"""
track_stars.py
===============
Daily star status tracker. Runs before the slate push.

1. Pulls current injury reports from BDL API
2. Compares against star_registry in Supabase
3. Detects status CHANGES (Out → Available = RETURN)
4. Updates star_registry with current status
5. Logs to star_status_log for history
6. Posts RETURN alerts to news_feed so characters can react

Usage:
    python track_stars.py
    python track_stars.py --date 2026-03-24
"""

import sys
import os
import json
import requests
import random
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BDL_KEY = os.environ.get("BALLDONTLIE_API_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BDL_BASE = "https://api.balldontlie.io"
BDL_HEADERS = {"Authorization": BDL_KEY}

scan_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        scan_date = arg.split("=")[1]

print(f"\n{'=' * 60}")
print(f"  OTJ Star Status Tracker")
print(f"  Date: {scan_date}")
print(f"{'=' * 60}\n")


# ── Pull current star registry ───────────────────────────────────────────────

print("⏳ Loading star registry...")
registry = supabase.table("star_registry").select("*").execute()
stars = {s["player_name"]: s for s in registry.data}
print(f"  ✅ {len(stars)} stars tracked")


# ── Pull today's injury reports from BDL ─────────────────────────────────────

print("⏳ Fetching injury reports from BDL...")

# Get today's games first
try:
    games_resp = requests.get(
        f"{BDL_BASE}/v1/games",
        params={"start_date": scan_date, "end_date": scan_date, "per_page": 25},
        headers=BDL_HEADERS, timeout=15
    )
    games = games_resp.json().get("data", [])
    print(f"  Found {len(games)} games today")
except Exception as e:
    print(f"  ⚠ Failed to fetch games: {e}")
    games = []

# Collect all injured players from today's games
injured_today = {}  # player_name -> {team, status, description}

for game in games:
    game_id = game.get("id")
    if not game_id:
        continue
    
    try:
        inj_resp = requests.get(
            f"{BDL_BASE}/v1/injuries",
            params={"game_ids[]": game_id, "per_page": 100},
            headers=BDL_HEADERS, timeout=15
        )
        injuries = inj_resp.json().get("data", [])
        
        for inj in injuries:
            player = inj.get("player", {})
            first = player.get("first_name", "")
            last = player.get("last_name", "")
            name = f"{first} {last}".strip()
            team = inj.get("team", {}).get("abbreviation", "")
            status = inj.get("status", "")
            desc = inj.get("comment", "") or inj.get("description", "") or ""
            
            if name and team:
                injured_today[name] = {
                    "team": team,
                    "status": status,
                    "description": desc,
                }
    except Exception as e:
        print(f"  ⚠ Failed to fetch injuries for game {game_id}: {e}")

print(f"  ✅ {len(injured_today)} players on injury reports today")


# ── Compare against registry — detect changes ───────────────────────────────

print("\n⏳ Detecting status changes...")

returns = []   # stars coming BACK
new_outs = []  # stars going OUT
unchanged = [] # no change

for star_name, star_data in stars.items():
    prev_status = star_data.get("status", "available")
    team = star_data.get("team", "")
    
    # Check if this star is on today's injury report
    if star_name in injured_today:
        inj = injured_today[star_name]
        current_status = inj["status"].lower()
        
        # Normalize status
        if current_status in ("out", "inactive"):
            current_status = "out"
        elif current_status in ("doubtful",):
            current_status = "doubtful"
        elif current_status in ("questionable", "probable", "day-to-day"):
            current_status = "questionable"
        else:
            current_status = "out"
        
        if prev_status == "available" and current_status == "out":
            new_outs.append({
                "name": star_name, "team": team,
                "new_status": current_status, "desc": inj["description"],
                "impact": star_data.get("impact_rating", 4.0),
            })
            print(f"  🔴 NEW OUT: {star_name} ({team}) — {inj['description']}")
        elif prev_status != current_status:
            print(f"  🟡 STATUS CHANGE: {star_name} ({team}): {prev_status} → {current_status}")
        else:
            unchanged.append(star_name)
        
        # Update registry
        update_data = {
            "status": current_status,
            "injury_type": inj["description"][:100] if inj["description"] else star_data.get("injury_type"),
            "updated_at": datetime.now().isoformat(),
        }
        if prev_status == "available" and current_status == "out":
            update_data["out_since"] = scan_date
            update_data["games_missed"] = 0
        elif current_status == "out":
            update_data["games_missed"] = (star_data.get("games_missed") or 0) + 1
        
        supabase.table("star_registry").update(update_data).eq("player_name", star_name).execute()
        
    else:
        # Star is NOT on injury report — they're available
        current_status = "available"
        
        if prev_status in ("out", "doubtful") and current_status == "available":
            games_missed = star_data.get("games_missed", 0) or 0
            out_since = star_data.get("out_since", "unknown")
            returns.append({
                "name": star_name, "team": team,
                "prev_status": prev_status,
                "games_missed": games_missed,
                "out_since": out_since,
                "impact": star_data.get("impact_rating", 4.0),
            })
            print(f"  🟢 RETURN DETECTED: {star_name} ({team}) — was {prev_status} since {out_since}, missed ~{games_missed} games!")
            
            # Update registry
            supabase.table("star_registry").update({
                "status": "available",
                "last_game_date": scan_date,
                "updated_at": datetime.now().isoformat(),
                "notes": f"Returned {scan_date} after missing ~{games_missed} games",
            }).eq("player_name", star_name).execute()
        
        elif prev_status == "available":
            unchanged.append(star_name)
    
    # Log to history
    try:
        supabase.table("star_status_log").upsert({
            "player_name": star_name,
            "team": team,
            "date": scan_date,
            "status": current_status,
            "on_injury_report": star_name in injured_today,
            "injury_desc": injured_today.get(star_name, {}).get("description", ""),
        }, on_conflict="player_name,date").execute()
    except Exception as e:
        print(f"  ⚠ Failed to log {star_name}: {e}")


# ── Post alerts to news_feed ─────────────────────────────────────────────────

if returns:
    print(f"\n⏳ Posting {len(returns)} return alerts...")
    
    for ret in returns:
        # Pick a character reaction
        character = random.choice(["yumi", "johnnybot", "krash"])
        
        reactions = {
            "yumi": [
                f"{ret['name']} is back for {ret['team']} after missing ~{ret['games_missed']} games. "
                f"The line may not reflect this yet. Adjust your thinking accordingly.",
                f"Quietly significant: {ret['name']} returns for {ret['team']} tonight. "
                f"The team's recent numbers were built without him. That changes now.",
            ],
            "johnnybot": [
                f"{ret['name']} is BACK for {ret['team']}. Been out since {ret['out_since']}. "
                f"If the line hasn't moved yet, somebody's about to get burned.",
                f"Wait — {ret['name']} is playing tonight? For {ret['team']}? "
                f"After {ret['games_missed']} games out? And the line is still the same? Interesting.",
            ],
            "krash": [
                f"{ret['name']} IS BACK. {ret['team']} just got a completely different team tonight. "
                f"{ret['games_missed']} games missed and he's about to remind everyone what he does.",
                f"LET'S GO. {ret['name']} returns for {ret['team']}! "
                f"The energy shift alone is worth 5 points. The talent is worth 10.",
            ],
        }
        
        body = random.choice(reactions.get(character, reactions["yumi"]))
        
        try:
            supabase.table("news_feed").upsert({
                "type": "star_return",
                "sport": "nba",
                "headline": f"🔄 STAR RETURN: {ret['name']} ({ret['team']}) — Back After {ret['games_missed']} Games",
                "body": body,
                "character": character,
                "severity": "breaking",
                "date": scan_date,
                "dedup_key": f"star_return_{ret['name']}_{scan_date}",
            }, on_conflict="dedup_key").execute()
            print(f"  ✅ Posted return alert for {ret['name']}")
        except Exception as e:
            print(f"  ⚠ Failed to post alert for {ret['name']}: {e}")

if new_outs:
    print(f"\n⏳ Posting {len(new_outs)} new injury alerts...")
    
    for out in new_outs:
        character = random.choice(["yumi", "johnnybot", "krash"])
        
        try:
            supabase.table("news_feed").upsert({
                "type": "star_injury",
                "sport": "nba",
                "headline": f"🚨 STAR OUT: {out['name']} ({out['team']}) — {out['desc'][:80]}",
                "body": f"{out['name']} has been ruled out for {out['team']}. Impact rating: {out['impact']}/6.0. Line may shift.",
                "character": character,
                "severity": "breaking",
                "date": scan_date,
                "dedup_key": f"star_out_{out['name']}_{scan_date}",
            }, on_conflict="dedup_key").execute()
            print(f"  ✅ Posted injury alert for {out['name']}")
        except Exception as e:
            print(f"  ⚠ Failed to post alert for {out['name']}: {e}")


# ── Summary ──────────────────────────────────────────────────────────────────

print(f"\n{'=' * 60}")
print(f"  Star Tracker Summary — {scan_date}")
print(f"{'=' * 60}")
print(f"  Stars tracked:    {len(stars)}")
print(f"  Returns detected: {len(returns)}")
print(f"  New injuries:     {len(new_outs)}")
print(f"  Unchanged:        {len(unchanged)}")

if returns:
    print(f"\n  🟢 RETURNS:")
    for r in returns:
        print(f"     {r['name']} ({r['team']}) — back after {r['games_missed']} games (impact: {r['impact']})")

if new_outs:
    print(f"\n  🔴 NEW OUTS:")
    for o in new_outs:
        print(f"     {o['name']} ({o['team']}) — {o['desc'][:60]}")

# List currently out stars
out_stars = [s for s in stars.values() if s.get("status") in ("out", "doubtful")]
if out_stars:
    print(f"\n  📋 CURRENTLY OUT:")
    for s in sorted(out_stars, key=lambda x: x.get("impact_rating", 0), reverse=True):
        since = s.get("out_since", "unknown")
        print(f"     {s['player_name']} ({s['team']}) — out since {since} | impact: {s.get('impact_rating', 0)}/6.0")

print(f"\n  ✅ Star tracking complete")
