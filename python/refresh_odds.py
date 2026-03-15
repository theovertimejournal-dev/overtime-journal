"""
refresh_odds.py
===============
Lightweight odds + injury refresh. Runs every 10 minutes during game hours.
NO Claude API calls — zero narrative generation cost.

What it does:
  1. Pulls fresh odds from BDL for today's games
  2. Pulls fresh injuries from Tank01
  3. Logs a snapshot to odds_history table
  4. Updates live odds on the games table (ml_home, ml_away, spread, total)

What it does NOT do:
  - Generate narratives (Claude API)
  - Rebuild edge scores
  - Touch the slates table

Usage:
  python refresh_odds.py
  python refresh_odds.py --date=2026-03-15
"""

import sys
import os
import requests
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BDL_KEY      = os.environ.get("BALLDONTLIE_API_KEY", "")
TANK01_KEY   = os.environ.get("TANK01_API_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BDL_HEADERS   = {"Authorization": BDL_KEY}
TANK01_HEADERS = {
    "x-rapidapi-key": TANK01_KEY,
    "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com"
}

# ── Args ──────────────────────────────────────────────────────────────────────
game_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]

print(f"\n{'=' * 50}")
print(f"  OTJ Lightweight Refresh — {game_date}")
print(f"  {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 50}\n")

# ── Status guard ──────────────────────────────────────────────────────────────
FINAL_STATUSES = {"final", "completed", "complete", "f", "ft", "game over", "official", "post"}

def game_is_over(status: str) -> bool:
    return bool(status) and status.strip().lower() in FINAL_STATUSES

# ── Step 1: Get today's games from Supabase (already pushed this morning) ─────
print("⏳ Fetching today's slate from Supabase...")
try:
    slate_resp = supabase.table("slates") \
        .select("id, games") \
        .eq("sport", "nba") \
        .eq("date", game_date) \
        .single() \
        .execute()
    slate_id = slate_resp.data["id"]
    games = slate_resp.data.get("games") or []
    print(f"  ✅ Found slate — {len(games)} games  (slate_id: {slate_id})")
except Exception as e:
    print(f"  ❌ No slate found for {game_date}: {e}")
    sys.exit(0)  # Not an error — might be an off day

if not games:
    print("  ℹ️  No games on slate — nothing to refresh")
    sys.exit(0)

# ── Step 2: Pull fresh odds from BDL ─────────────────────────────────────────
print("\n⏳ Pulling fresh odds from BDL...")
try:
    resp = requests.get(
        "https://api.balldontlie.io/v2/odds",
        params={"dates[]": game_date, "per_page": 100},
        headers=BDL_HEADERS,
        timeout=20
    )
    resp.raise_for_status()
    odds_data = resp.json().get("data", [])
    print(f"  ✅ {len(odds_data)} odds rows returned")
except Exception as e:
    print(f"  ⚠ BDL odds fetch failed: {e}")
    odds_data = []

# Build odds map by matchup string — match away @ home abbreviations
# BDL odds rows have home_team and away_team objects with abbreviations
odds_by_matchup = {}
for row in odds_data:
    vendor = row.get("vendor", "")
    try:
        away_abbr = row.get("game", {}).get("visitor_team", {}).get("abbreviation", "")
        home_abbr = row.get("game", {}).get("home_team", {}).get("abbreviation", "")
        if not away_abbr or not home_abbr:
            continue
        matchup_key = f"{away_abbr} @ {home_abbr}"
    except Exception:
        continue

    current_vendor = odds_by_matchup.get(matchup_key, {}).get("vendor", "")
    current_priority = VENDOR_PRIORITY.index(current_vendor) if current_vendor in VENDOR_PRIORITY else 99
    new_priority = VENDOR_PRIORITY.index(vendor) if vendor in VENDOR_PRIORITY else 99
    if new_priority < current_priority:
        odds_by_matchup[matchup_key] = {
            "vendor":           vendor,
            "spread_home":      row.get("spread_home_value"),
            "spread_away":      row.get("spread_away_value"),
            "spread_home_odds": row.get("spread_home_odds"),
            "spread_away_odds": row.get("spread_away_odds"),
            "total":            row.get("total_value"),
            "ml_home":          row.get("moneyline_home_odds"),
            "ml_away":          row.get("moneyline_away_odds"),
        }

print(f"  Matched odds for: {list(odds_by_matchup.keys())}")

# ── Step 3: Pull fresh injuries from Tank01 ───────────────────────────────────
print("\n⏳ Pulling fresh injuries from Tank01...")
tank01_injuries = {}
try:
    resp = requests.get(
        "https://tank01-fantasy-stats.p.rapidapi.com/getNBAInjuryList",
        headers=TANK01_HEADERS,
        timeout=20
    )
    resp.raise_for_status()
    injury_list = resp.json().get("body", [])
    for player in injury_list:
        team = (player.get("team") or player.get("teamAbv") or "").upper()
        status = (player.get("injStatus") or player.get("status") or "").lower()
        if status in ("out", "doubtful"):
            if team not in tank01_injuries:
                tank01_injuries[team] = []
            tank01_injuries[team].append(
                f"{player.get('firstName','')} {player.get('lastName','')}".strip()
            )
    injured_count = sum(len(v) for v in tank01_injuries.values())
    print(f"  ✅ {injured_count} players out/doubtful")
except Exception as e:
    print(f"  ⚠ Tank01 injury fetch failed (non-fatal): {e}")

# ── Step 4: Update games table + log odds_history ────────────────────────────
print("\n⏳ Updating games + logging odds history...")
logged = 0
skipped = 0
now_iso = datetime.now().isoformat()

for game in games:
    matchup = game.get("matchup", "")
    game_id  = game.get("game_id") or game.get("id")
    status   = game.get("status", "")

    # Skip completed games — no odds to log
    if game_is_over(status):
        skipped += 1
        print(f"  ⏭ {matchup} — game over")
        continue

    odds = odds_by_matchup.get(matchup, {})
    ml_home     = odds.get("ml_home")
    ml_away     = odds.get("ml_away")
    spread_home = odds.get("spread_home")
    spread_away = odds.get("spread_away")
    total       = odds.get("total")
    vendor      = odds.get("vendor")

    if ml_home is None and spread_home is None:
        skipped += 1
        print(f"  ⏭ {matchup} — no odds yet")
        continue

    # ── Update live odds on games table ──────────────────────────────────────
    try:
        supabase.table("games").update({
            "ml_home":          int(ml_home)       if ml_home     is not None else None,
            "ml_away":          int(ml_away)        if ml_away     is not None else None,
            "spread_home":      float(spread_home)  if spread_home is not None else None,
            "spread_away":      float(spread_away)  if spread_away is not None else None,
            "total":            float(total)        if total       is not None else None,
            "odds_vendor":      vendor,
            "odds_updated_at":  now_iso,
        }).eq("slate_id", slate_id).eq("matchup", matchup).execute()
    except Exception as e:
        print(f"  ⚠ games update failed ({matchup}): {e}")

    # ── Log snapshot to odds_history ──────────────────────────────────────────
    is_open = False
    try:
        existing = supabase.table("odds_history") \
            .select("id") \
            .eq("game_id", matchup) \
            .eq("date", game_date) \
            .limit(1) \
            .execute()
        is_open = len(existing.data) == 0
    except Exception as e:
        print(f"  ⚠ is_open check failed ({matchup}): {e}")

    try:
        supabase.table("odds_history").insert({
            "game_id":     matchup,
            "slate_id":    slate_id,
            "date":        game_date,
            "is_open":     is_open,
            "ml_home":     int(ml_home)       if ml_home     is not None else None,
            "ml_away":     int(ml_away)        if ml_away     is not None else None,
            "spread_home": float(spread_home)  if spread_home is not None else None,
            "spread_away": float(spread_away)  if spread_away is not None else None,
            "total":       float(total)        if total       is not None else None,
            "odds_vendor": vendor,
            "game_status": status,
        }).execute()
        flag = " 🔓 OPENING" if is_open else ""
        print(f"  ✅ {matchup}{flag}  ML: {ml_home}/{ml_away}  Spread: {spread_home}")
        logged += 1
    except Exception as e:
        print(f"  ⚠ odds_history insert failed ({matchup}): {e}")

print(f"\n  Odds history: {logged} logged, {skipped} skipped")
print(f"\n{'=' * 50}")
print(f"  ✅ Refresh complete — {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 50}\n")
