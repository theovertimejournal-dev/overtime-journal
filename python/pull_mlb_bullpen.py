"""
pull_mlb_bullpen.py

For each historical game date+team in our parquets, compute the team's 7-day
rolling bullpen stats AS-OF that date. Mirrors the logic of Juan's existing
mlb_bullpen_analyzer_v2.py but runs over historical games.

Why this is slow:
  - For each unique (date, team) combo (~2 teams x 4500 games / 2 = ~4500 combos)
  - We fetch the schedule for the prior 7 days for that team
  - Then fetch boxscores for those 5-7 games
  - That's roughly 25,000-30,000 API calls total

To keep it manageable:
  - Cache boxscores aggressively (each game appears in multiple teams' lookbacks)
  - Cache schedules per (team, date) range
  - Skip if we've already computed for that (team, date) combo
  - Output is keyed by (team_id, target_date) so multiple games on same day reuse

Output: bullpen_features.parquet keyed by (team_id, target_date)
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
from datetime import datetime, timedelta
import requests, pandas as pd

BASE = "https://statsapi.mlb.com/api/v1"
SLEEP = 0.10
MAX_RETRIES = 3
LOOKBACK_DAYS = 7
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

# Maps full team name (which we have in our parquet) to MLB team_id
# Built from MLB API team IDs you confirmed in the schedule sample
TEAM_NAME_TO_ID = {
    "arizona diamondbacks": 109, "atlanta braves": 144, "baltimore orioles": 110,
    "boston red sox": 111, "chicago cubs": 112, "chicago white sox": 145,
    "cincinnati reds": 113, "cleveland guardians": 114, "colorado rockies": 115,
    "detroit tigers": 116, "houston astros": 117, "kansas city royals": 118,
    "los angeles angels": 108, "los angeles dodgers": 119, "miami marlins": 146,
    "milwaukee brewers": 158, "minnesota twins": 142, "new york mets": 121,
    "new york yankees": 147, "oakland athletics": 133, "athletics": 133,
    "philadelphia phillies": 143, "pittsburgh pirates": 134,
    "san diego padres": 135, "san francisco giants": 137, "seattle mariners": 136,
    "st louis cardinals": 138, "st. louis cardinals": 138,
    "tampa bay rays": 139, "texas rangers": 140, "toronto blue jays": 141,
    "washington nationals": 120,
}

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("bullpen")


def get(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            if attempt == MAX_RETRIES:
                log.warning("giving up on %s: %s", url.split("/")[-1], e)
                return None
            time.sleep(2 ** attempt)
    return None


def normalize_name(n):
    if not n: return ""
    return n.replace(".", "").lower().strip()


def parse_ip(ip_str):
    """Parse '5.2' -> 5.667 innings (decimal portion is outs/3)."""
    try:
        s = str(ip_str)
        if "." in s:
            whole, frac = s.split(".")
            return int(whole) + int(frac) / 3.0
        return float(s)
    except (ValueError, AttributeError):
        return 0.0


# Caches to avoid hammering the API
_schedule_cache = {}    # (team_id, start, end) -> list of {gamePk, date}
_boxscore_cache = {}    # gamePk -> raw boxscore json


def get_team_recent_games(team_id, end_date_str, num_days=LOOKBACK_DAYS):
    """Return list of {gamePk, date} for team's games in the prior num_days."""
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=num_days)
    start = start_dt.strftime("%Y-%m-%d")
    # End is the day BEFORE target (we want games BEFORE this date)
    end_minus_1 = (end_dt - timedelta(days=1)).strftime("%Y-%m-%d")

    cache_key = (team_id, start, end_minus_1)
    if cache_key in _schedule_cache:
        return _schedule_cache[cache_key]

    payload = get(f"{BASE}/schedule", {
        "sportId": 1, "teamId": team_id,
        "startDate": start, "endDate": end_minus_1, "gameType": "R",
    })
    games = []
    if payload:
        for d in payload.get("dates", []):
            for g in d.get("games", []):
                # Only include finalized games
                if g.get("status", {}).get("codedGameState") in ("F", "FR", "FT"):
                    games.append({"gamePk": g.get("gamePk"), "date": d.get("date")})
    _schedule_cache[cache_key] = games
    time.sleep(SLEEP)
    return games


def get_boxscore(game_pk):
    if game_pk in _boxscore_cache:
        return _boxscore_cache[game_pk]
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    _boxscore_cache[game_pk] = payload
    time.sleep(SLEEP)
    return payload


def compute_bullpen_for_team_date(team_id, target_date_str):
    """
    For team_id, compute 7-day-prior bullpen stats as-of target_date.
    Returns dict of stats or empty dict if no data.
    """
    recent = get_team_recent_games(team_id, target_date_str, LOOKBACK_DAYS)
    if not recent:
        return {}

    bt = {"ip": 0.0, "er": 0, "h": 0, "bb": 0, "so": 0, "hr": 0, "pitches": 0}
    reliever_ids = set()

    for gm in recent:
        box = get_boxscore(gm["gamePk"])
        if not box: continue
        for side in ("home", "away"):
            sd = box.get("teams", {}).get(side, {})
            if sd.get("team", {}).get("id") != team_id:
                continue
            players = sd.get("players", {})
            pitcher_ids = sd.get("pitchers", [])
            if not pitcher_ids: continue
            starter_id = pitcher_ids[0]
            for pid in pitcher_ids:
                if pid == starter_id:  # skip starter, only count relievers
                    continue
                reliever_ids.add(pid)
                pdat = players.get(f"ID{pid}", {})
                ps = pdat.get("stats", {}).get("pitching", {})
                if not ps: continue
                bt["ip"] += parse_ip(ps.get("inningsPitched", "0"))
                bt["er"] += int(ps.get("earnedRuns", 0))
                bt["h"]  += int(ps.get("hits", 0))
                bt["bb"] += int(ps.get("baseOnBalls", 0))
                bt["so"] += int(ps.get("strikeOuts", 0))
                bt["hr"] += int(ps.get("homeRuns", 0))
                bt["pitches"] += int(ps.get("numberOfPitches", 0))

    if bt["ip"] <= 0:
        return {}

    return {
        "bp_era_7d":     round(bt["er"] / bt["ip"] * 9, 2),
        "bp_whip_7d":    round((bt["h"] + bt["bb"]) / bt["ip"], 2),
        "bp_k_per_9_7d": round(bt["so"] / bt["ip"] * 9, 2),
        "bp_bb_per_9_7d": round(bt["bb"] / bt["ip"] * 9, 2),
        "bp_hr_per_9_7d": round(bt["hr"] / bt["ip"] * 9, 2),
        "bp_ip_7d":      round(bt["ip"], 1),
        "bp_pitches_7d": bt["pitches"],
        "bp_reliever_count_7d": len(reliever_ids),
        "bp_games_in_lookback": len(recent),
    }


def process_year(year):
    in_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not in_path.exists():
        log.error("missing %s", in_path); return

    games_df = pd.read_parquet(in_path)
    games_df["game_date_str"] = games_df["game_date"].dt.strftime("%Y-%m-%d")

    # Build unique (team_id, target_date) combos for both home and away
    home_combos = games_df[["game_date_str", "home_team_name"]].rename(
        columns={"home_team_name": "team_name"})
    away_combos = games_df[["game_date_str", "away_team_name"]].rename(
        columns={"away_team_name": "team_name"})
    all_combos = pd.concat([home_combos, away_combos], ignore_index=True)
    all_combos["team_id"] = all_combos["team_name"].apply(
        lambda n: TEAM_NAME_TO_ID.get(normalize_name(n)))

    unmapped = all_combos[all_combos["team_id"].isna()]
    if len(unmapped):
        log.warning("[%s] %s rows with unmapped team names. Examples: %s",
                    year, len(unmapped),
                    sorted(unmapped["team_name"].unique())[:5])

    combos = all_combos.dropna(subset=["team_id"]).drop_duplicates(
        subset=["team_id", "game_date_str"]).reset_index(drop=True)
    combos["team_id"] = combos["team_id"].astype(int)

    log.info("[%s] %s unique (team, date) combos to compute", year, len(combos))

    rows = []
    for i, (_, c) in enumerate(combos.iterrows()):
        stats = compute_bullpen_for_team_date(int(c["team_id"]), c["game_date_str"])
        row = {
            "team_id": int(c["team_id"]),
            "team_name": c["team_name"],
            "game_date_str": c["game_date_str"],
            **stats,
        }
        rows.append(row)
        if (i + 1) % 100 == 0:
            log.info("  progress: %s/%s | cache: %s schedules, %s boxscores",
                     i + 1, len(combos),
                     len(_schedule_cache), len(_boxscore_cache))

    df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"bullpen_features_{year}.parquet"
    df.to_parquet(out_path, index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_bullpen_{year}.csv", index=False)

    cov = df["bp_era_7d"].notna().mean() if "bp_era_7d" in df.columns else 0
    log.info("[%s] saved %s rows | era_coverage=%.1f%%", year, len(df), 100 * cov)


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
