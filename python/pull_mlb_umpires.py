"""
pull_mlb_umpires.py

For each historical game, extract the home plate umpire from the boxscore.
Then compute each umpire's season tendencies (K rate, BB rate, runs/game).

Key insight: home plate umpire calls balls/strikes, which shifts K/BB rates
5-15% depending on how tight/wide their zone is. This amplifies pitcher edge
for tight-zone umps and hitter edge for wide-zone umps.

Output: umpire_features_{year}.parquet keyed by event_id with:
  - hp_umpire_id, hp_umpire_name
  - ump_season_k_rate (K% in games this umpire worked)
  - ump_season_bb_rate (BB% in games this umpire worked)
  - ump_season_runs_per_game
  - ump_games_worked (sample size)
"""
import os, sys, time, argparse, logging
from pathlib import Path
from collections import defaultdict
import requests, pandas as pd

BASE = "https://statsapi.mlb.com/api/v1"
SLEEP = 0.08
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("umpires")


def get(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=15)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == MAX_RETRIES: return None
            time.sleep(2 ** attempt)
    return None


def get_hp_umpire(game_pk):
    """Returns {id, name} for the home plate umpire, or None."""
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    if not payload: return None

    officials = payload.get("officials", [])
    for o in officials:
        if o.get("officialType") == "Home Plate":
            official = o.get("official", {})
            return {
                "id": official.get("id"),
                "name": official.get("fullName"),
            }
    return None


def get_game_k_bb_runs(game_pk):
    """Returns K totals, BB totals, and runs for one game from boxscore."""
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    if not payload: return None

    totals = {"k": 0, "bb": 0, "runs": 0, "batters_faced": 0}
    for side in ("home", "away"):
        team = payload.get("teams", {}).get(side, {})
        team_stats = team.get("teamStats", {})
        pitching = team_stats.get("pitching", {})
        batting = team_stats.get("batting", {})
        try:
            totals["k"] += int(pitching.get("strikeOuts", 0))
            totals["bb"] += int(pitching.get("baseOnBalls", 0))
            totals["runs"] += int(batting.get("runs", 0))
            # Batters faced is crude PA count
            totals["batters_faced"] += int(pitching.get("battersFaced", 0))
        except (ValueError, TypeError):
            continue
    return totals


def process_year(year):
    pitcher_path = INPUT_DIR / f"pitcher_features_{year}.parquet"
    if not pitcher_path.exists():
        log.error("missing %s", pitcher_path); return

    pitchers = pd.read_parquet(pitcher_path)
    game_pks = pitchers[["event_id", "gamePk"]].dropna().drop_duplicates()
    game_pks["gamePk"] = game_pks["gamePk"].astype(int)
    log.info("[%s] %s games to process", year, len(game_pks))

    # Step 1: For each game, pull home plate umpire + game totals
    # (Both come from same boxscore call, so no extra cost)
    ump_per_game = []
    ump_stat_log = defaultdict(lambda: {"k": 0, "bb": 0, "runs": 0,
                                         "bf": 0, "games": 0})

    for i, (_, row) in enumerate(game_pks.iterrows()):
        gpk = int(row["gamePk"])
        payload = get(f"{BASE}/game/{gpk}/boxscore")
        time.sleep(SLEEP)
        if not payload:
            continue

        # Umpire
        hp_ump = None
        for o in payload.get("officials", []):
            if o.get("officialType") == "Home Plate":
                hp_ump = o.get("official", {})
                break

        # Game totals
        k, bb, runs, bf = 0, 0, 0, 0
        for side in ("home", "away"):
            team = payload.get("teams", {}).get(side, {})
            team_stats = team.get("teamStats", {})
            pitching = team_stats.get("pitching", {})
            batting = team_stats.get("batting", {})
            try:
                k += int(pitching.get("strikeOuts", 0))
                bb += int(pitching.get("baseOnBalls", 0))
                runs += int(batting.get("runs", 0))
                bf += int(pitching.get("battersFaced", 0))
            except (ValueError, TypeError):
                continue

        ump_id = hp_ump.get("id") if hp_ump else None
        ump_name = hp_ump.get("fullName") if hp_ump else None

        ump_per_game.append({
            "event_id": row["event_id"],
            "gamePk": gpk,
            "hp_umpire_id": ump_id,
            "hp_umpire_name": ump_name,
            "game_k": k,
            "game_bb": bb,
            "game_runs": runs,
            "game_bf": bf,
        })

        if ump_id and bf > 0:
            u = ump_stat_log[ump_id]
            u["k"] += k
            u["bb"] += bb
            u["runs"] += runs
            u["bf"] += bf
            u["games"] += 1

        if (i + 1) % 200 == 0:
            log.info("  %s/%s | %s unique umps",
                     i + 1, len(game_pks), len(ump_stat_log))

    # Step 2: compute umpire season aggregates
    ump_agg = []
    for uid, vals in ump_stat_log.items():
        if vals["bf"] < 50:  # tiny-sample umpires get skipped
            continue
        ump_agg.append({
            "hp_umpire_id": uid,
            "ump_season_k_rate": round(vals["k"] / vals["bf"], 4),
            "ump_season_bb_rate": round(vals["bb"] / vals["bf"], 4),
            "ump_season_runs_per_game": round(vals["runs"] / vals["games"], 2),
            "ump_games_worked": vals["games"],
        })
    ump_agg_df = pd.DataFrame(ump_agg)

    # Step 3: attach umpire aggregates to each game
    game_df = pd.DataFrame(ump_per_game)
    merged = game_df.merge(ump_agg_df, on="hp_umpire_id", how="left")

    out_path = OUTPUT_DIR / f"umpire_features_{year}.parquet"
    merged.to_parquet(out_path, index=False, compression="snappy")
    merged.head(20).to_csv(OUTPUT_DIR / f"preview_umpires_{year}.csv", index=False)

    cov = merged["hp_umpire_id"].notna().mean()
    stat_cov = merged["ump_season_k_rate"].notna().mean()
    log.info("[%s] saved %s rows | ump_cov=%.1f%% | stat_cov=%.1f%% | %s unique umps",
             year, len(merged), 100 * cov, 100 * stat_cov, len(ump_agg_df))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, choices=[2024, 2025])
    args = p.parse_args()
    years = [args.year] if args.year else [2024, 2025]
    for y in years:
        process_year(y)
    log.info("DONE")


if __name__ == "__main__":
    main()
