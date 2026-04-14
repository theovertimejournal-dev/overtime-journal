"""
pull_mlb_pitchers.py - v3

Key change: match by full team NAME, not abbreviation.
The MLB Stats API schedule endpoint returns:
  team: {id: 109, name: "Arizona Diamondbacks", link: "..."}
NO abbreviation field. So we use names directly.

Our SGO parquet already has home_team_name / away_team_name in standard format
("Arizona Diamondbacks", "St. Louis Cardinals", etc) which match MLB's exactly.

Defensive: if a name doesn't match cleanly, we log it and skip rather than crash.
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
import requests, pandas as pd

BASE = "https://statsapi.mlb.com/api/v1"
SLEEP = 0.15
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,"""
pull_mlb_pitchers.py - v3

Key change: match by full team NAME, not abbreviation.
The MLB Stats API schedule endpoint returns:
  team: {id: 109, name: "Arizona Diamondbacks", link: "..."}
NO abbreviation field. So we use names directly.

Our SGO parquet already has home_team_name / away_team_name in standard format
("Arizona Diamondbacks", "St. Louis Cardinals", etc) which match MLB's exactly.

Defensive: if a name doesn't match cleanly, we log it and skip rather than crash.
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
import requests, pandas as pd

BASE = "https://statsapi.mlb.com/api/v1"
SLEEP = 0.15
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("pitchers")


def get(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            log.warning("attempt %s on %s: %s", attempt, url.split("/")[-1], e)
            if attempt == MAX_RETRIES: return None
            time.sleep(2 ** attempt)
    return None


def normalize_name(n):
    """Normalize team name for matching: strip periods, lowercase.
    Handles 'St Louis Cardinals' vs 'St. Louis Cardinals'.
    """
    if not n: return ""
    return n.replace(".", "").lower().strip()


def fetch_schedule_for_date(date_str):
    """Returns list of {gamePk, home_name_norm, away_name_norm} (regular season + playoffs only)."""
    payload = get(f"{BASE}/schedule", {"sportId": 1, "date": date_str})
    if not payload: return []
    games = []
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            # R=regular, F=wildcard, D=division, L=LCS, W=WS
            if g.get("gameType") not in ("R", "F", "D", "L", "W"):
                continue
            games.append({
                "gamePk": g.get("gamePk"),
                "home_name_norm": normalize_name(g.get("teams", {}).get("home", {}).get("team", {}).get("name")),
                "away_name_norm": normalize_name(g.get("teams", {}).get("away", {}).get("team", {}).get("name")),
                "officialDate": g.get("officialDate"),
            })
    return games


def fetch_starters(game_pk):
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    if not payload: return None, None, None, None
    out = {}
    for side in ("home", "away"):
        team_block = payload.get("teams", {}).get(side, {})
        pitcher_ids = team_block.get("pitchers", [])
        if not pitcher_ids:
            out[side] = (None, None); continue
        starter_id = pitcher_ids[0]
        pkey = f"ID{starter_id}"
        player = team_block.get("players", {}).get(pkey, {})
        starter_name = player.get("person", {}).get("fullName")
        out[side] = (starter_id, starter_name)
    return out["home"][0], out["home"][1], out["away"][0], out["away"][1]


_pitcher_stats_cache = {}

def fetch_pitcher_season_stats(person_id, season):
    if person_id is None: return {}
    cache_key = (person_id, season)
    if cache_key in _pitcher_stats_cache:
        return _pitcher_stats_cache[cache_key]

    payload = get(f"{BASE}/people/{person_id}/stats",
                  {"stats": "season", "season": season, "group": "pitching"})
    result = {}
    if payload:
        for s in payload.get("stats", []):
            for split in s.get("splits", []):
                stat = split.get("stat", {})
                ip = _to_float(stat.get("inningsPitched"))
                bb = _to_float(stat.get("baseOnBalls"))
                # Compute BB/9 manually since baseOnBallsPer9Inn isn't returned
                bb_per_9 = round(bb / ip * 9, 2) if (ip and ip > 0 and bb is not None) else None
                result = {
                    "era": _to_float(stat.get("era")),
                    "whip": _to_float(stat.get("whip")),
                    "k_per_9": _to_float(stat.get("strikeoutsPer9Inn")),
                    "bb_per_9": bb_per_9,
                    "hr_per_9": _to_float(stat.get("homeRunsPer9")),
                    "innings_pitched": ip,
                    "games_started": _to_int(stat.get("gamesStarted")),
                    "wins": _to_int(stat.get("wins")),
                    "losses": _to_int(stat.get("losses")),
                }
                break
            if result: break
    _pitcher_stats_cache[cache_key] = result
    return result


def _to_float(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def _to_int(x):
    try: return int(x)
    except (TypeError, ValueError): return None


def process_year(year):
    in_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not in_path.exists():
        log.error("missing %s", in_path); return

    games_df = pd.read_parquet(in_path)
    games_df["game_date_str"] = games_df["game_date"].dt.strftime("%Y-%m-%d")

    if games_df["home_team_name"].isna().any():
        log.warning("[%s] %s rows missing team names - will skip those",
                    year, games_df["home_team_name"].isna().sum())

    unique_dates = sorted(games_df["game_date_str"].dropna().unique())
    log.info("[%s] %s games across %s dates", year, len(games_df), len(unique_dates))

    # 1. Fetch schedule for each date
    log.info("[%s] fetching schedule...", year)
    date_to_mlb = {}
    for i, d in enumerate(unique_dates):
        date_to_mlb[d] = fetch_schedule_for_date(d)
        if (i + 1) % 30 == 0:
            log.info("  schedule: %s/%s", i + 1, len(unique_dates))
        time.sleep(SLEEP)

    # 2. Match SGO games to MLB gamePks by (date, home_name, away_name)
    rows = []
    matched = 0
    unmatched_examples = []
    for _, g in games_df.iterrows():
        d = g["game_date_str"]
        h = normalize_name(g["home_team_name"])
        a = normalize_name(g["away_team_name"])
        mlb_games = date_to_mlb.get(d, [])
        match = next((m for m in mlb_games
                      if m["home_name_norm"] == h and m["away_name_norm"] == a), None)
        rows.append({
            "event_id": g["event_id"],
            "game_date_str": d,
            "home_name": g["home_team_name"],
            "away_name": g["away_team_name"],
            "gamePk": match["gamePk"] if match else None,
        })
        if match:
            matched += 1
        elif len(unmatched_examples) < 5:
            unmatched_examples.append((d, g["home_team_name"], g["away_team_name"]))

    match_df = pd.DataFrame(rows)
    log.info("[%s] matched %s/%s games (%.1f%%)",
             year, matched, len(match_df), 100 * matched / len(match_df))
    if unmatched_examples:
        log.info("  unmatched examples: %s", unmatched_examples)

    if matched == 0:
        log.error("[%s] zero matches - bailing out before crash", year)
        # save the match attempt anyway so you can debug
        match_df.head(20).to_csv(OUTPUT_DIR / f"debug_unmatched_{year}.csv", index=False)
        return

    # 3. Pull starters for matched games
    matched_only = match_df[match_df["gamePk"].notna()].copy()
    log.info("[%s] fetching boxscores for %s games...", year, len(matched_only))
    starter_rows = []
    for i, (_, row) in enumerate(matched_only.iterrows()):
        hs_id, hs_name, as_id, as_name = fetch_starters(int(row["gamePk"]))
        starter_rows.append({
            "event_id": row["event_id"],
            "gamePk": int(row["gamePk"]),
            "home_starter_id": hs_id,
            "home_starter_name": hs_name,
            "away_starter_id": as_id,
            "away_starter_name": as_name,
        })
        if (i + 1) % 100 == 0:
            log.info("  boxscore: %s/%s", i + 1, len(matched_only))
        time.sleep(SLEEP)

    starters_df = pd.DataFrame(starter_rows)

    # Defensive: if starters_df is empty, columns won't exist
    if "home_starter_id" not in starters_df.columns:
        log.error("[%s] no starter data extracted - saving raw match table only", year)
        match_df.to_parquet(OUTPUT_DIR / f"pitcher_features_{year}.parquet",
                            index=False, compression="snappy")
        return

    # 4. Pull season stats for each unique starter
    unique_starters = set(starters_df["home_starter_id"].dropna()) | \
                      set(starters_df["away_starter_id"].dropna())
    log.info("[%s] fetching season stats for %s starters...", year, len(unique_starters))
    for i, pid in enumerate(unique_starters):
        fetch_pitcher_season_stats(int(pid), year)
        if (i + 1) % 50 == 0:
            log.info("  stats: %s/%s", i + 1, len(unique_starters))
        time.sleep(SLEEP)

    # 5. Attach stats
    def attach(side):
        out = []
        for _, r in starters_df.iterrows():
            pid = r[f"{side}_starter_id"]
            stats = _pitcher_stats_cache.get((int(pid), year), {}) if pid else {}
            row = {f"{side}_p_{k}": v for k, v in stats.items()}
            out.append(row)
        return pd.DataFrame(out)

    home_stats_df = attach("home")
    away_stats_df = attach("away")
    full = pd.concat([starters_df.reset_index(drop=True), home_stats_df, away_stats_df], axis=1)

    out_path = OUTPUT_DIR / f"pitcher_features_{year}.parquet"
    full.to_parquet(out_path, index=False, compression="snappy")
    full.head(20).to_csv(OUTPUT_DIR / f"preview_pitchers_{year}.csv", index=False)

    cov_starter = full["home_starter_id"].notna().mean()
    cov_era = full["home_p_era"].notna().mean() if "home_p_era" in full.columns else 0
    log.info("[%s] saved %s rows | starter_cov=%.1f%% | era_cov=%.1f%%",
             year, len(full), 100 * cov_starter, 100 * cov_era)


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
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("pitchers")


def get(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            log.warning("attempt %s on %s: %s", attempt, url.split("/")[-1], e)
            if attempt == MAX_RETRIES: return None
            time.sleep(2 ** attempt)
    return None


def fetch_schedule_for_date(date_str):
    """Returns list of {gamePk, home_name, away_name}."""
    payload = get(f"{BASE}/schedule", {"sportId": 1, "date": date_str})
    if not payload: return []
    games = []
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            games.append({
                "gamePk": g.get("gamePk"),
                "home_name": g.get("teams", {}).get("home", {}).get("team", {}).get("name"),
                "away_name": g.get("teams", {}).get("away", {}).get("team", {}).get("name"),
                "officialDate": g.get("officialDate"),
            })
    return games


def fetch_starters(game_pk):
    payload = get(f"{BASE}/game/{game_pk}/boxscore")
    if not payload: return None, None, None, None
    out = {}
    for side in ("home", "away"):
        team_block = payload.get("teams", {}).get(side, {})
        pitcher_ids = team_block.get("pitchers", [])
        if not pitcher_ids:
            out[side] = (None, None); continue
        starter_id = pitcher_ids[0]
        pkey = f"ID{starter_id}"
        player = team_block.get("players", {}).get(pkey, {})
        starter_name = player.get("person", {}).get("fullName")
        out[side] = (starter_id, starter_name)
    return out["home"][0], out["home"][1], out["away"][0], out["away"][1]


_pitcher_stats_cache = {}

def fetch_pitcher_season_stats(person_id, season):
    if person_id is None: return {}
    cache_key = (person_id, season)
    if cache_key in _pitcher_stats_cache:
        return _pitcher_stats_cache[cache_key]

    payload = get(f"{BASE}/people/{person_id}/stats",
                  {"stats": "season", "season": season, "group": "pitching"})
    result = {}
    if payload:
        for s in payload.get("stats", []):
            for split in s.get("splits", []):
                stat = split.get("stat", {})
                result = {
                    "era": _to_float(stat.get("era")),
                    "whip": _to_float(stat.get("whip")),
                    "k_per_9": _to_float(stat.get("strikeoutsPer9Inn")),
                    "bb_per_9": _to_float(stat.get("baseOnBallsPer9Inn")),
                    "hr_per_9": _to_float(stat.get("homeRunsPer9")),
                    "innings_pitched": _to_float(stat.get("inningsPitched")),
                    "games_started": _to_int(stat.get("gamesStarted")),
                    "wins": _to_int(stat.get("wins")),
                    "losses": _to_int(stat.get("losses")),
                }
                break
            if result: break
    _pitcher_stats_cache[cache_key] = result
    return result


def _to_float(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def _to_int(x):
    try: return int(x)
    except (TypeError, ValueError): return None


def process_year(year):
    in_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not in_path.exists():
        log.error("missing %s", in_path); return

    games_df = pd.read_parquet(in_path)
    games_df["game_date_str"] = games_df["game_date"].dt.strftime("%Y-%m-%d")

    if games_df["home_team_name"].isna().any():
        log.warning("[%s] %s rows missing team names - will skip those",
                    year, games_df["home_team_name"].isna().sum())

    unique_dates = sorted(games_df["game_date_str"].dropna().unique())
    log.info("[%s] %s games across %s dates", year, len(games_df), len(unique_dates))

    # 1. Fetch schedule for each date
    log.info("[%s] fetching schedule...", year)
    date_to_mlb = {}
    for i, d in enumerate(unique_dates):
        date_to_mlb[d] = fetch_schedule_for_date(d)
        if (i + 1) % 30 == 0:
            log.info("  schedule: %s/%s", i + 1, len(unique_dates))
        time.sleep(SLEEP)

    # 2. Match SGO games to MLB gamePks by (date, home_name, away_name)
    rows = []
    matched = 0
    unmatched_examples = []
    for _, g in games_df.iterrows():
        d = g["game_date_str"]
        h, a = g["home_team_name"], g["away_team_name"]
        mlb_games = date_to_mlb.get(d, [])
        match = next((m for m in mlb_games
                      if m["home_name"] == h and m["away_name"] == a), None)
        # also check officialDate == d in case start time crossed UTC midnight
        if not match:
            for d2 in (date_to_mlb.keys()):
                pass  # placeholder; SGO already gives us start date in the right TZ
        rows.append({
            "event_id": g["event_id"],
            "game_date_str": d,
            "home_name": h,
            "away_name": a,
            "gamePk": match["gamePk"] if match else None,
        })
        if match:
            matched += 1
        elif len(unmatched_examples) < 5:
            unmatched_examples.append((d, h, a))

    match_df = pd.DataFrame(rows)
    log.info("[%s] matched %s/%s games (%.1f%%)",
             year, matched, len(match_df), 100 * matched / len(match_df))
    if unmatched_examples:
        log.info("  unmatched examples: %s", unmatched_examples)

    if matched == 0:
        log.error("[%s] zero matches - bailing out before crash", year)
        # save the match attempt anyway so you can debug
        match_df.head(20).to_csv(OUTPUT_DIR / f"debug_unmatched_{year}.csv", index=False)
        return

    # 3. Pull starters for matched games
    matched_only = match_df[match_df["gamePk"].notna()].copy()
    log.info("[%s] fetching boxscores for %s games...", year, len(matched_only))
    starter_rows = []
    for i, (_, row) in enumerate(matched_only.iterrows()):
        hs_id, hs_name, as_id, as_name = fetch_starters(int(row["gamePk"]))
        starter_rows.append({
            "event_id": row["event_id"],
            "gamePk": int(row["gamePk"]),
            "home_starter_id": hs_id,
            "home_starter_name": hs_name,
            "away_starter_id": as_id,
            "away_starter_name": as_name,
        })
        if (i + 1) % 100 == 0:
            log.info("  boxscore: %s/%s", i + 1, len(matched_only))
        time.sleep(SLEEP)

    starters_df = pd.DataFrame(starter_rows)

    # Defensive: if starters_df is empty, columns won't exist
    if "home_starter_id" not in starters_df.columns:
        log.error("[%s] no starter data extracted - saving raw match table only", year)
        match_df.to_parquet(OUTPUT_DIR / f"pitcher_features_{year}.parquet",
                            index=False, compression="snappy")
        return

    # 4. Pull season stats for each unique starter
    unique_starters = set(starters_df["home_starter_id"].dropna()) | \
                      set(starters_df["away_starter_id"].dropna())
    log.info("[%s] fetching season stats for %s starters...", year, len(unique_starters))
    for i, pid in enumerate(unique_starters):
        fetch_pitcher_season_stats(int(pid), year)
        if (i + 1) % 50 == 0:
            log.info("  stats: %s/%s", i + 1, len(unique_starters))
        time.sleep(SLEEP)

    # 5. Attach stats
    def attach(side):
        out = []
        for _, r in starters_df.iterrows():
            pid = r[f"{side}_starter_id"]
            stats = _pitcher_stats_cache.get((int(pid), year), {}) if pid else {}
            row = {f"{side}_p_{k}": v for k, v in stats.items()}
            out.append(row)
        return pd.DataFrame(out)

    home_stats_df = attach("home")
    away_stats_df = attach("away")
    full = pd.concat([starters_df.reset_index(drop=True), home_stats_df, away_stats_df], axis=1)

    out_path = OUTPUT_DIR / f"pitcher_features_{year}.parquet"
    full.to_parquet(out_path, index=False, compression="snappy")
    full.head(20).to_csv(OUTPUT_DIR / f"preview_pitchers_{year}.csv", index=False)

    cov_starter = full["home_starter_id"].notna().mean()
    cov_era = full["home_p_era"].notna().mean() if "home_p_era" in full.columns else 0
    log.info("[%s] saved %s rows | starter_cov=%.1f%% | era_cov=%.1f%%",
             year, len(full), 100 * cov_starter, 100 * cov_era)


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
