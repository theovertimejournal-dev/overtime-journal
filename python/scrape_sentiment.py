"""
scrape_sentiment.py
====================
Scrapes Reddit NBA game threads and tracks fan sentiment per team.
Characters (Yumi, Johnnybot, Krash) develop preferences based on
what fans actually say about teams over time.

NOT used for predictions — purely for personality development.
Characters might start rooting for teams fans love and fading
teams fans complain about.

Runs daily after games via GitHub Actions.

Usage:
    python scrape_sentiment.py
    python scrape_sentiment.py --date 2026-03-22
"""

import sys
import os
import json
import requests
import re
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

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
REDDIT_HEADERS = {"User-Agent": "OTJ-Sentiment/1.0"}

# ── Args ──────────────────────────────────────────────────────────────────────
scan_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        scan_date = arg.split("=")[1]

print(f"\n{'=' * 60}")
print(f"  OTJ Reddit Sentiment Tracker")
print(f"  Date: {scan_date}")
print(f"{'=' * 60}\n")

# ── Team name mappings ───────────────────────────────────────────────────────
TEAM_ALIASES = {
    "lakers": "LAL", "lal": "LAL", "lebron": "LAL", "luka": "LAL", "reaves": "LAL",
    "celtics": "BOS", "bos": "BOS", "tatum": "BOS", "jaylen": "BOS", "jayson": "BOS",
    "thunder": "OKC", "okc": "OKC", "shai": "OKC", "sga": "OKC",
    "pistons": "DET", "det": "DET", "cade": "DET", "cunningham": "DET",
    "spurs": "SAS", "sas": "SAS", "wemby": "SAS", "wembanyama": "SAS", "victor": "SAS",
    "knicks": "NYK", "nyk": "NYK", "brunson": "NYK", "jalen brunson": "NYK",
    "rockets": "HOU", "hou": "HOU",
    "cavaliers": "CLE", "cavs": "CLE", "cle": "CLE", "donovan": "CLE",
    "nuggets": "DEN", "den": "DEN", "jokic": "DEN", "nikola": "DEN",
    "timberwolves": "MIN", "wolves": "MIN", "min": "MIN", "ant": "MIN", "edwards": "MIN",
    "heat": "MIA", "mia": "MIA", "jimmy": "MIA", "butler": "MIA",
    "suns": "PHX", "phx": "PHX", "booker": "PHX", "devin": "PHX",
    "hawks": "ATL", "atl": "ATL", "trae": "ATL",
    "76ers": "PHI", "sixers": "PHI", "phi": "PHI", "embiid": "PHI", "maxey": "PHI",
    "magic": "ORL", "orl": "ORL", "paolo": "ORL",
    "raptors": "TOR", "tor": "TOR",
    "warriors": "GSW", "gsw": "GSW", "curry": "GSW", "steph": "GSW",
    "bucks": "MIL", "mil": "MIL", "giannis": "MIL",
    "bulls": "CHI", "chi": "CHI",
    "pelicans": "NOP", "nop": "NOP", "zion": "NOP",
    "grizzlies": "MEM", "mem": "MEM", "ja": "MEM", "morant": "MEM",
    "mavericks": "DAL", "mavs": "DAL", "dal": "DAL",
    "jazz": "UTA", "uta": "UTA",
    "kings": "SAC", "sac": "SAC", "fox": "SAC",
    "nets": "BKN", "bkn": "BKN",
    "wizards": "WAS", "was": "WAS",
    "pacers": "IND", "ind": "IND",
    "hornets": "CHA", "cha": "CHA",
    "blazers": "POR", "por": "POR", "portland": "POR",
    "clippers": "LAC", "lac": "LAC",
}

# ── Sentiment keywords ───────────────────────────────────────────────────────
POSITIVE_WORDS = [
    "goat", "amazing", "incredible", "insane", "clutch", "beast", "monster",
    "cooking", "on fire", "unstoppable", "love", "beautiful", "elite", "mvp",
    "dynasty", "unreal", "ridiculous", "special", "generational", "dominant",
    "locked in", "different breed", "built different", "hooper", "bucket",
    "cash", "money", "automatic", "lethal", "cold blooded", "icy", "dawg",
    "certified", "legit", "scary", "terrifying", "best in the league",
]

NEGATIVE_WORDS = [
    "trash", "garbage", "terrible", "pathetic", "embarrassing", "washed",
    "cooked", "done", "finished", "poverty", "poverty franchise", "tank",
    "fire the coach", "blow it up", "disgraceful", "joke", "clown",
    "fraud", "overrated", "choke", "choker", "soft", "weak", "lazy",
    "no effort", "gave up", "quit", "disgusting", "unwatchable", "pain",
    "existence is pain", "fade me", "sell the team", "worst",
    "can't watch", "turning off the tv", "i'm done", "hate this team",
]

HYPE_WORDS = [
    "omg", "holy", "what", "bruh", "sheesh", "yooo", "lets go",
    "im screaming", "crying", "dead", "lmao", "no way", "are you kidding",
    "i can't believe", "oh my god", "this is insane",
]


def score_sentiment(text):
    """Score a comment's sentiment. Returns (positive, negative, hype, teams_mentioned)."""
    t = text.lower()
    
    pos = sum(1 for w in POSITIVE_WORDS if w in t)
    neg = sum(1 for w in NEGATIVE_WORDS if w in t)
    hype = sum(1 for w in HYPE_WORDS if w in t)
    
    # Find teams mentioned
    teams = set()
    words = re.findall(r'\b\w+\b', t)
    for word in words:
        if word in TEAM_ALIASES:
            teams.add(TEAM_ALIASES[word])
    
    return pos, neg, hype, teams


def search_game_threads():
    """Search Reddit for NBA post-game threads."""
    url = "https://www.reddit.com/r/nba/search.json"
    params = {"q": "Post Game Thread", "sort": "new", "restrict_sr": "true", "limit": 15, "t": "day"}
    
    try:
        resp = requests.get(url, headers=REDDIT_HEADERS, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        threads = []
        for post in data.get("data", {}).get("children", []):
            d = post.get("data", {})
            title = d.get("title", "")
            if "post game thread" in title.lower() or "post-game thread" in title.lower():
                threads.append({
                    "id": d.get("id"),
                    "title": title,
                    "num_comments": d.get("num_comments", 0),
                })
        return threads
    except Exception as e:
        print(f"  ⚠ Reddit search failed: {e}")
        return []


def scrape_comments(thread_id, limit=50):
    """Pull top comments from a thread."""
    url = f"https://www.reddit.com/comments/{thread_id}.json"
    try:
        resp = requests.get(url, headers=REDDIT_HEADERS, params={"sort": "top", "limit": limit}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        comments = []
        if len(data) >= 2:
            for child in data[1].get("data", {}).get("children", []):
                c = child.get("data", {})
                body = c.get("body", "")
                score = c.get("score", 0)
                
                if not body or len(body) < 10 or body in ("[removed]", "[deleted]"):
                    continue
                if "i am a bot" in body.lower():
                    continue
                if score < 2:
                    continue
                
                comments.append({"text": body, "score": score})
        
        return comments
    except:
        return []


# ── Main ─────────────────────────────────────────────────────────────────────

print("⏳ Searching game threads...")
threads = search_game_threads()
print(f"  Found {len(threads)} post-game threads")

# Aggregate sentiment per team
team_sentiment = {}  # team -> {pos, neg, hype, total_comments, top_positive, top_negative}

for thread in threads[:10]:
    print(f"\n  📄 {thread['title'][:70]}...")
    
    # Try to extract teams from thread title
    title_lower = thread['title'].lower()
    thread_teams = set()
    for alias, abbr in TEAM_ALIASES.items():
        if alias in title_lower and len(alias) > 2:
            thread_teams.add(abbr)
    
    comments = scrape_comments(thread["id"], limit=40)
    print(f"     Scraped {len(comments)} comments")
    
    for comment in comments:
        pos, neg, hype, mentioned_teams = score_sentiment(comment["text"])
        
        # Associate sentiment with mentioned teams, or thread teams if none mentioned
        associated_teams = mentioned_teams if mentioned_teams else thread_teams
        
        for team in associated_teams:
            if team not in team_sentiment:
                team_sentiment[team] = {
                    "positive": 0, "negative": 0, "hype": 0,
                    "comments": 0, "upvote_weighted_pos": 0, "upvote_weighted_neg": 0,
                    "best_quote": "", "best_quote_score": 0,
                    "worst_quote": "", "worst_quote_score": 0,
                }
            
            ts = team_sentiment[team]
            ts["positive"] += pos
            ts["negative"] += neg
            ts["hype"] += hype
            ts["comments"] += 1
            ts["upvote_weighted_pos"] += pos * min(comment["score"], 100)
            ts["upvote_weighted_neg"] += neg * min(comment["score"], 100)
            
            # Track best/worst quotes
            if pos > neg and comment["score"] > ts["best_quote_score"]:
                ts["best_quote"] = comment["text"][:200]
                ts["best_quote_score"] = comment["score"]
            if neg > pos and comment["score"] > ts["worst_quote_score"]:
                ts["worst_quote"] = comment["text"][:200]
                ts["worst_quote_score"] = comment["score"]

# ── Store sentiment in Supabase ──────────────────────────────────────────────

print(f"\n⏳ Storing sentiment data for {len(team_sentiment)} teams...")

for team, data in team_sentiment.items():
    total = data["positive"] + data["negative"]
    if total == 0:
        sentiment_score = 0.5
    else:
        sentiment_score = round(data["positive"] / total, 3)
    
    # Vibes: 0 = pure hate, 0.5 = neutral, 1.0 = pure love
    if sentiment_score > 0.7:
        vibe = "beloved"
    elif sentiment_score > 0.55:
        vibe = "positive"
    elif sentiment_score > 0.45:
        vibe = "neutral"
    elif sentiment_score > 0.3:
        vibe = "negative"
    else:
        vibe = "hated"
    
    row = {
        "team": team,
        "date": scan_date,
        "sentiment_score": sentiment_score,
        "vibe": vibe,
        "positive_count": data["positive"],
        "negative_count": data["negative"],
        "hype_count": data["hype"],
        "comment_count": data["comments"],
        "best_quote": data["best_quote"][:300] if data["best_quote"] else None,
        "worst_quote": data["worst_quote"][:300] if data["worst_quote"] else None,
    }
    
    try:
        supabase.table("team_sentiment").upsert(row, on_conflict="team,date").execute()
    except Exception as e:
        print(f"  ⚠ Failed to store {team}: {e}")

# ── Print Summary ────────────────────────────────────────────────────────────

print(f"\n{'=' * 60}")
print(f"  REDDIT SENTIMENT — {scan_date}")
print(f"{'=' * 60}")
print(f"  {'Team':<6}{'Vibe':<12}{'Score':<8}{'Pos':<6}{'Neg':<6}{'Hype':<6}{'Comments'}")
print(f"  {'-'*52}")

sorted_teams = sorted(team_sentiment.items(), key=lambda x: x[1]["positive"] / max(x[1]["positive"] + x[1]["negative"], 1), reverse=True)
for team, data in sorted_teams:
    total = data["positive"] + data["negative"]
    score = data["positive"] / max(total, 1)
    vibe = "🟢 beloved" if score > 0.7 else "🔵 positive" if score > 0.55 else "⚪ neutral" if score > 0.45 else "🟠 negative" if score > 0.3 else "🔴 hated"
    print(f"  {team:<6}{vibe:<12}{score:.2f}    {data['positive']:<6}{data['negative']:<6}{data['hype']:<6}{data['comments']}")

# ── Character Favorite Assignment ────────────────────────────────────────────
# Each character naturally gravitates toward different teams based on sentiment

if sorted_teams:
    beloved = [t for t, d in sorted_teams if d["positive"] / max(d["positive"] + d["negative"], 1) > 0.65]
    controversial = [t for t, d in sorted_teams if d["hype"] >= 3]
    underdogs = [t for t, d in sorted_teams if d["positive"] / max(d["positive"] + d["negative"], 1) > 0.5 and d["comments"] < 10]
    
    print(f"\n  CHARACTER VIBES:")
    if beloved:
        krash_fav = random.choice(beloved[:3]) if len(beloved) >= 3 else beloved[0]
        print(f"  🟢 KRASH vibing with: {krash_fav} (fans love them)")
    if controversial:
        jbot_watch = random.choice(controversial[:3]) if len(controversial) >= 3 else controversial[0]
        print(f"  🟡 JOHNNYBOT watching: {jbot_watch} (high hype, needs questioning)")
    if underdogs:
        yumi_quiet = random.choice(underdogs[:3]) if len(underdogs) >= 3 else underdogs[0]
        print(f"  🔵 YUMI quietly noting: {yumi_quiet} (under the radar positive)")

print(f"\n  ✅ Sentiment tracking complete")
