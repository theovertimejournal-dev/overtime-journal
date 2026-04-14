"""
backfill_mlb_history.py - v3
Adds F5 (first 5 innings) ML odds + F5 results.
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
import requests, pandas as pd

API_KEY = os.environ.get("SPORTSGAMEODDS_API_KEY")
if not API_KEY:
    sys.exit("ERROR: SPORTSGAMEODDS_API_KEY not set")

BASE_URL = "https://api.sportsgameodds.com/v2/events"
LEAGUE = "MLB"
PAGE_LIMIT = 50
SLEEP = 0.25
MAX_RETRIES = 3
ODDS_SANITY_CAP = 1000

SEASON_WINDOWS = {
    2024: ("2024-03-20", "2024-11-05"),
    2025: ("2025-03-18", "2025-11-05"),
}

OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("backfill")


def sgo_get(params):
    headers = {"x-api-key": API_KEY}
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(BASE_URL, params=params, headers=headers, timeout=30)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            log.warning("attempt %s: %s", attempt, e)
            if attempt == MAX_RETRIES: raise
            time.sleep(2 ** attempt)
    return {}


def fetch_events(starts_after, starts_before, debug_dump=False):
    cursor = None; page = 0; dumped = False
    while True:
        page += 1
        params = {"leagueID": LEAGUE, "startsAfter": starts_after,
                  "startsBefore": starts_before, "finalized": "true",
                  "limit": PAGE_LIMIT}
        if cursor: params["cursor"] = cursor
        payload = sgo_get(params)
        events = payload.get("data", []) or []
        log.info("page %s: %s events", page, len(events))
        if debug_dump and events and not dumped:
            Path("data/_sample_event.json").write_text(json.dumps(events[0], indent=2))
            dumped = True
        for ev in events: yield ev
        cursor = payload.get("nextCursor")
        if not cursor: break
        time.sleep(SLEEP)


def _get(d, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict): return default
        cur = cur.get(k)
        if cur is None: return default
    return cur


def _clean_odd(x):
    try:
        v = int(x)
        if abs(v) > ODDS_SANITY_CAP:
            return None
        return v
    except (TypeError, ValueError):
        return None


def extract_full_ml(odds_obj):
    h = a = ch = ca = None
    if not isinstance(odds_obj, dict):
        return h, a, ch, ca
    for oid, odd in odds_obj.items():
        if not isinstance(odd, dict): continue
        if oid.endswith("-game-ml-home"):
            h = _clean_odd(odd.get("fairOdds") or odd.get("bookOdds"))
            ch = _clean_odd(odd.get("closeFairOdds") or odd.get("closeBookOdds"))
        elif oid.endswith("-game-ml-away"):
            a = _clean_odd(odd.get("fairOdds") or odd.get("bookOdds"))
            ca = _clean_odd(odd.get("closeFairOdds") or odd.get("closeBookOdds"))
    return h, a, ch, ca


def extract_f5_ml(odds_obj):
    h = a = ch = ca = None
    if not isinstance(odds_obj, dict):
        return h, a, ch, ca
    for oid, odd in odds_obj.items():
        if not isinstance(odd, dict): continue
        if oid.endswith("-1h-ml3way-home"):
            h = _clean_odd(odd.get("fairOdds") or odd.get("bookOdds"))
            ch = _clean_odd(odd.get("closeFairOdds") or odd.get("closeBookOdds"))
        elif oid.endswith("-1h-ml3way-away"):
            a = _clean_odd(odd.get("fairOdds") or odd.get("bookOdds"))
            ca = _clean_odd(odd.get("closeFairOdds") or odd.get("closeBookOdds"))
    return h, a, ch, ca


def extract_f5_score(results_obj):
    if not isinstance(results_obj, dict):
        return None, None
    home_runs, away_runs, found = 0, 0, 0
    for inning in ("1i", "2i", "3i", "4i", "5i"):
        inn = results_obj.get(inning, {})
        if not isinstance(inn, dict):
            continue
        h = _get(inn, "home", "points")
        a = _get(inn, "away", "points")
        if h is None or a is None:
            continue
        try:
            home_runs += int(h)
            away_runs += int(a)
            found += 1
        except (TypeError, ValueError):
            continue
    if found < 5:
        return None, None
    return home_runs, away_runs


def event_to_row(ev):
    status = ev.get("status", {}) or {}
    if not status.get("finalized"):
        return None
    home = _get(ev, "teams", "home", default={}) or {}
    away = _get(ev, "teams", "away", default={}) or {}
    hs = _get(ev, "results", "game", "home", "points")
    as_ = _get(ev, "results", "game", "away", "points")
    if hs is None or as_ is None:
        return None
    try:
        hs, as_ = int(hs), int(as_)
    except (TypeError, ValueError):
        return None

    f5_home, f5_away = extract_f5_score(ev.get("results", {}))
    if f5_home is not None and f5_away is not None:
        if f5_home > f5_away: f5_winner = 1
        elif f5_away > f5_home: f5_winner = 0
        else: f5_winner = -1
    else:
        f5_winner = None

    open_h, open_a, close_h, close_a = extract_full_ml(ev.get("odds", {}))
    f5_open_h, f5_open_a, f5_close_h, f5_close_a = extract_f5_ml(ev.get("odds", {}))
    starts_at = status.get("startsAt")

    return {
        "event_id": ev.get("eventID"),
        "game_date": starts_at,
        "season": (starts_at or "")[:4],
        "home_team": home.get("teamID") or _get(home, "names", "short"),
        "away_team": away.get("teamID") or _get(away, "names", "short"),
        "home_team_name": _get(home, "names", "long"),
        "away_team_name": _get(away, "names", "long"),
        "home_score": hs, "away_score": as_, "home_win": int(hs > as_),
        "open_home_ml": open_h, "open_away_ml": open_a,
        "close_home_ml": close_h, "close_away_ml": close_a,
        "f5_home_score": f5_home, "f5_away_score": f5_away,
        "f5_winner": f5_winner,
        "f5_open_home_ml": f5_open_h, "f5_open_away_ml": f5_open_a,
        "f5_close_home_ml": f5_close_h, "f5_close_away_ml": f5_close_a,
    }


def backfill_season(season, dry_run=False):
    if dry_run:
        start, end = f"{season}-04-01", f"{season}-04-04"
        log.info("=== DRY RUN %s: %s -> %s ===", season, start, end)
    else:
        start, end = SEASON_WINDOWS[season]
        log.info("=== %s: %s -> %s ===", season, start, end)

    rows, skipped = [], 0
    for ev in fetch_events(start, end, debug_dump=dry_run):
        r = event_to_row(ev)
        if r is None: skipped += 1
        else: rows.append(r)

    if not rows:
        log.warning("[%s] NO ROWS", season); return

    df = pd.DataFrame(rows)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce", utc=True)
    df = df.sort_values("game_date").reset_index(drop=True)

    suffix = "_dryrun" if dry_run else ""
    df.to_parquet(OUTPUT_DIR / f"mlb_historical_{season}{suffix}.parquet",
                  index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_{season}{suffix}.csv", index=False)

    f5_complete = df["f5_winner"].notna().sum()
    f5_ties = (df["f5_winner"] == -1).sum()
    f5_odds_cov = df["f5_open_home_ml"].notna().mean()
    log.info(
        "[%s] %s rows | skipped=%s | home_win=%.3f | full_ml_cov=%.1f%% "
        "| f5_results=%s | f5_ties=%s | f5_ml_cov=%.1f%%",
        season, len(df), skipped, df["home_win"].mean(),
        100 * df["open_home_ml"].notna().mean(),
        f5_complete, f5_ties, 100 * f5_odds_cov,
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, choices=list(SEASON_WINDOWS.keys()))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    seasons = [args.season] if args.season else list(SEASON_WINDOWS.keys())
    for s in seasons:
        backfill_season(s, dry_run=args.dry_run)
    log.info("DONE")


if __name__ == "__main__":
    main()
