"""
pull_mlb_lineups.py

Pulls full starting lineup data for each historical game.

For each game:
  - Starting 9 batters per team in batting order
  - Each batter's season stats (OPS, wOBA, K%, BB%, ISO, etc.)
  - Each batter's L/R platoon splits (OPS vs LHP, OPS vs RHP)
  - Each batter's handedness
  - Each batter's recent form (last 15 games OPS)

Output: lineup_features_{year}.parquet keyed by event_id

Estimated runtime: 60-120 min depending on cache hit rate.
~5,000 boxscores (one per game) + ~800 unique batters x 4 stat calls each.

LEAK-PROOF: For each game's "recent form" we use the player's last-15-game
log AS-OF the day before the game (not season-end stats).
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
import requests, pandas as pd

BASE = "https://statsapi.mlb.com/api/v1"
SLEEP = 0.10
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("lineups")


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
                log.warning("giving up: %s", url.split("/")[-1])
                return None
            time.sleep(2 ** attempt)
    return None


def _f(x):
    try: return float(x)
    except (TypeError, ValueError): return None


def _i(x):
    try: return int(x)
    except (TypeError, ValueError): return None


# ---------------------------------------------------------------------------
# Boxscore -> lineup
# ---------------------------------------------------------------------------

_boxscore_cache = {}

def get_boxscore(game_pk):
    if game_pk in _boxscore_cache:
        return _boxscore_cache[game_pk]
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    _boxscore_cache[game_pk] = payload
    time.sleep(SLEEP)
    return payload


def extract_lineups(game_pk):
    """
    Returns {'home': [batter_id, ...], 'away': [batter_id, ...]} in batting order.

    Boxscore 'batters' list is in batting order. We take the first 9 (the starters).
    Pinch hitters appear later in the list.
    """
    box = get_boxscore(game_pk)
    if not box: return None

    out = {}
    for side in ("home", "away"):
        team = box.get("teams", {}).get(side, {})
        batter_ids = team.get("batters", []) or []
        # First 9 = starters in batting order. Bench appears after.
        # But we also need to verify each is actually a starter (had a PA at top)
        starters = []
        for pid in batter_ids[:9]:
            pkey = f"ID{pid}"
            pdata = team.get("players", {}).get(pkey, {})
            position = pdata.get("position", {}).get("abbreviation", "")
            # Skip pitchers in batting order (NL pre-2022, or pitcher-batting blip)
            if position == "P":
                continue
            starters.append(pid)
        out[side] = starters[:9]
    return out


# ---------------------------------------------------------------------------
# Player season stats + L/R splits + recent form
# ---------------------------------------------------------------------------

_player_season_cache = {}    # (player_id, season) -> dict
_player_splits_cache = {}    # (player_id, season) -> {'vsL': dict, 'vsR': dict}
_player_handedness_cache = {} # player_id -> 'L'/'R'/'S'


def fetch_player_handedness(player_id):
    if player_id in _player_handedness_cache:
        return _player_handedness_cache[player_id]
    payload = get(f"{BASE}/people/{player_id}")
    h = "R"  # default
    if payload:
        people = payload.get("people", [])
        if people:
            h = people[0].get("batSide", {}).get("code", "R")
    _player_handedness_cache[player_id] = h
    time.sleep(SLEEP)
    return h


def fetch_player_season_stats(player_id, season):
    """Season-level batting stats."""
    cache_key = (player_id, season)
    if cache_key in _player_season_cache:
        return _player_season_cache[cache_key]

    payload = get(f"{BASE}/people/{player_id}/stats",
                  {"stats": "season", "season": season, "group": "hitting"})
    result = {}
    if payload:
        for s in payload.get("stats", []):
            for split in s.get("splits", []):
                stat = split.get("stat", {})
                result = {
                    "avg": _f(stat.get("avg")),
                    "obp": _f(stat.get("obp")),
                    "slg": _f(stat.get("slg")),
                    "ops": _f(stat.get("ops")),
                    "babip": _f(stat.get("babip")),
                    "hr": _i(stat.get("homeRuns")),
                    "rbi": _i(stat.get("rbi")),
                    "sb": _i(stat.get("stolenBases")),
                    "k_rate": _f(stat.get("strikeOuts")) / _f(stat.get("plateAppearances"))
                              if _f(stat.get("plateAppearances")) else None,
                    "bb_rate": _f(stat.get("baseOnBalls")) / _f(stat.get("plateAppearances"))
                              if _f(stat.get("plateAppearances")) else None,
                    "iso": (_f(stat.get("slg")) - _f(stat.get("avg")))
                           if (_f(stat.get("slg")) is not None and _f(stat.get("avg")) is not None) else None,
                    "plate_appearances": _i(stat.get("plateAppearances")),
                    "games_played": _i(stat.get("gamesPlayed")),
                }
                break
            if result: break
    _player_season_cache[cache_key] = result
    time.sleep(SLEEP)
    return result


def fetch_player_splits(player_id, season):
    """OPS vs LHP and vs RHP for the season."""
    cache_key = (player_id, season)
    if cache_key in _player_splits_cache:
        return _player_splits_cache[cache_key]

    # statSplits with vr=vsRHP, vl=vsLHP via 'sitCodes' parameter
    payload = get(f"{BASE}/people/{player_id}/stats",
                  {"stats": "statSplits", "sitCodes": "vl,vr",
                   "season": season, "group": "hitting"})
    result = {"vs_lhp_ops": None, "vs_lhp_pa": None,
              "vs_rhp_ops": None, "vs_rhp_pa": None}

    if payload:
        for s in payload.get("stats", []):
            for split in s.get("splits", []):
                code = split.get("split", {}).get("code", "")
                stat = split.get("stat", {})
                if code == "vl":  # vs LHP
                    result["vs_lhp_ops"] = _f(stat.get("ops"))
                    result["vs_lhp_pa"] = _i(stat.get("plateAppearances"))
                elif code == "vr":  # vs RHP
                    result["vs_rhp_ops"] = _f(stat.get("ops"))
                    result["vs_rhp_pa"] = _i(stat.get("plateAppearances"))

    _player_splits_cache[cache_key] = result
    time.sleep(SLEEP)
    return result


def fetch_player_recent_ops(player_id, season, end_date_str, last_n=15):
    """
    Game log: last N games' OPS as-of end_date (exclusive).
    Returns dict with recent_ops, recent_pa, recent_games.

    NOTE: This is the leak-proof part. We only count games BEFORE end_date.
    """
    payload = get(f"{BASE}/people/{player_id}/stats",
                  {"stats": "gameLog", "season": season, "group": "hitting"})
    if not payload:
        return {"recent_ops": None, "recent_pa": None, "recent_games": 0}

    all_games = []
    for s in payload.get("stats", []):
        for split in s.get("splits", []):
            game_date = split.get("date", "")
            if game_date and game_date < end_date_str:  # exclusive
                stat = split.get("stat", {})
                all_games.append({
                    "date": game_date,
                    "ops": _f(stat.get("ops")),
                    "pa": _i(stat.get("plateAppearances")) or 0,
                    "h": _i(stat.get("hits")) or 0,
                    "tb": _i(stat.get("totalBases")) or 0,
                    "bb": _i(stat.get("baseOnBalls")) or 0,
                    "ab": _i(stat.get("atBats")) or 0,
                    "sf": _i(stat.get("sacFlies")) or 0,
                    "hbp": _i(stat.get("hitByPitch")) or 0,
                })

    # Sort by date desc, take last N
    all_games.sort(key=lambda g: g["date"], reverse=True)
    recent = all_games[:last_n]

    if not recent:
        return {"recent_ops": None, "recent_pa": None, "recent_games": 0}

    # Aggregate -> compute combined OPS
    tot_ab = sum(g["ab"] for g in recent)
    tot_h = sum(g["h"] for g in recent)
    tot_bb = sum(g["bb"] for g in recent)
    tot_tb = sum(g["tb"] for g in recent)
    tot_pa = sum(g["pa"] for g in recent)
    tot_sf = sum(g["sf"] for g in recent)
    tot_hbp = sum(g["hbp"] for g in recent)

    obp_denom = tot_ab + tot_bb + tot_sf + tot_hbp
    obp = (tot_h + tot_bb + tot_hbp) / obp_denom if obp_denom else 0
    slg = tot_tb / tot_ab if tot_ab else 0
    recent_ops = obp + slg

    return {
        "recent_ops": round(recent_ops, 3),
        "recent_pa": tot_pa,
        "recent_games": len(recent),
    }


# ---------------------------------------------------------------------------
# Per-game lineup feature computation
# ---------------------------------------------------------------------------

def compute_team_lineup_features(batter_ids, season, game_date_str,
                                  opposing_pitcher_hand):
    """
    Given a team's batting order (list of player_ids), compute aggregate
    lineup features.
    """
    if not batter_ids:
        return {}

    batters = []
    for pid in batter_ids:
        season_stats = fetch_player_season_stats(pid, season)
        splits = fetch_player_splits(pid, season)
        hand = fetch_player_handedness(pid)
        recent = fetch_player_recent_ops(pid, season, game_date_str, last_n=15)

        batters.append({
            "id": pid, "hand": hand,
            "ops": season_stats.get("ops"),
            "obp": season_stats.get("obp"),
            "slg": season_stats.get("slg"),
            "iso": season_stats.get("iso"),
            "k_rate": season_stats.get("k_rate"),
            "bb_rate": season_stats.get("bb_rate"),
            "pa": season_stats.get("plate_appearances") or 0,
            "vs_lhp_ops": splits.get("vs_lhp_ops"),
            "vs_rhp_ops": splits.get("vs_rhp_ops"),
            "recent_ops": recent.get("recent_ops"),
        })

    # Filter batters with valid season stats (50+ PA — a real regular)
    qualified = [b for b in batters if b["ops"] is not None and b["pa"] >= 50]
    n_qualified = len(qualified)

    if not qualified:
        return {"lineup_n_qualified": 0}

    # Aggregate metrics
    def avg(vals):
        v = [x for x in vals if x is not None]
        return sum(v) / len(v) if v else None

    # Top 3 in batting order (most PAs in a game)
    top3 = batters[:3]
    top3_q = [b for b in top3 if b["ops"] is not None]

    # Platoon-adjusted: use the right split based on opposing starter hand
    split_key = "vs_lhp_ops" if opposing_pitcher_hand == "L" else "vs_rhp_ops"

    return {
        "lineup_n_qualified": n_qualified,
        "lineup_avg_ops": avg([b["ops"] for b in qualified]),
        "lineup_avg_obp": avg([b["obp"] for b in qualified]),
        "lineup_avg_slg": avg([b["slg"] for b in qualified]),
        "lineup_avg_iso": avg([b["iso"] for b in qualified]),
        "lineup_avg_k_rate": avg([b["k_rate"] for b in qualified]),
        "lineup_avg_bb_rate": avg([b["bb_rate"] for b in qualified]),
        # Top 3 (the heart of the lineup)
        "top3_avg_ops": avg([b["ops"] for b in top3_q]) if top3_q else None,
        # Recent form
        "lineup_recent_ops": avg([b["recent_ops"] for b in qualified]),
        # Platoon-adjusted vs opposing starter
        "lineup_vs_starter_ops": avg([b[split_key] for b in qualified]),
        # Handedness composition
        "lineup_lhb_count": sum(1 for b in batters if b["hand"] in ("L", "S")),
        # Raw batter IDs (comma-delimited) — needed for pitch-type matching
        # in build_features. Full lineup in batting order.
        "batter_ids": ",".join(str(b["id"]) for b in batters),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_year(year):
    pitcher_path = INPUT_DIR / f"pitcher_features_{year}.parquet"
    games_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not pitcher_path.exists() or not games_path.exists():
        log.error("missing input files for %s", year); return

    pitchers = pd.read_parquet(pitcher_path)
    games = pd.read_parquet(games_path)

    # Get pitcher handedness so we can compute platoon-adjusted features
    log.info("[%s] fetching pitcher handedness for %s pitchers...",
             year, pitchers["home_starter_id"].nunique())
    unique_pitchers = set(pitchers["home_starter_id"].dropna()) | \
                      set(pitchers["away_starter_id"].dropna())
    pitcher_hand = {}
    for i, pid in enumerate(unique_pitchers):
        pitcher_hand[int(pid)] = fetch_player_handedness(int(pid))
        if (i + 1) % 50 == 0:
            log.info("  pitcher hand: %s/%s", i + 1, len(unique_pitchers))

    # Merge for game dates
    df = pitchers.merge(games[["event_id", "game_date"]], on="event_id", how="inner")
    df["game_date_str"] = pd.to_datetime(df["game_date"]).dt.strftime("%Y-%m-%d")

    log.info("[%s] processing %s games for lineup data...", year, len(df))
    rows = []
    for i, (_, g) in enumerate(df.iterrows()):
        gpk = int(g["gamePk"])
        lineups = extract_lineups(gpk)
        if not lineups:
            continue

        date_str = g["game_date_str"]
        # Home faces away pitcher; away faces home pitcher
        home_p_hand = pitcher_hand.get(int(g["away_starter_id"]), "R") \
            if pd.notna(g.get("away_starter_id")) else "R"
        away_p_hand = pitcher_hand.get(int(g["home_starter_id"]), "R") \
            if pd.notna(g.get("home_starter_id")) else "R"

        home_features = compute_team_lineup_features(
            lineups.get("home", []), year, date_str, home_p_hand)
        away_features = compute_team_lineup_features(
            lineups.get("away", []), year, date_str, away_p_hand)

        row = {"event_id": g["event_id"], "gamePk": gpk}
        row.update({f"home_{k}": v for k, v in home_features.items()})
        row.update({f"away_{k}": v for k, v in away_features.items()})
        rows.append(row)

        if (i + 1) % 50 == 0:
            log.info("  games: %s/%s | cache: %s boxscores, %s players",
                     i + 1, len(df), len(_boxscore_cache),
                     len(_player_season_cache))

    out_df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"lineup_features_{year}.parquet"
    out_df.to_parquet(out_path, index=False, compression="snappy")
    out_df.head(20).to_csv(OUTPUT_DIR / f"preview_lineups_{year}.csv", index=False)

    cov = out_df["home_lineup_avg_ops"].notna().mean() if "home_lineup_avg_ops" in out_df.columns else 0
    log.info("[%s] saved %s rows | lineup_ops_cov=%.1f%%",
             year, len(out_df), 100 * cov)


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
