"""
resolve_picks.py
================
Resolves yesterday's game picks against final scores.
Runs automatically at the START of each pipeline run.

Logic:
- Fetches final scores from Balldontlie for yesterday
- Finds all game_picks where result IS NULL and game_time has passed
- Compares picked_team against winner
- Updates result = 'W' or 'L' in Supabase
- Updates cumulative record in slates table
"""

import os
import sys
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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BDL_API_KEY  = os.environ.get("BDL_API_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TEAM_ABBREV_MAP = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
}

def get_abbrev(full_name: str) -> str:
    return TEAM_ABBREV_MAP.get(full_name, full_name[:3].upper())


def fetch_final_scores(game_date: str) -> dict:
    """
    Fetch final scores from Balldontlie for a given date.
    Returns dict keyed by matchup string e.g. 'BKN @ DET' -> winner abbrev
    """
    headers = {"Authorization": BDL_API_KEY} if BDL_API_KEY else {}
    url = "https://api.balldontlie.io/v1/games"
    params = {"dates[]": game_date, "per_page": 30}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        games = resp.json().get("data", [])
    except Exception as e:
        print(f"  ⚠ BDL scores fetch failed: {e}")
        return {}

    results = {}
    for g in games:
        status = g.get("status", "")
        # Only process final games
        if "Final" not in str(status) and status != "3":
            continue

        home_score = g.get("home_team_score", 0)
        away_score = g.get("visitor_team_score", 0)
        home_abbrev = get_abbrev(g.get("home_team", {}).get("full_name", ""))
        away_abbrev = get_abbrev(g.get("visitor_team", {}).get("full_name", ""))

        if not home_abbrev or not away_abbrev:
            continue

        winner = home_abbrev if home_score > away_score else away_abbrev
        matchup = f"{away_abbrev} @ {home_abbrev}"
        results[matchup] = {
            "winner": winner,
            "home": home_abbrev,
            "away": away_abbrev,
            "home_score": home_score,
            "away_score": away_score,
        }
        print(f"  📊 {matchup}: {away_abbrev} {away_score} — {home_abbrev} {home_score} → Winner: {winner}")

    return results


def resolve_picks(game_date: str = None):
    """
    Main resolve function — matches picks against final scores.
    """
    # Default to yesterday
    if not game_date:
        game_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"\n{'─' * 50}")
    print(f"  🎯 Resolving picks for {game_date}")
    print(f"{'─' * 50}")

    # Fetch final scores
    scores = fetch_final_scores(game_date)
    if not scores:
        print(f"  ℹ No final scores found for {game_date} — skipping resolution")
        return {"resolved": 0, "wins": 0, "losses": 0}

    # Fetch pending picks for this date
    try:
        picks_resp = supabase.table("game_picks") \
            .select("*") \
            .eq("slate_date", game_date) \
            .is_("result", "null") \
            .execute()
        pending_picks = picks_resp.data or []
    except Exception as e:
        print(f"  ⚠ Could not fetch pending picks: {e}")
        return {"resolved": 0, "wins": 0, "losses": 0}

    if not pending_picks:
        print(f"  ℹ No pending picks found for {game_date}")
        return {"resolved": 0, "wins": 0, "losses": 0}

    print(f"  Found {len(pending_picks)} pending picks to resolve")

    wins = 0
    losses = 0
    resolved = 0

    for pick in pending_picks:
        matchup   = pick.get("matchup", "")
        picked    = pick.get("picked_team", "")
        pick_id   = pick.get("id")

        game_result = scores.get(matchup)
        if not game_result:
            print(f"  ⚠ No final score found for {matchup} — leaving pending")
            continue

        winner  = game_result["winner"]
        correct = (picked == winner)
        result  = "W" if correct else "L"

        try:
            supabase.table("game_picks").update({"result": result}).eq("id", pick_id).execute()
            resolved += 1
            if correct:
                wins += 1
                print(f"  ✅ {matchup} — picked {picked} → WIN")
            else:
                losses += 1
                print(f"  ❌ {matchup} — picked {picked}, winner was {winner} → LOSS")
        except Exception as e:
            print(f"  ⚠ Could not update pick {pick_id}: {e}")

    print(f"\n  📈 Resolved: {resolved} picks — {wins}W / {losses}L")

    # Update cumulative record in slates table for this date
    if resolved > 0:
        try:
            slate_resp = supabase.table("slates") \
                .select("id, cumulative_record") \
                .eq("sport", "nba") \
                .eq("date", game_date) \
                .single() \
                .execute()

            if slate_resp.data:
                # Parse existing record e.g. "11-2"
                rec = slate_resp.data.get("cumulative_record", "0-0")
                try:
                    w, l = map(int, rec.split("-"))
                except Exception:
                    w, l = 0, 0
                new_w = w + wins
                new_l = l + losses
                new_rec = f"{new_w}-{new_l}"
                supabase.table("slates").update({
                    "cumulative_record": new_rec,
                    "yesterday_record": f"{wins}-{losses}",
                }).eq("id", slate_resp.data["id"]).execute()
                print(f"  📊 Cumulative record updated: {rec} → {new_rec}")
        except Exception as e:
            print(f"  ⚠ Could not update cumulative record: {e}")

    return {"resolved": resolved, "wins": wins, "losses": losses}


if __name__ == "__main__":
    game_date = None
    for arg in sys.argv[1:]:
        if arg.startswith("--date="):
            game_date = arg.split("=")[1]
        elif arg == "--date" and sys.argv.index(arg) + 1 < len(sys.argv):
            game_date = sys.argv[sys.argv.index(arg) + 1]

    resolve_picks(game_date)
