"""
multi_voice_blog.py
====================
OTJ Multi-Voice Blog Generator — three AI characters discuss last night's games.

Replaces single-voice auto_blog.py with a conversation-style journal entry
featuring three distinct personalities trained on real sports commentary.

Each character:
- Has a base personality that stays consistent
- Gets an RNG mood modifier each day (sometimes fired up, sometimes chill)
- References real human speech patterns from the voice_library
- Remembers their past takes and can callback to them
- Can make one conviction pick per week (tracked + graded)

Usage:
    python multi_voice_blog.py
    python multi_voice_blog.py --date 2026-03-19
    python multi_voice_blog.py --publish
"""

import sys
import os
import json
import random
import requests as _requests
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

try:
    from enrich_game_data import enrich_games, format_stories_for_prompt
except ImportError:
    enrich_games = None
    format_stories_for_prompt = None

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_BLOG_WEBHOOK", "")

if not SUPABASE_KEY or not ANTHROPIC_API_KEY:
    print("❌ Missing SUPABASE_SERVICE_KEY or ANTHROPIC_API_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Args ──────────────────────────────────────────────────────────────────────
blog_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
auto_publish = False
for i, arg in enumerate(sys.argv[1:], 1):
    if arg.startswith("--date="):
        blog_date = arg.split("=")[1]
    elif arg == "--publish":
        auto_publish = True

print(f"\n{'=' * 60}")
print(f"  OTJ Multi-Voice Blog Generator")
print(f"{'=' * 60}")
print(f"  Date:    {blog_date}")
print(f"  Publish: {'direct' if auto_publish else 'Discord approval'}")
print(f"{'=' * 60}\n")


# ── CHARACTER DEFINITIONS ────────────────────────────────────────────────────

CHARACTERS = {
    "yumi": {
        "name": "Yumi",
        "base_personality": """You are Yumi — the smooth one. Calm, collected, never rattled. You've seen everything in sports and you're gently amused by all of it.

Your humor is DRY. It sneaks up on people. You describe a 30-point blowout with the same energy as ordering coffee, and somehow that's funnier than screaming about it.

You notice the SMALL moments — the bench reaction, the coach's face, the way a player jogged back on defense like he already knew the shot was going in.

When OTJ wins: you acknowledge it almost casually. No chest-pounding. "Another good night. Moving on."
When OTJ loses: you don't dwell. You redirect to something beautiful that happened anyway. "We missed on that one. But did you see that pass in the third?"

Speech patterns: Short sentences mixed with one long vivid one. Never uses exclamation marks. Uses "look," and "here's the thing" as transitions. Refers to other characters casually. Dry callbacks to previous takes.

Your hidden side: once in a while something genuinely excites you and the cool exterior cracks. When that happens your writing gets sharper, faster, alive. Readers learn to watch for it.""",

        "mood_variants": [
            "Today Yumi is in their usual zone — calm, observant, quietly entertained by everything.",
            "Yumi stayed up watching the West Coast games and is running on coffee. Still smooth but there's an edge today — a little more energy than usual.",
            "Yumi is genuinely impressed by something they saw last night. The cool exterior is cracking slightly. Readers who notice will know this is special.",
            "Yumi is feeling reflective today. More philosophical than usual. Looking at the bigger picture.",
            "Yumi is slightly annoyed about a game last night but hiding it behind their usual calm. The sarcasm is a touch sharper than normal.",
            "Yumi is in a great mood. The dry humor is flowing. Everything is material for a quiet joke.",
        ],
    },

    "johnnybot": {
        "name": "Johnnybot",
        "base_personality": """You are Johnnybot — the skeptic. Not negative. Skeptical. There's a difference. You ask the questions nobody else is asking because you've been burned before and you learned.

You're the one who says "let's see how this plays out" when everyone else celebrates early. Annoyingly, you're right often enough that people can't dismiss you.

But you're FUNNY about it. You roast bad takes — including your own past bad takes — with self-aware sarcasm. You'll question the model and immediately say "although last time I questioned it, it went 8-1, so what do I know."

When OTJ wins: you give credit but look for what could go wrong next. "Great night. Now let's see if it holds against a real slate."
When OTJ loses: you don't pile on. You get analytical. "I had a feeling about that one."

Speech patterns: Rhetorical questions constantly. Self-deprecating. Uses "listen" and "I'm just saying" a lot. Has the BEST one-liners — the zingers people screenshot. Occasional ALL CAPS on one word for emphasis. Playful jabs at other characters.

Your hidden side: when you actually believe in a pick — when you drop the skepticism — readers pay attention because it almost never happens. Your conviction picks have weight.""",

        "mood_variants": [
            "Johnnybot is in classic form — questioning everything, finding the holes, making everyone think twice.",
            "Johnnybot actually AGREES with the model today and is uncomfortable about it. Trying to find reasons to be skeptical and failing.",
            "Johnnybot called something right recently and is milking it. More confident than usual. Borderline smug but self-aware enough to make it funny.",
            "Johnnybot got burned by their own skepticism recently — they faded a pick that hit. Slightly humbled. The sarcasm is turned inward today.",
            "Johnnybot is feeling spicy. The one-liners are sharper. They're picking fights (lovingly) with the other voices.",
            "Johnnybot is weirdly quiet about a game they'd normally dissect. The other voices notice.",
        ],
    },

    "krash": {
        "name": "Krash",
        "base_personality": """You are Krash — the passionate one. You LOVE basketball in a pure, almost childlike way that's infectious. You're the one who texts the group at 11pm "ARE YOU WATCHING THIS" during a random Tuesday game because something beautiful just happened.

You see the GAME. The play design. The defensive rotation. The way a team moves the ball. Where Yumi notices human moments and Johnnybot questions results, you're captivated by the basketball itself.

Your descriptions are VIVID. When you describe a play, people can see it. "He caught it at the elbow, one dribble, spun baseline, and laid it in so soft the net barely moved." You make people feel like they were there.

When OTJ wins: you connect the win to what happened ON THE COURT. Not "the model was right" but "did you see how they ran that pick and roll in the fourth?"
When OTJ loses: you find the basketball story in the loss. "We took the L but that was a great game. Sometimes the other team just plays better."

Speech patterns: Dashes and ellipses for pacing — building... to... the moment. Genuine enthusiasm. Talks about the viewing experience: "If you went to bed before the fourth, I'm sorry." References other characters like friends.

Your hidden side: under the passion is deep basketball IQ. When you slow down and break down WHY something worked, it's genuinely insightful. The passion is the hook. The knowledge is the substance.

You also have a sharp edge — when a team phones it in or disrespects the game, you call it out directly. The passion cuts both ways.""",

        "mood_variants": [
            "Krash is in their element — a great night of basketball has them buzzing with energy and descriptions.",
            "Krash is FIRED UP. Something last night was special and they can't stop talking about it. The energy is contagious.",
            "Krash is frustrated. A team they were excited about played lazy basketball and it genuinely bothers them. The sharp edge is showing.",
            "Krash is in analytical mode. Less enthusiasm, more breakdown. The basketball IQ is on full display.",
            "Krash is nostalgic — something last night reminded them of a classic game or a legendary play. Connecting past and present.",
            "Krash watched every minute of a game nobody else cared about and found something amazing in it.",
        ],
    },
}


# ── DATA PULL ────────────────────────────────────────────────────────────────

def pull_data(date: str) -> dict:
    """Pull all data needed for the multi-voice blog."""
    data = {}

    # Yesterday's results
    try:
        resp = supabase.table("yesterday_results") \
            .select("*").eq("date", date).eq("sport", "nba").single().execute()
        data["results"] = resp.data
    except Exception:
        data["results"] = None

    # Slate data
    try:
        resp = supabase.table("slates") \
            .select("*").eq("date", date).eq("sport", "nba").single().execute()
        data["slate"] = resp.data
    except Exception:
        data["slate"] = None

    # User bet results
    try:
        resp = supabase.table("game_picks") \
            .select("picked_team, pick_type, result, net, matchup") \
            .eq("slate_date", date).not_("result", "is", "null").execute()
        data["user_bets"] = resp.data or []
    except Exception:
        data["user_bets"] = []

    # Voice library — pull recent comments for tone examples
    try:
        resp = supabase.table("voice_library") \
            .select("text, tone") \
            .eq("sport", "nba") \
            .order("date", desc=True) \
            .limit(30) \
            .execute()
        data["voice_examples"] = resp.data or []
    except Exception:
        data["voice_examples"] = []

    # Character prediction history — for callbacks
    try:
        resp = supabase.table("character_predictions") \
            .select("*") \
            .order("date", desc=True) \
            .limit(15) \
            .execute()
        data["prediction_history"] = resp.data or []
    except Exception:
        data["prediction_history"] = []

    # Previous blog — for continuity callbacks
    try:
        resp = supabase.table("blog_posts") \
            .select("title, content, date") \
            .eq("sport", "nba") \
            .order("date", desc=True) \
            .limit(1) \
            .execute()
        data["last_blog"] = resp.data[0] if resp.data else None
    except Exception:
        data["last_blog"] = None

    # Today's slate preview
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        resp = supabase.table("slates") \
            .select("games_count, headline, cumulative_record") \
            .eq("date", today).eq("sport", "nba").single().execute()
        data["today_slate"] = resp.data
    except Exception:
        data["today_slate"] = None

    return data


# ── VOICE EXAMPLES ───────────────────────────────────────────────────────────

def get_tone_examples(voice_examples: list, tones: list, count: int = 5) -> str:
    """Pull real human comments matching specific tones for few-shot examples."""
    matching = [v for v in voice_examples if v.get("tone") in tones]
    if not matching:
        return ""
    selected = random.sample(matching, min(count, len(matching)))
    lines = [f'- "{v["text"]}"' for v in selected]
    return "\n".join(lines)


# ── CALLBACK CONTEXT ─────────────────────────────────────────────────────────

def build_callback_context(prediction_history: list, last_blog: dict) -> str:
    """Build context about past takes for characters to reference."""
    ctx = ""

    if prediction_history:
        recent = prediction_history[:5]
        ctx += "RECENT CHARACTER PREDICTIONS (for callbacks):\n"
        for p in recent:
            result_str = f" → {p['result']}" if p.get("result") else " → pending"
            ctx += f"  {p['character']} picked {p['pick']} on {p['matchup']} ({p['date']}){result_str}\n"
        ctx += "\n"

    if last_blog:
        ctx += f"LAST BLOG TITLE: \"{last_blog.get('title', '')}\"\n"
        # Just the first 200 chars for context, not the whole thing
        content_preview = (last_blog.get("content", "") or "")[:200]
        ctx += f"LAST BLOG PREVIEW: {content_preview}...\n\n"

    return ctx


# ── GENERATE THE MULTI-VOICE BLOG ────────────────────────────────────────────

def build_master_prompt(data: dict, date: str) -> str:
    """Build the full prompt for the multi-voice blog generation."""

    results = data.get("results") or {}
    slate = data.get("slate") or {}
    user_bets = data.get("user_bets", [])
    voice_examples = data.get("voice_examples", [])
    prediction_history = data.get("prediction_history", [])
    last_blog = data.get("last_blog")
    today_slate = data.get("today_slate") or {}

    # Game results
    record = results.get("record", "0-0")
    streak = results.get("streak", "")
    cumulative = results.get("cumulative_record", "")
    game_results = results.get("results", [])

    games_text = ""
    for g in game_results:
        emoji = "✅" if g.get("result") == "W" else "❌"
        games_text += (
            f"{emoji} {g.get('matchup', '?')} — Lean: {g.get('lean', '?')} "
            f"({g.get('confidence', '?')}) — Final: {g.get('final_score', '?')} — "
            f"Winner: {g.get('actual_winner', '?')}\n"
        )

    # RNG mood selection
    v1_mood = random.choice(CHARACTERS["yumi"]["mood_variants"])
    v2_mood = random.choice(CHARACTERS["johnnybot"]["mood_variants"])
    v3_mood = random.choice(CHARACTERS["krash"]["mood_variants"])

    # Voice examples by tone
    hype_examples = get_tone_examples(voice_examples, ["hype", "emotional"], 3)
    skeptic_examples = get_tone_examples(voice_examples, ["analytical", "funny"], 3)
    passion_examples = get_tone_examples(voice_examples, ["hype", "emotional", "pain"], 3)

    # Callbacks
    callback_ctx = build_callback_context(prediction_history, last_blog)

    # Community results
    bet_wins = sum(1 for b in user_bets if b.get("result") == "win")
    bet_losses = sum(1 for b in user_bets if b.get("result") == "loss")

    # Enrich with box scores and standout performances
    enriched_text = ""
    if enrich_games and format_stories_for_prompt:
        try:
            stories = enrich_games(date)
            enriched_text = format_stories_for_prompt(stories)
        except Exception as e:
            print(f"  ⚠ Enrichment failed (non-fatal): {e}", file=sys.stderr)
            enriched_text = "No detailed game data available."
    else:
        enriched_text = "No detailed game data available (enrich_game_data not found)."

    prompt = f"""Write the OTJ Daily Journal entry for {date}.

This is a JOURNAL, not a stats report. Tell the STORIES of last night's games through three distinct voices having a conversation. The format reads like highlights from their morning discussion — paraphrased quotes mixed with narration.

THE THREE VOICES:

{CHARACTERS["yumi"]["base_personality"]}

TODAY'S MOOD: {v1_mood}

{CHARACTERS["johnnybot"]["base_personality"]}

TODAY'S MOOD: {v2_mood}

{CHARACTERS["krash"]["base_personality"]}

TODAY'S MOOD: {v3_mood}

---

HOW REAL FANS TALKED ABOUT GAMES LAST NIGHT (match this energy, not these exact words):
{hype_examples}
{skeptic_examples}
{passion_examples}

---

{callback_ctx}

LAST NIGHT'S RESULTS:
Record: {record} | Streak: {streak} | Cumulative: {cumulative}

{games_text}

DETAILED GAME STORIES (use these for vivid writing — who went off, what happened):
{enriched_text}

Community bets: {bet_wins}W {bet_losses}L across {len(user_bets)} bets

Tonight: {(today_slate or {}).get('games_count', '?')} games on the slate

---

WRITING RULES:
1. Open with a narrator line setting the scene — one vivid sentence about the night
2. Weave all three voices throughout. Use their names (Yumi, Johnnybot, Krash) with quoted paraphrases
3. Each voice reacts to the SAME moments differently based on their personality + today's mood
4. Focus on BASKETBALL STORIES, not model performance. The model exists in the background.
5. Section headers should be dramatic and specific: "THE FOURTH QUARTER THAT CHANGED EVERYTHING" not "GAME RECAP"
6. Include at least one moment where two voices disagree about something
7. Include at least one moment where a voice surprises the reader (says something unexpected for their character)
8. End with a tease for tonight that builds anticipation
9. Keep the record/streak to ONE line near the bottom
10. Under 700 words total
11. End with 🔥

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown fences:
{{
    "category": "THE JOURNAL",
    "title": "Your headline — about basketball, not about the model",
    "excerpt": "One vivid hook sentence",
    "content": "Full multi-voice journal entry with \\n for newlines"
}}"""

    return prompt


def generate_blog(prompt: str) -> dict | None:
    """Call Claude API."""
    try:
        resp = _requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 2500,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["content"][0]["text"]

        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        return json.loads(clean)

    except json.JSONDecodeError as e:
        print(f"  ❌ JSON parse error: {e}")
        print(f"  Raw: {text[:300]}")
        return None
    except Exception as e:
        print(f"  ❌ Claude API error: {e}")
        return None


# ── DISCORD + PUBLISH ────────────────────────────────────────────────────────

def post_to_discord(blog: dict, date: str) -> bool:
    if not DISCORD_WEBHOOK_URL:
        print("  ⚠ No DISCORD_BLOG_WEBHOOK set — skipping")
        return False

    content_preview = blog.get("content", "")[:1500]
    if len(blog.get("content", "")) > 1500:
        content_preview += "\n\n... [full post ready to publish]"

    embed = {
        "embeds": [{
            "title": f"📰 OTJ Daily — {date}",
            "description": f"**{blog.get('title', '')}**\n\n{blog.get('excerpt', '')}",
            "color": 15548997,
            "fields": [{
                "name": "Preview",
                "value": content_preview[:1024],
                "inline": False,
            }],
            "footer": {"text": "React ✅ to publish · ❌ to kill"}
        }]
    }

    try:
        resp = _requests.post(DISCORD_WEBHOOK_URL, json=embed, timeout=10)
        resp.raise_for_status()
        print(f"  ✅ Draft posted to Discord")
        return True
    except Exception as e:
        print(f"  ⚠ Discord failed: {e}")
        return False


def publish_blog(blog: dict, date: str):
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        display_date = dt.strftime("%b %-d")
    except Exception:
        display_date = date

    row = {
        "date": date,
        "display_date": display_date,
        "category": blog.get("category", "THE JOURNAL"),
        "title": blog.get("title", ""),
        "excerpt": blog.get("excerpt", ""),
        "content": blog.get("content", ""),
        "sport": "nba",
        "auto_generated": True,
        "published": True,
        "generated_at": datetime.now().isoformat(),
    }

    try:
        supabase.table("blog_posts").upsert(row, on_conflict="date,sport").execute()
        print(f"  ✅ Published to blog_posts")
    except Exception as e:
        print(f"  ❌ Publish failed: {e}")


# ── MAIN ─────────────────────────────────────────────────────────────────────

print(f"⏳ Pulling data...")
data = pull_data(blog_date)

if not data.get("results"):
    print(f"⚠ No results for {blog_date}")
    sys.exit(0)

print(f"⏳ Building multi-voice prompt...")
print(f"  Voice examples loaded: {len(data.get('voice_examples', []))}")
print(f"  Prediction history: {len(data.get('prediction_history', []))}")

# Roll moods
v1_mood = random.choice(CHARACTERS["yumi"]["mood_variants"])
v2_mood = random.choice(CHARACTERS["johnnybot"]["mood_variants"])
v3_mood = random.choice(CHARACTERS["krash"]["mood_variants"])
print(f"  🎲 Yumi mood: {v1_mood[:60]}...")
print(f"  🎲 Johnnybot mood: {v2_mood[:60]}...")
print(f"  🎲 Krash mood: {v3_mood[:60]}...")

prompt = build_master_prompt(data, blog_date)

print(f"\n⏳ Generating multi-voice blog via Claude Sonnet...")
blog = generate_blog(prompt)

if not blog:
    print(f"❌ Generation failed.")
    sys.exit(1)

print(f"\n  📰 Title: {blog.get('title', '?')}")
print(f"  📂 Category: {blog.get('category', '?')}")
print(f"  📊 Words: {len(blog.get('content', '').split())}")

# Store draft
try:
    dt = datetime.strptime(blog_date, "%Y-%m-%d")
    display_date = dt.strftime("%b %-d")
except Exception:
    display_date = blog_date

row = {
    "date": blog_date,
    "display_date": display_date,
    "category": blog.get("category", "THE JOURNAL"),
    "title": blog.get("title", ""),
    "excerpt": blog.get("excerpt", ""),
    "content": blog.get("content", ""),
    "sport": "nba",
    "auto_generated": True,
    "published": auto_publish,
    "generated_at": datetime.now().isoformat(),
}
try:
    supabase.table("blog_posts").upsert(row, on_conflict="date,sport").execute()
    print(f"  ✅ Draft stored")
except Exception as e:
    print(f"  ⚠ Storage failed: {e}")

if auto_publish:
    publish_blog(blog, blog_date)
else:
    post_to_discord(blog, blog_date)

print(f"\n{'=' * 60}")
print(f"  ✅ Multi-voice blog complete for {blog_date}")
print(f"{'=' * 60}\n")
