"""
resolve_picks.py
================
Grades yesterday's OTJ picks against final scores and updates Supabase records.

Run this every morning AFTER games finish (8am+ local time recommended):
    python resolve_picks.py
    python resolve_picks.py --date 2026-03-07   # grade a specific date

What it does:
1. Fetches yesterday's final scores from BDL
2. Looks at the OTJ lean for each game in the slates table
3. Grades each game W/L based on spread result
4. Updates slates table: yesterday_record, yesterday_results, cumulative_record
5. Updates/inserts into yesterday_results table for the Record page

Setup:
    Same .env as push_to_supabase.py — uses SUPABASE_SERVICE_KEY
"""

import sys
import os
import json
from datetime import datetime, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Args ──────────────────────────────────────────────────────────────────────
# Default: grade yesterday. Pass --date=YYYY-MM-DD to grade a specific date.
grade_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        grade_date = arg.split("=")[1]
    elif arg == "--date" and sys.argv.index(arg) + 1 < len(sys.argv):
        grade_date = sys.argv[sys.argv.index(arg) + 1]

print(f"\n{'=' * 60}")
print(f"  OTJ Resolve Picks")
print(f"{'=' * 60}")
print(f"  Grading date: {grade_date}")
print(f"{'=' * 60}\n")


# ── Step 1: Fetch final scores from BDL ───────────────────────────────────────
def get_final_scores(date: str) -> dict:
    """
    Fetch final scores for a given date. Returns dict keyed by matchup string.

    FIX: BDL uses UTC dates. Late West Coast games (10PM ET tip = 3AM UTC next day)
    get indexed under the NEXT UTC date. We always fetch both the target date AND
    the following UTC date, then merge. This prevents CHA @ POR type misses.
    """
    import requests as _requests
    from datetime import datetime as _dt, timedelta as _td

    BDL_KEY = os.environ.get("BALLDONTLIE_API_KEY", "")

    # Fetch target date + next UTC date to catch late West Coast finishes
    date_dt = _dt.strptime(date, "%Y-%m-%d")
    next_date = (date_dt + _td(days=1)).strftime("%Y-%m-%d")

    all_games = []
    for fetch_date in [date, next_date]:
        try:
            resp = _requests.get(
                "https://api.balldontlie.io/v1/games",
                headers={"Authorization": BDL_KEY},
                params={"dates[]": fetch_date, "per_page": 100},
                timeout=20,
            )
            resp.raise_for_status()
            games = resp.json().get("data", [])
            all_games.extend(games)
            print(f"  BDL {fetch_date}: {len(games)} games returned")
        except Exception as e:
            print(f"  ⚠ BDL fetch failed for {fetch_date}: {e}")

    scores = {}
    for g in all_games:
        home = g.get("home_team", {}).get("abbreviation", "")
        away = g.get("visitor_team", {}).get("abbreviation", "")
        home_score = g.get("home_team_score")
        away_score = g.get("visitor_team_score")
        status = g.get("status", "")

        if home_score is None or away_score is None:
            continue
        try:
            hs, as_ = int(home_score), int(away_score)
        except (ValueError, TypeError):
            continue
        # Skip games with zero scores (not started) or suspiciously low (in progress)
        if hs == 0 and as_ == 0:
            continue
        if hs < 50 or as_ < 50:
            print(f"  ⚠ Skipping {away} @ {home} — scores look incomplete ({as_}-{hs})")
            continue

        matchup = f"{away} @ {home}"
        # Don't overwrite a good result already found from the primary date
        if matchup not in scores:
            scores[matchup] = {
                "home": home,
                "away": away,
                "home_score": hs,
                "away_score": as_,
                "home_won": hs > as_,
                "status": status,
            }

    print(f"✅ Found {len(scores)} final scores for {date} (inc. UTC+1 spillover)")
    return scores


# ── Step 2: Grade a single game ───────────────────────────────────────────────
def grade_game(game: dict, scores: dict) -> dict | None:
    """
    Grade one game from the slate against final scores.
    Returns dict with result info or None if ungradeable.
    """
    matchup = game.get("matchup", "")
    lean = game.get("edge", {}).get("lean")
    confidence = game.get("edge", {}).get("confidence", "INFO")
    score = game.get("edge", {}).get("score", 0)

    if not lean or matchup not in scores:
        return None

    final = scores[matchup]
    home_team = game.get("home", {}).get("team", "")
    away_team = game.get("away", {}).get("team", "")

    # Determine spread
    lean_is_home = lean == home_team
    spread = game.get("spread_home") if lean_is_home else game.get("spread_away")

    home_score = final["home_score"]
    away_score = final["away_score"]
    margin = home_score - away_score  # positive = home won

    # Grade moneyline — did the lean team win?
    # We grade straight up (did the lean team win the game) not spread cover.
    # The model issues a lean on a TEAM, not a specific number.
    # Spread cover is tracked separately in dog_covered for analytics only.
    lean_won = (lean_is_home and final["home_won"]) or (not lean_is_home and not final["home_won"])
    result = "W" if lean_won else "L"

    actual_winner = home_team if final["home_won"] else away_team
    score_str = f"{away_score}-{home_score}" if final["home_won"] else f"{home_score}-{away_score}"

    # Capture ML odds and spread at time of pick for outcome validation
    lean_is_home = lean == home_team
    ml_home = game.get("ml_home")
    ml_away = game.get("ml_away")
    closing_ml_lean = ml_home if lean_is_home else ml_away
    closing_ml_dog  = ml_away if lean_is_home else ml_home
    dog_team = away_team if lean_is_home else home_team
    home_score_final = final["home_score"]
    away_score_final = final["away_score"]
    margin_final = home_score_final - away_score_final
    dog_covered = None
    if spread is not None:
        try:
            sv = float(spread)
            if lean_is_home:
                dog_covered = margin_final < -sv  # away covers
            else:
                dog_covered = (-margin_final) < -sv  # home covers
        except (ValueError, TypeError):
            pass

    # Gut check flags that fired on this game
    gut_check_flags = []
    edge_data = game.get("edge", {})
    if edge_data.get("otj_juice_fade"):
        gut_check_flags.append("JUICE_FADE")
    if edge_data.get("otj_spread_rule"):
        gut_check_flags.append("SPREAD_VALUE")

    return {
        "matchup": matchup,
        "lean": lean,
        "confidence": confidence,
        "edge_score": score,
        "result": result,
        "final_score": f"{final['away_score']}-{final['home_score']}",
        "actual_winner": actual_winner,
        "spread": spread,
        "closing_ml_lean": closing_ml_lean,
        "closing_ml_dog": closing_ml_dog,
        "dog_team": dog_team,
        "dog_covered": dog_covered,
        "gut_check_flags": gut_check_flags,
    }


# ── Step 3: Calculate record string ──────────────────────────────────────────
def calc_record(wins: int, losses: int) -> str:
    return f"{wins}-{losses}"

def increment_record(record_str: str, result: str) -> str:
    """Add a W or L to a record string like '11-2'."""
    try:
        w, l = map(int, record_str.split("-"))
    except Exception:
        w, l = 0, 0
    if result == "W":
        w += 1
    else:
        l += 1
    return f"{w}-{l}"

def calc_streak(results: list) -> str:
    """Calculate streak from list of 'W'/'L' results (most recent first)."""
    if not results:
        return ""
    streak_type = results[0]
    count = 0
    for r in results:
        if r == streak_type:
            count += 1
        else:
            break
    return f"{streak_type}{count}"


# ── Main ──────────────────────────────────────────────────────────────────────

# Fetch final scores
print("⏳ Fetching final scores...")
scores = get_final_scores(grade_date)

if not scores:
    print(f"⚠ No final scores found for {grade_date}. Games may not be finished yet.")
    print("  Try running again after all games complete (after midnight ET).")
    sys.exit(0)

# Fetch yesterday's slate from Supabase
print(f"\n⏳ Fetching slate for {grade_date}...")
try:
    slate_resp = supabase.table("slates").select("*").eq("sport", "nba").eq("date", grade_date).single().execute()
    slate = slate_resp.data
except Exception as e:
    print(f"❌ Could not fetch slate for {grade_date}: {e}")
    sys.exit(1)

if not slate:
    print(f"❌ No slate found for {grade_date}. Run push_to_supabase.py for that date first.")
    sys.exit(1)

games = slate.get("games", [])
print(f"✅ Found slate with {len(games)} games")

# Grade each game
print(f"\n⏳ Grading games...")
results = []
wins = 0
losses = 0

for game in games:
    graded = grade_game(game, scores)
    if not graded:
        matchup = game.get("matchup", "?")
        lean = game.get("edge", {}).get("lean")
        if lean and matchup not in scores:
            # Has a lean but no score found — likely UTC spillover miss or game not finished
            # Mark PENDING so it doesn't silently become a loss
            print(f"  ⏳ PENDING {matchup} — lean={lean}, score not found (will need manual re-run)")
        else:
            print(f"  ⚠ Skipped {matchup} — no lean")
        continue

    results.append(graded)
    if graded["result"] == "W":
        wins += 1
        print(f"  ✅ W — {graded['matchup']} | Lean: {graded['lean']} | Final: {graded['final_score']}")
    else:
        losses += 1
        print(f"  ❌ L — {graded['matchup']} | Lean: {graded['lean']} | Final: {graded['final_score']} | Won: {graded['actual_winner']}")

if not results:
    print("⚠ No games could be graded.")
    sys.exit(0)

yesterday_record = calc_record(wins, losses)
print(f"\n📊 Yesterday: {yesterday_record} ({wins}W {losses}L)")

# ── Step 4: Update cumulative record ─────────────────────────────────────────
print(f"\n⏳ Updating cumulative record...")

# Get previous cumulative record (from slate BEFORE yesterday's)
try:
    prev_resp = supabase.table("slates") \
        .select("cumulative_record, date") \
        .eq("sport", "nba") \
        .lt("date", grade_date) \
        .order("date", desc=True) \
        .limit(1) \
        .execute()
    prev_record = prev_resp.data[0]["cumulative_record"] if prev_resp.data else "0-0"
except Exception:
    prev_record = "0-0"

print(f"  Previous cumulative: {prev_record}")

# Add yesterday's results to cumulative
try:
    prev_w, prev_l = map(int, prev_record.split("-"))
except Exception:
    prev_w, prev_l = 0, 0

new_cumulative = calc_record(prev_w + wins, prev_l + losses)
print(f"  New cumulative: {new_cumulative}")

# ── Step 5: Calculate weekly/monthly records ──────────────────────────────────
grade_dt = datetime.strptime(grade_date, "%Y-%m-%d")

# Week = Monday to Sunday
week_start = (grade_dt - timedelta(days=grade_dt.weekday())).strftime("%Y-%m-%d")
month_start = grade_dt.strftime("%Y-%m-01")

def fetch_record_range(start: str, end: str) -> tuple:
    """Sum W/L from all slates in a date range."""
    try:
        resp = supabase.table("yesterday_results") \
            .select("wins, losses") \
            .gte("date", start) \
            .lte("date", end) \
            .execute()
        w = sum(r.get("wins", 0) for r in (resp.data or []))
        l = sum(r.get("losses", 0) for r in (resp.data or []))
        return w, l
    except Exception:
        return 0, 0

week_w, week_l = fetch_record_range(week_start, grade_date)
week_w += wins
week_l += losses

month_w, month_l = fetch_record_range(month_start, grade_date)
month_w += wins
month_l += losses

weekly_record = calc_record(week_w, week_l)
monthly_record = calc_record(month_w, month_l)

print(f"  This week: {weekly_record}")
print(f"  This month: {monthly_record}")

# ── Step 6: Calculate streak ─────────────────────────────────────────────────
try:
    recent_resp = supabase.table("yesterday_results") \
        .select("date, wins, losses") \
        .eq("sport", "nba") \
        .order("date", desc=True) \
        .limit(10) \
        .execute()

    recent = recent_resp.data or []
    # Build result list: W if wins > losses, L otherwise
    recent_results = []
    # Add today's results first
    for _ in range(wins):
        recent_results.append("W")
    for _ in range(losses):
        recent_results.append("L")
    # Add previous days
    for day in recent:
        if day.get("wins", 0) > day.get("losses", 0):
            recent_results.append("W")
        else:
            recent_results.append("L")

    streak = calc_streak(recent_results)
except Exception:
    streak = f"W{wins}" if wins > losses else f"L{losses}"

print(f"  Streak: {streak}")

# ── Step 7: Push updates to Supabase ─────────────────────────────────────────
print(f"\n⏳ Pushing updates to Supabase...")

# Update yesterday's slate row
try:
    supabase.table("slates").update({
        "yesterday_record": yesterday_record,
        "yesterday_results": results,
        "cumulative_record": new_cumulative,
    }).eq("sport", "nba").eq("date", grade_date).execute()
    print(f"  ✅ Updated slates row for {grade_date}")
except Exception as e:
    print(f"  ❌ Failed to update slates: {e}")

# Update TODAY's slate cumulative_record so the live site shows it
today = datetime.now().strftime("%Y-%m-%d")
try:
    supabase.table("slates").update({
        "cumulative_record": new_cumulative,
        "yesterday_record": yesterday_record,
        "yesterday_results": results,
    }).eq("sport", "nba").eq("date", today).execute()
    print(f"  ✅ Updated today's slate ({today}) cumulative record")
except Exception as e:
    print(f"  ⚠ Could not update today's slate: {e}")

# Upsert into yesterday_results table (for Record page)
try:
    supabase.table("yesterday_results").upsert({
        "date": grade_date,
        "sport": "nba",
        "wins": wins,
        "losses": losses,
        "record": yesterday_record,
        "weekly_record": weekly_record,
        "monthly_record": monthly_record,
        "streak": streak,
        "cumulative_record": new_cumulative,
        "results": results,
        "graded_at": datetime.now().isoformat(),
    }, on_conflict="date,sport").execute()

    # ── Track gut check flag outcomes for system validation ───────────────────
    # Each game that had a gut check flag fired gets logged separately so we
    # can later query: "when JUICE_FADE fired, how often did the dog cover?"
    juice_fade_games = [r for r in results if "JUICE_FADE" in r.get("gut_check_flags", [])]
    spread_value_games = [r for r in results if "SPREAD_VALUE" in r.get("gut_check_flags", [])]

    for r in juice_fade_games + spread_value_games:
        try:
            for flag in r.get("gut_check_flags", []):
                supabase.table("gut_check_outcomes").upsert({
                    "date": grade_date,
                    "sport": "nba",
                    "matchup": r["matchup"],
                    "flag_type": flag,
                    "lean_team": r["lean"],
                    "dog_team": r.get("dog_team"),
                    "dog_covered": r.get("dog_covered"),
                    "closing_ml_lean": r.get("closing_ml_lean"),
                    "closing_ml_dog": r.get("closing_ml_dog"),
                    "edge_score": r.get("edge_score"),
                    "spread": r.get("spread"),
                    "result": r["result"],
                    "graded_at": datetime.now().isoformat(),
                }, on_conflict="date,sport,matchup,flag_type").execute()
        except Exception as e:
            print(f"  ⚠ gut_check_outcomes log failed (run SQL below to create table): {e}")
    # ── End gut check outcome tracking ───────────────────────────────────────
    print(f"  ✅ Upserted yesterday_results for {grade_date}")
except Exception as e:
    print(f"  ⚠ yesterday_results table may not exist yet: {e}")
    print(f"     Run this SQL in Supabase to create it:")
    print(f"""
     create table yesterday_results (
       id bigint generated always as identity primary key,
       date date not null,
       sport text not null default 'nba',
       wins int default 0,
       losses int default 0,
       record text,
       weekly_record text,
       monthly_record text,
       streak text,
       cumulative_record text,
       results jsonb default '[]',
       graded_at timestamptz default now(),
       unique(date, sport)
     );
     alter table yesterday_results enable row level security;
     create policy "anon read" on yesterday_results for select using (true);
    """)

print(f"\n{'=' * 60}")
print(f"  ✅ Resolve complete for {grade_date}")
print(f"  Yesterday: {yesterday_record} | Cumulative: {new_cumulative} | Streak: {streak}")
print(f"{'=' * 60}\n")
