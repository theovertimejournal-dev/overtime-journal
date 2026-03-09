"""
push_to_supabase.py
====================
Runs the NBA edge analyzer and pushes today's slate to Supabase.

Usage:
    python push_to_supabase.py                  # Push today's NBA slate
    python push_to_supabase.py --date 2026-03-07
    python push_to_supabase.py --dry-run        # Print what would be pushed, don't write

Setup:
    pip install supabase python-dotenv

Environment variables (in .env file next to this script):
    SUPABASE_URL=https://nuemrevwtawatrjsmxbj.supabase.co
    SUPABASE_SERVICE_KEY=your_service_role_key_here   ← NOT the anon key
"""

import sys
import json
import subprocess
import os
from datetime import datetime
from pathlib import Path
from nba_edge_analyzer import build_props_slate


# ── Load env ──────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # .env vars set manually

from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # must be service role key

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set. Add it to your .env file.")
    print("   Find it in: Supabase → Project Settings → API → service_role key")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Config ────────────────────────────────────────────────────────────────────
SPORT = "nba"
ANALYZER_SCRIPT = Path(__file__).parent / "nba_edge_analyzer.py"

# ── Args ──────────────────────────────────────────────────────────────────────
dry_run = "--dry-run" in sys.argv
game_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]
    elif arg == "--date" and sys.argv.index(arg) + 1 < len(sys.argv):
        game_date = sys.argv[sys.argv.index(arg) + 1]

print(f"\n{'=' * 60}")
print(f"  OTJ → Supabase Push")
print(f"{'=' * 60}")
print(f"  Sport:    {SPORT.upper()}")
print(f"  Date:     {game_date}")
print(f"  Dry run:  {dry_run}")
print(f"{'=' * 60}\n")


# ── Step 1: Run the analyzer ──────────────────────────────────────────────────
print("⏳ Running NBA edge analyzer...")
try:
    result = subprocess.run(
        [sys.executable, str(ANALYZER_SCRIPT), "--json", f"--date={game_date}"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"❌ Analyzer error:\n{result.stderr}")
        sys.exit(1)

    data = json.loads(result.stdout)
except subprocess.TimeoutExpired:
    print("❌ Analyzer timed out after 120 seconds.")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"❌ Could not parse analyzer output: {e}")
    print(f"   Output was:\n{result.stdout[:500]}")
    sys.exit(1)

if "error" in data:
    print(f"❌ Analyzer returned error: {data['error']}")
    sys.exit(1)

games = data.get("games", [])
print(f"✅ Analyzer complete — {len(games)} games found\n")


# ── Step 2: Format slate for Supabase ─────────────────────────────────────────
def get_cumulative_record() -> str:
    """Pull the most recent cumulative record from Supabase instead of hardcoding."""
    try:
        resp = supabase.table("slates")             .select("cumulative_record")             .eq("sport", "nba")             .order("date", desc=True)             .limit(1)             .execute()
        if resp.data and resp.data[0].get("cumulative_record"):
            return resp.data[0]["cumulative_record"]
    except Exception as e:
        print(f"  ⚠ Could not fetch cumulative record: {e}")
    return "0-0"


def format_slate(data: dict, game_date: str) -> dict:
    """Format analyzer output to match the slates table schema."""
    games = data.get("games", [])
    slate_narrative = data.get("slate_narrative", {})
    sharp_games = [g for g in games if g["edge"]["confidence"] == "SHARP"]

    # Use Claude-generated headline if available, fallback to auto-generated
    headline = slate_narrative.get("headline")
    if not headline and sharp_games:
        h = sharp_games[0]
        headline = f"{h['matchup']} — {h['edge']['lean']} edge (score: {h['edge']['score']:+.1f})"

    return {
        "sport": SPORT,
        "date": game_date,
        "games_count": len(games),
        "headline": headline,
        "headline_body": slate_narrative.get("headline_body"),
        "sharp_summary": slate_narrative.get("sharp_summary"),
        "cumulative_record": get_cumulative_record(),
        "cumulative_note": "since launch",
        "yesterday_record": None,      # ← updated by resolve_picks.py after games end
        "yesterday_results": [],
        "b2b_tiers": data.get("b2b_tiers"),
        "b2b_tags": data.get("b2b_tags", []),
        "b2b_lesson": slate_narrative.get("b2b_lesson"),
        "spread_mismatches": data.get("spread_mismatches", []),
        "games": games,                # full game data stored as JSONB
        "generated_at": data.get("generated_at", datetime.now().isoformat()),
    }


slate_data = format_slate(data, game_date)

if dry_run:
    print("🔍 DRY RUN — would push this to Supabase:\n")
    print(json.dumps(slate_data, indent=2, default=str))
    print(f"\n✅ Dry run complete. No data written.")
    sys.exit(0)


# ── Step 3: Push to Supabase ──────────────────────────────────────────────────
print(f"⏳ Pushing slate to Supabase...")

# ── Parlay odds lock ──────────────────────────────────────────────────────────
# If a parlay was already pushed today, freeze those leg odds.
# Re-runs should never overwrite the opening parlay odds — same rule as game opening odds.
def freeze_parlay_odds(new_parlay: dict | None, existing_parlay: dict | None) -> dict | None:
    """
    Merge new parlay structure with existing locked odds.
    Preserves: pick, pick_type, score, matchup per leg (the stuff that was live at build time).
    Updates:   label, top_signal, confidence (non-odds fields can refresh).
    """
    if not new_parlay:
        return existing_parlay  # keep existing if new run produced nothing
    if not existing_parlay:
        return new_parlay  # first push — no lock needed yet

    existing_legs = {leg["matchup"]: leg for leg in existing_parlay.get("legs", [])}
    locked_legs = []

    for leg in new_parlay.get("legs", []):
        matchup = leg["matchup"]
        if matchup in existing_legs:
            existing_leg = existing_legs[matchup]
            # Freeze the odds-sensitive fields from first push
            locked_leg = {
                **leg,  # start with new (gets label, signal updates)
                "pick":      existing_leg.get("pick", leg["pick"]),       # LOCKED
                "pick_type": existing_leg.get("pick_type", leg["pick_type"]),  # LOCKED
                "score":     existing_leg.get("score", leg["score"]),     # LOCKED
                "mismatch_gap": existing_leg.get("mismatch_gap", leg.get("mismatch_gap")),  # LOCKED
                "odds_locked": True,
                "odds_locked_at": existing_parlay.get("generated_at", ""),
            }
            locked_legs.append(locked_leg)
        else:
            # New leg not in existing parlay — use as-is (fresh)
            locked_legs.append({**leg, "odds_locked": False})

    return {
        **new_parlay,
        "legs": locked_legs,
        "generated_at": existing_parlay.get("generated_at", new_parlay["generated_at"]),  # keep original time
    }

# Fetch existing slate to check for locked parlay
existing_parlay = None
try:
    ex_slate_resp = supabase.table("slates") \
        .select("id,games") \
        .eq("sport", SPORT) \
        .eq("date", game_date) \
        .single() \
        .execute()
    if ex_slate_resp.data:
        existing_games = ex_slate_resp.data.get("games") or {}
        if isinstance(existing_games, dict):
            existing_parlay = existing_games.get("otj_parlay")
        print(f"  {'🔒 Existing parlay found — locking odds' if existing_parlay else '🆕 First push — no lock needed'}")
except Exception:
    pass  # No existing row — first insert

# Apply parlay lock
new_parlay = data.get("otj_parlay")
locked_parlay = freeze_parlay_odds(new_parlay, existing_parlay)

# Inject locked parlay back into slate data
if "games" not in slate_data or not isinstance(slate_data.get("games"), dict):
    # games is a list — parlay lives at top level of the JSON output
    pass  # parlay is separate from games list, store it directly
slate_data["otj_parlay"] = locked_parlay
# ── End parlay odds lock ──────────────────────────────────────────────────────

try:
    # Upsert — if a slate for this sport/date already exists, update it
    response = supabase.table("slates").upsert(
        slate_data,
        on_conflict="sport,date"
    ).execute()

    print(f"✅ Slate pushed successfully!")
    print(f"   Games: {slate_data['games_count']}")
    print(f"   Headline: {slate_data['headline']}")
    if locked_parlay:
        locked_count = sum(1 for l in locked_parlay.get("legs", []) if l.get("odds_locked"))
        print(f"   Parlay: {locked_parlay['leg_count']} legs ({locked_count} odds locked)")

except Exception as e:
    print(f"❌ Supabase error: {e}")
    sys.exit(1)


# ── Step 4: Push individual games to games table (optional) ───────────────────
print(f"\n⏳ Pushing individual games...")

# First get the slate ID we just created
try:
    slate_resp = supabase.table("slates").select("id").eq("sport", SPORT).eq("date", game_date).single().execute()
    slate_id = slate_resp.data["id"]
except Exception as e:
    print(f"⚠ Could not get slate ID, skipping games table push: {e}")
    slate_id = None

if slate_id:
    print(f"  Using slate_id: {slate_id}")
    for game in games:
        matchup_key = game.get("matchup", "")
        now_iso = datetime.now().isoformat()

        # Check if this game already exists with opening odds locked
        existing = None
        try:
            ex_resp = supabase.table("games")                 .select("id,opening_spread,opening_ml_home,opening_ml_away,opening_total")                 .eq("slate_id", slate_id)                 .eq("matchup", matchup_key)                 .single()                 .execute()
            existing = ex_resp.data
        except Exception:
            pass  # No existing row — first insert

        # Lock opening odds on first insert only
        opening_spread   = existing["opening_spread"]   if existing and existing.get("opening_spread")   else game.get("spread")
        opening_ml_home  = existing["opening_ml_home"]  if existing and existing.get("opening_ml_home")  else game.get("ml_home")
        opening_ml_away  = existing["opening_ml_away"]  if existing and existing.get("opening_ml_away")  else game.get("ml_away")
        opening_total    = existing["opening_total"]     if existing and existing.get("opening_total")    else game.get("total")

        game_row = {
            "slate_id": slate_id,
            "matchup": matchup_key,
            "game_time": game.get("game_time", ""),
            "sport": SPORT,
            "date": game_date,
            "away_team": game.get("away", {}).get("team", ""),
            "home_team": game.get("home", {}).get("team", ""),
            "away_data": game.get("away", {}),
            "home_data": game.get("home", {}),
            "edge_data": game.get("edge", {}),
            # Opening odds — locked on first insert, never overwritten
            "opening_spread":  opening_spread,
            "opening_ml_home": opening_ml_home,
            "opening_ml_away": opening_ml_away,
            "opening_total":   opening_total,
            # Live odds — always update
            "spread": game.get("spread", None),
            "spread_home": game.get("spread_home", None),
            "spread_away": game.get("spread_away", None),
            "spread_home_odds": game.get("spread_home_odds", None),
            "spread_away_odds": game.get("spread_away_odds", None),
            "total": game.get("total", None),
            "ml_home": game.get("ml_home", None),
            "ml_away": game.get("ml_away", None),
            "odds_vendor": game.get("odds_vendor", None),
            "odds_updated_at": now_iso,
            "lean": game.get("edge", {}).get("lean", None),
            "confidence": game.get("edge", {}).get("confidence", None),
            "edge_score": game.get("edge", {}).get("score", None),
            "signals": game.get("edge", {}).get("signals", []),
            "narrative_summary": game.get("narrative", {}).get("summary"),
            "narrative_key_angle": game.get("narrative", {}).get("key_angle"),
            "narrative_contrarian": game.get("narrative", {}).get("contrarian_flag"),
            "narrative_ou_lean": game.get("narrative", {}).get("ou_lean"),
            "narrative_otj_pick": game.get("narrative", {}).get("otj_pick"),
            "narrative_signals": game.get("narrative", {}).get("narrative_signals", []),
        }
        try:
            supabase.table("games").upsert(
                game_row,
                on_conflict="slate_id,matchup"
            ).execute()
            print(f"  ✅ {matchup_key}")
        except Exception as e:
            print(f"  ⚠ Could not push game {matchup_key}: {e}")

# ── Step 5: Build + push props slate ──────────

print(f"\n⏳ Building props slate...")
try:
    from nba_edge_analyzer import get_all_team_stats, get_todays_games, get_todays_injuries

    raw_games = get_todays_games(game_date)
    all_stats = get_all_team_stats(season=2025)
    all_team_ids = list(set(
        [g["home_team_id"] for g in raw_games] + [g["away_team_id"] for g in raw_games]
    ))
    todays_injuries = get_todays_injuries(game_date, all_team_ids)

    props = build_props_slate(
        games=raw_games,
        all_stats=all_stats,
        todays_injuries=todays_injuries,
        game_date=game_date,
    )

    if props:
        props_payload = {
            "date":         game_date,
            "props":        props,
            "games_count":  len(set(p["game_id"] for p in props)),
            "generated_at": datetime.now().isoformat(),
        }
        supabase.table("props_slates").upsert(
            props_payload, on_conflict="date"
        ).execute()
        print(f"✅ Props slate pushed — {len(props)} props")
    else:
        print(f"⚠ No props to push")

except Exception as e:
    print(f"⚠ Props push failed (non-fatal): {e}")


print(f"\n{'=' * 60}")
print(f"  ✅ OTJ push complete for {game_date}")
print(f"  Live at: overtimejournal.com/nba")
print(f"{'=' * 60}\n")

