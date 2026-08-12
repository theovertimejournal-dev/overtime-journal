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

# ── Credibility shrinkage ────────────────────────────────────────────────────
# A season-to-date reliever ERA is only trustworthy once he's thrown enough
# innings. A guy with 0.1 IP and a 27.00 ERA (gave up 1 run, got 1 out) is noise,
# not skill. We regress each stat toward the league average, weighted by how many
# innings back it: era_adj = (IP*observed + K*league_avg) / (IP + K).
# With K=25, a pen with 200+ season IP barely moves; a 3-IP sample gets pulled
# almost entirely to league average. This is what kills the outlier skew Juan saw.
SHRINK_K = 25.0                # innings of "league-average prior" to blend in
LEAGUE_AVG = {                 # MLB-wide bullpen rates (rough, stable priors)
    "era": 4.10, "whip": 1.30, "k9": 8.6, "bb9": 3.4, "hr9": 1.2,
}


def shrink(observed, ip, stat):
    """Credibility-weighted stat: blend observed toward league avg by innings."""
    prior = LEAGUE_AVG[stat]
    if ip <= 0:
        return prior
    return (ip * observed + SHRINK_K * prior) / (ip + SHRINK_K)


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


def extract_reliever_line(box, team_id):
    """Pull one game's aggregate RELIEVER line for team_id from a boxscore.
    Returns dict of counting stats + the set of reliever pids. Reused for both
    the season accumulator and the 7-day window so we only parse each box once.
    """
    out = {"ip": 0.0, "er": 0, "h": 0, "bb": 0, "so": 0, "hr": 0,
           "pitches": 0, "reliever_ids": set()}
    for side in ("home", "away"):
        sd = box.get("teams", {}).get(side, {})
        if sd.get("team", {}).get("id") != team_id:
            continue
        players = sd.get("players", {})
        pitcher_ids = sd.get("pitchers", [])
        if not pitcher_ids:
            continue
        starter_id = pitcher_ids[0]   # matches serve-side; keep for parity
        for pid in pitcher_ids:
            if pid == starter_id:
                continue
            ps = players.get(f"ID{pid}", {}).get("stats", {}).get("pitching", {})
            if not ps:
                continue
            out["reliever_ids"].add(pid)
            out["ip"]  += parse_ip(ps.get("inningsPitched", "0"))
            out["er"]  += int(ps.get("earnedRuns", 0))
            out["h"]   += int(ps.get("hits", 0))
            out["bb"]  += int(ps.get("baseOnBalls", 0))
            out["so"]  += int(ps.get("strikeOuts", 0))
            out["hr"]  += int(ps.get("homeRuns", 0))
            out["pitches"] += int(ps.get("numberOfPitches", 0))
    return out


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


def _team_full_season_schedule(team_id, year):
    """All finalized regular-season games for a team in `year`, date-ordered."""
    payload = get(f"{BASE}/schedule", {
        "sportId": 1, "teamId": team_id,
        "startDate": f"{year}-03-01", "endDate": f"{year}-11-15",
        "gameType": "R",
    })
    games = []
    if payload:
        for d in payload.get("dates", []):
            for g in d.get("games", []):
                if g.get("status", {}).get("codedGameState") in ("F", "FR", "FT"):
                    games.append({"gamePk": g.get("gamePk"), "date": d.get("date")})
    games.sort(key=lambda x: x["date"])
    time.sleep(SLEEP)
    return games


def process_year(year):
    in_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not in_path.exists():
        log.error("missing %s", in_path); return

    games_df = pd.read_parquet(in_path)
    games_df["game_date_str"] = games_df["game_date"].dt.strftime("%Y-%m-%d")

    # Which (team, date) combos does the training set actually need a row for?
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
                    year, len(unmapped), sorted(unmapped["team_name"].unique())[:5])
    combos = all_combos.dropna(subset=["team_id"]).drop_duplicates(
        subset=["team_id", "game_date_str"]).reset_index(drop=True)
    combos["team_id"] = combos["team_id"].astype(int)

    # needed[team_id] = set of dates we must emit a feature row for
    needed = {}
    for _, c in combos.iterrows():
        needed.setdefault(int(c["team_id"]), {})[c["game_date_str"]] = c["team_name"]

    log.info("[%s] %s teams, %s (team,date) rows to emit",
             year, len(needed), len(combos))

    rows = []
    for t_idx, (team_id, dates_needed) in enumerate(needed.items(), 1):
        # One schedule fetch per team for the whole season, then walk it in order
        # accumulating season-to-date reliever totals. Each boxscore is fetched
        # once and feeds BOTH the running season accumulator AND the 7-day window.
        sched = _team_full_season_schedule(team_id, year)

        season = {"ip": 0.0, "er": 0, "h": 0, "bb": 0, "so": 0, "hr": 0, "pitches": 0}
        season_relievers = set()
        # keep a small rolling list of (date, line) for the 7-day window
        recent_lines = []

        # Pre-extract each game's reliever line once, in date order
        for gi, gm in enumerate(sched):
            gdate = gm["date"]

            # BEFORE adding today's game, emit features "as of" this date if needed
            # (features must reflect games strictly BEFORE the target game).
            if gdate in dates_needed:
                # 7-day window = games within the prior 7 days
                cutoff = (datetime.strptime(gdate, "%Y-%m-%d") - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
                w = {"ip": 0.0, "er": 0, "h": 0, "bb": 0, "so": 0, "hr": 0, "pitches": 0}
                w_rel = set()
                for (rd, rl) in recent_lines:
                    if rd >= cutoff:
                        for k in ("ip", "er", "h", "bb", "so", "hr", "pitches"):
                            w[k] += rl[k]
                        w_rel |= rl["reliever_ids"]
                rows.append(_emit_row(team_id, dates_needed[gdate], gdate,
                                      season, season_relievers, w, w_rel))

            # Now fold today's game into the accumulators (for future dates)
            box = get_boxscore(gm["gamePk"])
            if not box:
                continue
            line = extract_reliever_line(box, team_id)
            for k in ("ip", "er", "h", "bb", "so", "hr", "pitches"):
                season[k] += line[k]
            season_relievers |= line["reliever_ids"]
            recent_lines.append((gdate, line))
            # trim recent_lines to keep memory small (only need ~10 days back)
            trim = (datetime.strptime(gdate, "%Y-%m-%d") - timedelta(days=LOOKBACK_DAYS + 3)).strftime("%Y-%m-%d")
            recent_lines = [(d, l) for (d, l) in recent_lines if d >= trim]

        if t_idx % 5 == 0:
            log.info("  [%s] %s/%s teams | %s boxscores cached",
                     year, t_idx, len(needed), len(_boxscore_cache))

    df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"bullpen_features_{year}.parquet"
    df.to_parquet(out_path, index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_bullpen_{year}.csv", index=False)

    cov = df["bp_era_season"].notna().mean() if "bp_era_season" in df.columns else 0
    log.info("[%s] saved %s rows | season_era_coverage=%.1f%%", year, len(df), 100 * cov)


def _emit_row(team_id, team_name, gdate, season, season_rel, w, w_rel):
    """Build one output row: shrunk season stats + raw 7-day window + fatigue."""
    s_ip = season["ip"]
    # Season-to-date raw rates (guard div-by-zero)
    s_era_raw = (season["er"] / s_ip * 9) if s_ip > 0 else None
    s_whip_raw = ((season["h"] + season["bb"]) / s_ip) if s_ip > 0 else None
    s_k9_raw = (season["so"] / s_ip * 9) if s_ip > 0 else None
    s_bb9_raw = (season["bb"] / s_ip * 9) if s_ip > 0 else None
    s_hr9_raw = (season["hr"] / s_ip * 9) if s_ip > 0 else None

    # 7-day window raw rates
    w_ip = w["ip"]
    w_era = round(w["er"] / w_ip * 9, 2) if w_ip > 0 else None
    w_whip = round((w["h"] + w["bb"]) / w_ip, 2) if w_ip > 0 else None
    w_k9 = round(w["so"] / w_ip * 9, 2) if w_ip > 0 else None

    return {
        "team_id": team_id,
        "team_name": team_name,
        "game_date_str": gdate,
        # ── SEASON-TO-DATE, credibility-shrunk (the new backbone) ──
        "bp_era_season":  round(shrink(s_era_raw, s_ip, "era"), 2) if s_era_raw is not None else round(LEAGUE_AVG["era"], 2),
        "bp_whip_season": round(shrink(s_whip_raw, s_ip, "whip"), 2) if s_whip_raw is not None else round(LEAGUE_AVG["whip"], 2),
        "bp_k9_season":   round(shrink(s_k9_raw, s_ip, "k9"), 2) if s_k9_raw is not None else LEAGUE_AVG["k9"],
        "bp_bb9_season":  round(shrink(s_bb9_raw, s_ip, "bb9"), 2) if s_bb9_raw is not None else LEAGUE_AVG["bb9"],
        "bp_hr9_season":  round(shrink(s_hr9_raw, s_ip, "hr9"), 2) if s_hr9_raw is not None else LEAGUE_AVG["hr9"],
        "bp_ip_season":   round(s_ip, 1),
        # ── 7-DAY WINDOW, raw (recent form — model down-weights on its own) ──
        "bp_era_7d":  w_era,
        "bp_whip_7d": w_whip,
        "bp_k_per_9_7d": w_k9,
        "bp_ip_7d":   round(w_ip, 1),        # <- also the FATIGUE signal
        "bp_reliever_count_7d": len(w_rel),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, choices=[2024, 2025, 2026])
    args = p.parse_args()
    # Blank = ALL seasons the model should learn from, including the current one.
    # (Was [2024, 2025] — silently excluded 2026, so a full retrain missed this
    # whole season of bullpen data.)
    years = [args.year] if args.year else [2024, 2025, 2026]
    for y in years:
        log.info("=== Processing %s ===", y)
        process_year(y)
    log.info("DONE")


if __name__ == "__main__":
    main()
