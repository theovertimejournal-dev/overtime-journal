"""
push_mlb_props_to_supabase.py
=============================
MLB HR prop scorer — runs at 2PM ET daily after lineups are confirmed.

Signals scored (v1):
  - Park factor           (20pts)
  - Batter season HR rate (20pts)
  - Batter L15 HR pace    (15pts)
  - Pitcher HR/9 allowed  (20pts)
  - L/R batter vs pitcher (15pts)
  - Weather (wind + temp) (10pts)

v2 (coming): pitch-type matchup via pybaseball Statcast

Usage:
  python push_mlb_props_to_supabase.py
  python push_mlb_props_to_supabase.py --date=2026-04-01
  python push_mlb_props_to_supabase.py --date=2026-04-01 --no-narrative
  python push_mlb_props_to_supabase.py --dry-run   # score + print, no DB write
"""

import sys
import os
import json
import requests
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY      = os.environ.get("SUPABASE_SERVICE_KEY", "")
SGO_API_KEY       = os.environ.get("SPORTSGAMEODDS_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

MLB_STATS_API     = "https://statsapi.mlb.com/api/v1"
SGO_BASE          = "https://api.sportsgameodds.com/v2"
SGO_HEADERS       = {"X-Api-Key": SGO_API_KEY}
OPEN_METEO_BASE   = "https://api.open-meteo.com/v1/forecast"

MIN_GAMES_PLAYED  = 1     # Opening Week: set to 1. Raise to 10 after April 10.
MIN_SCORE_SHOW    = 45    # Don't push props below this score
NARRATIVE_MODEL   = "claude-sonnet-4-20250514"

# ── Park Factors ──────────────────────────────────────────────────────────────
PARK_FACTORS = {
    "COL": 114, "CIN": 107, "TEX": 106, "BOS": 105, "CHC": 104,
    "PHI": 103, "ATL": 102, "MIL": 102, "TOR": 101, "BAL": 101,
    "MIN": 101, "LAA": 100, "NYY": 100, "WSH": 100, "CLE": 99,
    "DET": 99,  "STL": 99,  "AZ":  99,  "KC":  98,  "SF":  98,
    "CWS": 98,  "HOU": 97,  "PIT": 97,  "TB":  96,  "NYM": 96,
    "LAD": 96,  "SD":  95,  "SEA": 95,  "MIA": 94,  "OAK": 94,
}

# ── Stadium Coordinates + Home Plate Bearing ──────────────────────────────────
# hp_bearing = compass direction home plate faces (where catcher throws to pitcher)
# Wind blowing FROM bearing+180 ± 45° = blowing OUT to CF = HR boost
# Dome/retractable teams get no weather adjustment
STADIUMS = {
    "LAD": {"lat": 34.0739, "lng": -118.2400, "hp_bearing": 45,  "dome": False},
    "COL": {"lat": 39.7559, "lng": -104.9942, "hp_bearing": 315, "dome": False},
    "NYY": {"lat": 40.8296, "lng": -73.9262,  "hp_bearing": 60,  "dome": False},
    "BOS": {"lat": 42.3467, "lng": -71.0972,  "hp_bearing": 95,  "dome": False},
    "CHC": {"lat": 41.9484, "lng": -87.6553,  "hp_bearing": 45,  "dome": False},
    "SF":  {"lat": 37.7786, "lng": -122.3893, "hp_bearing": 305, "dome": False},
    "SD":  {"lat": 32.7076, "lng": -117.1570, "hp_bearing": 15,  "dome": False},
    "HOU": {"lat": 29.7573, "lng": -95.3555,  "hp_bearing": 10,  "dome": True },  # retractable - default closed
    "ATL": {"lat": 33.8907, "lng": -84.4677,  "hp_bearing": 25,  "dome": False},
    "NYM": {"lat": 40.7571, "lng": -73.8458,  "hp_bearing": 60,  "dome": False},
    "PHI": {"lat": 39.9061, "lng": -75.1665,  "hp_bearing": 55,  "dome": False},
    "MIL": {"lat": 43.0283, "lng": -87.9712,  "hp_bearing": 85,  "dome": True },  # retractable
    "STL": {"lat": 38.6226, "lng": -90.1928,  "hp_bearing": 50,  "dome": False},
    "CIN": {"lat": 39.0975, "lng": -84.5080,  "hp_bearing": 70,  "dome": False},
    "PIT": {"lat": 40.4469, "lng": -80.0057,  "hp_bearing": 95,  "dome": False},
    "MIN": {"lat": 44.9817, "lng": -93.2781,  "hp_bearing": 60,  "dome": False},
    "CLE": {"lat": 41.4962, "lng": -81.6852,  "hp_bearing": 130, "dome": False},
    "DET": {"lat": 42.3390, "lng": -83.0485,  "hp_bearing": 45,  "dome": False},
    "CWS": {"lat": 41.8300, "lng": -87.6339,  "hp_bearing": 5,   "dome": False},
    "KC":  {"lat": 39.0517, "lng": -94.4803,  "hp_bearing": 40,  "dome": False},
    "TEX": {"lat": 32.7473, "lng": -97.0824,  "hp_bearing": 55,  "dome": True },  # retractable
    "LAA": {"lat": 33.8003, "lng": -117.8827, "hp_bearing": 15,  "dome": False},
    "OAK": {"lat": 37.7516, "lng": -122.2005, "hp_bearing": 60,  "dome": False},
    "SEA": {"lat": 47.5914, "lng": -122.3325, "hp_bearing": 15,  "dome": True },  # retractable
    "TB":  {"lat": 27.7683, "lng": -82.6534,  "hp_bearing": 0,   "dome": True },  # fixed dome
    "TOR": {"lat": 43.6414, "lng": -79.3894,  "hp_bearing": 0,   "dome": True },  # retractable
    "MIA": {"lat": 25.7781, "lng": -80.2197,  "hp_bearing": 0,   "dome": True },  # fixed dome
    "AZ":  {"lat": 33.4455, "lng": -112.0667, "hp_bearing": 0,   "dome": True },  # retractable
    "BAL": {"lat": 39.2838, "lng": -76.6216,  "hp_bearing": 100, "dome": False},
    "WSH": {"lat": 38.8730, "lng": -77.0074,  "hp_bearing": 55,  "dome": False},
}

# ── Arg parsing ───────────────────────────────────────────────────────────────
game_date    = datetime.now().strftime("%Y-%m-%d")
no_narrative = False
dry_run      = False
for arg in sys.argv[1:]:
    if arg.startswith("--date="):     game_date    = arg.split("=")[1]
    elif arg == "--no-narrative":     no_narrative = True
    elif arg == "--dry-run":          dry_run      = True

print(f"\n{'=' * 60}")
print(f"  💣 OTJ MLB HR Props — {game_date}")
print(f"  {datetime.now().strftime('%I:%M %p ET')}")
if dry_run: print(f"  ⚠ DRY RUN — no DB writes")
print(f"{'=' * 60}\n")

# ── Guards ────────────────────────────────────────────────────────────────────
if not SUPABASE_KEY and not dry_run:
    print("❌ SUPABASE_SERVICE_KEY not set"); sys.exit(1)
if not SGO_API_KEY:
    print("❌ SPORTSGAMEODDS_API_KEY not set"); sys.exit(1)

supabase: Client = None
if not dry_run:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ══════════════════════════════════════════════════════════════════════════════
# API HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def mlb_get(endpoint, params=None):
    try:
        r = requests.get(f"{MLB_STATS_API}{endpoint}", params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  ⚠ MLB API error {endpoint}: {e}", file=sys.stderr)
        return {}


def sgo_get(params):
    try:
        r = requests.get(f"{SGO_BASE}/events", headers=SGO_HEADERS, params=params, timeout=20)
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception as e:
        print(f"  ⚠ SGO error: {e}", file=sys.stderr)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — TODAY'S GAMES + PROBABLE PITCHERS
# ══════════════════════════════════════════════════════════════════════════════

def get_todays_games():
    print("⏳ Fetching today's games + probable pitchers...")
    data = mlb_get("/schedule", {
        "sportId": 1, "date": game_date,
        "hydrate": "probablePitcher,team,linescore,lineups"
    })
    games = []
    for d in data.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("codedGameState") in ("F", "O"):
                continue  # Skip final games
            t = g["teams"]

            def get_pitcher(side):
                p = t[side].get("probablePitcher", {})
                return {
                    "id":   p.get("id"),
                    "name": p.get("fullName", "TBD"),
                }

            # Try confirmed lineup first, fall back to None
            lineups = g.get("lineups", {})
            away_lineup = lineups.get("awayPlayers", [])
            home_lineup = lineups.get("homePlayers", [])

            games.append({
                "game_pk":     g["gamePk"],
                "game_time":   g.get("gameDate", "TBD"),
                "away_team":   t["away"]["team"]["abbreviation"],
                "home_team":   t["home"]["team"]["abbreviation"],
                "away_id":     t["away"]["team"]["id"],
                "home_id":     t["home"]["team"]["id"],
                "away_starter": get_pitcher("away"),
                "home_starter": get_pitcher("home"),
                "away_lineup": away_lineup,  # list of player IDs if confirmed
                "home_lineup": home_lineup,
                "venue":       g.get("venue", {}).get("name", ""),
            })
    print(f"  ✅ {len(games)} upcoming games")
    return games


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — SGO HR PROP LINES
# ══════════════════════════════════════════════════════════════════════════════

def get_sgo_hr_props():
    """
    Pull HR over/under lines from SGO for today's games.
    Returns dict: { sgo_player_id → { "over_odds": int, "under_odds": int, "line": float, "team": str } }

    TODO: Confirm SGO HR prop oddID format. Expected:
      batting_homeRuns-PLAYER_ID-game-ou-over
    where PLAYER_ID is the SGO player ID like SHOHEI_OHTANI_1_MLB.

    If SGO doesn't have HR props on your plan, this returns {} and the script
    falls back to showing props without real odds (line = 0.5, odds = -115 default).
    """
    print("\n⏳ Fetching HR prop lines from SportsGameOdds...")

    events = sgo_get({
        "leagueID":            "MLB",
        "oddsPresent":         "true",
        "finalized":           "false",
        "oddID":               "batting_homeRuns-PLAYER_ID-game-ou-over",
        "includeOpposingOdds": "true",
        "limit":               "30",
    })

    props = {}
    for event in events:
        teams = event.get("teams", {})
        away_abbr = teams.get("away", {}).get("names", {}).get("short", "").upper()
        home_abbr = teams.get("home", {}).get("names", {}).get("short", "").upper()

        odds_dict = event.get("odds", {})
        game_pk = str(event.get("eventID", ""))

        for odd_id, odd_data in odds_dict.items():
            # odd_id format: batting_homeRuns-MIKE_TROUT_1_MLB-game-ou-over
            # Strip prefix "batting_homeRuns-" and suffix "-game-ou-over" to get player ID
            if not odd_id.startswith("batting_homeRuns-") or not odd_id.endswith("-game-ou-over"):
                continue

            # Extract player_id from the middle segment
            # e.g. "batting_homeRuns-MIKE_TROUT_1_MLB-game-ou-over"
            #   → strip prefix → "MIKE_TROUT_1_MLB-game-ou-over"
            #   → strip suffix → "MIKE_TROUT_1_MLB"
            PREFIX = "batting_homeRuns-"
            SUFFIX = "-game-ou-over"
            player_id = odd_id[len(PREFIX):-len(SUFFIX)]  # MIKE_TROUT_1_MLB

            # Use playerID field directly from odd data as confirmation
            confirmed_id = odd_data.get("playerID", player_id)
            player_id = confirmed_id if confirmed_id else player_id

            # Line value — use bookOverUnder (confirmed from response)
            line = float(odd_data.get("bookOverUnder") or odd_data.get("overUnderValue") or 0.5)

            # Best book for over odds — use bookOdds as fallback if byBookmaker is empty
            VENDOR_PRIORITY = ["draftkings", "fanduel", "caesars", "betmgm", "bet365"]
            by_book   = odd_data.get("byBookmaker", {})
            over_odds = None
            vendor    = None
            for book in VENDOR_PRIORITY:
                entry = by_book.get(book, {})
                if entry.get("available") and entry.get("odds") is not None:
                    raw = str(entry["odds"]).replace("+", "")
                    try:
                        over_odds = int(raw)
                        if entry["odds"].startswith("+"):
                            over_odds = abs(over_odds)
                        vendor = book
                        break
                    except (ValueError, AttributeError):
                        pass
            # Fallback to bookOdds consensus
            if over_odds is None and odd_data.get("bookOdds"):
                raw = str(odd_data["bookOdds"]).replace("+", "")
                try:
                    over_odds = int(raw)
                    if str(odd_data["bookOdds"]).startswith("+"):
                        over_odds = abs(over_odds)
                    vendor = "consensus"
                except (ValueError, AttributeError):
                    pass

            # Under odds from opposing odd
            opposing_id  = odd_id.replace("-ou-over", "-ou-under")
            opp_odd      = odds_dict.get(opposing_id, {})
            opp_by_book  = opp_odd.get("byBookmaker", {})
            under_odds   = None
            for book in VENDOR_PRIORITY:
                entry = opp_by_book.get(book, {})
                if entry.get("available") and entry.get("odds") is not None:
                    raw = str(entry["odds"]).replace("+", "")
                    try:
                        under_odds = int(raw)
                        if entry["odds"].startswith("+"):
                            under_odds = abs(under_odds)
                        break
                    except (ValueError, AttributeError):
                        pass

            if over_odds is None:
                continue  # No usable odds — skip

            props[player_id] = {
                "line":       line,
                "over_odds":  over_odds,
                "under_odds": under_odds or -115,
                "vendor":     vendor or "consensus",
                "away_team":  away_abbr,
                "home_team":  home_abbr,
                "event_id":   game_pk,
            }

    print(f"  ✅ {len(props)} HR prop lines from SGO")
    if not props:
        print("  ⚠ No HR props returned — SGO may not have lines yet, or check plan tier")
        print("  ℹ️  Test URL: https://api.sportsgameodds.com/v2/events?leagueID=MLB&oddsAvailable=true&oddID=batting_homeRuns-PLAYER_ID-game-ou-over&limit=5")
    return props


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — BATTER STATS FROM MLB STATS API
# ══════════════════════════════════════════════════════════════════════════════

def get_batter_stats(mlb_id):
    """Season HR stats + last 15 game log for a batter."""
    season = datetime.now().year

    # Season totals
    season_data = mlb_get(f"/people/{mlb_id}/stats", {
        "stats": "season", "group": "hitting", "season": season
    })
    season_stats = {}
    for split in season_data.get("stats", []):
        s = split.get("splits", [{}])[0].get("stat", {}) if split.get("splits") else {}
        if s:
            season_stats = s
            break

    hr        = int(season_stats.get("homeRuns", 0))
    pa        = int(season_stats.get("plateAppearances", 0))
    games     = int(season_stats.get("gamesPlayed", 0))
    hr_rate   = round(hr / pa, 4) if pa > 0 else 0

    # Last 15 game log
    log_data = mlb_get(f"/people/{mlb_id}/stats", {
        "stats": "gameLog", "group": "hitting", "season": season, "limit": 15
    })
    last15_hr = 0
    last15_pa = 0
    for split in log_data.get("stats", []):
        for entry in split.get("splits", []):
            s = entry.get("stat", {})
            last15_hr += int(s.get("homeRuns", 0))
            last15_pa += int(s.get("plateAppearances", 0))

    last15_hr_rate = round(last15_hr / last15_pa, 4) if last15_pa > 0 else 0

    return {
        "season_hr":       hr,
        "season_pa":       pa,
        "season_games":    games,
        "season_hr_rate":  hr_rate,
        "last15_hr":       last15_hr,
        "last15_pa":       last15_pa,
        "last15_hr_rate":  last15_hr_rate,
    }


def get_batter_hand(mlb_id):
    """Returns 'L', 'R', or 'S' (switch)."""
    data = mlb_get(f"/people/{mlb_id}")
    people = data.get("people", [])
    if people:
        return people[0].get("batSide", {}).get("code", "R")
    return "R"


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — PITCHER STATS
# ══════════════════════════════════════════════════════════════════════════════

def get_pitcher_stats(mlb_id):
    """Season HR/9, ERA, hand for a pitcher."""
    if not mlb_id:
        return {"hr9": 1.0, "era": 4.00, "hand": "R", "games": 0}

    season = datetime.now().year
    data = mlb_get(f"/people/{mlb_id}/stats", {
        "stats": "season", "group": "pitching", "season": season
    })
    s = {}
    for split in data.get("stats", []):
        splits = split.get("splits", [])
        if splits:
            s = splits[0].get("stat", {})
            break

    ip   = float(s.get("inningsPitched", "0") or 0)
    hr   = int(s.get("homeRuns", 0))
    era  = float(s.get("era", "4.00") or 4.00)
    games = int(s.get("gamesStarted", 0))
    hr9  = round(hr / ip * 9, 2) if ip > 0 else 1.0

    # Pitcher hand
    pdata = mlb_get(f"/people/{mlb_id}")
    people = pdata.get("people", [])
    hand = people[0].get("pitchHand", {}).get("code", "R") if people else "R"

    return {"hr9": hr9, "era": era, "hand": hand, "games": games, "ip": ip}


# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — WEATHER
# ══════════════════════════════════════════════════════════════════════════════

def angle_diff(a, b):
    """Smallest angle between two compass bearings (0-180)."""
    diff = abs(a - b) % 360
    return diff if diff <= 180 else 360 - diff


def get_wind_context(team_abbr, game_time_iso):
    """
    Returns wind context for a stadium.
    game_time_iso: ISO string like "2026-04-01T19:05:00Z"
    """
    stadium = STADIUMS.get(team_abbr)
    if not stadium:
        return {"dome": False, "wind_speed_mph": 0, "wind_direction": "unknown", "temp_f": 70, "condition": "unknown"}

    if stadium.get("dome"):
        return {"dome": True, "wind_speed_mph": 0, "wind_direction": "dome", "temp_f": 72, "condition": "dome"}

    lat, lng = stadium["lat"], stadium["lng"]
    hp_bearing = stadium["hp_bearing"]

    # CF direction = home plate bearing + 180 (outfield is behind pitcher)
    cf_bearing = (hp_bearing + 180) % 360

    try:
        # Get hourly forecast for game day
        r = requests.get(OPEN_METEO_BASE, params={
            "latitude":            lat,
            "longitude":           lng,
            "hourly":              "wind_speed_10m,wind_direction_10m,temperature_2m,precipitation",
            "wind_speed_unit":     "mph",
            "temperature_unit":    "fahrenheit",
            "timezone":            "America/New_York",
            "forecast_days":       2,
        }, timeout=10)
        r.raise_for_status()
        data = r.json()

        hourly = data.get("hourly", {})
        times  = hourly.get("time", [])
        winds  = hourly.get("wind_speed_10m", [])
        dirs   = hourly.get("wind_direction_10m", [])
        temps  = hourly.get("temperature_2m", [])
        precip = hourly.get("precipitation", [])

        # Find the hour closest to game time
        game_dt = None
        try:
            game_dt = datetime.fromisoformat(game_time_iso.replace("Z", "+00:00"))
        except Exception:
            pass

        target_idx = 0
        if game_dt and times:
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

        wind_spd = winds[target_idx] if winds else 0
        wind_dir = dirs[target_idx]  if dirs  else 0
        temp     = temps[target_idx] if temps else 70
        rain     = precip[target_idx] if precip else 0

        # Classify wind direction relative to outfield
        diff_to_cf = angle_diff(wind_dir, cf_bearing)
        if diff_to_cf <= 45 and wind_spd >= 5:
            wind_label = "out_to_cf"
        elif diff_to_cf >= 135 and wind_spd >= 5:
            wind_label = "in_from_cf"
        elif wind_spd < 5:
            wind_label = "calm"
        else:
            wind_label = "crosswind"

        condition = "rainy" if rain > 0.05 else "clear"

        return {
            "dome":             False,
            "wind_speed_mph":   round(wind_spd, 1),
            "wind_direction":   wind_label,
            "wind_bearing":     wind_dir,
            "temp_f":           round(temp, 1),
            "condition":        condition,
            "rain_chance":      round(rain, 2),
        }

    except Exception as e:
        print(f"  ⚠ Weather fetch failed for {team_abbr}: {e}", file=sys.stderr)
        return {"dome": False, "wind_speed_mph": 0, "wind_direction": "unknown", "temp_f": 70, "condition": "unknown"}


# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — SCORING ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def score_hr_prop(batter_stats, batter_hand, pitcher_stats, park_factor, weather, line=0.5):
    """
    Score a batter's HR prop 0-100.
    Returns (score, lean, confidence, signals)
    """
    score   = 0
    signals = []

    pf = park_factor

    # ── Park Factor (20pts max) ────────────────────────────────────────────────
    if pf >= 110:
        score += 20
        signals.append({"text": f"Park factor {pf} — elite hitter park (Coors tier)", "tag": "OVER"})
    elif pf >= 105:
        score += 15
        signals.append({"text": f"Park factor {pf} — hitter-friendly venue", "tag": "OVER"})
    elif pf >= 101:
        score += 10
        signals.append({"text": f"Park factor {pf} — slight hitter advantage", "tag": "OVER"})
    elif pf >= 98:
        score += 5
        signals.append({"text": f"Park factor {pf} — neutral park", "tag": "NEUTRAL"})
    else:
        score += 0
        signals.append({"text": f"Park factor {pf} — pitcher-friendly venue, suppresses HRs", "tag": "CAUTION"})

    # ── Batter Season HR Rate (20pts max) ─────────────────────────────────────
    hr_rate = batter_stats.get("season_hr_rate", 0)
    szn_hr  = batter_stats.get("season_hr", 0)
    szn_pa  = batter_stats.get("season_pa", 0)
    if hr_rate >= 0.08:
        score += 20
        signals.append({"text": f"Elite HR rate: {szn_hr} HRs in {szn_pa} PA ({hr_rate:.1%} per PA)", "tag": "OVER"})
    elif hr_rate >= 0.055:
        score += 15
        signals.append({"text": f"Strong HR rate: {szn_hr} HRs in {szn_pa} PA ({hr_rate:.1%} per PA)", "tag": "OVER"})
    elif hr_rate >= 0.035:
        score += 8
        signals.append({"text": f"Average HR rate: {szn_hr} HRs in {szn_pa} PA ({hr_rate:.1%} per PA)", "tag": "NEUTRAL"})
    elif hr_rate >= 0.015:
        score += 3
        signals.append({"text": f"Below avg HR rate: {szn_hr} HRs in {szn_pa} PA ({hr_rate:.1%}) — not a HR threat", "tag": "CAUTION"})
    else:
        score += 0
        signals.append({"text": f"Poor HR rate: {szn_hr} HRs in {szn_pa} PA — avoid HR props", "tag": "WARN"})

    # ── L15 HR Pace (15pts max) ────────────────────────────────────────────────
    l15_hr   = batter_stats.get("last15_hr", 0)
    l15_pa   = batter_stats.get("last15_pa", 0)
    l15_rate = batter_stats.get("last15_hr_rate", 0)
    if szn_hr > 0 and l15_pa > 0:
        pace_ratio = l15_rate / hr_rate if hr_rate > 0 else 1
        if pace_ratio >= 1.8:
            score += 15
            signals.append({"text": f"🔥 Running HOT: {l15_hr} HRs in last {l15_pa} PA (pace {pace_ratio:.1f}x season rate)", "tag": "OVER"})
        elif pace_ratio >= 1.2:
            score += 10
            signals.append({"text": f"Trending up: {l15_hr} HRs in last {l15_pa} PA (above season pace)", "tag": "OVER"})
        elif pace_ratio >= 0.7:
            score += 5
            signals.append({"text": f"On pace: {l15_hr} HRs in last {l15_pa} PA (inline with season rate)", "tag": "NEUTRAL"})
        else:
            score -= 8
            signals.append({"text": f"🥶 Running COLD: {l15_hr} HRs in last {l15_pa} PA (well below season pace)", "tag": "CAUTION"})
    elif l15_pa == 0:
        signals.append({"text": "Not enough recent games to assess HR pace (early season)", "tag": "NEUTRAL"})

    # ── Pitcher HR/9 (20pts max) ──────────────────────────────────────────────
    hr9    = pitcher_stats.get("hr9", 1.0)
    p_era  = pitcher_stats.get("era", 4.00)
    p_ip   = pitcher_stats.get("ip", 0)
    if p_ip < 10:
        signals.append({"text": f"Pitcher has limited data ({p_ip} IP) — small sample", "tag": "NEUTRAL"})
        score += 8  # neutral score
    elif hr9 >= 1.8:
        score += 20
        signals.append({"text": f"Pitcher HR/9 = {hr9} — gives up HRs at well above-average rate", "tag": "OVER"})
    elif hr9 >= 1.3:
        score += 15
        signals.append({"text": f"Pitcher HR/9 = {hr9} — above-average HR rate allowed", "tag": "OVER"})
    elif hr9 >= 0.9:
        score += 8
        signals.append({"text": f"Pitcher HR/9 = {hr9} — average HR rate allowed", "tag": "NEUTRAL"})
    elif hr9 >= 0.5:
        score += 3
        signals.append({"text": f"Pitcher HR/9 = {hr9} — below-average HR rate, keeps ball in park", "tag": "CAUTION"})
    else:
        score -= 5
        signals.append({"text": f"Pitcher HR/9 = {hr9} — elite at suppressing HRs", "tag": "WARN"})

    # ── L/R Batter vs Pitcher (15pts max) ─────────────────────────────────────
    p_hand = pitcher_stats.get("hand", "R")
    b_hand = batter_hand or "R"
    # Switch hitters always favorable
    if b_hand == "S":
        score += 12
        signals.append({"text": f"Switch hitter — always gets favorable platoon split vs {p_hand}HP", "tag": "OVER"})
    elif b_hand != p_hand:
        # Opposite-hand matchup — favorable
        score += 15
        signals.append({"text": f"{'LHB' if b_hand=='L' else 'RHB'} vs {'RHP' if p_hand=='R' else 'LHP'} — favorable platoon split for power", "tag": "OVER"})
    else:
        # Same-hand matchup — slight disadvantage
        score += 5
        signals.append({"text": f"{'LHB' if b_hand=='L' else 'RHB'} vs {'LHP' if p_hand=='L' else 'RHP'} — same-hand matchup, slight disadvantage", "tag": "NEUTRAL"})

    # ── Weather (10pts max) ────────────────────────────────────────────────────
    if weather.get("dome"):
        signals.append({"text": "Indoor/retractable stadium — weather not a factor", "tag": "NEUTRAL"})
    else:
        wind_dir = weather.get("wind_direction", "unknown")
        wind_spd = weather.get("wind_speed_mph", 0)
        temp     = weather.get("temp_f", 70)
        rain     = weather.get("condition", "") == "rainy"

        if wind_dir == "out_to_cf":
            if wind_spd >= 15:
                score += 10
                signals.append({"text": f"🌬️ Wind {wind_spd}mph blowing OUT to CF — elite HR conditions", "tag": "OVER"})
            elif wind_spd >= 8:
                score += 6
                signals.append({"text": f"🌬️ Wind {wind_spd}mph blowing out — HR-friendly conditions", "tag": "OVER"})
            else:
                score += 2
                signals.append({"text": f"Light wind ({wind_spd}mph) blowing out — minor HR boost", "tag": "OVER"})
        elif wind_dir == "in_from_cf":
            score -= 6
            signals.append({"text": f"💨 Wind {wind_spd}mph blowing IN from CF — suppresses HRs", "tag": "CAUTION"})
        elif wind_dir == "crosswind":
            score += 2
            signals.append({"text": f"Crosswind {wind_spd}mph — minimal HR impact", "tag": "NEUTRAL"})
        else:
            signals.append({"text": f"Calm conditions ({wind_spd}mph) — weather neutral", "tag": "NEUTRAL"})

        # Temperature
        if temp >= 85:
            score += 3
            signals.append({"text": f"Hot {temp}°F — ball carries well in warm air", "tag": "OVER"})
        elif temp <= 50:
            score -= 3
            signals.append({"text": f"Cold {temp}°F — ball dies in cold air, suppresses HRs", "tag": "CAUTION"})

        if rain:
            score -= 4
            signals.append({"text": "Rain in forecast — could affect play or cause delays", "tag": "WARN"})

    # ── Final score ────────────────────────────────────────────────────────────
    score = max(0, min(100, score))
    lean  = "OVER" if score >= 45 else "UNDER"

    if score >= 70:   confidence = "HIGH"
    elif score >= 50: confidence = "MODERATE"
    else:             confidence = "LOW"

    return score, lean, confidence, signals


# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — NARRATIVE GENERATION (optional)
# ══════════════════════════════════════════════════════════════════════════════

def generate_prop_narrative(prop):
    if no_narrative or not ANTHROPIC_API_KEY:
        return ""
    try:
        import anthropic
        top_signals = [s["text"] for s in prop["signals"][:3]]
        prompt = f"""You are OTJ's MLB analyst. Write a sharp 1-2 sentence prop note for bettors.

Player: {prop["player"]} ({prop["team"]}) — HR Over {prop["line"]}
Score: {prop["score"]}/100 ({prop["confidence"]})
Key signals: {" | ".join(top_signals)}
Park: {prop["venue"]} (PF {prop["park_factor"]})
Pitcher: {prop["opp_pitcher"]} (HR/9: {prop.get("pitcher_hr9", "N/A")})

Be specific, punchy, under 40 words. Reference the player and pitcher by name."""

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=NARRATIVE_MODEL, max_tokens=80,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"  ⚠ Narrative failed: {e}", file=sys.stderr)
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    # Step 1 — Today's games
    games = get_todays_games()
    if not games:
        print("No games today — nothing to push")
        return

    # Build a lookup: team → (starter_id, game_pk, game_time, opponent)
    team_game_map = {}
    for g in games:
        team_game_map[g["away_team"]] = {
            "starter_id":   g["home_starter"]["id"],      # away bats against home starter
            "starter_name": g["home_starter"]["name"],
            "game_pk":      g["game_pk"],
            "game_time":    g["game_time"],
            "opponent":     g["home_team"],
            "home_team":    g["home_team"],
            "venue":        g["venue"],
            "matchup":      f"{g['away_team']} @ {g['home_team']}",
        }
        team_game_map[g["home_team"]] = {
            "starter_id":   g["away_starter"]["id"],      # home bats against away starter
            "starter_name": g["away_starter"]["name"],
            "game_pk":      g["game_pk"],
            "game_time":    g["game_time"],
            "opponent":     g["away_team"],
            "home_team":    g["home_team"],
            "venue":        g["venue"],
            "matchup":      f"{g['away_team']} @ {g['home_team']}",
        }

    # Step 2 — SGO HR prop lines
    sgo_props = get_sgo_hr_props()

    # Step 3 — Weather (one fetch per unique home team)
    print("\n⏳ Fetching weather for each venue...")
    weather_cache = {}
    for g in games:
        ht = g["home_team"]
        if ht not in weather_cache:
            w = get_wind_context(ht, g["game_time"])
            weather_cache[ht] = w
            dome_str = "🏟 DOME" if w["dome"] else f"🌬️ {w['wind_direction']} {w['wind_speed_mph']}mph {w['temp_f']}°F"
            print(f"  {ht}: {dome_str}")

    # Step 4 — Score each prop
    print("\n⏳ Scoring HR props...")
    scored_props = []
    now_iso = datetime.now().isoformat()

    # If SGO has no props, build from roster (fallback: score top HR hitters)
    if not sgo_props:
        print("  ⚠ No SGO prop lines — building from top HR hitters on today's rosters")
        # TODO: Pull roster + season stats, filter to top HR hitters per team
        # For now, exit gracefully
        print("  ℹ️  Will retry once SGO has lines for today's games")
        return

    # ── SGO player ID → MLB Stats API player ID ──────────────────────────────
    # SGO format: MIKE_TROUT_1_MLB → convert to search name "Mike Trout"
    # Then search MLB Stats API /people/search to get their mlb_id.
    # Cache results to avoid re-searching the same player twice.
    mlb_id_cache = {}

    def sgo_id_to_name(sgo_id):
        """Convert MIKE_TROUT_1_MLB → Mike Trout"""
        # Strip _MLB suffix and trailing number
        parts = sgo_id.replace("_MLB", "").split("_")
        # Drop trailing number if it's all digits
        if parts and parts[-1].isdigit():
            parts = parts[:-1]
        return " ".join(p.capitalize() for p in parts)

    def search_mlb_player(name):
        """Search MLB Stats API for player by name, return (mlb_id, full_name, team_abbr)"""
        data = mlb_get("/people/search", {"names": name, "sportIds": 1})
        people = data.get("people", [])
        if not people:
            return None, None, None
        # Take first active result
        for p in people:
            if p.get("active"):
                team = p.get("currentTeam", {}).get("abbreviation", "")
                return p["id"], p.get("fullName", name), team
        # Fall back to first result even if not active
        p = people[0]
        team = p.get("currentTeam", {}).get("abbreviation", "")
        return p["id"], p.get("fullName", name), team

    # Build a set of all teams playing today for fast lookup
    todays_teams = set(team_game_map.keys())

    # SGO abbrev → OTJ abbrev normalization (same map as push_mlb_to_supabase.py)
    SGO_TO_MLB = {
        "ARI": "AZ", "KCR": "KC", "SDP": "SD",
        "SFG": "SF", "TBR": "TB", "WSN": "WSH", "CHW": "CWS",
        "OAK": "ATH",  # Athletics moved to Sacramento — SGO may still use OAK
    }
    # Also need reverse map for MLB Stats API team abbrevs → our abbrevs
    MLB_STATS_TO_OTJ = {
        "ARI": "AZ", "KCR": "KC", "SDP": "SD",
        "SFG": "SF", "TBR": "TB", "WSN": "WSH", "CHW": "CWS",
        "OAK": "ATH",
    }

    print(f"  ⏳ Resolving {len(sgo_props)} SGO player IDs → MLB Stats API IDs...")
    print(f"  Today's teams: {sorted(todays_teams)}")
    resolved = 0

    for sgo_player_id, prop_line_data in sgo_props.items():
        # Step 1: Find which game this prop belongs to using SGO event teams
        away_raw = prop_line_data.get("away_team", "")
        home_raw = prop_line_data.get("home_team", "")
        away_norm = SGO_TO_MLB.get(away_raw, away_raw)
        home_norm = SGO_TO_MLB.get(home_raw, home_raw)

        # Skip if neither team is playing today
        if away_norm not in todays_teams and home_norm not in todays_teams:
            continue  # Game not on today's slate — silently skip

        # Step 2: Get player name and MLB ID from SGO player ID
        search_name = sgo_id_to_name(sgo_player_id)

        if search_name in mlb_id_cache:
            mlb_id, full_name, mlb_team = mlb_id_cache[search_name]
        else:
            mlb_id, full_name, mlb_team = search_mlb_player(search_name)
            mlb_id_cache[search_name] = (mlb_id, full_name, mlb_team)

        if not mlb_id:
            print(f"  ⚠ Could not resolve {sgo_player_id} → skipping", file=sys.stderr)
            continue

        # Step 3: Determine which team this player is on from the SGO event.
        # Try MLB Stats API team first, then fall back to matching against the game teams.
        mlb_team_norm = MLB_STATS_TO_OTJ.get(mlb_team, mlb_team)

        if mlb_team_norm in (away_norm, home_norm) and mlb_team_norm in todays_teams:
            team = mlb_team_norm
        elif away_norm in todays_teams:
            # Guess away team (we'll use the game context either way)
            team = away_norm
        elif home_norm in todays_teams:
            team = home_norm
        else:
            print(f"  ⚠ {full_name} — can't map to today's game ({away_norm} @ {home_norm})")
            continue

        game_info = team_game_map.get(team, {})
        if not game_info:
            # Last resort: try the other team in the matchup
            other = home_norm if team == away_norm else away_norm
            game_info = team_game_map.get(other, {})
            if game_info:
                team = other

        if not game_info:
            print(f"  ⚠ {full_name} (mlb_team={mlb_team!r}, norm={mlb_team_norm!r}, away={away_norm}, home={home_norm}) → no game_info")
            continue

        home_team    = game_info["home_team"]
        weather      = weather_cache.get(home_team, {"dome": False, "wind_speed_mph": 0, "wind_direction": "unknown", "temp_f": 70})
        park_factor  = PARK_FACTORS.get(home_team, 100)
        starter_id   = game_info["starter_id"]
        starter_name = game_info["starter_name"]

        pitcher_stats = get_pitcher_stats(starter_id) if starter_id else {"hr9": 1.0, "era": 4.00, "hand": "R", "games": 0}
        batter_stats  = get_batter_stats(mlb_id)
        batter_hand   = get_batter_hand(mlb_id)

        if batter_stats.get("season_games", 0) < MIN_GAMES_PLAYED:
            print(f"  ⏭ {full_name} — only {batter_stats.get('season_games',0)} games played (min {MIN_GAMES_PLAYED})")
            continue

        score, lean, confidence, signals = score_hr_prop(
            batter_stats, batter_hand, pitcher_stats, park_factor, weather,
            line=prop_line_data["line"]
        )

        if score < MIN_SCORE_SHOW:
            continue

        prop = {
            "player":          full_name,
            "sgo_player_id":   sgo_player_id,
            "mlb_player_id":   mlb_id,
            "team":            team,
            "pos":             "",  # filled below
            "game":            game_info["matchup"],
            "matchup":         game_info["matchup"],
            "opp_team":        game_info["opponent"],
            "opp_pitcher":     starter_name,
            "pitcher_hand":    pitcher_stats.get("hand", "R"),
            "pitcher_hr9":     pitcher_stats.get("hr9", 1.0),
            "batter_hand":     batter_hand,
            "venue":           game_info["venue"],
            "park_factor":     park_factor,
            "stat":            "Home Runs",
            "line":            prop_line_data["line"],
            "over_odds":       prop_line_data["over_odds"],
            "under_odds":      prop_line_data["under_odds"],
            "vendor":          prop_line_data["vendor"],
            "season_hr":       batter_stats["season_hr"],
            "season_pa":       batter_stats["season_pa"],
            "season_hr_rate":  batter_stats["season_hr_rate"],
            "last15_hr":       batter_stats["last15_hr"],
            "last15_pa":       batter_stats["last15_pa"],
            "last15_hr_rate":  batter_stats["last15_hr_rate"],
            "weather":         weather,
            "score":           score,
            "lean":            lean,
            "confidence":      confidence,
            "signals":         signals,
            "narrative":       "",
        }
        scored_props.append(prop)
        resolved += 1
        print(f"  ✅ {full_name} ({team}) — score {score}/100 {lean}")

    print(f"  Resolved {resolved}/{len(sgo_props)} SGO props")

    if not scored_props:
        print("  No props met the minimum score threshold")
        return

    # Sort by score
    scored_props.sort(key=lambda x: x["score"], reverse=True)
    print(f"  ✅ {len(scored_props)} props scored above threshold")

    # Step 5 — Generate narratives
    if not no_narrative and ANTHROPIC_API_KEY:
        print("\n⏳ Generating narratives...")
        for prop in scored_props[:10]:  # Narratives for top 10 only
            prop["narrative"] = generate_prop_narrative(prop)
            print(f"  ✍ {prop['player']} — {prop['score']}/100")

    # Step 6 — Print results (always)
    print(f"\n{'─' * 60}")
    print(f"  💣 TOP HR PROPS — {game_date}")
    print(f"{'─' * 60}")
    for p in scored_props[:15]:
        conf_icon = "🔥" if p["confidence"] == "HIGH" else "⚡" if p["confidence"] == "MODERATE" else "ℹ️"
        print(f"  {conf_icon} {p['player']:25} {p['team']:4} {p['lean']:5} {p['score']:3}/100 | vs {p['opp_pitcher']} | PF {p['park_factor']}")

    # Step 7 — Push to Supabase
    if dry_run:
        print(f"\n  ⚠ DRY RUN — skipping Supabase write")
        print(f"  Would push {len(scored_props)} props for {game_date}")
        return

    print(f"\n⏳ Upserting {len(scored_props)} props to Supabase...")
    try:
        supabase.table("mlb_props_slates").upsert({
            "date":       game_date,
            "sport":      "mlb",
            "props":      scored_props,
            "created_at": now_iso,
        }, on_conflict="date").execute()
        print(f"  ✅ Pushed {len(scored_props)} HR props for {game_date}")
    except Exception as e:
        print(f"  ❌ Supabase upsert failed: {e}")
        sys.exit(1)

    print(f"\n{'=' * 60}")
    print(f"  ✅ MLB Props push complete — {datetime.now().strftime('%I:%M %p ET')}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
