"""
news_scanner.py
================
OTJ Live News Scanner — runs every 5 minutes during active hours.
Checks for newsworthy events and writes blurbs to the news_feed table.

Events detected:
- Fresh injury scratches (new since last scan)
- Big line movements (ML moved 100+ pts)
- Game final scores (as games finish)
- Standout performances (40+ pts, triple-doubles, etc.)
- Trade/transaction news (via ESPN API)

Each blurb gets a dedup_key to prevent duplicate alerts.

Usage:
    python news_scanner.py
    python news_scanner.py --date 2026-03-20
"""

import sys
import os
import json
import requests
import hashlib
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
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BDL_HEADERS = {"Authorization": BDL_KEY}
BDL_BASE = "https://api.balldontlie.io"

# ── Args ──────────────────────────────────────────────────────────────────────
scan_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        scan_date = arg.split("=")[1]

print(f"[{datetime.now().strftime('%H:%M:%S')}] OTJ News Scanner — {scan_date}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def bdl_get(endpoint, params=None):
    try:
        resp = requests.get(f"{BDL_BASE}/{endpoint}", params=params, headers=BDL_HEADERS, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  ⚠ BDL error ({endpoint}): {e}")
        return {}


def dedup_key(event_type, *parts):
    """Generate a unique key to prevent duplicate news items."""
    raw = f"{event_type}:{scan_date}:{':'.join(str(p) for p in parts)}"
    return hashlib.md5(raw.encode()).hexdigest()


def insert_news(item):
    """Insert a news item, skip if dedup_key already exists."""
    try:
        supabase.table("news_feed").insert(item).execute()
        return True
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            return False  # already exists, not an error
        print(f"  ⚠ Insert failed: {e}")
        return False


# ── CHARACTER VOICE for blurbs ───────────────────────────────────────────────
import random

VOICE_STYLES = {
    "voice_1": {
        "injury": lambda p, t: f"Look, {p} being out changes the math for {t}. Quietly significant.",
        "line_move": lambda info: f"Here's the thing — a {info} move like that doesn't happen without a reason. Something shifted.",
        "game_final": lambda w, l, s: f"{w} handled business. {s}. Nothing complicated, just basketball.",
        "standout": lambda p, pts: f"{p} with {pts}. Sometimes a player just decides it's their night. This was one of those.",
    },
    "voice_2": {
        "injury": lambda p, t: f"{p} out for {t}? Sure, that matters. But let's see if the line actually moves before we panic.",
        "line_move": lambda info: f"A {info} shift — listen, when the line moves that hard, somebody knows something we don't. I'm just saying.",
        "game_final": lambda w, l, s: f"{w} gets the W but {s} — was it as clean as the box score says? I have questions.",
        "standout": lambda p, pts: f"{p} dropped {pts} and everyone's going to overreact. Let me see them do it twice.",
    },
    "voice_3": {
        "injury": lambda p, t: f"Hate to see {p} go down. {t} loses a real one tonight. The game is always better with the best players on the floor.",
        "line_move": lambda info: f"Whoa — {info} is a MASSIVE swing. Something just happened. Keep your eyes on this one.",
        "game_final": lambda w, l, s: f"What a game. {w} came out and {s} — this is why we watch every night.",
        "standout": lambda p, pts: f"ARE YOU KIDDING ME. {p} just went for {pts}. I need to talk about this right now.",
    },
}

def pick_voice():
    return random.choice(["voice_1", "voice_2", "voice_3"])


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER 1: INJURIES
# ═══════════════════════════════════════════════════════════════════════════════

def scan_injuries():
    """Check for fresh injury scratches not already in the news feed."""
    print("  Scanning injuries...", end=" ")
    
    # Get today's games to know which teams to check
    games = bdl_get("v1/games", {"dates[]": scan_date, "per_page": 100})
    team_ids = set()
    team_map = {}
    for g in games.get("data", []):
        hid = g["home_team"]["id"]
        aid = g["visitor_team"]["id"]
        team_ids.add(hid)
        team_ids.add(aid)
        team_map[hid] = g["home_team"]["abbreviation"]
        team_map[aid] = g["visitor_team"]["abbreviation"]
    
    if not team_ids:
        print("no games today")
        return 0
    
    # Fetch injuries
    params = [("per_page", 100)] + [("team_ids[]", tid) for tid in team_ids]
    try:
        resp = requests.get(f"{BDL_BASE}/v1/player_injuries", params=params, headers=BDL_HEADERS, timeout=15)
        resp.raise_for_status()
        injury_data = resp.json()
    except Exception as e:
        print(f"error: {e}")
        return 0
    
    count = 0
    for row in injury_data.get("data", []):
        player = row.get("player", {})
        status = row.get("status", "")
        if status not in ("Out", "Doubtful"):
            continue
        
        name = f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
        tid = player.get("team_id")
        team = team_map.get(tid, "???")
        desc = (row.get("description", "") or "")[:100]
        
        # Check if this is fresh (day-to-day, game-time, soreness, etc.)
        fresh_keywords = ["day-to-day", "game-time", "questionable", "tonight", "rest", "soreness", "illness", "personal"]
        is_fresh = any(k in desc.lower() for k in fresh_keywords)
        
        dk = dedup_key("injury", name, team, status)
        voice = pick_voice()
        
        headline = f"🏥 {name} ({team}) — {status}"
        body = VOICE_STYLES[voice]["injury"](name, team) if is_fresh else None
        
        if insert_news({
            "type": "injury",
            "sport": "nba",
            "headline": headline,
            "body": body,
            "character": voice if body else None,
            "team": team,
            "severity": "breaking" if is_fresh else "normal",
            "data": json.dumps({"player": name, "team": team, "status": status, "description": desc, "fresh": is_fresh}),
            "date": scan_date,
            "dedup_key": dk,
        }):
            count += 1
            tag = "🚨 FRESH" if is_fresh else "📋"
            print(f"\n    {tag} {name} ({team}) — {status}")
    
    print(f"{count} new" if count else "no new injuries")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER 2: LINE MOVEMENTS
# ═══════════════════════════════════════════════════════════════════════════════

def scan_line_movements():
    """Check for big ML line movements (100+ points shift)."""
    print("  Scanning line movements...", end=" ")
    
    # Get latest odds
    odds_data = bdl_get("v2/odds", {"dates[]": scan_date, "per_page": 100})
    if not odds_data.get("data"):
        print("no odds data")
        return 0
    
    # Get the opening odds from our odds_history table
    count = 0
    seen_matchups = set()
    
    for row in odds_data.get("data", []):
        game_id = row.get("game_id")
        if not game_id or game_id in seen_matchups:
            continue
        seen_matchups.add(game_id)
        
        ml_home = row.get("moneyline_home_odds")
        ml_away = row.get("moneyline_away_odds")
        home_team = row.get("home_team", {}).get("abbreviation", "???")
        away_team = row.get("away_team", {}).get("abbreviation", "???")
        matchup = f"{away_team} @ {home_team}"
        
        if ml_home is None or ml_away is None:
            continue
        
        # Check against opening odds in our history
        try:
            open_resp = supabase.table("odds_history") \
                .select("ml_home, ml_away") \
                .eq("game_id", matchup) \
                .eq("date", scan_date) \
                .eq("is_open", True) \
                .limit(1) \
                .execute()
            
            if not open_resp.data:
                continue
            
            open_ml_home = open_resp.data[0].get("ml_home")
            open_ml_away = open_resp.data[0].get("ml_away")
            
            if open_ml_home is None:
                continue
            
            move = abs(int(ml_home) - int(open_ml_home))
            if move < 100:
                continue
            
            # Big move detected
            direction = home_team if int(ml_home) < int(open_ml_home) else away_team
            dk = dedup_key("line_move", matchup, f"move{move // 50 * 50}")  # bucket by 50pt increments
            
            voice = pick_voice()
            move_info = f"{move}-point ML"
            headline = f"📈 {matchup} — ML moved {move} pts toward {direction}"
            body = VOICE_STYLES[voice]["line_move"](move_info)
            
            if insert_news({
                "type": "line_move",
                "sport": "nba",
                "headline": headline,
                "body": body,
                "character": voice,
                "team": direction,
                "matchup": matchup,
                "severity": "important" if move >= 200 else "normal",
                "data": json.dumps({
                    "matchup": matchup,
                    "open_ml_home": open_ml_home, "current_ml_home": int(ml_home),
                    "open_ml_away": open_ml_away, "current_ml_away": int(ml_away),
                    "move": move, "direction": direction,
                }),
                "date": scan_date,
                "dedup_key": dk,
            }):
                count += 1
                print(f"\n    📈 {matchup} — ML moved {move} pts toward {direction}")
        
        except Exception as e:
            pass
    
    print(f"{count} new" if count else "no big moves")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER 3: GAME FINALS + STANDOUT PERFORMANCES
# ═══════════════════════════════════════════════════════════════════════════════

def scan_game_results():
    """Check for games that just finished and flag standout performances."""
    print("  Scanning game results...", end=" ")
    
    # Get games — check both today and tomorrow UTC for West Coast
    all_games = []
    for d in [scan_date, (datetime.strptime(scan_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")]:
        data = bdl_get("v1/games", {"dates[]": d, "per_page": 100})
        all_games.extend(data.get("data", []))
    
    count = 0
    for game in all_games:
        hs = game.get("home_team_score", 0) or 0
        vs = game.get("visitor_team_score", 0) or 0
        status = (game.get("status", "") or "").lower()
        
        # Only process finished games
        if hs < 50 or vs < 50:
            continue
        if status not in ("final", "f", "complete", "completed"):
            continue
        
        home = game["home_team"]["abbreviation"]
        away = game["visitor_team"]["abbreviation"]
        matchup = f"{away} @ {home}"
        winner = home if hs > vs else away
        loser = away if hs > vs else home
        margin = abs(hs - vs)
        
        # Game final blurb
        dk = dedup_key("game_final", matchup)
        voice = pick_voice()
        
        score_str = f"{vs}-{hs}"
        game_desc = f"won by {margin}" if margin > 10 else f"survived by {margin}" if margin <= 3 else f"pulled it out by {margin}"
        headline = f"🏁 {matchup} FINAL — {winner} wins {score_str}"
        body = VOICE_STYLES[voice]["game_final"](winner, loser, game_desc)
        
        if insert_news({
            "type": "game_final",
            "sport": "nba",
            "headline": headline,
            "body": body,
            "character": voice,
            "team": winner,
            "matchup": matchup,
            "severity": "normal",
            "data": json.dumps({"matchup": matchup, "home_score": hs, "away_score": vs, "winner": winner, "margin": margin}),
            "date": scan_date,
            "dedup_key": dk,
        }):
            count += 1
            print(f"\n    🏁 {matchup} FINAL — {winner} {score_str}")
        
        # Check for standout performances
        game_id = game["id"]
        try:
            stats = bdl_get("v1/stats", {"game_ids[]": game_id, "per_page": 100})
            for ps in stats.get("data", []):
                player = ps.get("player", {})
                name = f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
                pts = int(ps.get("pts", 0) or 0)
                reb = int(ps.get("reb", 0) or 0)
                ast = int(ps.get("ast", 0) or 0)
                stl = int(ps.get("stl", 0) or 0)
                blk = int(ps.get("blk", 0) or 0)
                fg3m = int(ps.get("fg3m", 0) or 0)
                team_abbr = ps.get("team", {}).get("abbreviation", "")
                
                min_str = ps.get("min", "0") or "0"
                try:
                    minutes = int(min_str.split(":")[0]) if ":" in str(min_str) else int(float(min_str))
                except:
                    minutes = 0
                
                if minutes < 15:
                    continue
                
                doubles = sum(1 for s in [pts, reb, ast, stl, blk] if s >= 10)
                
                # 40+ points
                if pts >= 40:
                    dk2 = dedup_key("standout", name, matchup, f"pts{pts}")
                    voice = pick_voice()
                    stat_line = f"{pts}pts/{reb}reb/{ast}ast"
                    
                    if pts >= 50:
                        headline = f"🔥 {name} GOES OFF — {pts} POINTS vs {loser if team_abbr == winner else winner}"
                        severity = "breaking"
                    else:
                        headline = f"⭐ {name} drops {pts} points — {stat_line}"
                        severity = "important"
                    
                    body = VOICE_STYLES[voice]["standout"](name, stat_line)
                    
                    if insert_news({
                        "type": "standout",
                        "sport": "nba",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "team": team_abbr,
                        "matchup": matchup,
                        "severity": severity,
                        "data": json.dumps({"player": name, "team": team_abbr, "pts": pts, "reb": reb, "ast": ast, "fg3m": fg3m}),
                        "date": scan_date,
                        "dedup_key": dk2,
                    }):
                        count += 1
                        print(f"\n    🔥 {name} — {stat_line}")
                
                # Triple-double
                elif doubles >= 3:
                    dk2 = dedup_key("standout", name, matchup, "triple")
                    voice = pick_voice()
                    stat_line = f"{pts}/{reb}/{ast}"
                    headline = f"🎯 {name} TRIPLE-DOUBLE — {stat_line} vs {loser if team_abbr == winner else winner}"
                    body = VOICE_STYLES[voice]["standout"](name, f"a triple-double ({stat_line})")
                    
                    if insert_news({
                        "type": "standout",
                        "sport": "nba",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "team": team_abbr,
                        "matchup": matchup,
                        "severity": "important",
                        "data": json.dumps({"player": name, "team": team_abbr, "pts": pts, "reb": reb, "ast": ast, "triple_double": True}),
                        "date": scan_date,
                        "dedup_key": dk2,
                    }):
                        count += 1
                        print(f"\n    🎯 {name} TRIPLE-DOUBLE — {stat_line}")
                
                # 7+ threes
                elif fg3m >= 7:
                    dk2 = dedup_key("standout", name, matchup, f"3pt{fg3m}")
                    voice = pick_voice()
                    headline = f"☔ {name} rains {fg3m} threes — {pts} points"
                    body = VOICE_STYLES[voice]["standout"](name, f"{fg3m} threes and {pts} points")
                    
                    if insert_news({
                        "type": "standout",
                        "sport": "nba",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "team": team_abbr,
                        "matchup": matchup,
                        "severity": "normal",
                        "data": json.dumps({"player": name, "team": team_abbr, "pts": pts, "fg3m": fg3m}),
                        "date": scan_date,
                        "dedup_key": dk2,
                    }):
                        count += 1
                        print(f"\n    ☔ {name} — {fg3m} threes")
        
        except Exception as e:
            pass
    
    print(f"{count} new" if count else "no new results")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

total = 0
total += scan_injuries()
total += scan_line_movements()
total += scan_game_results()

print(f"\n  📡 Scan complete — {total} new items published")
