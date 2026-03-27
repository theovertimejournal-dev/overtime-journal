"""
push_mlb_to_supabase.py
=======================
MLB equivalent of push_to_supabase.py for NBA.

What it does:
  1. Calls mlb_bullpen_analyzer_v2.py (--json) to get today's games + edges
  2. Fetches ML/Spread/Total odds from SportsGameOdds API
  3. Writes one row to `slates` table  (sport = "mlb")
  4. Writes one row per game to `games` table
  5. Generates a Claude narrative for each game (same pattern as NBA)

Supabase tables used (same schema as NBA, sport column differentiates):
  slates  — id, sport, date, games (JSONB), created_at
  games   — id, slate_id, sport, matchup, game_id,
             away_team, home_team, game_time, venue,
             lean, confidence, signals (JSONB),
             ml_home, ml_away, spread_home, spread_away, total,
             odds_vendor, odds_updated_at,
             away_bullpen (JSONB), home_bullpen (JSONB),
             away_pythagorean (JSONB), home_pythagorean (JSONB),
             park_factor (JSONB), away_tto (JSONB), home_tto (JSONB),
             narrative, status, created_at

Usage:
  python push_mlb_to_supabase.py
  python push_mlb_to_supabase.py --date=2026-04-01
  python push_mlb_to_supabase.py --date=2026-04-01 --no-narrative
"""

import sys
import os
import json
import subprocess
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY      = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SGO_API_KEY       = os.environ.get("SPORTSGAMEODDS_API_KEY", "")

NARRATIVE_MODEL   = "claude-sonnet-4-20250514"
SPORT             = "mlb"

# SportsGameOdds endpoint for MLB
SGO_BASE          = "https://api.sportsgameodds.com/v2"
SGO_HEADERS       = {"X-Api-Key": SGO_API_KEY}

# Preferred sportsbook order for odds selection (same as NBA)
VENDOR_PRIORITY   = ["draftkings", "fanduel", "caesars", "betmgm", "bet365"]

# ── Arg parsing ───────────────────────────────────────────────────────────────
game_date    = datetime.now().strftime("%Y-%m-%d")
no_narrative = False
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]
    elif arg == "--no-narrative":
        no_narrative = True

print(f"\n{'=' * 60}")
print(f"  ⚾ OTJ MLB Slate Push — {game_date}")
print(f"  {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 60}\n")

# ── Guards ────────────────────────────────────────────────────────────────────
if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Step 1: Run the MLB analyzer in JSON mode ─────────────────────────────────
print("⏳ Running MLB bullpen analyzer...")

analyzer_path = Path(__file__).parent / "mlb_bullpen_analyzer_v2.py"
try:
    result = subprocess.run(
        [sys.executable, str(analyzer_path), "--json", f"--date={game_date}"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"  ❌ Analyzer exited with code {result.returncode}")
        print(result.stderr)
        sys.exit(1)

    analyzer_output = json.loads(result.stdout)
    games_raw = analyzer_output.get("games", [])
    print(f"  ✅ Analyzer returned {len(games_raw)} game(s)")

except subprocess.TimeoutExpired:
    print("  ❌ Analyzer timed out after 120s")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"  ❌ Analyzer output is not valid JSON: {e}")
    print("  Raw output:", result.stdout[:500])
    sys.exit(1)
except Exception as e:
    print(f"  ❌ Analyzer failed: {e}")
    sys.exit(1)

if not games_raw:
    print(f"  ℹ️  No MLB games on {game_date} — nothing to push")
    sys.exit(0)


# ── Step 2: Fetch odds from SportsGameOdds ────────────────────────────────────
print("\n⏳ Fetching MLB odds from SportsGameOdds...")

import requests

sgo_odds_by_matchup = {}

# SGO oddIDs for MLB core markets:
# moneyline: points-home-game-ml-home / points-away-game-ml-away
# run line:  points-home-game-spread-home / points-away-game-spread-away
# total:     points-game-game-ou-over
MLB_ODD_IDS = ",".join([
    "points-home-game-ml-home",
    "points-away-game-ml-away",
    "points-home-game-spread-home",
    "points-away-game-spread-away",
    "points-game-game-ou-over",
])

try:
    # First pass: no date filter, just get whatever MLB events SGO has right now.
    # oddsPresent=true (not oddsAvailable) catches games where odds exist but
    # aren't yet "available for wagering" (common early morning before line opens).
    resp = requests.get(
        f"{SGO_BASE}/events",
        headers=SGO_HEADERS,
        params={
            "leagueID":            "MLB",
            "oddsPresent":         "true",   # broader than oddsAvailable
            "oddID":               MLB_ODD_IDS,
            "includeOpposingOdds": "true",
            "finalized":           "false",  # only upcoming/live, not final
            "limit":               "30",
        },
        timeout=20
    )
    resp.raise_for_status()
    full_response = resp.json()
    sgo_events_all = full_response.get("data", [])

    # Filter to today's date client-side (more reliable than server-side timestamp filter)
    sgo_events = [
        e for e in sgo_events_all
        if game_date in (e.get("status", {}).get("startsAt", "") or "")
    ]
    print(f"  ✅ {len(sgo_events_all)} total SGO events, {len(sgo_events)} match {game_date}")
    if not sgo_events and sgo_events_all:
        # Debug: show what dates SGO does have so we can diagnose the mismatch
        dates_seen = sorted(set(
            (e.get("status", {}).get("startsAt", "") or "")[:10]
            for e in sgo_events_all
        ))
        print(f"  ℹ️  SGO has events for dates: {dates_seen}")

    for event in sgo_events:
        teams = event.get("teams", {})
        away_team = teams.get("away", {})
        home_team = teams.get("home", {})
        # SGO uses teams.away.names.short for abbreviation (e.g. "NYY", "BOS")
        away = (away_team.get("names", {}).get("short") or
                away_team.get("names", {}).get("medium") or "").upper().strip()
        home = (home_team.get("names", {}).get("short") or
                home_team.get("names", {}).get("medium") or "").upper().strip()
        if not away or not home:
            continue
        matchup_key = f"{away} @ {home}"

        odds_dict = event.get("odds", {})

        def best_book_odds(odd_id):
            odd = odds_dict.get(odd_id, {})
            by_book = odd.get("byBookmaker", {})
            for book in VENDOR_PRIORITY:
                entry = by_book.get(book, {})
                if entry.get("available") and entry.get("odds") is not None:
                    return entry["odds"], book
            for book_id, entry in by_book.items():
                if entry.get("available") and entry.get("odds") is not None:
                    return entry["odds"], book_id
            if odd.get("bookOdds") is not None:
                return odd["bookOdds"], "consensus"
            return None, None

        ml_home_odds, vendor = best_book_odds("points-home-game-ml-home")
        ml_away_odds, _      = best_book_odds("points-away-game-ml-away")

        spread_val = odds_dict.get("points-home-game-spread-home", {}).get("spreadValue")
        total_val  = odds_dict.get("points-game-game-ou-over",     {}).get("overUnderValue")

        sgo_odds_by_matchup[matchup_key] = {
            "vendor":      vendor or "",
            "ml_home":     int(ml_home_odds)     if ml_home_odds is not None else None,
            "ml_away":     int(ml_away_odds)     if ml_away_odds is not None else None,
            "spread_home": float(spread_val)     if spread_val   is not None else None,
            "spread_away": float(spread_val)*-1  if spread_val   is not None else None,
            "total":       float(total_val)      if total_val    is not None else None,
        }

    print(f"  Matched odds for: {list(sgo_odds_by_matchup.keys())}")

except Exception as e:
    print(f"  ⚠ SGO odds fetch failed (non-fatal — odds will be null): {e}")


# ── Step 3: Generate Claude narratives ───────────────────────────────────────
def generate_narrative(game_data: dict) -> str:
    """Call Claude to generate a 2-3 sentence game narrative."""
    if no_narrative or not ANTHROPIC_API_KEY:
        return ""
    try:
        import anthropic
        edge   = game_data.get("edge", {})
        abp    = game_data.get("away_bullpen", {})
        hbp    = game_data.get("home_bullpen", {})
        apyth  = game_data.get("away_pythagorean", {})
        hpyth  = game_data.get("home_pythagorean", {})
        park   = game_data.get("park_factor", {})
        game   = game_data.get("game", {})

        prompt = f"""You are OTJ's MLB analyst. Write a punchy 2-3 sentence game preview for bettors.

Game: {game.get('away_team')} @ {game.get('home_team')}
Venue: {game.get('venue')} (Park factor: {park.get('factor', 100)} — {park.get('label', 'NEUTRAL')})
Starters: {game.get('away_starter', {}).get('name', 'TBD')} vs {game.get('home_starter', {}).get('name', 'TBD')}

Edge lean: {edge.get('lean', 'None')} ({edge.get('confidence', 'LOW')})
Key signals: {', '.join(s['type'] + ': ' + s['detail'] for s in edge.get('signals', [])[:3])}

Away bullpen ERA: {abp.get('bullpen_era', 'N/A')} | Fatigue score: {abp.get('fatigue_score', 'N/A')}
Home bullpen ERA: {hbp.get('bullpen_era', 'N/A')} | Fatigue score: {hbp.get('fatigue_score', 'N/A')}
Away Pythagorean luck: {apyth.get('luck_factor', 0):+.1f}W | Home luck: {hpyth.get('luck_factor', 0):+.1f}W

Keep it sharp, specific, and under 60 words. Reference the actual teams and numbers."""

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=NARRATIVE_MODEL,
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"  ⚠ Narrative failed: {e}", file=sys.stderr)
        return ""


# ── Step 3b: Pre-flight column check ─────────────────────────────────────────
# Attempts a dry-run select to confirm required columns exist before processing
# all 11 games. Fails fast with a clear SQL migration message if any are missing.
print("⏳ Pre-flight column check...")
REQUIRED_COLUMNS = ["sport", "game_id", "venue", "status", "scores", "analysis", "narrative"]
try:
    # SELECT with all required columns — will 400 immediately if any are missing
    supabase.table("games").select(", ".join(REQUIRED_COLUMNS)).limit(1).execute()
    print(f"  ✅ All required columns present")
except Exception as e:
    msg = str(e)
    missing = [c for c in REQUIRED_COLUMNS if f"'{c}'" in msg or f'"{c}"' in msg]
    print(f"\n❌ MISSING COLUMNS in games table: {missing or 'see error below'}")
    print(f"   Error: {msg}")
    print(f"\n   Run mlb_games_migration.sql in your Supabase SQL editor first:")
    print("   https://supabase.com/dashboard/project/_/sql\n")
    sys.exit(1)


# ── Step 4: Build the slate payload ──────────────────────────────────────────
print("\n⏳ Building slate...")
now_iso = datetime.now().isoformat()

# Lightweight game list stored in slates.games JSONB (same shape as NBA)
slate_games_list = []
for gd in games_raw:
    g = gd.get("game", {})
    edge = gd.get("edge", {})
    matchup = f"{g.get('away_team', '')} @ {g.get('home_team', '')}"
    slate_games_list.append({
        "matchup":    matchup,
        "game_id":    str(g.get("game_pk", "")),
        "away_team":  g.get("away_team", ""),
        "home_team":  g.get("home_team", ""),
        "game_time":  g.get("game_time", "TBD"),
        "status":     g.get("status", ""),
        "lean":       edge.get("lean"),
        "confidence": edge.get("confidence", "LOW"),
    })

# ── Step 5: Upsert slate row ──────────────────────────────────────────────────
print("⏳ Upserting slate row...")
try:
    slate_resp = supabase.table("slates").upsert({
        "sport":      SPORT,
        "date":       game_date,
        "games":      slate_games_list,
        "created_at": now_iso,
    }, on_conflict="sport,date").execute()

    # Re-fetch to get the ID (upsert may not return it depending on Supabase version)
    slate_fetch = supabase.table("slates") \
        .select("id") \
        .eq("sport", SPORT) \
        .eq("date", game_date) \
        .single() \
        .execute()
    slate_id = slate_fetch.data["id"]
    print(f"  ✅ Slate upserted — id: {slate_id}")
except Exception as e:
    print(f"  ❌ Slate upsert failed: {e}")
    sys.exit(1)


# ── Step 6: Upsert each game row ──────────────────────────────────────────────
print("\n⏳ Upserting game rows...")
pushed = 0
failed = 0

for gd in games_raw:
    g     = gd.get("game", {})
    edge  = gd.get("edge", {})
    abp   = gd.get("away_bullpen", {})
    hbp   = gd.get("home_bullpen", {})
    apyth = gd.get("away_pythagorean", {})
    hpyth = gd.get("home_pythagorean", {})
    park  = gd.get("park_factor", {})
    atto  = gd.get("away_tto", {})
    htto  = gd.get("home_tto", {})
    alr   = gd.get("away_lr_matchup", {})
    hlr   = gd.get("home_lr_matchup", {})

    away    = g.get("away_team", "")
    home    = g.get("home_team", "")
    matchup = f"{away} @ {home}"

    # Merge in odds
    odds = sgo_odds_by_matchup.get(matchup, {})

    # Narrative
    print(f"  ✍ Generating narrative for {matchup}...")
    narrative = generate_narrative(gd)

    try:
        supabase.table("games").upsert({
            "slate_id":         slate_id,
            "sport":            SPORT,
            "matchup":          matchup,
            "game_id":          str(g.get("game_pk", "")),
            "away_team":        away,
            "home_team":        home,
            "game_time":        g.get("game_time", "TBD"),
            "venue":            g.get("venue", ""),
            "status":           g.get("status", ""),
            "lean":             edge.get("lean"),
            "confidence":       edge.get("confidence", "LOW"),
            "signals":          edge.get("signals", []),
            "scores":           edge.get("scores", {}),
            # Odds
            "ml_home":          int(odds["ml_home"])        if odds.get("ml_home")     is not None else None,
            "ml_away":          int(odds["ml_away"])        if odds.get("ml_away")     is not None else None,
            "spread_home":      float(odds["spread_home"])  if odds.get("spread_home") is not None else None,
            "spread_away":      float(odds["spread_away"])  if odds.get("spread_away") is not None else None,
            "total":            float(odds["total"])        if odds.get("total")       is not None else None,
            "odds_vendor":      odds.get("vendor"),
            "odds_updated_at":  now_iso if odds else None,
            # Full MLB analysis packed into one JSONB column.
            # Avoids adding 9 sport-specific columns to the shared games table.
            # Frontend can unpack: game.analysis.away_bullpen, .park_factor, etc.
            "analysis": {
                "away_bullpen":     abp,
                "home_bullpen":     hbp,
                "away_pythagorean": apyth,
                "home_pythagorean": hpyth,
                "park_factor":      park,
                "away_tto":         atto,
                "home_tto":         htto,
                "away_lr_matchup":  alr,
                "home_lr_matchup":  hlr,
            },
            # Narrative
            "narrative":        narrative,
            "created_at":       now_iso,
        }, on_conflict="slate_id,matchup").execute()

        lean_str = f"{edge.get('lean')} ({edge.get('confidence')})" if edge.get("lean") else "No lean"
        odds_str = f"ML {odds.get('ml_home')}/{odds.get('ml_away')}" if odds else "No odds"
        print(f"  ✅ {matchup} — {lean_str} | {odds_str}")
        pushed += 1

    except Exception as e:
        print(f"  ❌ Game upsert failed ({matchup}): {e}")
        failed += 1

# ── Done ──────────────────────────────────────────────────────────────────────
print(f"\n  Games pushed: {pushed}  |  Failed: {failed}")
print(f"\n{'=' * 60}")
print(f"  ✅ MLB slate push complete — {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 60}\n")
