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

# Known star players — get bigger reactions
STAR_PLAYERS = {
    "LeBron James", "Luka Doncic", "Nikola Jokic", "Giannis Antetokounmpo",
    "Shai Gilgeous-Alexander", "Jayson Tatum", "Kevin Durant", "Stephen Curry",
    "Victor Wembanyama", "Anthony Davis", "Donovan Mitchell", "Devin Booker",
    "Ja Morant", "Damian Lillard", "Jimmy Butler", "Joel Embiid", "Tyrese Maxey",
    "Paolo Banchero", "Cade Cunningham", "Jalen Brunson", "Trae Young",
    "De'Aaron Fox", "Zion Williamson", "Lauri Markkanen", "Kyrie Irving",
    "Anthony Edwards", "Karl-Anthony Towns", "Bam Adebayo", "Domantas Sabonis",
}

def pick_voice():
    return random.choice(["voice_1", "voice_2", "voice_3"])

def get_injury_reaction(voice, name, team, is_fresh, desc):
    """Every injury gets a voice reaction — scaled by player importance."""
    is_star = name in STAR_PLAYERS
    
    if is_star and is_fresh:
        # Big reaction for fresh star scratch
        reactions = {
            "voice_1": f"Here's the thing — {name} being out tonight changes everything for {team}. This isn't minor.",
            "voice_2": f"{name} out? Watch the line move in the next 20 minutes. Vegas hasn't caught up yet.",
            "voice_3": f"No {name} tonight. That hurts to type. {team} is a completely different team without him on the floor.",
        }
    elif is_star:
        # Known star, already priced in
        reactions = {
            "voice_1": f"{name} still out for {team}. At this point the line reflects it, but the team misses what he brings.",
            "voice_2": f"Everyone knows {name} is out. The question is whether {team} has figured out how to play without him yet.",
            "voice_3": f"Another game without {name}. {team} keeps fighting but you can feel the difference.",
        }
    elif is_fresh:
        # Non-star fresh scratch
        reactions = {
            "voice_1": f"{name} scratched late for {team}. Rotation just got shorter.",
            "voice_2": f"{name} out tonight — how much does that actually matter for {team}? Depends on the matchup.",
            "voice_3": f"Hate to see anyone go down. {name} out for {team} tonight.",
        }
    else:
        # Routine bench/role player injury — quick one-liner
        reactions = {
            "voice_1": f"{team} down another body. Depth matters in March.",
            "voice_2": f"Another name on the {team} injury list. It's getting crowded.",
            "voice_3": f"{team} thin tonight. Next man up.",
        }
    
    return reactions.get(voice, f"{name} out for {team}.")

def get_line_move_reaction(voice, matchup, move, direction):
    """Line movement reaction."""
    reactions = {
        "voice_1": f"A {move}-point swing toward {direction}. Something changed. Worth watching.",
        "voice_2": f"{move}-point ML move toward {direction} — when money moves that fast, somebody knows something. I'm just saying.",
        "voice_3": f"Whoa. {move}-point shift toward {direction}. Keep your eyes on {matchup} tonight.",
    }
    return reactions.get(voice, "")

def get_game_final_reaction(voice, winner, loser, margin, score_str):
    """Game result reaction."""
    if margin >= 25:
        reactions = {
            "voice_1": f"{winner} by {margin}. That stopped being a game in the third quarter.",
            "voice_2": f"{winner} by {margin} and the starters sat the whole fourth. {loser} has questions to answer.",
            "voice_3": f"{winner} absolutely dismantled {loser}. {margin} points. That's not a game, that's a statement.",
        }
    elif margin <= 3:
        reactions = {
            "voice_1": f"{winner} survives by {margin}. The kind of game that ages you.",
            "voice_2": f"{winner} by {margin}. That could've gone either way and we all know it.",
            "voice_3": f"My heart. {winner} by {margin}. That finish was INTENSE. This is why we watch every night.",
        }
    elif margin <= 7:
        reactions = {
            "voice_1": f"{winner} pulls it out. Competitive game, good basketball.",
            "voice_2": f"{winner} by {margin}. Close enough to make you sweat if you had action on it.",
            "voice_3": f"Fun game. {winner} came through when it mattered. {score_str} final.",
        }
    else:
        reactions = {
            "voice_1": f"{winner} handles business. {score_str}. Clean.",
            "voice_2": f"{winner} gets the W. {score_str}. Nothing to overthink here.",
            "voice_3": f"{winner} solid tonight. {score_str}. On to the next one.",
        }
    return reactions.get(voice, "")

def get_standout_reaction(voice, name, stat_line, pts):
    """Standout performance reaction."""
    if pts >= 50:
        reactions = {
            "voice_1": f"{name} with {stat_line}. You don't see this often. Remember where you were tonight.",
            "voice_2": f"{name} just dropped {pts}. Incredible. Even I can't find something to question about that.",
            "voice_3": f"ARE YOU KIDDING ME. {name}. {stat_line}. I'm still processing what I just watched. HISTORIC.",
        }
    elif pts >= 40:
        reactions = {
            "voice_1": f"{name} with a casual {stat_line}. That's an elite performance any way you slice it.",
            "voice_2": f"{name} drops {pts} and everyone's going to overreact. Let me see it twice before I crown anyone.",
            "voice_3": f"{name} was ON ONE tonight. {stat_line}. When a player locks in like that, it's beautiful to watch.",
        }
    else:
        reactions = {
            "voice_1": f"{name} put together a strong night. {stat_line}.",
            "voice_2": f"Solid line from {name}. {stat_line}. Quietly impressive.",
            "voice_3": f"{name} showed up tonight. {stat_line}. Love watching players compete at that level.",
        }
    return reactions.get(voice, "")


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
        body = get_injury_reaction(voice, name, team, is_fresh, desc)
        
        if insert_news({
            "type": "injury",
            "sport": "nba",
            "headline": headline,
            "body": body,
            "character": voice,
            "team": team,
            "severity": "breaking" if is_fresh and name in STAR_PLAYERS else "important" if is_fresh else "normal",
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
            body = get_line_move_reaction(voice, matchup, move, direction)
            
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
        body = get_game_final_reaction(voice, winner, loser, margin, score_str)
        
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
                    
                    body = get_standout_reaction(voice, name, stat_line, pts)
                    
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
                    body = get_standout_reaction(voice, name, f"TRIPLE-DOUBLE {stat_line}", pts)
                    
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
                    body = get_standout_reaction(voice, name, f"{fg3m} threes, {pts} pts", pts)
                    
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
# SCANNER 4: MARCH MADNESS (ESPN Free API)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_march_madness():
    """Check ESPN for March Madness tournament game results and upsets."""
    print("  Scanning March Madness...", end=" ")
    
    espn_date = scan_date.replace("-", "")
    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates={espn_date}&groups=100&limit=50"
    
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"error: {e}")
        return 0
    
    events = data.get("events", [])
    if not events:
        print("no tournament games")
        return 0
    
    count = 0
    for event in events:
        status_type = event.get("status", {}).get("type", {}).get("name", "")
        if status_type != "STATUS_FINAL":
            continue
        
        comp = event.get("competitions", [{}])[0]
        competitors = comp.get("competitors", [])
        if len(competitors) != 2:
            continue
        
        # Parse teams
        teams = {}
        for c in competitors:
            haway = c.get("homeAway", "")
            team_data = c.get("team", {})
            teams[haway] = {
                "name": team_data.get("shortDisplayName", team_data.get("displayName", "???")),
                "abbr": team_data.get("abbreviation", "???"),
                "seed": c.get("curatedRank", {}).get("current", 0) or c.get("seed", 0),
                "score": int(c.get("score", 0) or 0),
                "winner": c.get("winner", False),
            }
        
        home = teams.get("home", {})
        away = teams.get("away", {})
        
        if not home.get("score") or not away.get("score"):
            continue
        
        winner = home if home.get("winner") else away
        loser = away if home.get("winner") else home
        margin = abs(home["score"] - away["score"])
        matchup_str = f"🏀 {away.get('name', '?')} vs {home.get('name', '?')}"
        score_str = f"{away['score']}-{home['score']}"
        
        # Detect upsets (lower seed beating higher seed, or big seed gap)
        w_seed = winner.get("seed", 0) or 99
        l_seed = loser.get("seed", 0) or 99
        is_upset = w_seed > l_seed and (w_seed - l_seed) >= 4
        is_huge_upset = w_seed > l_seed and (w_seed - l_seed) >= 8
        
        # Determine severity
        if is_huge_upset:
            severity = "breaking"
        elif is_upset:
            severity = "important"
        else:
            severity = "normal"
        
        dk = dedup_key("march_madness", away.get("name", ""), home.get("name", ""))
        voice = pick_voice()
        
        # Build headline
        seed_str_w = f"({w_seed})" if w_seed < 20 else ""
        seed_str_l = f"({l_seed})" if l_seed < 20 else ""
        
        if is_huge_upset:
            headline = f"🚨 UPSET! {seed_str_w} {winner['name']} STUNS {seed_str_l} {loser['name']} — {score_str}"
        elif is_upset:
            headline = f"⚡ {seed_str_w} {winner['name']} upsets {seed_str_l} {loser['name']} — {score_str}"
        elif margin <= 3:
            headline = f"😤 THRILLER — {seed_str_w} {winner['name']} survives {seed_str_l} {loser['name']} {score_str}"
        else:
            headline = f"🏁 {seed_str_w} {winner['name']} defeats {seed_str_l} {loser['name']} — {score_str}"
        
        # Character reaction
        if is_huge_upset:
            reactions = {
                "voice_1": f"Look, {winner['name']} just did something nobody predicted. That's March for you.",
                "voice_2": f"Everyone had {loser['name']} in their bracket. Everyone. This tournament is COOKED.",
                "voice_3": f"THIS IS WHY WE WATCH. A {w_seed} seed just took down a {l_seed} seed and the building went CRAZY.",
            }
        elif is_upset:
            reactions = {
                "voice_1": f"Quiet upset. {winner['name']} played the better game. Sometimes the seed doesn't matter.",
                "voice_2": f"I'm just saying — if you had {loser['name']} going deep, might want to check your bracket.",
                "voice_3": f"March Madness, baby. {winner['name']} wanted it more and you could see it all game.",
            }
        elif margin <= 3:
            reactions = {
                "voice_1": f"That one could have gone either way. {winner['name']} just made one more play.",
                "voice_2": f"Survived by {margin}. Let's not pretend that was comfortable.",
                "voice_3": f"My heart can't take these games. {margin} points. March is undefeated.",
            }
        else:
            reactions = {
                "voice_1": f"{winner['name']} handled it. Moving on.",
                "voice_2": f"{winner['name']} by {margin}. Chalk. Next.",
                "voice_3": f"Clean win for {winner['name']}. {margin} points and it felt like more.",
            }
        
        body = reactions.get(voice, "")
        
        if insert_news({
            "type": "march_madness",
            "sport": "ncaa",
            "headline": headline,
            "body": body,
            "character": voice,
            "team": winner.get("abbr"),
            "matchup": matchup_str,
            "severity": severity,
            "data": json.dumps({
                "winner": winner.get("name"), "loser": loser.get("name"),
                "winner_seed": w_seed, "loser_seed": l_seed,
                "score": score_str, "margin": margin,
                "is_upset": is_upset, "is_huge_upset": is_huge_upset,
            }),
            "date": scan_date,
            "dedup_key": dk,
        }):
            count += 1
            tag = "🚨 UPSET" if is_upset else "🏁"
            print(f"\n    {tag} {seed_str_w}{winner['name']} def. {seed_str_l}{loser['name']} {score_str}")
    
    print(f"{count} new" if count else "no new results")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER 5: MULTI-SPORT (ESPN Free API — NHL, MLB, NFL)
# ═══════════════════════════════════════════════════════════════════════════════

ESPN_SPORTS = {
    "nhl": {
        "endpoint": "hockey/nhl",
        "sport_tag": "nhl",
        "emoji": "🏒",
        "label": "NHL",
    },
    "mlb": {
        "endpoint": "baseball/mlb",
        "sport_tag": "mlb",
        "emoji": "⚾",
        "label": "MLB",
    },
    "nfl": {
        "endpoint": "football/nfl",
        "sport_tag": "nfl",
        "emoji": "🏈",
        "label": "NFL",
    },
}


def scan_espn_sport(sport_key):
    """Generic ESPN scanner for any sport — scores + notable results."""
    cfg = ESPN_SPORTS[sport_key]
    print(f"  Scanning {cfg['label']}...", end=" ")

    espn_date = scan_date.replace("-", "")
    url = f"https://site.api.espn.com/apis/site/v2/sports/{cfg['endpoint']}/scoreboard?dates={espn_date}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"error: {e}")
        return 0

    events = data.get("events", [])
    if not events:
        print("no games")
        return 0

    count = 0
    for event in events:
        status_type = event.get("status", {}).get("type", {}).get("name", "")
        if status_type != "STATUS_FINAL":
            continue

        comp = event.get("competitions", [{}])[0]
        competitors = comp.get("competitors", [])
        if len(competitors) != 2:
            continue

        teams = {}
        for c in competitors:
            haway = c.get("homeAway", "")
            team_data = c.get("team", {})
            teams[haway] = {
                "name": team_data.get("shortDisplayName", team_data.get("displayName", "???")),
                "abbr": team_data.get("abbreviation", "???"),
                "score": c.get("score", "0"),
                "winner": c.get("winner", False),
                "record": c.get("records", [{}])[0].get("summary", "") if c.get("records") else "",
            }

        home = teams.get("home", {})
        away = teams.get("away", {})
        hs = int(home.get("score", 0) or 0)
        as_ = int(away.get("score", 0) or 0)

        if hs == 0 and as_ == 0:
            continue

        winner = home if home.get("winner") else away
        loser = away if home.get("winner") else home
        margin = abs(hs - as_)
        score_str = f"{as_}-{hs}"
        matchup_str = f"{away.get('name', '?')} @ {home.get('name', '?')}"

        dk = dedup_key(f"{sport_key}_final", matchup_str)
        voice = pick_voice()

        # Game type
        if margin == 0:
            continue  # tie/incomplete
        elif margin <= 1 and sport_key in ("nhl", "mlb"):
            game_desc = f"edged out {loser['name']} by {margin}"
            severity = "important"
        elif margin >= 5 and sport_key == "nhl":
            game_desc = f"dominated {loser['name']} {score_str}"
            severity = "normal"
        elif margin >= 7 and sport_key == "mlb":
            game_desc = f"crushed {loser['name']} {score_str}"
            severity = "normal"
        else:
            game_desc = f"beat {loser['name']} {score_str}"
            severity = "normal"

        headline = f"{cfg['emoji']} {winner['name']} def. {loser['name']} — {score_str}"
        body = get_game_final_reaction(voice, winner['name'], loser['name'], margin, score_str)

        if insert_news({
            "type": f"{sport_key}_final",
            "sport": cfg["sport_tag"],
            "headline": headline,
            "body": body,
            "character": voice,
            "team": winner.get("abbr"),
            "matchup": matchup_str,
            "severity": severity,
            "data": json.dumps({
                "matchup": matchup_str, "home_score": hs, "away_score": as_,
                "winner": winner.get("name"), "loser": loser.get("name"), "margin": margin,
            }),
            "date": scan_date,
            "dedup_key": dk,
        }):
            count += 1
            print(f"\n    {cfg['emoji']} {winner['name']} def. {loser['name']} {score_str}")

    # Also scan for notable injuries via ESPN
    try:
        inj_url = f"https://site.api.espn.com/apis/site/v2/sports/{cfg['endpoint']}/news"
        inj_resp = requests.get(inj_url, timeout=10)
        inj_resp.raise_for_status()
        news_data = inj_resp.json()

        for article in news_data.get("articles", [])[:5]:
            headline_text = article.get("headline", "")
            desc = article.get("description", "")
            # Only grab injury/transaction related headlines
            injury_keywords = ["injury", "injured", "out for", "ruled out", "day-to-day",
                               "trade", "traded", "signs", "waived", "released", "suspended",
                               "IL", "disabled list", "concussion", "ACL", "MCL", "surgery"]
            if not any(k.lower() in (headline_text + desc).lower() for k in injury_keywords):
                continue

            dk2 = dedup_key(f"{sport_key}_news", headline_text[:50])
            voice = pick_voice()

            if insert_news({
                "type": "trade" if any(k in headline_text.lower() for k in ["trade", "traded", "signs", "waived"]) else "injury",
                "sport": cfg["sport_tag"],
                "headline": f"{cfg['emoji']} {headline_text}",
                "body": None,
                "character": None,
                "team": None,
                "matchup": None,
                "severity": "important",
                "data": json.dumps({"source": "espn", "headline": headline_text, "description": desc[:200]}),
                "date": scan_date,
                "dedup_key": dk2,
            }):
                count += 1
                print(f"\n    📰 {cfg['label']}: {headline_text[:60]}")

    except Exception:
        pass  # news endpoint is optional

    print(f"{count} new" if count else f"no new {cfg['label']} items")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER 5: LIVE IN-GAME ALERTS (NBA + NCAA)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_live_games():
    """Check for interesting live game situations — upsets, runs, close 4th quarters."""
    print("  Scanning live games...", end=" ")
    
    count = 0
    
    # Check NBA live games via ESPN (has real-time scores)
    for sport_cfg in [
        {"endpoint": "basketball/nba", "sport": "nba", "emoji": "🏀", "label": "NBA"},
        {"endpoint": "basketball/mens-college-basketball", "sport": "ncaa", "emoji": "🏀", "label": "NCAAM", "groups": "&groups=100"},
        {"endpoint": "hockey/nhl", "sport": "nhl", "emoji": "🏒", "label": "NHL"},
    ]:
        espn_date = scan_date.replace("-", "")
        groups = sport_cfg.get("groups", "")
        url = f"https://site.api.espn.com/apis/site/v2/sports/{sport_cfg['endpoint']}/scoreboard?dates={espn_date}{groups}"
        
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            continue
        
        for event in data.get("events", []):
            status_obj = event.get("status", {})
            status_type = status_obj.get("type", {}).get("name", "")
            
            # Only care about IN PROGRESS games
            if status_type != "STATUS_IN_PROGRESS":
                continue
            
            period = status_obj.get("period", 0)
            clock = status_obj.get("displayClock", "")
            detail = status_obj.get("type", {}).get("shortDetail", "")
            
            comp = event.get("competitions", [{}])[0]
            competitors = comp.get("competitors", [])
            if len(competitors) != 2:
                continue
            
            teams = {}
            for c in competitors:
                haway = c.get("homeAway", "")
                team_data = c.get("team", {})
                score_val = int(c.get("score", 0) or 0)
                
                # Get seed for college
                seed = 0
                if c.get("curatedRank", {}).get("current"):
                    seed = c["curatedRank"]["current"]
                
                teams[haway] = {
                    "name": team_data.get("shortDisplayName", team_data.get("displayName", "???")),
                    "abbr": team_data.get("abbreviation", "???"),
                    "score": score_val,
                    "seed": seed,
                }
            
            home = teams.get("home", {})
            away = teams.get("away", {})
            hs = home["score"]
            as_ = away["score"]
            margin = abs(hs - as_)
            leading = home if hs > as_ else away
            trailing = away if hs > as_ else home
            
            matchup_str = f"{away['name']} @ {home['name']}" if sport_cfg["sport"] != "ncaa" else f"{away['name']} vs {home['name']}"
            
            voice = pick_voice()
            alert = None
            
            # ── ALERT: Close game in 4th quarter / 3rd period ──
            is_late = (sport_cfg["sport"] in ("nba", "ncaa") and period >= 4) or (sport_cfg["sport"] == "nhl" and period >= 3)
            if is_late and margin <= 5:
                dk = dedup_key("live_close", matchup_str, f"p{period}")
                reactions = {
                    "voice_1": f"{matchup_str} — {as_}-{hs} with {clock} left. This one's going down to the wire.",
                    "voice_2": f"{margin}-point game in the {detail}. If you're not watching {matchup_str} right now, fix that.",
                    "voice_3": f"THIS GAME. {matchup_str}. {as_}-{hs}. {clock} left. I can't sit down right now.",
                }
                alert = {
                    "type": "live_close",
                    "headline": f"🔥 CLOSE GAME — {matchup_str} {as_}-{hs} ({detail})",
                    "body": reactions.get(voice, ""),
                    "severity": "important",
                    "dk": dk,
                }
            
            # ── ALERT: Underdog leading by 10+ in second half ──
            # For NBA: check if the team with worse record/higher seed is winning
            # Simple proxy: away team leading by 10+ in 2nd half (road teams are usually dogs)
            is_second_half = (sport_cfg["sport"] in ("nba", "ncaa") and period >= 3) or (sport_cfg["sport"] == "nhl" and period >= 2)
            if is_second_half and margin >= 10 and not alert:
                # For college: check seeds
                if sport_cfg["sport"] == "ncaa" and leading.get("seed", 0) > trailing.get("seed", 0) and leading["seed"] > 0 and trailing["seed"] > 0:
                    seed_diff = leading["seed"] - trailing["seed"]
                    if seed_diff >= 3:
                        dk = dedup_key("live_upset", matchup_str, f"p{period}_{margin//5*5}")
                        reactions = {
                            "voice_1": f"A {leading['seed']}-seed leading a {trailing['seed']}-seed by {margin}. In the second half. March is doing its thing.",
                            "voice_2": f"({leading['seed']}) {leading['name']} up {margin} over ({trailing['seed']}) {trailing['name']}. Brackets everywhere are sweating.",
                            "voice_3": f"THE UPSET IS BREWING. ({leading['seed']}) {leading['name']} up {margin} on ({trailing['seed']}) {trailing['name']}. THIS IS MARCH!",
                        }
                        alert = {
                            "type": "live_upset",
                            "headline": f"🚨 UPSET ALERT — ({leading['seed']}) {leading['name']} leads ({trailing['seed']}) {trailing['name']} by {margin}",
                            "body": reactions.get(voice, ""),
                            "severity": "breaking",
                            "dk": dk,
                        }
                elif sport_cfg["sport"] == "nba" and margin >= 15:
                    dk = dedup_key("live_blowout", matchup_str, f"p{period}_{margin//10*10}")
                    reactions = {
                        "voice_1": f"{leading['name']} up {margin} in the {detail}. This one's essentially over.",
                        "voice_2": f"{trailing['name']} down {margin}. At what point do we call it? Asking for a friend.",
                        "voice_3": f"{leading['name']} is rolling. Up {margin}. {trailing['name']} has no answer right now.",
                    }
                    alert = {
                        "type": "live_blowout",
                        "headline": f"💀 BLOWOUT — {leading['name']} up {margin} on {trailing['name']} ({detail})",
                        "body": reactions.get(voice, ""),
                        "severity": "normal",
                        "dk": dk,
                    }
            
            # ── ALERT: Overtime ──
            if period > 4 and sport_cfg["sport"] in ("nba", "ncaa"):
                dk = dedup_key("live_ot", matchup_str)
                ot_num = period - 4
                ot_label = f"OT" if ot_num == 1 else f"{ot_num}OT"
                reactions = {
                    "voice_1": f"{matchup_str} heading to {ot_label}. Neither team could close it out.",
                    "voice_2": f"{ot_label} in {matchup_str}. If you bet the under, you're having a bad night.",
                    "voice_3": f"OVERTIME! {matchup_str} can't be decided in regulation. {ot_label}. I LOVE THIS GAME.",
                }
                alert = {
                    "type": "live_overtime",
                    "headline": f"⏰ OVERTIME — {matchup_str} tied {as_}-{hs} heading to {ot_label}",
                    "body": reactions.get(voice, ""),
                    "severity": "important",
                    "dk": dk,
                }
            
            # Insert if we have an alert
            if alert:
                if insert_news({
                    "type": alert["type"],
                    "sport": sport_cfg["sport"],
                    "headline": alert["headline"],
                    "body": alert["body"],
                    "character": voice,
                    "team": leading.get("abbr"),
                    "matchup": matchup_str,
                    "severity": alert["severity"],
                    "data": json.dumps({
                        "home": home["name"], "away": away["name"],
                        "home_score": hs, "away_score": as_,
                        "period": period, "clock": clock, "margin": margin,
                    }),
                    "date": scan_date,
                    "dedup_key": alert["dk"],
                }):
                    count += 1
                    print(f"\n    {sport_cfg['emoji']} LIVE: {alert['headline'][:60]}")
    
    print(f"{count} new" if count else "no live alerts")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

total = 0
total += scan_injuries()
total += scan_line_movements()
total += scan_game_results()
total += scan_march_madness()
total += scan_live_games()
total += scan_espn_sport("nhl")
total += scan_espn_sport("mlb")
total += scan_espn_sport("nfl")

print(f"\n  📡 Scan complete — {total} new items published")
