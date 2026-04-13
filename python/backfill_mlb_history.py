"""
backfill_mlb_history.py — GitHub Actions version.
Writes parquets to ./data/ which the workflow uploads as artifacts.
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
            log.info("dumped sample event")
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


def extract_ml(odds_obj):
    h=a=ch=ca=None
    if not isinstance(odds_obj, dict): return h,a,ch,ca
    for oid, odd in odds_obj.items():
        if not isinstance(odd, dict): continue
        if oid.endswith("-ml-home"):
            h = odd.get("fairOdds") or odd.get("bookOdds")
            ch = odd.get("closeFairOdds") or odd.get("closeBookOdds")
        elif oid.endswith("-ml-away"):
            a = odd.get("fairOdds") or odd.get("bookOdds")
            ca = odd.get("closeFairOdds") or odd.get("closeBookOdds")
    def i(x):
        try: return int(x)
        except: return None
    return i(h), i(a), i(ch), i(ca)


def event_to_row(ev):
    if not _get(ev, "status", "finalized"): return None
    home = _get(ev, "teams", "home", default={}) or {}
    away = _get(ev, "teams", "away", default={}) or {}
    hs = _get(ev, "results", "game", "home", "points")
    as_ = _get(ev, "results", "game", "away", "points")
    if hs is None or as_ is None: return None
    try: hs, as_ = int(hs), int(as_)
    except: return None
    hml, aml, chml, caml = extract_ml(ev.get("odds", {}))
    return {
        "event_id": ev.get("eventID"),
        "game_date": ev.get("startsAt"),
        "season": (ev.get("startsAt") or "")[:4],
        "home_team": home.get("teamID") or _get(home, "names", "short"),
        "away_team": away.get("teamID") or _get(away, "names", "short"),
        "home_team_name": _get(home, "names", "long"),
        "away_team_name": _get(away, "names", "long"),
        "home_score": hs, "away_score": as_,
        "home_win": int(hs > as_),
        "home_starter": _get(ev, "players", "home", "starter", "name"),
        "away_starter": _get(ev, "players", "away", "starter", "name"),
        "home_ml": hml, "away_ml": aml,
        "close_home_ml": chml, "close_away_ml": caml,
        "venue": _get(ev, "venue", "name"),
    }


def backfill_season(season, dry_run=False):
    if dry_run:
        start = f"{season}-04-01"; end = f"{season}-04-04"
        log.info("=== DRY RUN %s: %s → %s ===", season, start, end)
    else:
        start, end = SEASON_WINDOWS[season]
        log.info("=== %s: %s → %s ===", season, start, end)

    rows, skipped = [], 0
    for ev in fetch_events(start, end, debug_dump=dry_run):
        r = event_to_row(ev)
        if r is None: skipped += 1
        else: rows.append(r)

    if not rows:
        log.warning("[%s] NO ROWS — check _sample_event.json", season); return

    df = pd.DataFrame(rows)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce", utc=True)
    df = df.sort_values("game_date").reset_index(drop=True)

    suffix = "_dryrun" if dry_run else ""
    df.to_parquet(OUTPUT_DIR / f"mlb_historical_{season}{suffix}.parquet",
                  index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_{season}{suffix}.csv", index=False)
    log.info("[%s] %s rows | skipped=%s | home_win=%.3f | ml_coverage=%.1f%%",
             season, len(df), skipped, df["home_win"].mean(),
             100 * df["close_home_ml"].notna().mean())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, choices=list(SEASON_WINDOWS.keys()))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    seasons = [args.season] if args.season else list(SEASON_WINDOWS.keys())
    for s in seasons: backfill_season(s, dry_run=args.dry_run)
    log.info("DONE")


if __name__ == "__main__":
    main()
