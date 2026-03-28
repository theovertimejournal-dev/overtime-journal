"""
push_mlb_to_supabase.py
=======================
MLB equivalent of push_to_supabase.py for NBA.

What it does:
  1. Calls mlb_bullpen_analyzer_v2.py (--json) to get today's games + edges
  2. Fetches ML/Spread/Total odds from SportsGameOdds API
  3. Writes one row to `slates` table  (sport = "mlb")
  4. Writes one row per game to `games` table
  5. Generates a Claude narrative for each game (same pattern as NBA)

Supabase tables used (same schema as NBA, sport column differentiates):
  slates  — id, sport, date, games (JSONB), created_at
  games   — id, slate_id, sport, matchup, game_id,
             away_team, home_team, game_time, venue,
             lean, confidence, signals (JSONB),
             ml_home, ml_away, spread_home, spread_away, total,
             odds_vendor, odds_updated_at,
             away_bullpen (JSONB), home_bullpen (JSONB),
             away_pythagorean (JSONB), home_pythagorean (JSONB),
             park_factor (JSONB), away_tto (JSONB), home_tto (JSONB),
             narrative, status, created_at

Usage:
  python push_mlb_to_supabase.py
  python push_mlb_to_supabase.py --date=2026-04-01
  python push_mlb_to_supabase.py --date=2026-04-01 --no-narrative
"""

import sys
import os
import json
import subprocess
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY      = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SGO_API_KEY       = os.environ.get("SPORTSGAMEODDS_API_KEY", "")

NARRATIVE_MODEL   = "claude-sonnet-4-20250514"
SPORT             = "mlb"

# SportsGameOdds endpoint for MLB
SGO_BASE          = "https://api.sportsgameodds.com/v2"
SGO_HEADERS       = {"X-Api-Key": SGO_API_KEY}

# Preferred sportsbook order for odds selection (same as NBA)
VENDOR_PRIORITY   = ["draftkings", "fanduel", "caesars", "betmgm", "bet365"]

# ── Arg parsing ───────────────────────────────────────────────────────────────
game_date    = datetime.now().strftime("%Y-%m-%d")
no_narrative = False
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]
    elif arg == "--no-narrative":
        no_narrative = True

print(f"\n{'=' * 60}")
print(f"  ⚾ OTJ MLB Slate Push — {game_date}")
print(f"  {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 60}\n")

# ── Guards ────────────────────────────────────────────────────────────────────
if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Step 1: Run the MLB analyzer in JSON mode ─────────────────────────────────
print("⏳ Running MLB bullpen analyzer...")

analyzer_path = Path(__file__).parent / "mlb_bullpen_analyzer_v2.py"
try:
    result = subprocess.run(
        [sys.executable, str(analyzer_path), "--json", f"--date={game_date}"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"  ❌ Analyzer exited with code {result.returncode}")
        print(result.stderr)
        sys.exit(1)

    analyzer_output = json.loads(result.stdout)
    games_raw = analyzer_output.get("games", [])
    print(f"  ✅ Analyzer returned {len(games_raw)} game(s)")

except subprocess.TimeoutExpired:
    print("  ❌ Analyzer timed out after 120s")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"  ❌ Analyzer output is not valid JSON: {e}")
    print("  Raw output:", result.stdout[:500])
    sys.exit(1)
except Exception as e:
    print(f"  ❌ Analyzer failed: {e}")
    sys.exit(1)

if not games_raw:
    print(f"  ℹ️  No MLB games on {game_date} — nothing to push")
    sys.exit(0)


# ── Step 2: Fetch odds from SportsGameOdds ────────────────────────────────────
print("\n⏳ Fetching MLB odds from SportsGameOdds...")

import requests

sgo_odds_by_matchup = {}

# SGO oddIDs for MLB core markets:
# moneyline: points-home-game-ml-home / points-away-game-ml-away
# run line:  points-home-game-spread-home / points-away-game-spread-away
# total:     points-game-game-ou-over
MLB_ODD_IDS = ",".join([
    "points-home-game-ml-home",
    "points-away-game-ml-away",
    "points-home-game-spread-home",
    "points-away-game-spread-away",
    "points-game-game-ou-over",
])

try:
    # First pass: no date filter, just get whatever MLB events SGO has right now.
    # oddsPresent=true (not oddsAvailable) catches games where odds exist but
    # aren't yet "available for wagering" (common early morning before line opens).
    resp = requests.get(
        f"{SGO_BASE}/events",
        headers=SGO_HEADERS,
        params={
            "leagueID":            "MLB",
            "oddsPresent":         "true",   # broader than oddsAvailable
            "oddID":               MLB_ODD_IDS,
            "includeOpposingOdds": "true",
            "finalized":           "false",  # only upcoming/live, not final
            "limit":               "30",
        },
        timeout=20
    )
    resp.raise_for_status()
    full_response = resp.json()
    sgo_events_all = full_response.get("data", [])

    # SGO stores game times in UTC. ET evening games (7PM ET = midnight UTC) appear
    # under the NEXT calendar date in startsAt. So we also check previousStartsAt
    # which contains the originally scheduled ET-based time before UTC conversion.
    def event_matches_date(event):
        status = event.get("status", {})
        starts_at = status.get("startsAt", "") or ""
        prev_starts = status.get("previousStartsAt", []) or []
        all_dates = [starts_at] + prev_starts
        return any(game_date in d for d in all_dates)

    sgo_events = [e for e in sgo_events_all if event_matches_date(e)]
    print(f"  ✅ {len(sgo_events_all)} total SGO events, {len(sgo_events)} match {game_date}")
    if not sgo_events and sgo_events_all:
        dates_seen = sorted(set(
            (e.get("status", {}).get("startsAt", "") or "")[:10]
            for e in sgo_events_all
        ))
        print(f"  ℹ️  SGO has events for dates: {dates_seen}")

    for event in sgo_events:
        teams = event.get("teams", {})
        away_team = teams.get("away", {})
        home_team = teams.get("home", {})
        # SGO short names don't always match MLB Stats API abbreviations.
        # This map translates SGO → MLB Stats API so matchup strings align.
        SGO_TO_MLB = {
            "ARI": "AZ",   "KCR": "KC",  "SDP": "SD",
            "SFG": "SF",   "TBR": "TB",  "WSN": "WSH",
            "CHW": "CWS",
        }
        def norm(team):
            raw = (team.get("names", {}).get("short") or
                   team.get("names", {}).get("medium") or "").upper().strip()
            return SGO_TO_MLB.get(raw, raw)

        away = norm(away_team)
        home = norm(home_team)
        if not away or not home:
            continue
        matchup_key = f"{away} @ {home}"

        odds_dict = event.get("odds", {})

        def best_book_odds(odd_id):
            odd = odds_dict.get(odd_id, {})
            by_book = odd.get("byBookmaker", {})
            for book in VENDOR_PRIORITY:
                entry = by_book.get(book, {})
                if entry.get("available") and entry.get("odds") is not None:
                    return entry["odds"], book
            for book_id, entry in by_book.items():
                if entry.get("available") and entry.get("odds") is not None:
                    return entry["odds"], book_id
            if odd.get("bookOdds") is not None:
                return odd["bookOdds"], "consensus"
            return None, None

        ml_home_odds, vendor = best_book_odds("points-home-game-ml-home")
        ml_away_odds, _      = best_book_odds("points-away-game-ml-away")

        spread_val = odds_dict.get("points-home-game-spread-home", {}).get("spreadValue")
        total_val  = odds_dict.get("points-game-game-ou-over",     {}).get("overUnderValue")

        sgo_odds_by_matchup[matchup_key] = {
            "vendor":      vendor or "",
            "ml_home":     int(ml_home_odds)     if ml_home_odds is not None else None,
            "ml_away":     int(ml_away_odds)     if ml_away_odds is not None else None,
            "spread_home": float(spread_val)     if spread_val   is not None else None,
            "spread_away": float(spread_val)*-1  if spread_val   is not None else None,
            "total":       float(total_val)      if total_val    is not None else None,
        }

    print(f"  Matched odds for: {list(sgo_odds_by_matchup.keys())}")

except Exception as e:
    print(f"  ⚠ SGO odds fetch failed (non-fatal — odds will be null): {e}")


# ── Step 2b: Fetch weather + calculate Real Feel Index ───────────────────────
print("\n⏳ Fetching weather for each stadium...")

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"

# Stadium coordinates + home plate bearing (same source as props pipeline)
STADIUMS = {
    "LAD": {"lat": 34.0739, "lng": -118.2400, "hp_bearing": 45,  "dome": False},
    "COL": {"lat": 39.7559, "lng": -104.9942, "hp_bearing": 315, "dome": False},
    "NYY": {"lat": 40.8296, "lng": -73.9262,  "hp_bearing": 60,  "dome": False},
    "BOS": {"lat": 42.3467, "lng": -71.0972,  "hp_bearing": 95,  "dome": False},
    "CHC": {"lat": 41.9484, "lng": -87.6553,  "hp_bearing": 45,  "dome": False},
    "SF":  {"lat": 37.7786, "lng": -122.3893, "hp_bearing": 305, "dome": False},
    "SD":  {"lat": 32.7076, "lng": -117.1570, "hp_bearing": 15,  "dome": False},
    "HOU": {"lat": 29.7573, "lng": -95.3555,  "hp_bearing": 10,  "dome": True },
    "ATL": {"lat": 33.8907, "lng": -84.4677,  "hp_bearing": 25,  "dome": False},
    "NYM": {"lat": 40.7571, "lng": -73.8458,  "hp_bearing": 60,  "dome": False},
    "PHI": {"lat": 39.9061, "lng": -75.1665,  "hp_bearing": 55,  "dome": False},
    "MIL": {"lat": 43.0283, "lng": -87.9712,  "hp_bearing": 85,  "dome": True },
    "STL": {"lat": 38.6226, "lng": -90.1928,  "hp_bearing": 50,  "dome": False},
    "CIN": {"lat": 39.0975, "lng": -84.5080,  "hp_bearing": 70,  "dome": False},
    "PIT": {"lat": 40.4469, "lng": -80.0057,  "hp_bearing": 95,  "dome": False},
    "MIN": {"lat": 44.9817, "lng": -93.2781,  "hp_bearing": 60,  "dome": False},
    "CLE": {"lat": 41.4962, "lng": -81.6852,  "hp_bearing": 130, "dome": False},
    "DET": {"lat": 42.3390, "lng": -83.0485,  "hp_bearing": 45,  "dome": False},
    "CWS": {"lat": 41.8300, "lng": -87.6339,  "hp_bearing": 5,   "dome": False},
    "KC":  {"lat": 39.0517, "lng": -94.4803,  "hp_bearing": 40,  "dome": False},
    "TEX": {"lat": 32.7473, "lng": -97.0824,  "hp_bearing": 55,  "dome": True },
    "LAA": {"lat": 33.8003, "lng": -117.8827, "hp_bearing": 15,  "dome": False},
    "OAK": {"lat": 37.7516, "lng": -122.2005, "hp_bearing": 60,  "dome": False},
    "SEA": {"lat": 47.5914, "lng": -122.3325, "hp_bearing": 15,  "dome": True },
    "TB":  {"lat": 27.7683, "lng": -82.6534,  "hp_bearing": 0,   "dome": True },
    "TOR": {"lat": 43.6414, "lng": -79.3894,  "hp_bearing": 0,   "dome": True },
    "MIA": {"lat": 25.7781, "lng": -80.2197,  "hp_bearing": 0,   "dome": True },
    "AZ":  {"lat": 33.4455, "lng": -112.0667, "hp_bearing": 0,   "dome": True },
    "BAL": {"lat": 39.2838, "lng": -76.6216,  "hp_bearing": 100, "dome": False},
    "WSH": {"lat": 38.8730, "lng": -77.0074,  "hp_bearing": 55,  "dome": False},
}

# Park factor map (same as props pipeline)
PARK_FACTORS_HR = {
    "COL": 114, "CIN": 107, "TEX": 106, "BOS": 105, "CHC": 104,
    "PHI": 103, "ATL": 102, "MIL": 102, "TOR": 101, "BAL": 101,
    "MIN": 101, "LAA": 100, "NYY": 100, "WSH": 100, "CLE": 99,
    "DET": 99,  "STL": 99,  "AZ":  99,  "KC":  98,  "SF":  98,
    "CWS": 98,  "HOU": 97,  "PIT": 97,  "TB":  96,  "NYM": 96,
    "LAD": 96,  "SD":  95,  "SEA": 95,  "MIA": 94,  "OAK": 94,
}


def angle_diff(a, b):
    """Smallest angle between two compass bearings (0-180)."""
    diff = abs(a - b) % 360
    return diff if diff <= 180 else 360 - diff


def fetch_weather(team_abbr, game_time_iso):
    """Fetch wind + temp for a stadium at game time. Returns weather dict."""
    stadium = STADIUMS.get(team_abbr)
    if not stadium:
        return {"dome": False, "wind_speed_mph": 0, "wind_direction": "unknown", "temp_f": 70}

    if stadium.get("dome"):
        return {"dome": True, "wind_speed_mph": 0, "wind_direction": "dome", "temp_f": 72}

    lat, lng = stadium["lat"], stadium["lng"]
    hp_bearing = stadium["hp_bearing"]
    cf_bearing = (hp_bearing + 180) % 360

    try:
        r = requests.get(OPEN_METEO_BASE, params={
            "latitude": lat, "longitude": lng,
            "hourly": "wind_speed_10m,wind_direction_10m,temperature_2m",
            "wind_speed_unit": "mph", "temperature_unit": "fahrenheit",
            "timezone": "America/New_York", "forecast_days": 2,
        }, timeout=10)
        r.raise_for_status()
        hourly = r.json().get("hourly", {})
        times = hourly.get("time", [])
        winds = hourly.get("wind_speed_10m", [])
        dirs  = hourly.get("wind_direction_10m", [])
        temps = hourly.get("temperature_2m", [])

        # Find hour closest to game time
        target_idx = 0
        if game_time_iso and times:
            try:
                game_dt = datetime.fromisoformat(game_time_iso.replace("Z", "+00:00"))
                min_diff = float("inf")
                for i, t in enumerate(times):
                    try:
                        t_dt = datetime.fromisoformat(t)
                        diff = abs((game_dt.replace(tzinfo=None) - t_dt).total_seconds())
                        if diff < min_diff:
                            min_diff = diff
                            target_idx = i
                    except Exception:
                        pass
            except Exception:
                pass

        wind_spd = winds[target_idx] if winds else 0
        wind_dir = dirs[target_idx]  if dirs  else 0
        temp     = temps[target_idx] if temps else 70

        # Classify wind relative to outfield
        diff_to_cf = angle_diff(wind_dir, cf_bearing)
        if diff_to_cf <= 45 and wind_spd >= 5:
            wind_label = "out_to_cf"
        elif diff_to_cf >= 135 and wind_spd >= 5:
            wind_label = "in_from_cf"
        elif wind_spd < 5:
            wind_label = "calm"
        else:
            wind_label = "crosswind"

        return {
            "dome": False,
            "wind_speed_mph": round(wind_spd, 1),
            "wind_direction": wind_label,
            "wind_bearing": wind_dir,
            "temp_f": round(temp, 1),
        }
    except Exception as e:
        print(f"  ⚠ Weather fetch failed for {team_abbr}: {e}", file=sys.stderr)
        return {"dome": False, "wind_speed_mph": 0, "wind_direction": "unknown", "temp_f": 70}


def calculate_real_feel(park_factor, weather):
    """
    Real Feel Index 0-100 for HR conditions.

    Scoring breakdown:
      Park factor:  0-30 pts  (COL=30, hitter parks=20, neutral=12, pitcher=5)
      Wind:         0-30 pts  (out to CF 15mph=30, out 8mph=20, calm=12, in=-10)
      Temperature:  0-20 pts  (85°F+=20, 70-85=14, 55-70=8, <55=2)
      Dome bonus:   fixed 12  (consistent, no weather variance)

    Returns dict: { score, label, park_pts, wind_pts, temp_pts, dome }
    """
    pf = park_factor if park_factor else 100

    # ── Park factor points (0-30) ────────────────────────────────────────────
    if pf >= 110:
        park_pts = 30
    elif pf >= 105:
        park_pts = 25
    elif pf >= 102:
        park_pts = 20
    elif pf >= 99:
        park_pts = 12
    elif pf >= 96:
        park_pts = 8
    else:
        park_pts = 5

    is_dome = weather.get("dome", False)

    if is_dome:
        # Domes get fixed moderate scores — consistent but not boosted
        wind_pts = 12
        temp_pts = 12
        score = park_pts + wind_pts + temp_pts
        score = min(100, max(0, score))
        label = "ELITE" if score >= 70 else "WARM" if score >= 50 else "NEUTRAL" if score >= 35 else "COLD"
        return {
            "score": score, "label": label,
            "park_pts": park_pts, "wind_pts": wind_pts, "temp_pts": temp_pts,
            "dome": True,
        }

    # ── Wind points (0-30, can go negative for headwind) ─────────────────────
    wind_dir = weather.get("wind_direction", "unknown")
    wind_spd = weather.get("wind_speed_mph", 0)

    if wind_dir == "out_to_cf":
        if wind_spd >= 15:
            wind_pts = 30
        elif wind_spd >= 10:
            wind_pts = 24
        elif wind_spd >= 5:
            wind_pts = 18
        else:
            wind_pts = 12
    elif wind_dir == "crosswind":
        wind_pts = 10 if wind_spd >= 8 else 8
    elif wind_dir == "calm":
        wind_pts = 12
    elif wind_dir == "in_from_cf":
        # Headwind penalizes HR conditions
        if wind_spd >= 12:
            wind_pts = -5
        elif wind_spd >= 8:
            wind_pts = 0
        else:
            wind_pts = 5
    else:
        wind_pts = 8  # unknown

    # ── Temperature points (0-20) ────────────────────────────────────────────
    temp = weather.get("temp_f", 70)
    if temp >= 90:
        temp_pts = 20
    elif temp >= 80:
        temp_pts = 16
    elif temp >= 70:
        temp_pts = 14
    elif temp >= 60:
        temp_pts = 10
    elif temp >= 50:
        temp_pts = 6
    else:
        temp_pts = 2

    score = park_pts + wind_pts + temp_pts
    score = min(100, max(0, score))

    if score >= 70:
        label = "ELITE"
    elif score >= 50:
        label = "WARM"
    elif score >= 35:
        label = "NEUTRAL"
    else:
        label = "COLD"

    return {
        "score": score, "label": label,
        "park_pts": park_pts, "wind_pts": wind_pts, "temp_pts": temp_pts,
        "dome": False,
    }


# Fetch weather for each unique home team and compute Real Feel
weather_cache = {}
real_feel_cache = {}

home_teams_seen = set()
for gd in games_raw:
    g = gd.get("game", {})
    ht = g.get("home_team", "")
    if ht and ht not in home_teams_seen:
        home_teams_seen.add(ht)
        game_time = g.get("game_time", "")
        w = fetch_weather(ht, game_time)
        weather_cache[ht] = w
        pf_val = gd.get("park_factor", {}).get("factor") or PARK_FACTORS_HR.get(ht, 100)
        rf = calculate_real_feel(pf_val, w)
        real_feel_cache[ht] = rf
        dome_str = "🏟 DOME" if w["dome"] else f"🌬️ {w['wind_direction']} {w['wind_speed_mph']}mph {w['temp_f']}°F"
        print(f"  {ht}: {dome_str} → Real Feel {rf['score']}/100 ({rf['label']})")

print(f"  ✅ Weather + Real Feel computed for {len(real_feel_cache)} stadiums")


# ── Step 3: Generate Claude narratives ───────────────────────────────────────
def generate_narrative(game_data: dict) -> str:
    """Call Claude to generate a 2-3 sentence game narrative."""
    if no_narrative or not ANTHROPIC_API_KEY:
        return ""
    try:
        import anthropic
        edge   = game_data.get("edge", {})
        abp    = game_data.get("away_bullpen", {})
        hbp    = game_data.get("home_bullpen", {})
        apyth  = game_data.get("away_pythagorean", {})
        hpyth  = game_data.get("home_pythagorean", {})
        park   = game_data.get("park_factor", {})
        game   = game_data.get("game", {})

        # Use prior year ERA when current sample is too small (< 15 IP)
        away_ip = abp.get('bullpen_ip_7d', 0) or 0
        home_ip = hbp.get('bullpen_ip_7d', 0) or 0
        away_era_display = abp.get('bullpen_era', 'N/A') if away_ip >= 15 else f"{abp.get('prior_era', 'N/A')} (2025)"
        home_era_display = hbp.get('bullpen_era', 'N/A') if home_ip >= 15 else f"{hbp.get('prior_era', 'N/A')} (2025)"
        sample_note = ""
        if away_ip < 15 or home_ip < 15:
            sample_note = "\nNOTE: Early season — bullpen ERA shown is from 2025 season. Do NOT cite tiny current-season numbers."

        prompt = f"""You are OTJ's MLB analyst. Write a punchy 2-3 sentence game preview for bettors.

Game: {game.get('away_team')} @ {game.get('home_team')}
Venue: {game.get('venue')} (Park factor: {park.get('factor', 100)} — {park.get('label', 'NEUTRAL')})
Starters: {game.get('away_starter', {}).get('name', 'TBD')} vs {game.get('home_starter', {}).get('name', 'TBD')}

Edge lean: {edge.get('lean', 'None')} ({edge.get('confidence', 'LOW')})
Key signals: {', '.join(s['type'] + ': ' + s['detail'] for s in edge.get('signals', [])[:3])}

Away bullpen ERA: {away_era_display} | Fatigue score: {abp.get('fatigue_score', 'N/A')}
Home bullpen ERA: {home_era_display} | Fatigue score: {hbp.get('fatigue_score', 'N/A')}
Away Pythagorean luck: {apyth.get('luck_factor', 0):+.1f}W | Home luck: {hpyth.get('luck_factor', 0):+.1f}W
{sample_note}
Keep it sharp, specific, and under 60 words. Reference the actual teams and numbers."""

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=NARRATIVE_MODEL,
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"  ⚠ Narrative failed: {e}", file=sys.stderr)
        return ""


# ── Step 3b: Pre-flight column check ─────────────────────────────────────────
# Attempts a dry-run select to confirm required columns exist before processing
# all 11 games. Fails fast with a clear SQL migration message if any are missing.
print("⏳ Pre-flight column check...")
REQUIRED_COLUMNS = ["sport", "game_id", "venue", "status", "scores", "analysis", "narrative"]
try:
    # SELECT with all required columns — will 400 immediately if any are missing
    supabase.table("games").select(", ".join(REQUIRED_COLUMNS)).limit(1).execute()
    print(f"  ✅ All required columns present")
except Exception as e:
    msg = str(e)
    missing = [c for c in REQUIRED_COLUMNS if f"'{c}'" in msg or f'"{c}"' in msg]
    print(f"\n❌ MISSING COLUMNS in games table: {missing or 'see error below'}")
    print(f"   Error: {msg}")
    print(f"\n   Run mlb_games_migration.sql in your Supabase SQL editor first:")
    print("   https://supabase.com/dashboard/project/_/sql\n")
    sys.exit(1)


# ── Step 4: Build the slate payload ──────────────────────────────────────────
print("\n⏳ Building slate...")
now_iso = datetime.now().isoformat()

# Lightweight game list stored in slates.games JSONB (same shape as NBA)
slate_games_list = []
for gd in games_raw:
    g = gd.get("game", {})
    edge = gd.get("edge", {})
    matchup = f"{g.get('away_team', '')} @ {g.get('home_team', '')}"
    slate_games_list.append({
        "matchup":    matchup,
        "game_id":    str(g.get("game_pk", "")),
        "away_team":  g.get("away_team", ""),
        "home_team":  g.get("home_team", ""),
        "game_time":  g.get("game_time", "TBD"),
        "status":     g.get("status", ""),
        "lean":       edge.get("lean"),
        "confidence": edge.get("confidence", "LOW"),
    })

# ── Step 5: Upsert slate row ──────────────────────────────────────────────────
print("⏳ Upserting slate row...")
try:
    slate_resp = supabase.table("slates").upsert({
        "sport":      SPORT,
        "date":       game_date,
        "games":      slate_games_list,
        "created_at": now_iso,
    }, on_conflict="sport,date").execute()

    # Re-fetch to get the ID (upsert may not return it depending on Supabase version)
    slate_fetch = supabase.table("slates") \
        .select("id") \
        .eq("sport", SPORT) \
        .eq("date", game_date) \
        .single() \
        .execute()
    slate_id = slate_fetch.data["id"]
    print(f"  ✅ Slate upserted — id: {slate_id}")
except Exception as e:
    print(f"  ❌ Slate upsert failed: {e}")
    sys.exit(1)


# ── Step 6: Upsert each game row ──────────────────────────────────────────────
print("\n⏳ Upserting game rows...")
pushed = 0
failed = 0

# Pre-fetch all existing game rows for today so we know which ones are first-write
# vs subsequent runs. This lets us freeze narrative/analysis after first write
# and only refresh odds on subsequent runs.
existing_games: dict = {}
try:
    existing_resp = supabase.table("games")         .select("matchup, narrative, analysis")         .eq("slate_id", slate_id)         .execute()
    existing_games = {r["matchup"]: r for r in existing_resp.data}
    print(f"  ℹ️  {len(existing_games)} games already in DB for this slate")
except Exception as e:
    print(f"  ⚠ Could not pre-fetch existing games: {e}")

for gd in games_raw:
    g     = gd.get("game", {})
    edge  = gd.get("edge", {})
    abp   = gd.get("away_bullpen", {})
    hbp   = gd.get("home_bullpen", {})
    apyth = gd.get("away_pythagorean", {})
    hpyth = gd.get("home_pythagorean", {})
    park  = gd.get("park_factor", {})
    atto  = gd.get("away_tto", {})
    htto  = gd.get("home_tto", {})
    alr   = gd.get("away_lr_matchup", {})
    hlr   = gd.get("home_lr_matchup", {})

    away    = g.get("away_team", "")
    home    = g.get("home_team", "")
    matchup = f"{away} @ {home}"
    odds    = sgo_odds_by_matchup.get(matchup, {})

    existing = existing_games.get(matchup)
    is_first_write = existing is None

    # Narrative: generate once on first write, freeze after that.
    # Prevents regenerating on every odds refresh run (saves tokens + preserves
    # the pre-game context which is most valuable before first pitch).
    if is_first_write:
        print(f"  ✍ Generating narrative for {matchup}...")
        narrative = generate_narrative(gd)
    else:
        narrative = existing.get("narrative") or ""
        print(f"  ♻ Reusing narrative for {matchup} (odds refresh only)")

    # Analysis blob: same logic — freeze after first write.
    # Bullpen fatigue, pythagorean, TTO are pre-game reads; no value in
    # overwriting them mid-game with stale same-day data.
    if is_first_write:
        analysis = {
            "away_bullpen":     abp,
            "home_bullpen":     hbp,
            "away_pythagorean": apyth,
            "home_pythagorean": hpyth,
            "park_factor":      park,
            "away_tto":         atto,
            "home_tto":         htto,
            "away_lr_matchup":  alr,
            "home_lr_matchup":  hlr,
            "weather":          weather_cache.get(home, {}),
            "real_feel":        real_feel_cache.get(home, {}),
            "away_starter":     g.get("away_starter", {}),
            "home_starter":     g.get("home_starter", {}),
        }
    else:
        analysis = existing.get("analysis") or {}

    try:
        supabase.table("games").upsert({
            # ── Static fields (set on first write, unchanged after) ──────────
            "slate_id":         slate_id,
            "sport":            SPORT,
            "matchup":          matchup,
            "game_id":          str(g.get("game_pk", "")),
            "away_team":        away,
            "home_team":        home,
            "game_time":        g.get("game_time", "TBD"),
            "venue":            g.get("venue", ""),
            "lean":             edge.get("lean"),
            "confidence":       edge.get("confidence", "LOW"),
            "signals":          edge.get("signals", []),
            "scores":           edge.get("scores", {}),
            "analysis":         analysis,
            "narrative":        narrative,
            "created_at":       now_iso if is_first_write else existing.get("created_at", now_iso),
            # ── Live fields (refreshed every run) ────────────────────────────
            "status":           g.get("status", ""),
            "ml_home":          int(odds["ml_home"])        if odds.get("ml_home")     is not None else None,
            "ml_away":          int(odds["ml_away"])        if odds.get("ml_away")     is not None else None,
            "spread_home":      float(odds["spread_home"])  if odds.get("spread_home") is not None else None,
            "spread_away":      float(odds["spread_away"])  if odds.get("spread_away") is not None else None,
            "total":            float(odds["total"])        if odds.get("total")       is not None else None,
            "odds_vendor":      odds.get("vendor"),
            "odds_updated_at":  now_iso if odds else None,
        }, on_conflict="slate_id,matchup").execute()

        lean_str = f"{edge.get('lean')} ({edge.get('confidence')})" if edge.get("lean") else "No lean"
        odds_str = f"ML {odds.get('ml_home')}/{odds.get('ml_away')}" if odds else "No odds"
        tag = "🆕" if is_first_write else "🔄"
        print(f"  ✅ {tag} {matchup} — {lean_str} | {odds_str}")
        pushed += 1

    except Exception as e:
        print(f"  ❌ Game upsert failed ({matchup}): {e}")
        failed += 1

# ── Done ──────────────────────────────────────────────────────────────────────
print(f"\n  Games pushed: {pushed}  |  Failed: {failed}")
print(f"\n{'=' * 60}")
print(f"  ✅ MLB slate push complete — {datetime.now().strftime('%I:%M %p ET')}")
print(f"{'=' * 60}\n")
