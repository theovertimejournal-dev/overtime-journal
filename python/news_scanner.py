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
import re
import urllib.parse
from datetime import datetime, timedelta

# ── Nickname lookup ──────────────────────────────────────────────────────────
NICKNAMES = {
    "Airious Bailey": "Ace Bailey",
    "Stephen Curry": "Steph Curry",
    "Wardell Curry": "Steph Curry",
    "Shai Gilgeous-Alexander": "SGA",
    "Kentavious Caldwell-Pope": "KCP",
    "Nickeil Alexander-Walker": "NAW",
    "Luguentz Dort": "Lu Dort",
    "Herbert Jones": "Herb Jones",
    "Nicolas Claxton": "Nic Claxton",
    "Jabari Smith": "Jabari Smith Jr.",
    "Dereck Lively": "Dereck Lively II",
    "Jaime Jaquez": "Jaime Jaquez Jr.",
    "Tim Hardaway": "Tim Hardaway Jr.",
    "Gary Trent": "Gary Trent Jr.",
    "Larry Nance": "Larry Nance Jr.",
    "Kenyon Martin": "KJ Martin",
    "Kelly Oubre": "Kelly Oubre Jr.",
    "Wendell Carter": "Wendell Carter Jr.",
    "Lonnie Walker": "Lonnie Walker IV",
}

def get_display_name(first, last):
    full = f"{first} {last}".strip()
    return NICKNAMES.get(full, full)

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
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")  # optional — falls back to RSS if not set


def find_youtube_highlight(query, max_results=3, cache_key=None):
    """
    Search YouTube for a highlight clip. Returns embed URL or None.
    Uses YouTube Data API v3 if key is set, otherwise YouTube RSS search (free).
    """
    if not query:
        return None

    # Try YouTube Data API first (best results, needs key)
    if YOUTUBE_API_KEY:
        try:
            params = {
                "part": "snippet",
                "q": query,
                "type": "video",
                "videoEmbeddable": "true",
                "maxResults": max_results,
                "key": YOUTUBE_API_KEY,
            }
            r = requests.get("https://www.googleapis.com/youtube/v3/search",
                             params=params, timeout=10)
            r.raise_for_status()
            items = r.json().get("items", [])
            if items:
                vid_id = items[0]["id"]["videoId"]
                return f"https://www.youtube.com/watch?v={vid_id}"
        except Exception as e:
            pass  # fall through to RSS fallback

    # Fallback: YouTube search via unofficial search URL
    # Returns first result embed URL without needing API key
    try:
        encoded = urllib.parse.quote(query)
        r = requests.get(
            f"https://www.youtube.com/results?search_query={encoded}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; OTJ/1.0)"},
            timeout=10
        )
        # Extract first video ID from page source
        match = re.search(r'"videoId":"([a-zA-Z0-9_-]{11})"', r.text)
        if match:
            vid_id = match.group(1)
            return f"https://www.youtube.com/watch?v={vid_id}"
    except Exception:
        pass

    return None


def yt_query_for_standout(name, stat_line, sport="nba"):
    """Build a good YouTube search query for a standout performance."""
    short_stat = stat_line.split(",")[0]  # e.g. "42 pts" from "42 pts / 8 reb / 5 ast"
    return f"{name} {short_stat} highlights {datetime.now().strftime('%Y')}"


def yt_query_for_sport_event(headline, sport):
    """Build a YouTube search query from a news headline."""
    # Strip emojis and clean up
    clean = re.sub(r'[^\w\s@\-]', '', headline)[:80]
    return f"{clean} {sport} highlights"

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
    return random.choice(["yumi", "johnnybot", "krash"])

def get_injury_reaction(voice, name, team, is_fresh, desc):
    """Every injury gets a voice reaction — scaled by player importance. 
    Large variety pool so reactions never feel repetitive."""
    is_star = name in STAR_PLAYERS
    
    if is_star and is_fresh:
        options = {
            "yumi": [
                f"Here's the thing — {name} being out tonight changes everything for {team}. This isn't minor.",
                f"{name} scratched for {team}. The math just shifted. Adjust accordingly.",
                f"Late scratch on {name}. {team}'s entire game plan just changed.",
                f"{name} won't play. That's not a footnote — that's the headline for {team} tonight.",
                f"No {name} for {team}. Quietly, this might be the most important news of the day.",
            ],
            "johnnybot": [
                f"{name} out? Watch the line move in the next 20 minutes. Vegas hasn't caught up yet.",
                f"{name} scratched and the line hasn't moved enough. Somebody's sleeping on this.",
                f"So {name} is out for {team}. Cool. Cool cool cool. This changes... everything.",
                f"{name} sitting tonight. If you had {team} in your parlay, I'm sorry.",
                f"No {name}? {team} just went from contender to question mark tonight.",
            ],
            "krash": [
                f"No {name} tonight. That hurts to type. {team} is a completely different team without him.",
                f"{name} OUT. My stomach just dropped. {team} without their guy is painful to watch.",
                f"They just scratched {name}. {team} fans, I feel for you tonight.",
                f"Without {name}, {team} has to find something they haven't shown all year. Good luck.",
                f"{name} is out and I already know {team} is going to have to grind for this one.",
            ],
        }
    elif is_star:
        options = {
            "yumi": [
                f"{name} still out for {team}. At this point the line reflects it, but the team feels the absence.",
                f"Another game without {name}. {team} has adjusted, but there's a ceiling without him.",
                f"{name} remains out. {team}'s been managing, but you notice it in the clutch.",
                f"{team} without {name} again. The numbers say they've adapted. The eye test disagrees.",
            ],
            "johnnybot": [
                f"Everyone knows {name} is out. The question is whether {team} has figured out how to play without him yet.",
                f"{name} still sidelined. At what point do we stop calling this an injury and start calling it the new reality?",
                f"Still no {name} for {team}. The line's priced it in. Doesn't mean the team has.",
                f"Week whatever without {name}. {team}'s been fine. Or have they? I have questions.",
            ],
            "krash": [
                f"Another game without {name}. {team} keeps fighting but you can feel the difference.",
                f"Missing {name} again. {team}'s spirit is there but the talent gap shows up late in games.",
                f"Still no {name}. Every game without him is a game where {team} has to be perfect to win. That's exhausting.",
                f"{team} rolling without {name} again. The effort is there. The results are... mixed.",
            ],
        }
    elif is_fresh:
        options = {
            "yumi": [
                f"{name} scratched late for {team}. Rotation just got shorter.",
                f"Late scratch: {name} out for {team}. Minor adjustment, but it matters in a close game.",
                f"{name} won't go tonight. {team}'s bench gets a little thinner.",
                f"{team} loses {name} tonight. Not a headline, but it's another piece of the puzzle.",
                f"Noted: {name} out for {team}. File that away if this game gets tight.",
            ],
            "johnnybot": [
                f"{name} out tonight — how much does that actually matter for {team}? Depends on the matchup.",
                f"{name} scratched for {team}. Not losing sleep, but not ignoring it either.",
                f"So {name} is out. {team} has options, but one less option than they had this morning.",
                f"{name} sitting. I doubt Vegas moves a point for this, but it adds up.",
                f"Late scratch on {name}. {team} will survive, but it's one more thing to manage.",
            ],
            "krash": [
                f"Hate to see anyone go down. {name} out for {team} tonight.",
                f"{name} won't suit up for {team}. Hope it's nothing serious.",
                f"Down goes {name} for {team}. The basketball gods are testing them.",
                f"{name} out tonight. {team}'s next man needs to step up.",
                f"No {name} for {team}. It's a long season and these things add up.",
            ],
        }
    else:
        options = {
            "yumi": [
                f"{name} out for {team}. Rotation tightens slightly.",
                f"One more body down for {team}. {name} won't go.",
                f"{team} marking {name} out. The depth chart gets a little thinner.",
                f"{name} listed out for {team}. Not the headline, but worth noting.",
                f"Noted: {name} unavailable for {team} tonight.",
                f"{team} without {name}. Someone else gets those minutes.",
                f"{name} out. {team}'s rotation shrinks by one tonight.",
            ],
            "johnnybot": [
                f"Another name on the {team} injury report. {name} sitting.",
                f"{name} out for {team}. At this rate they'll need to sign someone off the street.",
                f"{team} lists {name} as out. The injury report is getting longer than the roster.",
                f"{name} won't play for {team}. Is anyone on this team healthy?",
                f"Add {name} to the {team} out list. It's becoming a novel.",
                f"{name} out. {team}'s injury report needs its own page at this point.",
                f"Another one for {team}. {name} joins the DNP club tonight.",
            ],
            "krash": [
                f"{name} out for {team}. Next man up mentality.",
                f"{team} down {name} tonight. Opportunity for someone else to show out.",
                f"No {name} for {team}. Somebody's getting extra minutes and a chance to prove something.",
                f"{name} sidelined. {team} keeps rolling with whoever's available.",
                f"{team} without {name}. The bench guys get their shot tonight.",
                f"Down {name}. {team}'s depth gets tested again.",
                f"{name} out. It's the NBA — next person up, no excuses.",
            ],
        }
    
    voice_options = options.get(voice, [f"{name} out for {team}."])
    return random.choice(voice_options)

def get_line_move_reaction(voice, matchup, move, direction):
    """Line movement reaction."""
    reactions = {
        "yumi": f"A {move}-point swing toward {direction}. Something changed. Worth watching.",
        "johnnybot": f"{move}-point ML move toward {direction} — when money moves that fast, somebody knows something. I'm just saying.",
        "krash": f"Whoa. {move}-point shift toward {direction}. Keep your eyes on {matchup} tonight.",
    }
    return reactions.get(voice, "")

def get_game_final_reaction(voice, winner, loser, margin, score_str):
    """Game result reaction — expanded variety pool."""
    if margin >= 25:
        options = {
            "yumi": [
                f"{winner} by {margin}. That stopped being a game in the third quarter.",
                f"{loser} never found their footing. {winner} runs away with it — {score_str}.",
                f"Dominant from start to finish. {winner} by {margin}. Clean performance.",
                f"{winner} set the tone early and never looked back. {loser} had no answers.",
            ],
            "johnnybot": [
                f"{winner} by {margin} and the starters sat the whole fourth. {loser} has questions to answer.",
                f"Was this a game? {winner} up {margin}. {loser} needs a serious film session.",
                f"I expected more from {loser}. {winner} made them look amateur tonight. {score_str}.",
                f"{margin} points. That's a beatdown. {loser} looked like they forgot to show up.",
            ],
            "krash": [
                f"{winner} absolutely dismantled {loser}. {margin} points. That's not a game, that's a statement.",
                f"{winner} was DOMINANT tonight. {score_str}. {loser} never had a chance.",
                f"I felt bad for {loser} by halftime. {winner} just took their soul. {margin}-point final.",
                f"RUTHLESS. {winner} showed zero mercy. {score_str}. When they're clicking like that, it's a problem for EVERYONE.",
            ],
        }
    elif margin <= 3:
        options = {
            "yumi": [
                f"{winner} survives by {margin}. The kind of game that ages you.",
                f"Either team could have won that. {winner} made one more play. {score_str}.",
                f"{score_str}. {winner} holds on. {loser} will be thinking about the final possession for a while.",
                f"Decided at the wire. {winner} by {margin}. That's why you watch every second.",
            ],
            "johnnybot": [
                f"{winner} by {margin}. That could've gone either way and we all know it.",
                f"If {loser} makes one more shot, we're talking about a different outcome. {winner} by {margin}.",
                f"Coin flip game. {winner} called heads. {score_str}.",
                f"I had {loser} in that spot. {winner} by {margin}. The margin for error was zero and they found it.",
            ],
            "krash": [
                f"My heart. {winner} by {margin}. That finish was INTENSE. This is why we watch every night.",
                f"I literally couldn't breathe at the end. {winner} holds on by {margin}. INCREDIBLE FINISH.",
                f"THE BASKETBALL GODS WERE WATCHING TONIGHT. {winner} by {margin}. That was INSANE.",
                f"Every single possession mattered. {winner} makes the plays. {score_str}. THAT'S SPORTS.",
            ],
        }
    elif margin <= 7:
        options = {
            "yumi": [
                f"{winner} pulls it out. Competitive game, good basketball.",
                f"Close throughout. {winner} had just enough. {score_str}.",
                f"{loser} kept it interesting but {winner} made the plays that mattered. {score_str}.",
                f"Good game. {winner} by {margin}. {loser} will feel like they left some things out there.",
            ],
            "johnnybot": [
                f"{winner} by {margin}. Close enough to make you sweat if you had action on it.",
                f"Competitive. {winner} pulls it out. {loser} gave them everything they had.",
                f"{margin} points. That's a real game. {winner} earned that W tonight.",
                f"{loser} was right there until they weren't. {winner} by {margin}. That's how it goes sometimes.",
            ],
            "krash": [
                f"Fun game. {winner} came through when it mattered. {score_str} final.",
                f"I was into this one the whole way. {winner} by {margin}. Great basketball tonight.",
                f"{winner} had to work for it and they got it done. That's a quality win. {score_str}.",
                f"Both teams competed hard. {winner} just had a little more in the tank at the end. {score_str}.",
            ],
        }
    else:
        options = {
            "yumi": [
                f"{winner} handles business. {score_str}. Clean.",
                f"Controlled performance from {winner}. {score_str}.",
                f"{winner} takes care of {loser} without drama. {score_str}.",
                f"Efficient. Decisive. {winner} by {margin}. On to the next.",
            ],
            "johnnybot": [
                f"{winner} gets the W. {score_str}. Nothing to overthink here.",
                f"Standard night for {winner}. {score_str}. They did what they were supposed to do.",
                f"{winner} by {margin}. Not flashy, just effective. The W is what matters.",
                f"Business trip for {winner}. {score_str}. Clean, efficient, done.",
            ],
            "krash": [
                f"{winner} solid tonight. {score_str}. On to the next one.",
                f"Smooth performance from {winner}. {score_str}. Love when a team just handles their business.",
                f"{winner} looked good tonight. {score_str}. That's a team playing with confidence.",
                f"No drama needed. {winner} by {margin}. That's a team that knows what it's doing.",
            ],
        }
    voice_options = options.get(voice, [f"{winner} wins {score_str}."])
    return random.choice(voice_options)

def get_standout_reaction(voice, name, stat_line, pts):
    """Standout performance reaction — large variety pool to avoid repetition."""
    if pts >= 50:
        options = {
            "yumi": [
                f"{name} with {stat_line}. You don't see this often. Remember where you were tonight.",
                f"50+ from {name}. That's a moment, not just a game.",
                f"{name} just had one of those nights that ends up on a career highlight reel.",
                f"The {stat_line} from {name} tonight was genuinely historic. Rare air.",
                f"When {name} is in this kind of zone, the defense literally doesn't matter. {stat_line}.",
            ],
            "johnnybot": [
                f"{name} just dropped {pts}. Incredible. Even I can't find something to question about that.",
                f"{pts} points. I've been watching basketball for 20 years. Tonight was different.",
                f"I was ready to be skeptical. Then {name} dropped {stat_line} and I had to just sit with it.",
                f"Okay. {name}. {stat_line}. I'll give credit where it's due — that was something else.",
                f"{name} made everyone look silly tonight. {stat_line}. This one goes in the archives.",
            ],
            "krash": [
                f"ARE YOU KIDDING ME. {name}. {stat_line}. I'm still processing what I just watched. HISTORIC.",
                f"WHAT. {name} just put up {stat_line}. I don't even have words. That's an all-timer.",
                f"The basketball gods blessed us tonight. {name} was POSSESSED. {stat_line}.",
                f"My jaw is on the floor. {name} went absolutely nuclear. {stat_line}. GOAT conversation starting NOW.",
                f"Everyone stop what you're doing. {name} just dropped {stat_line}. WITNESS.",
            ],
        }
    elif pts >= 40:
        options = {
            "yumi": [
                f"{name} with a casual {stat_line}. That's an elite performance any way you slice it.",
                f"The efficiency from {name} tonight was something else. {stat_line}.",
                f"{name} looked locked in from the first possession. {stat_line} is the result.",
                f"Quiet masterclass from {name}. {stat_line}. That's what elite looks like.",
                f"{name} was the best player on the floor tonight and it wasn't particularly close. {stat_line}.",
            ],
            "johnnybot": [
                f"{name} drops {pts} and everyone's going to overreact. Let me see it twice before I crown anyone.",
                f"Is {name} playing at a different level right now? The numbers say yes. {stat_line}.",
                f"I want to poke holes in this. I really do. But {stat_line} from {name} is hard to argue with.",
                f"{name} put up {stat_line}. The league is going to have to make adjustments. Real talk.",
                f"Forty-plus from {name}. Not a fluke. This is becoming a pattern and the rest of the league should be worried.",
            ],
            "krash": [
                f"{name} was ON ONE tonight. {stat_line}. When a player locks in like that, it's beautiful to watch.",
                f"I had to stand up for some of those shots from {name} tonight. {stat_line}. LOCKED IN.",
                f"The crowd felt it. I felt it. {name} was in a different universe tonight. {stat_line}.",
                f"Don't sleep on what just happened. {name} with {stat_line}. That's a special night.",
                f"{name} just put the league on notice. {stat_line}. When he's this hot, there's no stopping it.",
            ],
        }
    else:
        options = {
            "yumi": [
                f"{name} put together a strong night. {stat_line}.",
                f"Consistent, efficient, impactful. {name} with {stat_line} tonight.",
                f"{name}'s {stat_line} line doesn't jump off the page but the impact was real.",
                f"Right guy, right moment. {name} delivered tonight with {stat_line}.",
                f"The {stat_line} from {name} was exactly what the team needed.",
            ],
            "johnnybot": [
                f"Solid line from {name}. {stat_line}. Quietly impressive.",
                f"{name} does this so consistently that people forget to be impressed. {stat_line}.",
                f"Not flashy. Just effective. {name} with {stat_line} tonight.",
                f"{name}'s {stat_line} won't trend on Twitter. But the advanced metrics are going to love it.",
                f"If you watched closely, {name} was the most important player on the floor tonight. {stat_line}.",
            ],
            "krash": [
                f"{name} showed up tonight. {stat_line}. Love watching players compete at that level.",
                f"This is why {name} is different. {stat_line} and made it look easy.",
                f"Big time player, big time moment. {name} with {stat_line}. That's the good stuff.",
                f"Every game {name} steps up like this reminds me why I love this sport. {stat_line}.",
                f"{name} was the engine tonight. {stat_line}. That's what carrying looks like.",
            ],
        }
    voice_options = options.get(voice, [f"{name} with {stat_line}."])
    return random.choice(voice_options)


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
        
        name = get_display_name(player.get('first_name', ''), player.get('last_name', ''))
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
                name = get_display_name(player.get('first_name', ''), player.get('last_name', ''))
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
                    yt_url = find_youtube_highlight(f"{name} {pts} points highlights {scan_date[:7]}") if pts >= 35 else None

                    if insert_news({
                        "type": "standout",
                        "sport": "nba",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "team": team_abbr,
                        "matchup": matchup,
                        "source_url": yt_url,
                        "severity": severity,
                        "data": json.dumps({"player": name, "team": team_abbr, "pts": pts, "reb": reb, "ast": ast, "fg3m": fg3m}),
                        "date": scan_date,
                        "dedup_key": dk2,
                    }):
                        count += 1
                        yt_tag = " 📹" if yt_url else ""
                        print(f"\n    🔥 {name} — {stat_line}{yt_tag}")
                
                # Triple-double
                elif doubles >= 3:
                    dk2 = dedup_key("standout", name, matchup, "triple")
                    voice = pick_voice()
                    stat_line = f"{pts}/{reb}/{ast}"
                    headline = f"🎯 {name} TRIPLE-DOUBLE — {stat_line} vs {loser if team_abbr == winner else winner}"
                    body = get_standout_reaction(voice, name, f"TRIPLE-DOUBLE {stat_line}", pts)
                    
                    yt_url_td = find_youtube_highlight(f"{name} triple double highlights {scan_date[:7]}")
                    if insert_news({
                        "type": "standout",
                        "sport": "nba",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "team": team_abbr,
                        "matchup": matchup,
                        "source_url": yt_url_td,
                        "severity": "important",
                        "data": json.dumps({"player": name, "team": team_abbr, "pts": pts, "reb": reb, "ast": ast, "triple_double": True}),
                        "date": scan_date,
                        "dedup_key": dk2,
                    }):
                        count += 1
                        yt_tag_td = " 📹" if yt_url_td else ""
                        print(f"\n    🎯 {name} TRIPLE-DOUBLE — {stat_line}{yt_tag_td}")
                
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
                "yumi": f"Look, {winner['name']} just did something nobody predicted. That's March for you.",
                "johnnybot": f"Everyone had {loser['name']} in their bracket. Everyone. This tournament is COOKED.",
                "krash": f"THIS IS WHY WE WATCH. A {w_seed} seed just took down a {l_seed} seed and the building went CRAZY.",
            }
        elif is_upset:
            reactions = {
                "yumi": f"Quiet upset. {winner['name']} played the better game. Sometimes the seed doesn't matter.",
                "johnnybot": f"I'm just saying — if you had {loser['name']} going deep, might want to check your bracket.",
                "krash": f"March Madness, baby. {winner['name']} wanted it more and you could see it all game.",
            }
        elif margin <= 3:
            reactions = {
                "yumi": f"That one could have gone either way. {winner['name']} just made one more play.",
                "johnnybot": f"Survived by {margin}. Let's not pretend that was comfortable.",
                "krash": f"My heart can't take these games. {margin} points. March is undefeated.",
            }
        else:
            reactions = {
                "yumi": f"{winner['name']} handled it. Moving on.",
                "johnnybot": f"{winner['name']} by {margin}. Chalk. Next.",
                "krash": f"Clean win for {winner['name']}. {margin} points and it felt like more.",
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

    # Also scan for notable news via ESPN — injuries, trades, AND highlights
    try:
        inj_url = f"https://site.api.espn.com/apis/site/v2/sports/{cfg['endpoint']}/news"
        inj_resp = requests.get(inj_url, timeout=10)
        inj_resp.raise_for_status()
        news_data = inj_resp.json()

        for article in news_data.get("articles", [])[:10]:
            headline_text = article.get("headline", "")
            desc = article.get("description", "")
            combined = (headline_text + desc).lower()
            
            # Get source URL — ESPN articles have links
            source_url = ""
            for link in article.get("links", {}).get("web", {}).get("href", ""), article.get("links", {}).get("api", {}).get("self", {}).get("href", ""):
                if link:
                    source_url = link
                    break
            # Fallback: build ESPN URL from article type
            if not source_url:
                art_id = article.get("id", "")
                if art_id:
                    source_url = f"https://www.espn.com/{cfg['endpoint'].split('/')[0]}/story/_/id/{art_id}"

            # Hard junk filter — skip these entirely
            hard_junk = ["fantasy", "rest-of-season", "mock draft", "odds to win",
                         "picks to make", "card sells", "logoman", "rookie card",
                         "podcast", "mailbag", "power rankings", "tier list", "redraft",
                         "what to watch", "how to watch", "live stream", "channel",
                         "best bets", "prop bets", "parlay", "expert picks",
                         "top prospects", "draft stock", "scouting report",
                         "all-star", "mvp race", "hall of fame", "predictions",
                         "pick'em", "bracket", "printable"]
            if any(k in combined for k in hard_junk):
                continue

            # Classify the article type
            highlight_keywords = ["highlights", "recap", "game highlights", "full highlights"]
            injury_keywords = ["injury", "injured", "out for", "ruled out", "day-to-day",
                               "IL", "disabled list", "concussion", "ACL", "MCL", "surgery"]
            trade_keywords = ["trade", "traded", "signs with", "waived", "released", "suspended",
                              "free agent", "contract", "extension"]

            is_highlight = any(k in combined for k in highlight_keywords)
            is_injury = any(k in combined for k in injury_keywords)
            is_trade = any(k in combined for k in trade_keywords)

            if not is_highlight and not is_injury and not is_trade:
                continue

            dk2 = dedup_key(f"{sport_key}_news", headline_text[:50])
            voice = pick_voice()

            if is_highlight:
                news_type = "highlights"
                severity = "normal"
                emoji = "🎬"
                # Character reacts to highlights
                reactions = {
                    "yumi": f"Worth watching the full recap on this one.",
                    "johnnybot": f"The highlights don't lie. Check this one out.",
                    "krash": f"You NEED to see these highlights. Trust me.",
                }
                body = reactions.get(voice, "")
            elif is_trade:
                news_type = "trade"
                severity = "important"
                emoji = "💼"
                body = None
            else:
                news_type = "injury"
                severity = "important"
                emoji = "🏥"
                body = None

            if insert_news({
                "type": news_type,
                "sport": cfg["sport_tag"],
                "headline": f"{emoji} {headline_text}",
                "body": body,
                "character": voice if body else None,
                "team": None,
                "matchup": None,
                "severity": severity,
                "source_url": source_url or None,
                "data": json.dumps({"source": "espn", "headline": headline_text, "description": desc[:200], "url": source_url}),
                "date": scan_date,
                "dedup_key": dk2,
            }):
                count += 1
                link_tag = " 🔗" if source_url else ""
                print(f"\n    {emoji} {cfg['label']}: {headline_text[:60]}{link_tag}")

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
                    "yumi": f"{matchup_str} — {as_}-{hs} with {clock} left. This one's going down to the wire.",
                    "johnnybot": f"{margin}-point game in the {detail}. If you're not watching {matchup_str} right now, fix that.",
                    "krash": f"THIS GAME. {matchup_str}. {as_}-{hs}. {clock} left. I can't sit down right now.",
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
                            "yumi": f"A {leading['seed']}-seed leading a {trailing['seed']}-seed by {margin}. In the second half. March is doing its thing.",
                            "johnnybot": f"({leading['seed']}) {leading['name']} up {margin} over ({trailing['seed']}) {trailing['name']}. Brackets everywhere are sweating.",
                            "krash": f"THE UPSET IS BREWING. ({leading['seed']}) {leading['name']} up {margin} on ({trailing['seed']}) {trailing['name']}. THIS IS MARCH!",
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
                        "yumi": f"{leading['name']} up {margin} in the {detail}. This one's essentially over.",
                        "johnnybot": f"{trailing['name']} down {margin}. At what point do we call it? Asking for a friend.",
                        "krash": f"{leading['name']} is rolling. Up {margin}. {trailing['name']} has no answer right now.",
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
                    "yumi": f"{matchup_str} heading to {ot_label}. Neither team could close it out.",
                    "johnnybot": f"{ot_label} in {matchup_str}. If you bet the under, you're having a bad night.",
                    "krash": f"OVERTIME! {matchup_str} can't be decided in regulation. {ot_label}. I LOVE THIS GAME.",
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
# SCANNER: VIRAL SPORTS (golf, UFC, boxing, tennis, soccer)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_viral_sports():
    """
    Covers golf, UFC/boxing, tennis, soccer — plus searches YouTube for highlights.
    Characters react to Tiger meltdowns, UFC finishes, walk-off moments, anything notable.
    Runs alongside the main NBA/MLB/NHL scanner so the feed isn't just basketball.
    """
    print("  Scanning viral sports moments...", end=" ")
    count = 0

    GOLF_STARS = {
        "Tiger Woods", "Rory McIlroy", "Jon Rahm", "Scottie Scheffler",
        "Xander Schauffele", "Brooks Koepka", "Jordan Spieth", "Justin Thomas",
        "Collin Morikawa", "Viktor Hovland", "Hideki Matsuyama", "Wyndham Clark",
        "Nelly Korda", "Lexi Thompson", "Lydia Ko", "Brooke Henderson",
    }

    GOLF_REACTIONS = {
        "yumi": [
            "Golf has a way of exposing every weakness in your mental game. Today was someone's reckoning.",
            "The composure required to compete at this level is extraordinary. Not everyone has it every day.",
            "Sunday on the back nine tells you everything about a player's character. Today we got a full story.",
            "Golf is the most honest sport — the scorecard doesn't lie and neither does the leaderboard.",
            "What separates the great ones isn't talent on the good days. It's execution on the hard ones.",
        ],
        "johnnybot": [
            "Golf does this. Builds you up over 71 holes and then the 72nd hole ends careers. Ruthless.",
            "If you think golf isn't a sport, watch the final round of any major. That's pure pressure.",
            "I can't make a six-footer at the driving range for fun. These people do it for their livelihood. Different breed.",
            "The leaderboard moved. Somebody made a putt. Somebody missed one. This is golf.",
            "Sunday golf is a completely different animal than Thursday golf. The oxygen gets thinner.",
        ],
        "krash": [
            "THE GOLF GODS WERE WATCHING TODAY AND THEY WERE NOT KIND. That back nine was PAINFUL.",
            "I had to stand up for that putt. I literally stood up. In my living room. For golf.",
            "Golf is so cruel. One shot. One moment. Everything changes. That's why I watch every week.",
            "When a golfer gets in the zone on Sunday you can feel it through the screen. That was SPECIAL.",
            "I don't care what anyone says — golf under pressure is the most intense thing in sports. PERIOD.",
        ],
    }

    UFC_REACTIONS = {
        "yumi": [
            "A finish in combat sports is always jarring. The margin between winning and losing is razor thin.",
            "MMA is the most honest sport — there's nowhere to hide when you step in that cage.",
            "That finish changes everything. The rankings, the narratives, the next fight. One moment rewrites it all.",
        ],
        "johnnybot": [
            "Didn't see that finish coming. The oddsmakers didn't either, I'd bet.",
            "MMA is the one sport where everything can change in a single second. Tonight it changed.",
            "When the cage door closes, all the pre-fight talk stops mattering. What matters is what happens in there.",
        ],
        "krash": [
            "LIGHTS OUT. The Octagon is RUTHLESS. Did not see that coming AT ALL.",
            "ONE SHOT. ONE MOMENT. MMA just reminded everyone why it's the most electric sport on the planet.",
            "I jumped out of my seat. Combat sports does this to you. UNBELIEVABLE finish.",
        ],
    }

    VIRAL_SPORTS_CFGS = [
        {"url": "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard", "sport": "golf", "emoji": "⛳"},
        {"url": "https://site.api.espn.com/apis/site/v2/sports/golf/lpga/scoreboard", "sport": "golf", "emoji": "⛳"},
        {"url": "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard", "sport": "mma", "emoji": "🥊"},
        {"url": "https://site.api.espn.com/apis/site/v2/sports/boxing/boxing/scoreboard", "sport": "boxing", "emoji": "🥊"},
    ]

    for cfg in VIRAL_SPORTS_CFGS:
        try:
            resp = requests.get(cfg["url"], timeout=10)
            if resp.status_code != 200:
                continue
            data = resp.json()
        except Exception:
            continue

        for event in data.get("events", []):
            status_type = event.get("status", {}).get("type", {}).get("name", "")
            if status_type != "STATUS_FINAL":
                continue

            short_name = event.get("shortName", event.get("name", ""))
            comps = event.get("competitions", [{}])
            comp = comps[0] if comps else {}
            competitors = comp.get("competitors", [])
            if not competitors:
                continue

            voice = pick_voice()

            if cfg["sport"] == "golf":
                for c in competitors:
                    athlete = c.get("athlete", {})
                    aname = athlete.get("displayName", "")
                    if aname not in GOLF_STARS and not c.get("winner"):
                        continue

                    is_winner = c.get("winner", False)
                    dk = dedup_key("golf", aname, scan_date)
                    body = random.choice(GOLF_REACTIONS.get(voice, GOLF_REACTIONS["yumi"]))
                    headline = f"⛳ {aname} wins {short_name}" if is_winner else f"⛳ {aname} — {short_name}"
                    yt_url = find_youtube_highlight(f"{aname} golf highlights {scan_date[:7]}")

                    if insert_news({
                        "type": "highlights",
                        "sport": "golf",
                        "headline": headline,
                        "body": body,
                        "character": voice,
                        "source_url": yt_url,
                        "severity": "important" if is_winner else "normal",
                        "data": json.dumps({"athlete": aname, "event": short_name}),
                        "date": scan_date,
                        "dedup_key": dk,
                    }):
                        count += 1
                        print(f"\n    ⛳ {aname}: {short_name[:50]}")

            elif cfg["sport"] in ("mma", "boxing"):
                winner_name = None
                loser_name  = "opponent"
                method      = ""

                for c in competitors:
                    aname = (c.get("athlete", {}).get("displayName") or
                             c.get("team", {}).get("displayName", ""))
                    if c.get("winner"):
                        winner_name = aname
                        for stat in c.get("statistics", []):
                            if stat.get("name") in ("winBy", "method"):
                                method = stat.get("displayValue", "")
                    else:
                        loser_name = aname

                if not winner_name:
                    continue

                method_str = f" ({method})" if method else ""

                # Pick reaction based on finish type
                method_lower = method.lower()
                if any(k in method_lower for k in ["ko", "tko", "knockout"]):
                    react_pool = {
                        "yumi": [
                            f"{winner_name} puts {loser_name} away by KO. One moment, everything changes.",
                            f"Knockout finish for {winner_name}. The margin in combat sports is absolutely brutal.",
                            f"{winner_name} lands the finishing shot and it is OVER. That is MMA.",
                        ],
                        "johnnybot": [
                            f"{winner_name} by KO. Short night for {loser_name}. The oddsmakers are checking their math.",
                            f"One punch. One moment. {winner_name} over {loser_name}. That is combat sports.",
                            f"Lights out for {loser_name}. {winner_name} finishes it and moves on.",
                        ],
                        "krash": [
                            f"KNOCKED OUT COLD. {winner_name} SLEPT {loser_name}. The Octagon does not care about feelings.",
                            f"OH MY GOD. {winner_name} LANDS IT AND IT IS OVER. I AM SCREAMING RIGHT NOW.",
                            f"THE HIGHLIGHT REEL JUST GOT A NEW ENTRY. {winner_name} by KO. UNREAL.",
                        ],
                    }
                elif "sub" in method_lower:
                    react_pool = {
                        "yumi": [
                            f"{winner_name} submits {loser_name}{method_str}. The grappling game was elite tonight.",
                            f"Tap out. {winner_name} catches {loser_name} and the submission finish is clean.",
                            f"Ground game IQ on full display. {winner_name} gets the submission.",
                        ],
                        "johnnybot": [
                            f"{winner_name} by submission. {loser_name} tapped. The ground game wins fights.",
                            f"Caught and finished. {winner_name} over {loser_name}{method_str}.",
                            f"The submission of {winner_name} is legitimate. {loser_name} just found out.",
                        ],
                        "krash": [
                            f"TAPPED OUT. {winner_name} locks it in and {loser_name} has no choice. BEAUTIFUL.",
                            f"The submission was INEVITABLE once {winner_name} got that position. CHEF'S KISS.",
                            f"{winner_name} is an ARTIST on the ground. {loser_name} taps. THAT IS HOW IT IS DONE.",
                        ],
                    }
                else:
                    react_pool = UFC_REACTIONS

                dk     = dedup_key("combat", winner_name, loser_name, scan_date)
                voice  = pick_voice()
                body   = random.choice(react_pool.get(voice, react_pool.get("yumi", [f"{winner_name} wins."])))
                ck     = f"ufc_{winner_name}_{loser_name}_{scan_date}".replace(" ", "_")
                yt_url = find_youtube_highlight(
                    f"{winner_name} vs {loser_name} UFC fight highlights {scan_date[:7]}",
                    cache_key=ck
                )

                if insert_news({
                    "type":       "highlights",
                    "sport":      cfg["sport"],
                    "headline":   f"🥊 {winner_name} def. {loser_name}{method_str}",
                    "body":       body,
                    "character":  voice,
                    "source_url": yt_url,
                    "severity":   "breaking" if any(k in method_lower for k in ["ko", "tko"]) else "important",
                    "data":       json.dumps({"winner": winner_name, "loser": loser_name, "method": method}),
                    "date":       scan_date,
                    "dedup_key":  dk,
                }):
                    count += 1
                    yt_tag = " 📹" if yt_url else ""
                    print(f"\n    🥊 {winner_name} def {loser_name}{method_str}{yt_tag}")

    print(f"{count} new" if count else "no viral moments")
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER: UFC NEWS FEED (fight week previews, weigh-ins, post-fight drama)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_sport_news(sport_key, league, emoji, label, star_players=None, keywords=None):
    """
    Generic ESPN news feed scanner for any sport.
    Pulls headlines, filters for notable news, reacts with character voices.
    """
    star_players = star_players or set()
    keywords     = keywords or []

    try:
        resp = requests.get(
            f"https://site.api.espn.com/apis/site/v2/sports/{sport_key}/{league}/news",
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return 0

    SPORT_REACTIONS = {
        "nfl": {
            "yumi": [
                "The NFL never stops moving. Roster decisions like this have real implications.",
                "This changes the calculus heading into the offseason. File it away.",
                "In the NFL, every move is a signal. This one is worth reading carefully.",
                "Quiet but significant. The league is always operating, even in the offseason.",
                "The roster implications here ripple further than the headline suggests.",
            ],
            "johnnybot": [
                "NFL news in the offseason hits different. Someone is making a calculated move here.",
                "Every trade, every signing, every cut — it all connects to something bigger. This is no different.",
                "The NFL front offices are always playing chess. This is a chess move.",
                "I want to understand the cap implications before I react fully. But my initial read is interesting.",
                "Follow the money in the NFL and you follow the truth. This is a financial decision first.",
            ],
            "krash": [
                "THE NFL NEVER SLEEPS AND NEITHER DO I. This is huge news.",
                "WAIT WHAT. The NFL just dropped a bomb and people are sleeping on it.",
                "I am FIRED UP about this. The NFL offseason is genuinely must-watch content.",
                "This changes EVERYTHING heading into next season. LOCKED IN on the implications.",
                "The NFL is the greatest soap opera in American sports and this is a WILD episode.",
            ],
        },
        "nba": {
            "yumi": [
                "The trade market never truly closes in the NBA. This is proof.",
                "Roster construction is an art. This move tells you something about how this team sees itself.",
                "Quiet news day until this dropped. The league is always moving.",
                "NBA front offices operate 24/7. This is the result of weeks of conversations.",
            ],
            "johnnybot": [
                "NBA news cycle never stops. This one actually matters though.",
                "Woj bomb or not, this changes something. Let me think through the implications.",
                "Every NBA transaction is a domino. What falls next is the real question.",
                "The front office didn't do this by accident. There's a reason and I want to find it.",
            ],
            "krash": [
                "THE NBA IS NEVER BORING. EVER. This just proved it again.",
                "I WAS NOT READY FOR THIS NEWS. The NBA keeps delivering.",
                "TRADE ALERT ENERGY. The league just shifted and I am fully awake now.",
                "This is why I never turn off NBA notifications. WILD.",
            ],
        },
        "mlb": {
            "yumi": [
                "Baseball moves quietly but this one deserves attention.",
                "The MLB transaction wire never stops. This one has real implications.",
                "Roster depth matters in baseball more than any other sport. This affects it.",
                "A 162-game season means every roster decision compounds. This is one of those.",
            ],
            "johnnybot": [
                "MLB front offices are always tinkering. This is more than tinkering.",
                "The baseball analytics era means every move has a reason. What's the reason here?",
                "Quietly significant MLB news. The standings implications matter more than the headline.",
                "Baseball rewards patience and punishes panic moves. Which one is this?",
            ],
            "krash": [
                "BASEBALL NEWS HITTING DIFFERENT TODAY. The Hot Stove never truly goes cold.",
                "I love when baseball reminds you it never actually stops. This is that moment.",
                "THE ROSTER MOVE THAT CHANGES EVERYTHING. Okay maybe not everything. But something.",
                "Baseball fans are always watching and today we were rewarded. Big news.",
            ],
        },
        "nhl": {
            "yumi": [
                "The NHL trade deadline mentality never fully goes away. This proves it.",
                "Hockey roster construction is always in motion. This is the latest move.",
                "Quiet but meaningful NHL news. The playoff implications are worth tracking.",
            ],
            "johnnybot": [
                "NHL front offices are brutal and efficient. This move reflects that.",
                "Hockey trades are always about more than what's on the surface.",
                "The NHL salary cap makes every move a puzzle. This is an interesting piece.",
            ],
            "krash": [
                "HOCKEY NEVER STOPS DELIVERING. Big news from the NHL.",
                "The NHL is always doing something wild and I am always here for it.",
                "PLAYOFF IMPLICATIONS. The NHL just made a move that matters. A LOT.",
            ],
        },
    }

    sport_short = league.split("/")[-1] if "/" in league else league
    reactions   = SPORT_REACTIONS.get(sport_short, SPORT_REACTIONS.get("nfl", {}))
    count       = 0

    for article in data.get("articles", [])[:8]:
        headline = article.get("headline", "")
        desc     = article.get("description", "")
        url      = article.get("links", {}).get("web", {}).get("href", "")

        if not headline:
            continue

        headline_lower = headline.lower()

        # Filter: must mention a star or a key newsworthy term
        is_star    = any(s.lower() in headline_lower for s in star_players)
        is_notable = any(k in headline_lower for k in keywords)

        if not is_star and not is_notable:
            continue

        dk    = dedup_key(f"{sport_short}_news", headline[:60])
        voice = pick_voice()
        body  = random.choice(reactions.get(voice, [f"Big {label} news."]))

        severity = "breaking" if any(k in headline_lower for k in [
            "trade", "release", "cut", "suspended", "fired", "retires",
            "signs", "arrested", "injured", "out for season", "torn"
        ]) else "normal"

        if insert_news({
            "type":       "news",
            "sport":      sport_short,
            "headline":   f"{emoji} {headline}",
            "body":       body,
            "character":  voice,
            "source_url": url or None,
            "severity":   severity,
            "data":       json.dumps({"headline": headline, "description": desc[:200]}),
            "date":       scan_date,
            "dedup_key":  dk,
        }):
            count += 1
            print(f"\n    {emoji} {headline[:65]}")

    return count


def scan_ufc_news():
    """
    Pull UFC news from ESPN MMA news feed.
    Covers fight week hype, weigh-in results, fighter interviews, post-fight drama.
    Gives the feed MMA content on non-fight days too.
    """
    print("  Scanning UFC/MMA news...", end=" ")
    count = 0

    UFC_STARS = {
        "Jon Jones", "Islam Makhachev", "Alex Pereira", "Leon Edwards",
        "Sean O'Malley", "Dricus du Plessis", "Tom Aspinall", "Max Holloway",
        "Conor McGregor", "Paddy Pimblett", "Dustin Poirier", "Charles Oliveira",
        "Khamzat Chimaev", "Colby Covington", "Justin Gaethje", "Nate Diaz",
        "Valentina Shevchenko", "Amanda Nunes", "Zhang Weili", "Julianna Pena",
        "Francis Ngannou", "Stipe Miocic", "Ciryl Gane", "Sergei Pavlovich",
        "Michael Chandler", "Tony Ferguson", "Deiveson Figueiredo", "Brandon Moreno",
    }

    UFC_NEWS_REACTIONS = {
        "yumi": [
            "The fight game never stops moving. This is worth paying attention to.",
            "MMA news cycles fast. File this away before fight night.",
            "Context matters in MMA. This changes how I am looking at the upcoming card.",
            "The mental side of fighting is underrated. This is a storyline worth tracking.",
            "Every piece of fight week news is a data point. This one matters.",
        ],
        "johnnybot": [
            "MMA is 50% fighting and 50% mind games. This is the mind games part.",
            "Fight week always produces news. Whether it matters is another question I plan to answer.",
            "I need to see how this affects the line before I form a full opinion.",
            "In MMA, every piece of information is potentially actionable. This is one of them.",
            "The narrative is shifting. Whether the oddsmakers have caught up is a different story.",
        ],
        "krash": [
            "FIGHT WEEK IS DIFFERENT. Everything matters. Every word. Every look. I AM LOCKED IN.",
            "The MMA world is buzzing right now and I am fully HERE FOR IT.",
            "This sport never sleeps and neither do I when a card is coming up.",
            "FIGHT WEEK NEWS HITS DIFFERENT. My blood pressure is already up.",
            "When MMA Twitter starts moving like this, something real is happening. Pay attention.",
        ],
    }

    try:
        resp = requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/news",
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"error: {e}")
        return 0

    for article in data.get("articles", [])[:10]:
        headline = article.get("headline", "")
        desc     = article.get("description", "")
        url      = article.get("links", {}).get("web", {}).get("href", "")

        if not headline:
            continue

        # Only cover articles mentioning known stars or key fight week terms
        headline_lower = headline.lower()
        is_star_news   = any(star.lower() in headline_lower for star in UFC_STARS)
        is_fight_week  = any(k in headline_lower for k in [
            "weigh", "fight week", "canceled", "injured", "pulls out",
            "title shot", "championship", "ufc", "interim", "stripped",
            "contract", "ko", "tko", "submission", "decision",
        ])

        if not is_star_news and not is_fight_week:
            continue

        dk    = dedup_key("ufc_news", headline[:60])
        voice = pick_voice()
        body  = random.choice(UFC_NEWS_REACTIONS.get(voice, UFC_NEWS_REACTIONS["yumi"]))

        # Search YouTube for a related clip
        yt_url = None
        if is_star_news:
            star = next((s for s in UFC_STARS if s.lower() in headline_lower), None)
            if star:
                yt_url = find_youtube_highlight(
                    f"{star} UFC {scan_date[:7]}",
                    cache_key=f"ufc_news_{star}_{scan_date}"
                )

        if insert_news({
            "type":       "highlights",
            "sport":      "mma",
            "headline":   f"🥊 {headline}",
            "body":       body,
            "character":  voice,
            "source_url": yt_url or url or None,
            "severity":   "breaking" if any(k in headline_lower for k in ["pulls out", "canceled", "stripped", "injured"]) else "normal",
            "data":       json.dumps({"headline": headline, "description": desc[:200]}),
            "date":       scan_date,
            "dedup_key":  dk,
        }):
            count += 1
            print(f"\n    🥊 {headline[:60]}")

    print(f"{count} new" if count else "no UFC news")
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
total += scan_viral_sports()   # Golf, UFC results, boxing
total += scan_ufc_news()       # UFC news feed — fight week hype, weigh-ins, drama

# ── Sport news feeds ──────────────────────────────────────────────────────────
NFL_STARS = {
    "Patrick Mahomes", "Josh Allen", "Lamar Jackson", "Joe Burrow",
    "Justin Jefferson", "Tyreek Hill", "Travis Kelce", "Davante Adams",
    "CeeDee Lamb", "Stefon Diggs", "Ja'Marr Chase", "Cooper Kupp",
    "Aaron Rodgers", "Tua Tagovailoa", "Dak Prescott", "Justin Herbert",
    "Jalen Hurts", "Brock Purdy", "Sam Darnold", "Anthony Richardson",
    "Christian McCaffrey", "Derrick Henry", "Saquon Barkley", "Nick Chubb",
    "Micah Parsons", "Myles Garrett", "TJ Watt", "Maxx Crosby",
}
NFL_KEYWORDS = [
    "trade", "signs", "release", "cut", "draft", "free agent", "contract",
    "suspended", "injured", "ir", "retired", "fired", "head coach", "nfl",
    "super bowl", "playoff", "extension", "holdout", "franchise tag",
]

NBA_STARS = {
    "LeBron James", "Stephen Curry", "Kevin Durant", "Giannis Antetokounmpo",
    "Nikola Jokic", "Luka Doncic", "Jayson Tatum", "Shai Gilgeous-Alexander",
    "Anthony Davis", "Jimmy Butler", "Damian Lillard", "Kyrie Irving",
    "Anthony Edwards", "Donovan Mitchell", "Devin Booker", "Trae Young",
    "Victor Wembanyama", "Cade Cunningham", "Paolo Banchero", "Tyrese Maxey",
}
NBA_KEYWORDS = [
    "trade", "signs", "waived", "buyout", "extension", "max contract",
    "free agent", "draft", "suspended", "fined", "injured", "out",
    "all-star", "mvp", "dpoy", "championship", "playoffs",
]

MLB_KEYWORDS = [
    "trade", "signs", "dfa", "released", "suspended", "injured", "il",
    "no-hitter", "perfect game", "contract", "free agent", "extension",
    "playoffs", "world series", "all-star",
]

NHL_KEYWORDS = [
    "trade", "signs", "waived", "suspended", "injured", "ltir",
    "contract", "free agent", "playoffs", "stanley cup", "all-star",
]

nfl_count = scan_sport_news("american-football", "nfl", "🏈", "NFL", NFL_STARS, NFL_KEYWORDS)
nba_count = scan_sport_news("basketball", "nba", "🏀", "NBA", NBA_STARS, NBA_KEYWORDS)
mlb_count = scan_sport_news("baseball", "mlb", "⚾", "MLB", set(), MLB_KEYWORDS)
nhl_count = scan_sport_news("hockey", "nhl", "🏒", "NHL", set(), NHL_KEYWORDS)

if nfl_count: print(f"  🏈 NFL news: {nfl_count} new")
if nba_count: print(f"  🏀 NBA news: {nba_count} new")
if mlb_count: print(f"  ⚾ MLB news: {mlb_count} new")
if nhl_count: print(f"  🏒 NHL news: {nhl_count} new")
total += nfl_count + nba_count + mlb_count + nhl_count

print(f"\n  📡 Scan complete — {total} new items published")
