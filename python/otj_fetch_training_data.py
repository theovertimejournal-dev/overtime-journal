"""
otj_fetch_training_data.py
===========================
Pulls game data from Supabase games table and builds training_data.csv
for model retraining. Extracts team stats from away_data/home_data JSONB.

Usage:
    python otj_fetch_training_data.py
    python otj_fetch_training_data.py --output training_data.csv
"""

import os
import sys
import json
import pandas as pd
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

output_path = "training_data.csv"
for arg in sys.argv[1:]:
    if arg.startswith("--output="):
        output_path = arg.split("=")[1]

print(f"{'=' * 60}")
print(f"  OTJ Training Data Fetch")
print(f"{'=' * 60}")

# ── Fetch all graded games from Supabase ─────────────────────────────────────
print(f"\n⏳ Fetching games from Supabase...")

all_games = []
page = 0
page_size = 1000

while True:
    resp = supabase.table("games") \
        .select("*") \
        .eq("sport", "nba") \
        .not_.is_("away_data", "null") \
        .not_.is_("home_data", "null") \
        .order("date", desc=False) \
        .range(page * page_size, (page + 1) * page_size - 1) \
        .execute()

    batch = resp.data or []
    all_games.extend(batch)
    print(f"  Fetched {len(all_games)} games...")

    if len(batch) < page_size:
        break
    page += 1

print(f"✅ Total games fetched: {len(all_games)}")

# ── Also fetch yesterday_results from slates to get actual scores ─────────────
print(f"\n⏳ Fetching slate results...")
slates_resp = supabase.table("slates") \
    .select("date, yesterday_results, cumulative_record") \
    .eq("sport", "nba") \
    .not_.is_("yesterday_results", "null") \
    .execute()

# Build result lookup: matchup -> {result, score}
result_lookup = {}
for slate in (slates_resp.data or []):
    for r in (slate.get("yesterday_results") or []):
        key = r.get("game", "")
        result_lookup[key] = r

print(f"✅ Result lookup: {len(result_lookup)} graded games")


# ── Extract features from each game ──────────────────────────────────────────
print(f"\n⏳ Building feature rows...")

def safe_float(val, default=0.0):
    try:
        return float(val or default)
    except:
        return default

def safe_int(val, default=0):
    try:
        return int(val or default)
    except:
        return default

rows = []
skipped = 0

for game in all_games:
    try:
        away = game.get("away_data", {}) or {}
        home = game.get("home_data", {}) or {}
        edge = game.get("edge_data", {}) or {}

        # Skip if missing core data
        if not away or not home:
            skipped += 1
            continue

        matchup = game.get("matchup", "")
        date    = game.get("date", "")

        # ── Team features ─────────────────────────────────────────────────
        def extract_team(t):
            # Parse record
            record = t.get("record", "0-0")
            try:
                w, l = map(int, record.split("-"))
            except:
                w, l = 0, 0
            gp = w + l

            # Close game record
            cw = safe_int(t.get("close_wins", 0))
            cl = safe_int(t.get("close_losses", 0))
            close_pct = cw / (cw + cl) if (cw + cl) > 0 else 0.5

            # Last 5 from string e.g. "W-L-W-W-L"
            last5_str = t.get("last5", "") or ""
            l5_wins = last5_str.count("W")
            l5_pct  = l5_wins / 5 if last5_str else 0.5

            # Streak
            streak_str = t.get("streak", "") or ""
            streak_val = 0
            if streak_str:
                try:
                    num = int(''.join(filter(str.isdigit, streak_str)))
                    streak_val = num if "W" in streak_str else -num
                except:
                    pass

            net  = safe_float(t.get("net_rating", 0))
            off  = safe_float(t.get("off_rating", 110))
            deff = safe_float(t.get("def_rating", 110))
            pace = safe_float(t.get("pace", 100))
            wpct = safe_float(t.get("win_pct", 0.5))

            return {
                "wins": w, "losses": l, "win_pct": wpct,
                "games_played": gp,
                "net_rating": net,
                "off_rating": off,
                "def_rating": deff,
                "pace": pace,
                "close_win_pct": close_pct,
                "close_wins": cw,
                "close_losses": cl,
                "l5_wins": l5_wins,
                "l5_pct": l5_pct,
                "streak": streak_val,
                "b2b": 1 if t.get("b2b") else 0,
                "rest_days": safe_int(t.get("rest_days", 1)),
                "three_pct": safe_float(t.get("three_pct", 35)),
                "bench_net": safe_float(t.get("bench_net", 0)),
                "fb_pts": safe_float(t.get("fb_pts", 0)),
                "fb_pts_allowed": safe_float(t.get("fb_pts_allowed", 0)),
            }

        h = extract_team(home)
        a = extract_team(away)

        # ── Differential features ─────────────────────────────────────────
        diff_win_pct    = h["win_pct"]    - a["win_pct"]
        diff_net        = h["net_rating"] - a["net_rating"]
        diff_close      = h["close_win_pct"] - a["close_win_pct"]
        diff_streak     = h["streak"]     - a["streak"]
        diff_rest       = h["rest_days"]  - a["rest_days"]
        diff_pace       = h["pace"]       - a["pace"]
        diff_fb_off     = h["fb_pts"]     - a["fb_pts"]
        diff_fb_def     = h["fb_pts_allowed"] - a["fb_pts_allowed"]

        # ── Target: did home team win? ────────────────────────────────────
        # Try to get from edge data first (lean direction)
        # Real W/L comes from yesterday_results in slates
        home_won = None
        result = result_lookup.get(matchup)
        if result:
            r = result.get("result", "")
            lean = result.get("lean", "")
            home_team = home.get("team", "")
            away_team = away.get("team", "")
            if r == "W" and lean == home_team:
                home_won = 1
            elif r == "L" and lean == home_team:
                home_won = 0
            elif r == "W" and lean == away_team:
                home_won = 0
            elif r == "L" and lean == away_team:
                home_won = 1

        # Skip ungraded games
        if home_won is None:
            skipped += 1
            continue

        # ── Edge model score ──────────────────────────────────────────────
        edge_score = safe_float(edge.get("score", 0))
        confidence = edge.get("confidence", "INFO")

        row = {
            "matchup": matchup,
            "date": date,
            "home_team": home.get("team", ""),
            "away_team": away.get("team", ""),
            "home_won": home_won,

            # Home features
            "h_wins": h["wins"], "h_losses": h["losses"],
            "h_win_pct": h["win_pct"], "h_games_played": h["games_played"],
            "h_net_rating": h["net_rating"],
            "h_off_rating": h["off_rating"], "h_def_rating": h["def_rating"],
            "h_pace": h["pace"],
            "h_close_win_pct": h["close_win_pct"],
            "h_close_wins": h["close_wins"], "h_close_losses": h["close_losses"],
            "h_l5_wins": h["l5_wins"], "h_l5_pct": h["l5_pct"],
            "h_streak": h["streak"],
            "h_b2b": h["b2b"], "h_rest_days": h["rest_days"],
            "h_three_pct": h["three_pct"], "h_bench_net": h["bench_net"],
            "h_fb_pts": h["fb_pts"], "h_fb_pts_allowed": h["fb_pts_allowed"],

            # Away features
            "a_wins": a["wins"], "a_losses": a["losses"],
            "a_win_pct": a["win_pct"], "a_games_played": a["games_played"],
            "a_net_rating": a["net_rating"],
            "a_off_rating": a["off_rating"], "a_def_rating": a["def_rating"],
            "a_pace": a["pace"],
            "a_close_win_pct": a["close_win_pct"],
            "a_close_wins": a["close_wins"], "a_close_losses": a["close_losses"],
            "a_l5_wins": a["l5_wins"], "a_l5_pct": a["l5_pct"],
            "a_streak": a["streak"],
            "a_b2b": a["b2b"], "a_rest_days": a["rest_days"],
            "a_three_pct": a["three_pct"], "a_bench_net": a["bench_net"],
            "a_fb_pts": a["fb_pts"], "a_fb_pts_allowed": a["fb_pts_allowed"],

            # Differentials
            "diff_win_pct": diff_win_pct,
            "diff_net_rating": diff_net,
            "diff_close_win_pct": diff_close,
            "diff_streak": diff_streak,
            "diff_rest_days": diff_rest,
            "diff_pace": diff_pace,
            "diff_fb_off": diff_fb_off,
            "diff_fb_def": diff_fb_def,

            # Model features
            "edge_score": edge_score,
            "confidence_sharp": 1 if confidence == "SHARP" else 0,
            "confidence_lean": 1 if confidence == "LEAN" else 0,
        }

        rows.append(row)

    except Exception as e:
        skipped += 1
        continue

print(f"✅ Built {len(rows)} training rows ({skipped} skipped)")

if len(rows) < 100:
    print(f"⚠ Only {len(rows)} rows — not enough to retrain reliably")
    sys.exit(1)

df = pd.DataFrame(rows)
df = df.sort_values("date").reset_index(drop=True)

print(f"\n  Date range: {df['date'].min()} → {df['date'].max()}")
print(f"  Home win rate: {df['home_won'].mean():.1%}")
print(f"  SHARP games: {df['confidence_sharp'].sum()}")
print(f"  LEAN games: {df['confidence_lean'].sum()}")

df.to_csv(output_path, index=False)
print(f"\n✅ Saved to {output_path} ({len(df)} rows, {len(df.columns)} columns)")
print(f"\n  Run: python otj_retrain_v2.py to retrain models")
