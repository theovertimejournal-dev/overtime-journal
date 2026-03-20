"""
scrape_voice_library.py
========================
Scrapes real sports commentary from Reddit NBA game threads
and stores it in Supabase as voice training data for OTJ characters.

Runs daily via GitHub Actions after games finish.
Pulls post-game thread comments, filters for quality,
tags tone, and stores in voice_library table.

Usage:
    python scrape_voice_library.py
    python scrape_voice_library.py --date 2026-03-19
    python scrape_voice_library.py --limit 50
"""

import sys
import os
import json
import requests
import re
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

# Reddit doesn't need auth for public JSON endpoints
REDDIT_HEADERS = {"User-Agent": "OTJ-VoiceLibrary/1.0"}

# ── Args ──────────────────────────────────────────────────────────────────────
scrape_date = datetime.now().strftime("%Y-%m-%d")
comment_limit = 30

for i, arg in enumerate(sys.argv[1:], 1):
    if arg.startswith("--date="):
        scrape_date = arg.split("=")[1]
    elif arg.startswith("--limit="):
        comment_limit = int(arg.split("=")[1])

print(f"\n{'=' * 60}")
print(f"  OTJ Voice Library Scraper")
print(f"{'=' * 60}")
print(f"  Date:  {scrape_date}")
print(f"  Limit: {comment_limit} comments")
print(f"{'=' * 60}\n")


# ── Tone classification ──────────────────────────────────────────────────────

def classify_tone(text: str) -> str:
    """Simple keyword-based tone tagger."""
    t = text.lower()

    # Hype / excitement
    hype_words = ["insane", "ridiculous", "omg", "holy", "unreal", "what a", 
                  "are you kidding", "oh my god", "can't believe", "goat",
                  "cooking", "on fire", "clutch", "dagger", "ice cold",
                  "monster", "nasty", "filthy", "disgusting", "sheesh"]
    
    # Frustration / pain
    pain_words = ["pain", "why", "can't watch", "i'm done", "garbage",
                  "trash", "terrible", "pathetic", "embarrassing", "choke",
                  "blown lead", "collapse", "worst", "fire the coach",
                  "i hate", "fade me", "existence is pain", "tank"]
    
    # Analytical / thoughtful
    analysis_words = ["interesting", "actually", "if you look at", "the thing is",
                      "underrated", "people don't realize", "scheme", "adjustment",
                      "rotation", "matchup", "lineups", "spacing", "defense"]
    
    # Funny / sarcastic
    funny_words = ["lmao", "lol", "dead", "bruh", "crying", "i'm weak",
                   "comedy", "imagine", "poverty", "least valuable",
                   "certified", "ratio", "fraudulent", "mickey mouse"]
    
    # Emotional / passionate
    emotional_words = ["love this team", "so happy", "beautiful", "art",
                       "that pass", "that move", "chills", "tears",
                       "this is why", "i live for", "basketball is"]

    scores = {
        "hype": sum(1 for w in hype_words if w in t),
        "pain": sum(1 for w in pain_words if w in t),
        "analytical": sum(1 for w in analysis_words if w in t),
        "funny": sum(1 for w in funny_words if w in t),
        "emotional": sum(1 for w in emotional_words if w in t),
    }
    
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "neutral"
    return best


def is_quality_comment(text: str, score: int) -> bool:
    """Filter for comments worth keeping as voice training data."""
    if not text or len(text) < 20:
        return False
    if len(text) > 500:
        return False  # too long, probably a rant or copy-pasta
    if score < 3:
        return False  # not enough upvotes to be representative
    # Skip removed/deleted
    if text in ("[removed]", "[deleted]"):
        return False
    # Skip bot comments
    if "i am a bot" in text.lower() or "this action was performed" in text.lower():
        return False
    # Skip links-only comments
    if text.startswith("http") and len(text.split()) < 5:
        return False
    return True


# ── Reddit scraping ──────────────────────────────────────────────────────────

def search_game_threads(date: str) -> list:
    """Search r/nba for post-game threads from a specific date."""
    # Reddit search for post-game threads
    query = f"Post Game Thread subreddit:nba"
    url = f"https://www.reddit.com/r/nba/search.json"
    params = {
        "q": query,
        "sort": "new",
        "restrict_sr": "true",
        "limit": 15,
        "t": "day",
    }
    
    try:
        resp = requests.get(url, headers=REDDIT_HEADERS, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        threads = []
        for post in data.get("data", {}).get("children", []):
            d = post.get("data", {})
            title = d.get("title", "")
            # Filter for actual post-game threads
            if "post game thread" in title.lower() or "post-game thread" in title.lower():
                threads.append({
                    "id": d.get("id"),
                    "title": title,
                    "url": d.get("permalink"),
                    "score": d.get("score", 0),
                    "num_comments": d.get("num_comments", 0),
                    "created": d.get("created_utc", 0),
                })
        
        print(f"  Found {len(threads)} post-game threads")
        return threads
    
    except Exception as e:
        print(f"  ⚠ Reddit search failed: {e}")
        return []


def scrape_thread_comments(thread_id: str, limit: int = 30) -> list:
    """Pull top comments from a Reddit thread."""
    url = f"https://www.reddit.com/comments/{thread_id}.json"
    params = {"sort": "top", "limit": limit}
    
    try:
        resp = requests.get(url, headers=REDDIT_HEADERS, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        comments = []
        # Comments are in the second listing
        if len(data) >= 2:
            for child in data[1].get("data", {}).get("children", []):
                c = child.get("data", {})
                body = c.get("body", "")
                score = c.get("score", 0)
                
                if is_quality_comment(body, score):
                    # Clean up markdown
                    clean = body.replace("&amp;", "&").replace("&gt;", ">").replace("&lt;", "<")
                    clean = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', clean)  # remove links
                    clean = re.sub(r'\*+', '', clean)  # remove bold/italic markers
                    clean = clean.strip()
                    
                    comments.append({
                        "text": clean,
                        "score": score,
                        "tone": classify_tone(clean),
                    })
        
        # Sort by score, take top ones
        comments.sort(key=lambda x: x["score"], reverse=True)
        return comments[:limit]
    
    except Exception as e:
        print(f"  ⚠ Failed to scrape thread {thread_id}: {e}")
        return []


# ── Store in Supabase ────────────────────────────────────────────────────────

def store_comments(comments: list, thread_title: str, date: str):
    """Store scraped comments in voice_library table."""
    stored = 0
    for c in comments:
        try:
            supabase.table("voice_library").insert({
                "source": "reddit_nba",
                "source_thread": thread_title[:200],
                "text": c["text"][:1000],
                "tone": c["tone"],
                "upvotes": c["score"],
                "sport": "nba",
                "date": date,
            }).execute()
            stored += 1
        except Exception as e:
            # Skip duplicates or errors silently
            pass
    return stored


# ── Main ─────────────────────────────────────────────────────────────────────

print(f"⏳ Searching Reddit for game threads...")
threads = search_game_threads(scrape_date)

if not threads:
    print(f"⚠ No game threads found for {scrape_date}")
    print(f"  This is normal if games haven't finished yet or Reddit search is delayed.")
    sys.exit(0)

total_stored = 0
for thread in threads[:8]:  # max 8 game threads per night
    print(f"\n  📄 {thread['title'][:80]}...")
    print(f"     {thread['num_comments']} comments, score {thread['score']}")
    
    comments = scrape_thread_comments(thread["id"], limit=comment_limit)
    print(f"     Scraped {len(comments)} quality comments")
    
    if comments:
        # Show tone breakdown
        tones = {}
        for c in comments:
            tones[c["tone"]] = tones.get(c["tone"], 0) + 1
        print(f"     Tones: {tones}")
        
        stored = store_comments(comments, thread["title"], scrape_date)
        total_stored += stored
        print(f"     Stored {stored} comments")

print(f"\n{'=' * 60}")
print(f"  ✅ Voice library updated — {total_stored} new comments from {len(threads)} threads")
print(f"{'=' * 60}\n")
