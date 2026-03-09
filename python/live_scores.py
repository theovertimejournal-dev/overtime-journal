"""
live_scores.py
==============
Fetches live/final NBA scores from Tank01 and updates Supabase
so the OTJ ticker shows real-time game status.

Ticker rules (enforced here — NO picks leaked):
  - Completed games : "BOS 114 DAL 103 · FINAL"  + W/L on our pick
  - In-progress     : "GSW 87 HOU 82 · Q3 4:22"
  - Upcoming        : "MIL @ NYK · 7:30 PM ET"   (NO lean shown)

Run manually:
    python live_scores.py
    python live_scores.py --date 2026-03-08

Scheduled via GitHub Actions at 9:30 PM ET nightly.
"""

import sys
import os
import json
import requests
from datetime import datetime, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
TANK01_KEY    = os.environ.get("TANK01_API_KEY", "")

TANK01_HOST   = "tank01-fantasy-stats.p.rapidapi.com"
TANK01_SCORES = "https://tank01-fantasy-stats.p.rapidapi.com/getNBAScoresForDate"
TANK01_GAMES  = "https://tank01-fantasy-stats.p.rapidapi.com/getNBAGamesForDate"

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)

if not TANK01_KEY:
    print("❌ TANK01_API_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Args ──────────────────────────────────────────────────────────────────────
target_date = datetime.now().strftime("%Y%m%d")   # Tank01 uses YYYYMMDD
target_date_iso = datetime.now().strftime("%Y-%m-%d")

for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        raw = arg.split("=")[1]
        # Accept both YYYY-MM-DD and YYYYMMDD
        clean = raw.replace("-", "")
        target_date = clean
        target_date_iso = f"{clean[:4]}-{clean[4:6]}-{clean[6:]}"
    elif arg == "--date" and sys.argv.index(arg) + 1 < len(sys.argv):
        raw = sys.argv[sys.argv.index(arg) + 1]
        clean = raw.replace("-", "")
        target_date = clean
        target_date_iso = f"{clean[:4]}-{clean[4:6]}-{clean[6:]}"

print(f"\n{'=' * 60}")
print(f"  OTJ Live Scores → Supabase")
print(f"{'=' * 60}")
print(f"  Date: {target_date_iso}")
print(f"{'=' * 60}\n")

HEADERS = {
    "x-rapidapi-key":  TANK01_KEY,
    "x-rapidapi-host": TANK01_HOST,
}

# ── Step 1: Fetch scores from Tank01 ─────────────────────────────────────────
def fetch_tank01_scores(date_str: str) -> list:
    """
    Hit Tank01 getNBAScoresForDate.
    Returns list of game dicts with home/away teams, scores, status.
    """
    try:
        resp = requests.get(
            TANK01_SCORES,
            headers=HEADERS,
            params={"gameDate": date_str, "topPerformers": "false"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        games = data.get("body", [])
        if isinstance(games, dict):
            games = list(games.values())
        print(f"✅ Tank01 returned {len(games)} games")
        return games
    except Exception as e:
        print(f"⚠ Tank01 fetch failed: {e}")
        return []


# ── Step 2: Parse Tank01 game into ticker item ────────────────────────────────
def parse_game(g: dict) -> dict:
    """
    Convert Tank01 game object to a clean ticker item.
    NEVER includes our lean/pick — only public game data.
    """
    home = g.get("home", g.get("homeTeam", g.get("teamIDHome", "")))
    away = g.get("away", g.get("awayTeam", g.get("teamIDAway", "")))

    # Tank01 sometimes uses full names, sometimes abbreviations
    # Normalize to abbreviation if possible
    home_abbr = g.get("homeTeamAbbr", g.get("teamAbvHome", home))
    away_abbr = g.get("awayTeamAbbr", g.get("teamAbvAway", away))

    home_score = g.get("homePts", g.get("homeScore", g.get("ptHome", None)))
    away_score = g.get("awayPts", g.get("awayScore", g.get("ptAway", None)))

    # Normalize scores
    try:
        home_score = int(home_score) if home_score not in (None, "", "0") else None
        away_score = int(away_score) if away_score not in (None, "", "0") else None
    except (ValueError, TypeError):
        home_score = away_score = None

    game_status = g.get("gameStatus", g.get("status", "")).lower()
    game_time   = g.get("gameTime", g.get("startTime", ""))
    game_clock  = g.get("gameClock", g.get("clock", ""))
    quarter     = g.get("currentPeriod", g.get("quarter", g.get("qtr", "")))

    matchup = f"{away_abbr} @ {home_abbr}"

    # ── Determine display state ───────────────────────────────────────────────
    is_final    = "final" in game_status or "completed" in game_status or "complete" in game_status
    is_live     = any(x in game_status for x in ["live", "inprogress", "in_progress", "in progress", "halftime"])
    is_upcoming = not is_final and not is_live

    if is_final and home_score is not None and away_score is not None:
        winner = home_abbr if home_score > away_score else away_abbr
        loser  = away_abbr if home_score > away_score else home_abbr
        w_score = max(home_score, away_score)
        l_score = min(home_score, away_score)
        display = f"{winner} def {loser} {w_score}-{l_score}"
        state   = "final"
    elif is_live and home_score is not None:
        clock_str = f" {game_clock}" if game_clock else ""
        qtr_str   = f"Q{quarter}" if quarter else "LIVE"
        display   = f"{away_abbr} {away_score} {home_abbr} {home_score} · {qtr_str}{clock_str}"
        state     = "live"
    else:
        # Upcoming — just show tip time, NO lean
        time_str = game_time if game_time else "TBD"
        display  = f"{matchup} · {time_str} ET"
        state    = "upcoming"

    return {
        "matchup":     matchup,
        "home":        home_abbr,
        "away":        away_abbr,
        "home_score":  home_score,
        "away_score":  away_score,
        "status":      state,
        "display":     display,       # what the ticker shows
        "raw_status":  game_status,
    }


# ── Step 3: Match Tank01 results against OTJ picks ────────────────────────────
def apply_pick_result(ticker_item: dict, otj_games: list) -> dict:
    """
    For FINAL games only — add W/L indicator if we had a pick.
    Does NOT add the lean itself — just the outcome symbol.
    """
    if ticker_item["status"] != "final":
        return ticker_item

    home = ticker_item["home"].upper()
    away = ticker_item["away"].upper()

    for g in otj_games:
        g_matchup = g.get("matchup", "")
        lean      = g.get("edge", {}).get("lean", "")
        spread    = g.get("spread_home") or g.get("spread_away")

        # Match by team abbreviations
        if home not in g_matchup and away not in g_matchup:
            continue

        if not lean:
            continue

        # Grade the result
        h = ticker_item["home_score"]
        a = ticker_item["away_score"]
        if h is None or a is None:
            continue

        lean_is_home = lean.upper() == home
        margin = h - a  # positive = home won

        try:
            spread_val = float(spread) if spread else None
        except (ValueError, TypeError):
            spread_val = None

        if spread_val is not None:
            if lean_is_home:
                covered = margin > -spread_val
            else:
                covered = (-margin) > -spread_val
        else:
            covered = (lean_is_home and h > a) or (not lean_is_home and a > h)

        # Append ✓ or ✗ to display — result only, no pick details
        symbol = " ✓" if covered else " ✗"
        ticker_item["display"] += symbol
        ticker_item["pick_result"] = "W" if covered else "L"
        break

    return ticker_item


# ── Step 4: Build full ticker payload ────────────────────────────────────────
def build_ticker(raw_games: list, otj_games: list) -> list:
    """
    Build ordered ticker list:
    1. Live games first (most exciting)
    2. Final games (with W/L if we had a pick)
    3. Upcoming games
    """
    live     = []
    finals   = []
    upcoming = []

    for g in raw_games:
        item = parse_game(g)
        if not item["display"]:
            continue

        item = apply_pick_result(item, otj_games)

        if item["status"] == "live":
            live.append(item)
        elif item["status"] == "final":
            finals.append(item)
        else:
            upcoming.append(item)

    # Order: live → finals → upcoming
    return live + finals + upcoming


# ── Main ──────────────────────────────────────────────────────────────────────

# Fetch live scores
print("⏳ Fetching scores from Tank01...")
raw_games = fetch_tank01_scores(target_date)

if not raw_games:
    print("⚠ No games returned from Tank01. Check date or API key.")
    sys.exit(0)

# Fetch today's OTJ slate from Supabase (for pick grading — used internally only)
print(f"\n⏳ Fetching OTJ slate for {target_date_iso}...")
otj_games = []
try:
    slate_resp = supabase.table("slates") \
        .select("games, yesterday_results, cumulative_record, yesterday_record") \
        .eq("sport", "nba") \
        .eq("date", target_date_iso) \
        .single() \
        .execute()
    otj_games = slate_resp.data.get("games", []) if slate_resp.data else []
    print(f"✅ Found {len(otj_games)} OTJ games in slate")
except Exception as e:
    print(f"⚠ Could not fetch OTJ slate: {e} — ticker will show scores only")

# Build ticker
print(f"\n⏳ Building ticker...")
ticker_items = build_ticker(raw_games, otj_games)

print(f"\n📺 Ticker preview ({len(ticker_items)} items):")
for item in ticker_items:
    status_icon = {"live": "🔴", "final": "✅", "upcoming": "🕐"}.get(item["status"], "·")
    print(f"  {status_icon} {item['display']}")

# Push ticker to Supabase — stored in slates.live_ticker
print(f"\n⏳ Pushing ticker to Supabase...")

ticker_payload = [{"display": t["display"], "status": t["status"]} for t in ticker_items]

try:
    # Update today's slate with live ticker data
    supabase.table("slates").update({
        "live_ticker": ticker_payload,
        "ticker_updated_at": datetime.now().isoformat(),
    }).eq("sport", "nba").eq("date", target_date_iso).execute()
    print(f"✅ Ticker pushed to slates table ({len(ticker_payload)} items)")
except Exception as e:
    print(f"⚠ Could not update slates ticker: {e}")
    print(f"   You may need to add these columns to the slates table:")
    print(f"""
    ALTER TABLE slates ADD COLUMN IF NOT EXISTS live_ticker jsonb default '[]';
    ALTER TABLE slates ADD COLUMN IF NOT EXISTS ticker_updated_at timestamptz;
    """)

# Also check if any games are now final and trigger a resolve hint
finals_count = sum(1 for t in ticker_items if t["status"] == "final")
live_count   = sum(1 for t in ticker_items if t["status"] == "live")
total        = len(ticker_items)

print(f"\n{'=' * 60}")
print(f"  ✅ Live scores complete for {target_date_iso}")
print(f"  Final: {finals_count}/{total} · Live: {live_count} · Upcoming: {total - finals_count - live_count}")
if finals_count == total and total > 0:
    print(f"  🎯 All games final — run resolve_picks.py to grade picks")
print(f"{'=' * 60}\n")
