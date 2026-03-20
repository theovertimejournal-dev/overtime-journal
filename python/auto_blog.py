"""
auto_blog.py
============
OTJ Auto-Blog Agent — generates daily blog posts from model results.

Runs after morning resolve via GitHub Actions.
Pulls last night's graded results + today's slate from Supabase,
generates a blog post in the OTJ voice via Claude API,
and posts the draft to Discord for one-tap approval.

Usage:
    python auto_blog.py                     # Auto-detect: recap yesterday
    python auto_blog.py --date 2026-03-17   # Recap a specific date
    python auto_blog.py --type recap        # Force blog type
    python auto_blog.py --publish           # Skip Discord, publish directly

Blog types:
    recap     — "Last Night: 7-1. Here's What Hit." (default, daily)
    lesson    — Deep-dive on one specific game/bet outcome
    signal    — Signal spotlight (weekly, one signal's hit rate)
    update    — Product update (manual trigger)
"""

import sys
import os
import json
import requests as _requests
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_BLOG_WEBHOOK", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set.")
    sys.exit(1)
if not ANTHROPIC_API_KEY:
    print("❌ ANTHROPIC_API_KEY not set.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Args ──────────────────────────────────────────────────────────────────────
blog_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
blog_type = "recap"
auto_publish = False

for i, arg in enumerate(sys.argv[1:], 1):
    if arg.startswith("--date="):
        blog_date = arg.split("=")[1]
    elif arg == "--date" and i < len(sys.argv) - 1:
        blog_date = sys.argv[i + 1]
    elif arg.startswith("--type="):
        blog_type = arg.split("=")[1]
    elif arg == "--type" and i < len(sys.argv) - 1:
        blog_type = sys.argv[i + 1]
    elif arg == "--publish":
        auto_publish = True

print(f"\n{'=' * 60}")
print(f"  OTJ Auto-Blog Agent")
print(f"{'=' * 60}")
print(f"  Date:    {blog_date}")
print(f"  Type:    {blog_type}")
print(f"  Publish: {'direct' if auto_publish else 'Discord approval'}")
print(f"{'=' * 60}\n")


# ── Step 1: Pull data from Supabase ──────────────────────────────────────────

def pull_recap_data(date: str) -> dict:
    """Pull all data needed for a recap blog post."""
    data = {}

    # Yesterday's results
    try:
        resp = supabase.table("yesterday_results") \
            .select("*") \
            .eq("date", date) \
            .eq("sport", "nba") \
            .single() \
            .execute()
        data["results"] = resp.data
    except Exception as e:
        print(f"  ⚠ No results found for {date}: {e}")
        data["results"] = None

    # Slate data (games, parlay, signals)
    try:
        resp = supabase.table("slates") \
            .select("*") \
            .eq("date", date) \
            .eq("sport", "nba") \
            .single() \
            .execute()
        data["slate"] = resp.data
    except Exception:
        data["slate"] = None

    # User bet results for community section
    try:
        resp = supabase.table("game_picks") \
            .select("picked_team, pick_type, locked_odds, locked_line, wager, result, net, matchup") \
            .eq("slate_date", date) \
            .not_("result", "is", "null") \
            .execute()
        data["user_bets"] = resp.data or []
    except Exception:
        data["user_bets"] = []

    # Today's upcoming slate (for preview section)
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        resp = supabase.table("slates") \
            .select("games_count, headline, cumulative_record") \
            .eq("date", today) \
            .eq("sport", "nba") \
            .single() \
            .execute()
        data["today_slate"] = resp.data
    except Exception:
        data["today_slate"] = None

    return data


# ── Step 2: Build the prompt ─────────────────────────────────────────────────

OTJ_VOICE_SYSTEM_PROMPT = """You are the OTJ blog writer for Overtime Journal (overtimejournal.com), an NBA analytics and sports betting platform.

VOICE RULES — follow these exactly:
- Write in first person plural ("we") or direct address ("you")
- ALL CAPS section headers (THE WINS, THE LOSSES, THE LESSON, THE TAKEAWAY, etc.)
- No fluff, no hedging — direct statements, confident tone
- Always use specific numbers — scores, odds, percentages, point margins
- Be self-critical on losses: "this one's on me" not "variance happens"
- Be analytical on wins: explain WHY the model was right, not just that it was
- Reference specific signal names: B2B_FATIGUE, FRESH_SCRATCH, STANDINGS_TIER, NET_RATING, BENCH_EDGE, PACE_MISMATCH, etc.
- End every post with 🔥
- Keep it under 600 words — nobody wants a novel
- No emojis in body text except 🔥 at the end, ✅ for wins, ❌ for losses
- Write like a sharp sports bettor who builds models, not like a journalist
- Every loss gets explained — what signal missed, what the model will fix
- Every win gets attributed to a specific signal or edge that fired
- Open with the record and streak, then dive in
- Close with the record update and forward-looking energy

STRUCTURAL FORMAT:
- Title: punchy, specific, includes a number or result
- Excerpt: 1-2 sentences that make you want to read more
- Content: 3-6 ALL CAPS sections, each 2-4 paragraphs
- Final section is always THE TAKEAWAY or equivalent

CATEGORY OPTIONS:
- "TONIGHT'S LESSON" — for recaps with strategic takeaways
- "PRODUCT UPDATE" — for new features or model changes
- "ANALYSIS" — for deep-dive strategy posts
- "RECAP" — for pure results breakdowns

EXAMPLE TITLES (match this energy):
- "One Number. Three Tickets. Here's What Separated the Wins From the Losses."
- "We Lost. Here's Exactly Why."
- "$8 → $3,307: Inside the 11-Leg Parlay That Hit Last Night"
- "7-1 Night Pushes Streak to W7 — Here's Every Signal That Fired"

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown fences:
{
    "category": "TONIGHT'S LESSON",
    "title": "Your title here",
    "excerpt": "Your excerpt here",
    "content": "Your full blog content here with \\n for newlines"
}
"""


def build_recap_prompt(data: dict, date: str) -> str:
    """Build the user prompt for a recap blog post."""
    results = data.get("results", {})
    slate = data.get("slate", {})
    user_bets = data.get("user_bets", [])
    today_slate = data.get("today_slate", {})

    if not results:
        return None

    # Parse results
    record = results.get("record", "0-0")
    wins = results.get("wins", 0)
    losses = results.get("losses", 0)
    streak = results.get("streak", "")
    cumulative = results.get("cumulative_record", "")
    weekly = results.get("weekly_record", "")
    monthly = results.get("monthly_record", "")
    game_results = results.get("results", [])

    # Build game-by-game breakdown
    games_text = ""
    for g in game_results:
        result_emoji = "✅" if g.get("result") == "W" else "❌"
        games_text += (
            f"{result_emoji} {g.get('matchup', '?')} — "
            f"Lean: {g.get('lean', '?')} ({g.get('confidence', '?')}, score {g.get('edge_score', '?')}) — "
            f"Final: {g.get('final_score', '?')} — "
            f"Winner: {g.get('actual_winner', '?')}"
        )
        if g.get("spread"):
            games_text += f" — Spread: {g['spread']}"
        if g.get("gut_check_flags"):
            games_text += f" — Flags: {', '.join(g['gut_check_flags'])}"
        games_text += "\n"

    # User bet summary
    bet_wins = sum(1 for b in user_bets if b.get("result") == "win")
    bet_losses = sum(1 for b in user_bets if b.get("result") == "loss")
    bet_net = sum(float(b.get("net", 0) or 0) for b in user_bets)

    # Signals that appeared
    all_signals = []
    games = (slate or {}).get("games", [])
    for game in games:
        for sig in game.get("edge", {}).get("signals", []):
            all_signals.append(sig.get("type", ""))

    signal_counts = {}
    for s in all_signals:
        signal_counts[s] = signal_counts.get(s, 0) + 1

    prompt = f"""Write a recap blog post for OTJ's {date} NBA slate.

RESULTS:
Record: {record} ({wins}W {losses}L)
Streak: {streak}
Cumulative: {cumulative}
This week: {weekly}
This month: {monthly}

GAME-BY-GAME:
{games_text}

SIGNALS THAT FIRED:
{json.dumps(signal_counts, indent=2)}

COMMUNITY BETS:
{bet_wins}W {bet_losses}L across {len(user_bets)} user bets (net: ${bet_net:+.0f})

TONIGHT'S PREVIEW:
{today_slate.get('games_count', '?')} games on the slate
Cumulative: {today_slate.get('cumulative_record', cumulative)}

Write the recap blog post. Focus on:
1. The headline result (record + streak)
2. The best win — what signal drove it
3. The worst loss (if any) — what went wrong, what the model learns
4. Community results if notable
5. Forward-looking energy for tonight

Remember: JSON output only. Under 600 words. End with 🔥"""

    return prompt


def build_lesson_prompt(data: dict, date: str) -> str:
    """Build a deeper lesson post focusing on one game."""
    results = data.get("results", {})
    game_results = results.get("results", [])
    if not game_results:
        return None

    # Pick the most interesting game — biggest upset or closest call
    losses = [g for g in game_results if g.get("result") == "L"]
    interesting = losses[0] if losses else game_results[0]

    prompt = f"""Write a "TONIGHT'S LESSON" blog post about this specific game from {date}:

GAME: {interesting.get('matchup', '?')}
LEAN: {interesting.get('lean', '?')} ({interesting.get('confidence', '?')})
EDGE SCORE: {interesting.get('edge_score', '?')}
FINAL: {interesting.get('final_score', '?')}
WINNER: {interesting.get('actual_winner', '?')}
RESULT: {interesting.get('result', '?')}
SPREAD: {interesting.get('spread', '?')}
GUT CHECK FLAGS: {interesting.get('gut_check_flags', [])}

FULL NIGHT RECORD: {results.get('record', '?')} | Cumulative: {results.get('cumulative_record', '?')} | Streak: {results.get('streak', '?')}

Write a deep-dive blog post on this game. Explain what the model saw, what actually happened, and what the lesson is for bettors. If it was a loss, be self-critical and explain what the model will fix. If it was a win, explain the specific edge that made it work.

Remember: JSON output only. Under 600 words. End with 🔥"""

    return prompt


# ── Step 3: Call Claude API ──────────────────────────────────────────────────

def generate_blog(prompt: str) -> dict | None:
    """Call Claude API to generate blog post."""
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
                "max_tokens": 2000,
                "system": OTJ_VOICE_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["content"][0]["text"]

        # Parse JSON — strip markdown fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1]  # remove first line
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        blog = json.loads(clean)
        return blog

    except json.JSONDecodeError as e:
        print(f"  ❌ Failed to parse Claude response as JSON: {e}")
        print(f"  Raw response:\n{text[:500]}")
        return None
    except Exception as e:
        print(f"  ❌ Claude API error: {e}")
        return None


# ── Step 4: Post to Discord for approval ─────────────────────────────────────

def post_to_discord(blog: dict, date: str) -> bool:
    """Post blog draft to Discord webhook for approval."""
    if not DISCORD_BLOG_WEBHOOK:
        print("  ⚠ No DISCORD_BLOG_WEBHOOK set — skipping Discord post")
        return False

    # Truncate content for Discord embed (2000 char limit per field)
    content_preview = blog.get("content", "")[:1500]
    if len(blog.get("content", "")) > 1500:
        content_preview += "\n\n... [truncated — full post ready to publish]"

    embed = {
        "embeds": [{
            "title": f"📝 Blog Draft — {date}",
            "description": f"**{blog.get('title', 'Untitled')}**\n\n{blog.get('excerpt', '')}",
            "color": 15548997,  # OTJ red
            "fields": [
                {
                    "name": "Category",
                    "value": blog.get("category", "RECAP"),
                    "inline": True,
                },
                {
                    "name": "Word Count",
                    "value": str(len(blog.get("content", "").split())),
                    "inline": True,
                },
                {
                    "name": "Content Preview",
                    "value": content_preview[:1024],  # Discord field limit
                    "inline": False,
                },
            ],
            "footer": {
                "text": "React ✅ to publish · ❌ to kill · Reply with edits"
            }
        }],
        "content": f"<@&BLOG_REVIEWER> New blog draft for {date}:"
    }

    try:
        resp = _requests.post(DISCORD_WEBHOOK_URL, json=embed, timeout=10)
        resp.raise_for_status()
        print(f"  ✅ Draft posted to Discord")
        return True
    except Exception as e:
        print(f"  ⚠ Discord post failed: {e}")
        return False


# ── Step 5: Publish to Supabase ──────────────────────────────────────────────

def publish_blog(blog: dict, date: str) -> bool:
    """Insert blog post into Supabase blog_posts table."""
    # Format date for display (e.g., "Mar 17")
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        display_date = dt.strftime("%b %-d")
    except Exception:
        display_date = date

    row = {
        "date": date,
        "display_date": display_date,
        "category": blog.get("category", "RECAP"),
        "title": blog.get("title", ""),
        "excerpt": blog.get("excerpt", ""),
        "content": blog.get("content", ""),
        "sport": "nba",
        "auto_generated": True,
        "published": True,
        "generated_at": datetime.now().isoformat(),
    }

    try:
        supabase.table("blog_posts").upsert(
            row, on_conflict="date,sport"
        ).execute()
        print(f"  ✅ Blog published to Supabase for {date}")
        return True
    except Exception as e:
        print(f"  ❌ Failed to publish blog: {e}")
        # Fallback: store as pending
        try:
            row["published"] = False
            supabase.table("blog_posts").upsert(
                row, on_conflict="date,sport"
            ).execute()
            print(f"  ⚠ Stored as unpublished draft")
        except Exception:
            pass
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

print(f"⏳ Pulling data for {blog_date}...")
data = pull_recap_data(blog_date)

if not data.get("results"):
    print(f"⚠ No results data for {blog_date} — nothing to blog about.")
    sys.exit(0)

# Build prompt based on blog type
print(f"⏳ Building {blog_type} prompt...")
if blog_type == "lesson":
    prompt = build_lesson_prompt(data, blog_date)
else:
    prompt = build_recap_prompt(data, blog_date)

if not prompt:
    print(f"⚠ Could not build prompt — insufficient data.")
    sys.exit(0)

# Generate via Claude
print(f"⏳ Generating blog via Claude Sonnet...")
blog = generate_blog(prompt)

if not blog:
    print(f"❌ Blog generation failed.")
    sys.exit(1)

print(f"\n  📝 Title: {blog.get('title', '?')}")
print(f"  📂 Category: {blog.get('category', '?')}")
print(f"  📊 Words: {len(blog.get('content', '').split())}")
print(f"  📄 Excerpt: {blog.get('excerpt', '?')[:100]}...")

# Store draft in Supabase regardless of approval flow
print(f"\n⏳ Storing draft...")
row = {
    "date": blog_date,
    "display_date": datetime.strptime(blog_date, "%Y-%m-%d").strftime("%b %-d") if blog_date else blog_date,
    "category": blog.get("category", "RECAP"),
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
    print(f"  ✅ Draft stored in blog_posts table")
except Exception as e:
    print(f"  ⚠ Could not store draft (table may not exist yet): {e}")
    print(f"  Run this SQL to create it:")
    print(f"""
    CREATE TABLE blog_posts (
        id bigint generated always as identity primary key,
        date date not null,
        display_date text,
        category text default 'RECAP',
        title text not null,
        excerpt text,
        content text not null,
        sport text default 'nba',
        auto_generated boolean default true,
        published boolean default false,
        generated_at timestamptz default now(),
        published_at timestamptz,
        unique(date, sport)
    );
    ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "public read" ON blog_posts FOR SELECT USING (true);
    CREATE POLICY "service write" ON blog_posts FOR ALL USING (true);
    """)

# Publish or send to Discord
if auto_publish:
    publish_blog(blog, blog_date)
else:
    post_to_discord(blog, blog_date)
    print(f"\n  📬 Draft sent to Discord — waiting for approval")
    print(f"  React ✅ to publish, ❌ to kill")

print(f"\n{'=' * 60}")
print(f"  ✅ Auto-blog complete for {blog_date}")
print(f"  Title: {blog.get('title', '?')}")
print(f"{'=' * 60}\n")
