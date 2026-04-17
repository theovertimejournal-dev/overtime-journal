"""
predict_mlb_today.py

Runs the trained ensemble model on today's MLB slate and updates the Supabase
games table with predictions.

Workflow:
  1. Fetch today's games + probable pitchers from MLB Stats API
  2. Pull same feature data used in training (pitcher stats, bullpen, lineups,
     arsenal, hitter splits, umpires, weather)
  3. Build feature matrix using same logic as build_features.py
  4. Load trained models from models/ directory
  5. Run full_with_line (or full_no_line fallback) + f5_no_line per game
  6. Compute run_total_lean from arsenal_match + wx_hr_factor + park
  7. Upsert each game in the `games` table with edge.lean/confidence/scores/signals

Usage:
  python predict_mlb_today.py
  python predict_mlb_today.py --date=2026-04-15
  python predict_mlb_today.py --dry-run
"""
import os, sys, json, pickle, argparse, logging, time, math
from pathlib import Path
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import numpy as np
import pandas as pd
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SGO_API_KEY = os.environ.get("SPORTSGAMEODDS_API_KEY", "")

MLB_API = "https://statsapi.mlb.com/api/v1"
SGO_BASE = "https://api.sportsgameodds.com/v2"
SGO_HEADERS = {"X-Api-Key": SGO_API_KEY}
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

MODELS_DIR = Path("models")
DATA_DIR = Path("data")

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("predict")


# ── Stadium / Park / Team Maps (same as build_features.py) ──────────────────
PARK_FACTORS_BY_TEAM = {
    "COLORADO_ROCKIES_MLB": 114, "CINCINNATI_REDS_MLB": 107,
    "TEXAS_RANGERS_MLB": 106, "BOSTON_RED_SOX_MLB": 105,
    "CHICAGO_CUBS_MLB": 104, "PHILADELPHIA_PHILLIES_MLB": 103,
    "ATLANTA_BRAVES_MLB": 102, "MILWAUKEE_BREWERS_MLB": 102,
    "TORONTO_BLUE_JAYS_MLB": 101, "BALTIMORE_ORIOLES_MLB": 101,
    "MINNESOTA_TWINS_MLB": 101, "LOS_ANGELES_ANGELS_MLB": 100,
    "NEW_YORK_YANKEES_MLB": 100, "WASHINGTON_NATIONALS_MLB": 100,
    "CLEVELAND_GUARDIANS_MLB": 99, "DETROIT_TIGERS_MLB": 99,
    "STLOUIS_CARDINALS_MLB": 99, "ARIZONA_DIAMONDBACKS_MLB": 99,
    "KANSAS_CITY_ROYALS_MLB": 98, "SAN_FRANCISCO_GIANTS_MLB": 98,
    "CHICAGO_WHITE_SOX_MLB": 98, "HOUSTON_ASTROS_MLB": 97,
    "PITTSBURGH_PIRATES_MLB": 97, "TAMPA_BAY_RAYS_MLB": 96,
    "NEW_YORK_METS_MLB": 96, "LOS_ANGELES_DODGERS_MLB": 96,
    "SAN_DIEGO_PADRES_MLB": 95, "SEATTLE_MARINERS_MLB": 95,
    "MIAMI_MARLINS_MLB": 94, "OAKLAND_ATHLETICS_MLB": 94,
    "ATHLETICS_MLB": 94,
}

STADIUMS = {
    "ARIZONA_DIAMONDBACKS_MLB":     {"lat": 33.4452, "lon": -112.0667, "roof": "retractable", "cf_bearing": None},
    "ATLANTA_BRAVES_MLB":           {"lat": 33.8908, "lon": -84.4678,  "roof": False, "cf_bearing": 50},
    "BALTIMORE_ORIOLES_MLB":        {"lat": 39.2838, "lon": -76.6217,  "roof": False, "cf_bearing": 62},
    "BOSTON_RED_SOX_MLB":           {"lat": 42.3467, "lon": -71.0972,  "roof": False, "cf_bearing": 45},
    "CHICAGO_CUBS_MLB":             {"lat": 41.9475, "lon": -87.6560,  "roof": False, "cf_bearing": 31},
    "CHICAGO_WHITE_SOX_MLB":        {"lat": 41.8300, "lon": -87.6337,  "roof": False, "cf_bearing": 45},
    "CINCINNATI_REDS_MLB":          {"lat": 39.0974, "lon": -84.5071,  "roof": False, "cf_bearing": 125},
    "CLEVELAND_GUARDIANS_MLB":      {"lat": 41.4962, "lon": -81.6852,  "roof": False, "cf_bearing": 88},
    "COLORADO_ROCKIES_MLB":         {"lat": 39.7561, "lon": -104.9942, "roof": False, "cf_bearing": 3},
    "DETROIT_TIGERS_MLB":           {"lat": 42.3391, "lon": -83.0485,  "roof": False, "cf_bearing": 65},
    "KANSAS_CITY_ROYALS_MLB":       {"lat": 39.0517, "lon": -94.4803,  "roof": False, "cf_bearing": 45},
    "LOS_ANGELES_ANGELS_MLB":       {"lat": 33.8003, "lon": -117.8827, "roof": False, "cf_bearing": 45},
    "LOS_ANGELES_DODGERS_MLB":      {"lat": 34.0739, "lon": -118.2400, "roof": False, "cf_bearing": 22},
    "NEW_YORK_METS_MLB":            {"lat": 40.7571, "lon": -73.8458,  "roof": False, "cf_bearing": 60},
    "NEW_YORK_YANKEES_MLB":         {"lat": 40.8296, "lon": -73.9262,  "roof": False, "cf_bearing": 88},
    "OAKLAND_ATHLETICS_MLB":        {"lat": 37.7516, "lon": -122.2008, "roof": False, "cf_bearing": 56},
    "ATHLETICS_MLB":                {"lat": 38.5764, "lon": -121.4934, "roof": False, "cf_bearing": 49},
    "PHILADELPHIA_PHILLIES_MLB":    {"lat": 39.9057, "lon": -75.1665,  "roof": False, "cf_bearing": 17},
    "PITTSBURGH_PIRATES_MLB":       {"lat": 40.4469, "lon": -80.0057,  "roof": False, "cf_bearing": 115},
    "SAN_DIEGO_PADRES_MLB":         {"lat": 32.7076, "lon": -117.1566, "roof": False, "cf_bearing": 1},
    "SAN_FRANCISCO_GIANTS_MLB":     {"lat": 37.7786, "lon": -122.3893, "roof": False, "cf_bearing": 92},
    "WASHINGTON_NATIONALS_MLB":     {"lat": 38.8730, "lon": -77.0074,  "roof": False, "cf_bearing": 45},
    "HOUSTON_ASTROS_MLB":           {"lat": 29.7573, "lon": -95.3555,  "roof": "retractable", "cf_bearing": 340},
    "MIAMI_MARLINS_MLB":            {"lat": 25.7781, "lon": -80.2197,  "roof": "retractable", "cf_bearing": 67},
    "MILWAUKEE_BREWERS_MLB":        {"lat": 43.0280, "lon": -87.9712,  "roof": "retractable", "cf_bearing": 110},
    "SEATTLE_MARINERS_MLB":         {"lat": 47.5914, "lon": -122.3325, "roof": "retractable", "cf_bearing": 57},
    "STLOUIS_CARDINALS_MLB":        {"lat": 38.6226, "lon": -90.1928,  "roof": False, "cf_bearing": 102},
    "MINNESOTA_TWINS_MLB":          {"lat": 44.9817, "lon": -93.2772,  "roof": False, "cf_bearing": 90},
    "TEXAS_RANGERS_MLB":            {"lat": 32.7475, "lon": -97.0830,  "roof": "retractable", "cf_bearing": 353},
    "TORONTO_BLUE_JAYS_MLB":        {"lat": 43.6414, "lon": -79.3894,  "roof": "retractable", "cf_bearing": 325},
    "TAMPA_BAY_RAYS_MLB":           {"lat": 27.7682, "lon": -82.6534,  "roof": "dome", "cf_bearing": None},
}

# MLB Stats API abbreviation -> our SGO team ID
ABBREV_TO_SGO = {
    "ARI": "ARIZONA_DIAMONDBACKS_MLB", "ATL": "ATLANTA_BRAVES_MLB",
    "BAL": "BALTIMORE_ORIOLES_MLB", "BOS": "BOSTON_RED_SOX_MLB",
    "CHC": "CHICAGO_CUBS_MLB", "CWS": "CHICAGO_WHITE_SOX_MLB",
    "CHW": "CHICAGO_WHITE_SOX_MLB", "CIN": "CINCINNATI_REDS_MLB",
    "CLE": "CLEVELAND_GUARDIANS_MLB", "COL": "COLORADO_ROCKIES_MLB",
    "DET": "DETROIT_TIGERS_MLB", "HOU": "HOUSTON_ASTROS_MLB",
    "KC": "KANSAS_CITY_ROYALS_MLB", "KCR": "KANSAS_CITY_ROYALS_MLB",
    "LAA": "LOS_ANGELES_ANGELS_MLB", "LAD": "LOS_ANGELES_DODGERS_MLB",
    "MIA": "MIAMI_MARLINS_MLB", "MIL": "MILWAUKEE_BREWERS_MLB",
    "MIN": "MINNESOTA_TWINS_MLB", "NYM": "NEW_YORK_METS_MLB",
    "NYY": "NEW_YORK_YANKEES_MLB", "OAK": "OAKLAND_ATHLETICS_MLB",
    "ATH": "ATHLETICS_MLB", "PHI": "PHILADELPHIA_PHILLIES_MLB",
    "PIT": "PITTSBURGH_PIRATES_MLB", "SD": "SAN_DIEGO_PADRES_MLB",
    "SDP": "SAN_DIEGO_PADRES_MLB", "SF": "SAN_FRANCISCO_GIANTS_MLB",
    "SFG": "SAN_FRANCISCO_GIANTS_MLB", "SEA": "SEATTLE_MARINERS_MLB",
    "STL": "STLOUIS_CARDINALS_MLB", "TB": "TAMPA_BAY_RAYS_MLB",
    "TBR": "TAMPA_BAY_RAYS_MLB", "TEX": "TEXAS_RANGERS_MLB",
    "TOR": "TORONTO_BLUE_JAYS_MLB", "WSH": "WASHINGTON_NATIONALS_MLB",
    "WSN": "WASHINGTON_NATIONALS_MLB",
}


# ── HTTP helpers ─────────────────────────────────────────────────────────────
def mlb_get(endpoint, params=None):
    try:
        r = requests.get(f"{MLB_API}{endpoint}", params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning("MLB API %s: %s", endpoint, e)
        return {}


def sgo_get(params):
    try:
        r = requests.get(f"{SGO_BASE}/events", headers=SGO_HEADERS,
                         params=params, timeout=20)
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception as e:
        log.warning("SGO: %s", e)
        return []


# ── Data pulls (live, for today) ────────────────────────────────────────────

def get_todays_games(game_date):
    """Fetch today's MLB games with probable pitchers and venues."""
    payload = mlb_get("/schedule", {
        "sportId": 1, "date": game_date,
        "hydrate": "probablePitcher,team,venue,lineups"
    })
    games = []
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("codedGameState") in ("F", "O"):
                continue
            t = g["teams"]
            home_abbrev = t["home"]["team"].get("abbreviation", "")
            away_abbrev = t["away"]["team"].get("abbreviation", "")
            games.append({
                "game_pk": g["gamePk"],
                "game_date": g.get("gameDate"),
                "home_abbrev": home_abbrev,
                "away_abbrev": away_abbrev,
                "home_sgo": ABBREV_TO_SGO.get(home_abbrev, ""),
                "away_sgo": ABBREV_TO_SGO.get(away_abbrev, ""),
                "home_name": t["home"]["team"].get("name", ""),
                "away_name": t["away"]["team"].get("name", ""),
                "home_team_id": t["home"]["team"].get("id"),
                "away_team_id": t["away"]["team"].get("id"),
                "home_starter_id": t["home"].get("probablePitcher", {}).get("id"),
                "away_starter_id": t["away"].get("probablePitcher", {}).get("id"),
                "home_starter_name": t["home"].get("probablePitcher", {}).get("fullName", "TBD"),
                "away_starter_name": t["away"].get("probablePitcher", {}).get("fullName", "TBD"),
                "venue": g.get("venue", {}).get("name", ""),
                "lineups": g.get("lineups", {}),
                "matchup": f"{away_abbrev}@{home_abbrev}",
            })
    log.info("found %s games for %s", len(games), game_date)
    return games


def get_pitcher_season_stats(pid, season):
    """Season line (ERA/WHIP/K/9/BB/9/HR/9)."""
    if not pid: return {}
    payload = mlb_get(f"/people/{pid}/stats",
                      {"stats": "season", "group": "pitching", "season": season})
    try:
        splits = payload.get("stats", [{}])[0].get("splits", [])
        if not splits: return {}
        s = splits[0].get("stat", {})
        ip = float(s.get("inningsPitched", 0))
        bb = float(s.get("baseOnBalls", 0))
        k = float(s.get("strikeOuts", 0))
        hr = float(s.get("homeRuns", 0))
        w = int(s.get("wins", 0))
        l = int(s.get("losses", 0))
        gs = int(s.get("gamesStarted", 0))
        return {
            "era": float(s.get("era", 0)) if s.get("era") else None,
            "whip": float(s.get("whip", 0)) if s.get("whip") else None,
            "k_per_9": round(k / ip * 9, 2) if ip > 0 else None,
            "bb_per_9": round(bb / ip * 9, 2) if ip > 0 else None,
            "hr_per_9": round(hr / ip * 9, 2) if ip > 0 else None,
            "ip": ip, "wins": w, "losses": l, "games_started": gs,
        }
    except (IndexError, KeyError, ValueError):
        return {}


def get_team_7day_bullpen(team_id, season, end_date):
    """Rough 7-day bullpen rolling ERA/WHIP/K9."""
    if not team_id: return {}
    start_dt = (pd.Timestamp(end_date) - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    payload = mlb_get("/schedule", {"sportId": 1, "teamId": team_id,
                                     "startDate": start_dt, "endDate": end_date,
                                     "hydrate": "boxscore"})
    bp = {"ip": 0.0, "er": 0.0, "bb": 0.0, "k": 0.0, "hr": 0.0, "hits": 0.0}
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("codedGameState") not in ("F", "O"): continue
            box = mlb_get(f"/game/{g['gamePk']}/boxscore") or {}
            for side in ("home", "away"):
                team = box.get("teams", {}).get(side, {})
                if team.get("team", {}).get("id") != team_id: continue
                # Aggregate relievers (non-starters)
                starter_id = None
                for bat in team.get("battingOrder", []) or []:
                    pass  # not needed
                pitchers = team.get("pitchers", [])  # order pitched
                if not pitchers: continue
                starter_id = pitchers[0]
                for pid in pitchers[1:]:
                    stat = team.get("players", {}).get(f"ID{pid}", {})\
                        .get("stats", {}).get("pitching", {})
                    try:
                        bp["ip"] += float(stat.get("inningsPitched", 0))
                        bp["er"] += float(stat.get("earnedRuns", 0))
                        bp["bb"] += float(stat.get("baseOnBalls", 0))
                        bp["k"] += float(stat.get("strikeOuts", 0))
                        bp["hr"] += float(stat.get("homeRuns", 0))
                        bp["hits"] += float(stat.get("hits", 0))
                    except (ValueError, TypeError):
                        continue
            time.sleep(0.05)
    if bp["ip"] < 1:
        return {}
    return {
        "bp_era_7d": round(bp["er"] / bp["ip"] * 9, 2),
        "bp_whip_7d": round((bp["bb"] + bp["hits"]) / bp["ip"], 2),
        "bp_k_per_9_7d": round(bp["k"] / bp["ip"] * 9, 2),
        "bp_bb_per_9_7d": round(bp["bb"] / bp["ip"] * 9, 2),
        "bp_hr_per_9_7d": round(bp["hr"] / bp["ip"] * 9, 2),
        "bp_ip_7d": round(bp["ip"], 1),
    }


def get_team_recent_form(team_id, season, end_date, n=30):
    """Last N games: win pct, run diff, runs for/against rolling."""
    if not team_id: return {}
    start_dt = (pd.Timestamp(end_date) - pd.Timedelta(days=n)).strftime("%Y-%m-%d")
    payload = mlb_get("/schedule", {"sportId": 1, "teamId": team_id,
                                     "startDate": start_dt, "endDate": end_date})
    wins, losses, rf, ra, games = 0, 0, 0, 0, 0
    rf7, ra7, games7 = 0, 0, 0
    cutoff_7 = pd.Timestamp(end_date, tz="UTC") - pd.Timedelta(days=7)
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("codedGameState") not in ("F", "O"): continue
            home = g["teams"]["home"]; away = g["teams"]["away"]
            if home["team"].get("id") == team_id:
                tr = home.get("score", 0); opp = away.get("score", 0)
            elif away["team"].get("id") == team_id:
                tr = away.get("score", 0); opp = home.get("score", 0)
            else:
                continue
            wins += int(tr > opp); losses += int(tr < opp)
            rf += tr; ra += opp; games += 1
            try:
                game_dt = pd.Timestamp(g.get("gameDate"))
                if game_dt.tz is None:
                    game_dt = game_dt.tz_localize("UTC")
                else:
                    game_dt = game_dt.tz_convert("UTC")
                if game_dt >= cutoff_7:
                    rf7 += tr; ra7 += opp; games7 += 1
            except Exception:
                pass
    if games == 0: return {}
    return {
        "winpct_l10": round(wins / games, 3) if games >= 3 else None,
        "run_diff_l10": round((rf - ra) / games, 2) if games >= 3 else None,
        "runs_for_l30": round(rf / games, 2),
        "runs_against_l30": round(ra / games, 2),
        "runs_for_l7": round(rf7 / games7, 2) if games7 >= 3 else None,
        "runs_against_l7": round(ra7 / games7, 2) if games7 >= 3 else None,
    }


# Weather for today (forecast endpoint - different from archive)
def get_game_weather(sgo_team_id, game_date, game_hour_utc):
    """Forecast weather at game time for home stadium."""
    stadium = STADIUMS.get(sgo_team_id)
    if not stadium: return {}
    roof = stadium.get("roof")
    if roof == "dome":
        return {"wx_roof": "dome", "wx_is_indoor": 1}

    try:
        r = requests.get(OPEN_METEO, params={
            "latitude": stadium["lat"], "longitude": stadium["lon"],
            "start_date": game_date, "end_date": game_date,
            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,"
                      "wind_direction_10m,precipitation,cloud_cover",
            "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
        }, timeout=15)
        r.raise_for_status()
        h = r.json().get("hourly", {})
        times = h.get("time", [])
        # Match game hour
        idx = None
        for i, t in enumerate(times):
            try:
                if int(t[11:13]) == game_hour_utc: idx = i; break
            except (ValueError, IndexError): continue
        if idx is None: return {}

        def safe(arr, i, default=None):
            try: return arr[i] if arr else default
            except IndexError: return default

        temp = safe(h.get("temperature_2m"), idx)
        wind_sp = safe(h.get("wind_speed_10m"), idx)
        wind_dir = safe(h.get("wind_direction_10m"), idx)
        humid = safe(h.get("relative_humidity_2m"), idx)
        precip = safe(h.get("precipitation"), idx)
        cloud = safe(h.get("cloud_cover"), idx)

        # wind out toward CF
        cf_bearing = stadium.get("cf_bearing")
        wind_out = None
        if cf_bearing is not None and wind_sp is not None and wind_dir is not None and roof is False:
            from_home = (cf_bearing + 180) % 360
            diff = abs(wind_dir - from_home)
            if diff > 180: diff = 360 - diff
            wind_out = round(wind_sp * math.cos(math.radians(diff)), 2)

        return {
            "wx_roof": str(roof),
            "wx_temp_f": temp, "wx_humidity": humid,
            "wx_wind_mph": wind_sp, "wx_wind_dir": wind_dir,
            "wx_wind_out": wind_out, "wx_precip": precip,
            "wx_cloud_cover": cloud, "wx_is_indoor": 0,
        }
    except Exception as e:
        log.warning("weather %s: %s", sgo_team_id, e)
        return {}


# ── Feature construction (mirrors build_features.py) ────────────────────────

def american_to_implied_prob(odds):
    if odds is None or pd.isna(odds): return np.nan
    odds = float(odds)
    if odds < 0: return -odds / (-odds + 100)
    return 100 / (odds + 100)


# ── Live lineups + cached arsenal/hitter splits ─────────────────────────────

def load_cached_lookups():
    """Load arsenal + hitter_splits parquets as in-memory lookups."""
    arsenal_lookup = {}  # (pitcher_id, season) -> arsenal dict
    hitter_lookup = {}   # (batter_id, season) -> splits dict

    for year in (2024, 2025, 2026):
        ap = DATA_DIR / f"pitcher_arsenal_{year}.parquet"
        if ap.exists():
            df = pd.read_parquet(ap)
            for _, r in df.iterrows():
                key = (int(r["pitcher_id"]), int(r["season"]))
                arsenal_lookup[key] = {
                    "fastball_pct": r.get("arsenal_fastball_pct"),
                    "breaking_pct": r.get("arsenal_breaking_pct"),
                    "offspeed_pct": r.get("arsenal_offspeed_pct"),
                    "fb_velo": r.get("arsenal_fb_velo"),
                    "fb_whiff": r.get("arsenal_fb_whiff"),
                    "breaking_whiff": r.get("arsenal_breaking_whiff"),
                    "overall_xwoba": r.get("arsenal_overall_xwoba"),
                }

        hp = DATA_DIR / f"hitter_pitch_splits_{year}.parquet"
        if hp.exists():
            df = pd.read_parquet(hp)
            for _, r in df.iterrows():
                key = (int(r["batter_id"]), int(r["season"]))
                hitter_lookup[key] = {
                    "vs_fb_woba": r.get("vs_fastball_woba"),
                    "vs_br_woba": r.get("vs_breaking_woba"),
                    "vs_os_woba": r.get("vs_offspeed_woba"),
                    "pitches_seen": r.get("total_pitches_seen", 0),
                }

    log.info("loaded cache: %s arsenals, %s hitters",
             len(arsenal_lookup), len(hitter_lookup))
    return arsenal_lookup, hitter_lookup


def get_todays_lineup(game_pk, side):
    """Returns list of batter IDs for one team from the boxscore.
    Falls back to empty list if not yet confirmed."""
    payload = mlb_get(f"/game/{game_pk}/boxscore")
    if not payload: return []
    team = payload.get("teams", {}).get(side, {})
    # battingOrder is the confirmed lineup
    order = team.get("battingOrder", [])
    if order:
        # order is list of "ID123456" strings or ints
        return [int(str(x).replace("ID", "")) for x in order[:9]]
    # Fallback: use batters list
    batters = team.get("batters", [])
    return [int(b) for b in batters[:9]]


def get_batter_season_stats(batter_id, season):
    """OPS + handedness + L/R splits for one batter."""
    if not batter_id: return {}
    try:
        payload = mlb_get(f"/people/{batter_id}/stats",
                          {"stats": "season", "group": "hitting", "season": season})
        splits = payload.get("stats", [{}])[0].get("splits", [])
        if not splits: return {}
        s = splits[0].get("stat", {})
        return {
            "ops": float(s.get("ops", 0)) if s.get("ops") else None,
            "obp": float(s.get("obp", 0)) if s.get("obp") else None,
            "slg": float(s.get("slg", 0)) if s.get("slg") else None,
            "pa": int(s.get("plateAppearances", 0)),
        }
    except Exception:
        return {}


def compute_lineup_features(batter_ids, season):
    """Aggregate OPS etc across 9 starters. Skips early-season bench guys."""
    if not batter_ids: return {}
    ops_vals, obp_vals, slg_vals = [], [], []
    for bid in batter_ids:
        s = get_batter_season_stats(bid, season)
        # Early season: accept any qualified batter with at least 5 PAs
        if s.get("pa", 0) >= 5 and s.get("ops"):
            ops_vals.append(s["ops"])
            if s.get("obp"): obp_vals.append(s["obp"])
            if s.get("slg"): slg_vals.append(s["slg"])
        time.sleep(0.03)
    # Also try previous season as fallback if still no data
    if not ops_vals:
        for bid in batter_ids:
            s = get_batter_season_stats(bid, season - 1)
            if s.get("pa", 0) >= 50 and s.get("ops"):
                ops_vals.append(s["ops"])
                if s.get("obp"): obp_vals.append(s["obp"])
                if s.get("slg"): slg_vals.append(s["slg"])
            time.sleep(0.03)
    if not ops_vals: return {}
    return {
        "lineup_avg_ops": sum(ops_vals) / len(ops_vals),
        "lineup_avg_obp": sum(obp_vals) / len(obp_vals) if obp_vals else None,
        "lineup_avg_slg": sum(slg_vals) / len(slg_vals) if slg_vals else None,
        "top3_avg_ops": sum(sorted(ops_vals, reverse=True)[:3]) / min(3, len(ops_vals)),
        "n_qualified": len(ops_vals),
    }


def compute_arsenal_match(batter_ids, pitcher_arsenal, hitter_lookup, season):
    """The killer feature: weighted wOBA against pitcher's pitch mix."""
    if not batter_ids or not pitcher_arsenal: return None
    p_fb = pitcher_arsenal.get("fastball_pct") or 0
    p_br = pitcher_arsenal.get("breaking_pct") or 0
    p_os = pitcher_arsenal.get("offspeed_pct") or 0
    total = p_fb + p_br + p_os
    if total <= 0: return None
    w_fb, w_br, w_os = p_fb / total, p_br / total, p_os / total

    vals = []
    for bid in batter_ids:
        s = hitter_lookup.get((bid, season)) or hitter_lookup.get((bid, season - 1))
        if not s or s.get("pitches_seen", 0) < 200: continue
        if None in (s.get("vs_fb_woba"), s.get("vs_br_woba"), s.get("vs_os_woba")): continue
        vals.append(w_fb * s["vs_fb_woba"] + w_br * s["vs_br_woba"] + w_os * s["vs_os_woba"])
    return sum(vals) / len(vals) if vals else None


def build_features_for_game(g, season, today, full_feature_list,
                             arsenal_lookup=None, hitter_lookup=None):
    """Returns a single-row dict of ALL features the model expects."""
    home_sgo = g["home_sgo"]
    away_sgo = g["away_sgo"]

    # Pitchers
    hp = get_pitcher_season_stats(g["home_starter_id"], season)
    ap = get_pitcher_season_stats(g["away_starter_id"], season)

    # Bullpens
    hbp = get_team_7day_bullpen(g["home_team_id"], season, today)
    abp = get_team_7day_bullpen(g["away_team_id"], season, today)

    # Form
    hf = get_team_recent_form(g["home_team_id"], season, today)
    af = get_team_recent_form(g["away_team_id"], season, today)

    # Weather
    try:
        game_dt = pd.Timestamp(g["game_date"])
        game_hour_utc = game_dt.hour
    except Exception:
        game_hour_utc = 23
    wx = get_game_weather(home_sgo, today, game_hour_utc)

    # Park
    park_factor = PARK_FACTORS_BY_TEAM.get(home_sgo, 100)

    # Lineups (live)
    home_batter_ids = get_todays_lineup(g["game_pk"], "home")
    away_batter_ids = get_todays_lineup(g["game_pk"], "away")
    home_lineup = compute_lineup_features(home_batter_ids, season) if home_batter_ids else {}
    away_lineup = compute_lineup_features(away_batter_ids, season) if away_batter_ids else {}

    # Arsenal (from cache, with previous-season fallback)
    home_arsenal = None
    away_arsenal = None
    if arsenal_lookup:
        home_arsenal = arsenal_lookup.get((g["home_starter_id"], season)) if g.get("home_starter_id") else None
        if not home_arsenal and g.get("home_starter_id"):
            home_arsenal = arsenal_lookup.get((g["home_starter_id"], season - 1))
        away_arsenal = arsenal_lookup.get((g["away_starter_id"], season)) if g.get("away_starter_id") else None
        if not away_arsenal and g.get("away_starter_id"):
            away_arsenal = arsenal_lookup.get((g["away_starter_id"], season - 1))

    # Arsenal match (killer feature)
    home_match_woba = None
    away_match_woba = None
    if hitter_lookup and away_arsenal and home_batter_ids:
        # Home lineup faces AWAY pitcher's arsenal
        home_match_woba = compute_arsenal_match(home_batter_ids, away_arsenal, hitter_lookup, season)
    if hitter_lookup and home_arsenal and away_batter_ids:
        # Away lineup faces HOME pitcher's arsenal
        away_match_woba = compute_arsenal_match(away_batter_ids, home_arsenal, hitter_lookup, season)

    # Build feature row
    row = {}

    # Pitcher features
    row["home_p_era"] = hp.get("era"); row["away_p_era"] = ap.get("era")
    row["home_p_whip"] = hp.get("whip"); row["away_p_whip"] = ap.get("whip")
    row["home_p_k_per_9"] = hp.get("k_per_9"); row["away_p_k_per_9"] = ap.get("k_per_9")
    row["home_p_bb_per_9"] = hp.get("bb_per_9"); row["away_p_bb_per_9"] = ap.get("bb_per_9")
    row["home_p_hr_per_9"] = hp.get("hr_per_9"); row["away_p_hr_per_9"] = ap.get("hr_per_9")
    row["home_p_workload"] = hp.get("ip"); row["away_p_workload"] = ap.get("ip")
    row["home_p_experience"] = hp.get("games_started"); row["away_p_experience"] = ap.get("games_started")
    hw, hl = hp.get("wins", 0), hp.get("losses", 0)
    aw, al = ap.get("wins", 0), ap.get("losses", 0)
    row["home_p_winpct"] = hw / (hw + hl) if (hw + hl) > 0 else None
    row["away_p_winpct"] = aw / (aw + al) if (aw + al) > 0 else None
    row["era_edge"] = (row["home_p_era"] - row["away_p_era"]) if row["home_p_era"] and row["away_p_era"] else None
    row["whip_edge"] = (row["home_p_whip"] - row["away_p_whip"]) if row["home_p_whip"] and row["away_p_whip"] else None
    row["k9_edge"] = (row["home_p_k_per_9"] - row["away_p_k_per_9"]) if row["home_p_k_per_9"] and row["away_p_k_per_9"] else None
    row["bb9_edge"] = (row["home_p_bb_per_9"] - row["away_p_bb_per_9"]) if row["home_p_bb_per_9"] and row["away_p_bb_per_9"] else None
    row["hr9_edge"] = (row["home_p_hr_per_9"] - row["away_p_hr_per_9"]) if row["home_p_hr_per_9"] and row["away_p_hr_per_9"] else None

    # Bullpen features
    for k, v in hbp.items(): row[f"home_{k}"] = v
    for k, v in abp.items(): row[f"away_{k}"] = v
    if hbp and abp:
        row["bp_era_edge"] = hbp["bp_era_7d"] - abp["bp_era_7d"]
        row["bp_whip_edge"] = hbp["bp_whip_7d"] - abp["bp_whip_7d"]
        row["bp_k9_edge"] = hbp["bp_k_per_9_7d"] - abp["bp_k_per_9_7d"]
        row["home_bp_workload"] = hbp["bp_ip_7d"]
        row["away_bp_workload"] = abp["bp_ip_7d"]
        row["bp_workload_edge"] = hbp["bp_ip_7d"] - abp["bp_ip_7d"]

    # Park
    row["park_factor"] = park_factor
    row["park_pitcher_friendly"] = max(0, 100 - park_factor)

    # Weather
    for k, v in wx.items(): row[k] = v
    # Derived weather
    temp = row.get("wx_temp_f") or 70
    wind_out = row.get("wx_wind_out") or 0
    humid = row.get("wx_humidity") or 50
    row["wx_hr_factor"] = (temp - 70) * 0.01 + wind_out * 0.02 + (50 - humid) * 0.005
    row["wx_has_precip"] = 1 if (row.get("wx_precip") or 0) > 0.01 else 0
    row["wx_is_cold"] = 1 if temp < 50 else 0
    row["wx_is_hot"] = 1 if temp > 90 else 0
    if "wx_is_indoor" not in row: row["wx_is_indoor"] = 0

    # Form
    for k, v in hf.items(): row[f"home_{k}"] = v
    for k, v in af.items(): row[f"away_{k}"] = v
    if hf and af:
        row["winpct_edge"] = (hf.get("winpct_l10") or 0.5) - (af.get("winpct_l10") or 0.5)
        row["run_diff_edge"] = (hf.get("run_diff_l10") or 0) - (af.get("run_diff_l10") or 0)
        row["offense_edge"] = (hf.get("runs_for_l30") or 4.5) - (af.get("runs_for_l30") or 4.5)
        row["defense_edge"] = (af.get("runs_against_l30") or 4.5) - (hf.get("runs_against_l30") or 4.5)
        row["offense_l7_edge"] = (hf.get("runs_for_l7") or 4.5) - (af.get("runs_for_l7") or 4.5)
        row["defense_l7_edge"] = (af.get("runs_against_l7") or 4.5) - (hf.get("runs_against_l7") or 4.5)

    # Situational
    row["month"] = pd.Timestamp(today).month
    row["day_of_week"] = pd.Timestamp(today).dayofweek
    row["is_weekend"] = 1 if row["day_of_week"] in (5, 6) else 0

    # Lineup features
    row["home_lineup_avg_ops"] = home_lineup.get("lineup_avg_ops")
    row["away_lineup_avg_ops"] = away_lineup.get("lineup_avg_ops")
    row["home_lineup_avg_obp"] = home_lineup.get("lineup_avg_obp")
    row["away_lineup_avg_obp"] = away_lineup.get("lineup_avg_obp")
    row["home_lineup_avg_slg"] = home_lineup.get("lineup_avg_slg")
    row["away_lineup_avg_slg"] = away_lineup.get("lineup_avg_slg")
    row["home_top3_avg_ops"] = home_lineup.get("top3_avg_ops")
    row["away_top3_avg_ops"] = away_lineup.get("top3_avg_ops")
    if home_lineup.get("lineup_avg_ops") and away_lineup.get("lineup_avg_ops"):
        row["lineup_ops_edge"] = home_lineup["lineup_avg_ops"] - away_lineup["lineup_avg_ops"]
    if home_lineup.get("top3_avg_ops") and away_lineup.get("top3_avg_ops"):
        row["lineup_top3_edge"] = home_lineup["top3_avg_ops"] - away_lineup["top3_avg_ops"]

    # Arsenal features
    if home_arsenal:
        row["home_arsenal_fastball_pct"] = home_arsenal.get("fastball_pct")
        row["home_arsenal_breaking_pct"] = home_arsenal.get("breaking_pct")
        row["home_arsenal_offspeed_pct"] = home_arsenal.get("offspeed_pct")
        row["home_arsenal_fb_velo"] = home_arsenal.get("fb_velo")
        row["home_arsenal_overall_xwoba"] = home_arsenal.get("overall_xwoba")
    if away_arsenal:
        row["away_arsenal_fastball_pct"] = away_arsenal.get("fastball_pct")
        row["away_arsenal_breaking_pct"] = away_arsenal.get("breaking_pct")
        row["away_arsenal_offspeed_pct"] = away_arsenal.get("offspeed_pct")
        row["away_arsenal_fb_velo"] = away_arsenal.get("fb_velo")
        row["away_arsenal_overall_xwoba"] = away_arsenal.get("overall_xwoba")
    if home_arsenal and away_arsenal:
        if home_arsenal.get("overall_xwoba") and away_arsenal.get("overall_xwoba"):
            row["arsenal_overall_xwoba_edge"] = away_arsenal["overall_xwoba"] - home_arsenal["overall_xwoba"]
        if home_arsenal.get("fb_velo") and away_arsenal.get("fb_velo"):
            row["arsenal_fb_velo_edge"] = home_arsenal["fb_velo"] - away_arsenal["fb_velo"]

    # THE KILLER FEATURE: arsenal match
    row["home_arsenal_match_woba"] = home_match_woba
    row["away_arsenal_match_woba"] = away_match_woba
    if home_match_woba is not None and away_match_woba is not None:
        row["arsenal_match_edge"] = home_match_woba - away_match_woba

    # ── Interaction features (mirrors build_features.add_interaction_features) ──
    era_edge = row.get("era_edge")
    if era_edge is not None:
        abs_era = abs(era_edge)
        row["pitcher_parity"] = math.exp(-abs_era / 0.8)
        row["pitcher_dominance"] = max(0, min(1, 1 - row["pitcher_parity"]))
        row["era_edge_x_dominance"] = era_edge * row["pitcher_dominance"]
    else:
        row["pitcher_parity"] = 0.5
        row["pitcher_dominance"] = 0.5
        row["era_edge_x_dominance"] = 0

    home_era = row.get("home_p_era") or 4.5
    away_era = row.get("away_p_era") or 4.5
    home_ace = 1 if home_era < 3.00 else 0
    away_ace = 1 if away_era < 3.00 else 0
    home_tank = 1 if home_era > 5.00 else 0
    away_tank = 1 if away_era > 5.00 else 0
    row["has_ace_pitcher"] = home_ace or away_ace
    row["has_tank_pitcher"] = home_tank or away_tank
    row["ace_vs_tank"] = (home_ace and away_tank) or (away_ace and home_tank)
    row["ace_vs_tank"] = int(row["ace_vs_tank"])

    parity = row["pitcher_parity"]
    if row.get("lineup_ops_edge") is not None:
        row["lineup_x_parity"] = row["lineup_ops_edge"] * parity
    if row.get("lineup_recent_edge") is not None:
        row["lineup_recent_x_parity"] = row["lineup_recent_edge"] * parity
    if row.get("arsenal_match_edge") is not None:
        row["arsenal_match_x_parity"] = row["arsenal_match_edge"] * parity
    if row.get("bp_era_edge") is not None:
        row["bp_x_parity"] = row["bp_era_edge"] * parity

    # Ensure ALL features model expects are present (fill missing with NaN -> imputer)
    for feat in full_feature_list:
        if feat not in row: row[feat] = None

    return row


# ── Model loading + prediction ──────────────────────────────────────────────

def load_model_bundle(variant):
    vdir = MODELS_DIR / variant
    if not vdir.exists():
        log.warning("no %s models", variant); return None
    bundle = {}
    for name in ("lgb", "xgb", "rf", "lr", "cat"):
        p = vdir / f"{name}_classifier.pkl"
        if p.exists():
            with open(p, "rb") as f: bundle[name] = pickle.load(f)
    with open(vdir / "stacker.pkl", "rb") as f: bundle["stacker"] = pickle.load(f)
    with open(vdir / "calibrator.pkl", "rb") as f: bundle["calibrator"] = pickle.load(f)
    with open(vdir / "feature_list.json") as f: bundle["features"] = json.load(f)
    log.info("loaded %s (%s base models + stacker + calibrator)",
             variant, len([k for k in bundle if k in ("lgb","xgb","rf","lr","cat")]))
    return bundle


def predict_one(bundle, row):
    feats = bundle["features"]
    X = pd.DataFrame([{f: row.get(f) for f in feats}])
    # Force all columns to numeric float — LightGBM rejects 'object' dtype
    for col in X.columns:
        X[col] = pd.to_numeric(X[col], errors="coerce")
    base_preds = {}
    for name in ("lgb", "xgb", "rf", "lr", "cat"):
        if name not in bundle: continue
        try:
            base_preds[name] = bundle[name].predict_proba(X)[:, 1][0]
        except Exception as e:
            log.warning("base model %s failed: %s", name, e); return None
    base_df = pd.DataFrame([base_preds])
    stacked = bundle["stacker"].predict_proba(base_df)[:, 1][0]
    calibrated = bundle["calibrator"].predict([stacked])[0]
    return float(calibrated), {k: float(v) for k, v in base_preds.items()}


def prob_to_confidence(prob):
    edge = abs(prob - 0.5)
    if edge >= 0.15: return "HIGH"
    if edge >= 0.05: return "MODERATE"
    return "LOW"


def american_to_decimal(am):
    """American odds -> decimal (payout multiplier)."""
    if am is None or pd.isna(am): return None
    am = float(am)
    if am < 0: return 1 + 100 / abs(am)
    return 1 + am / 100


def kelly_units(model_prob, american_odds, max_fraction=0.25, unit_scale=20):
    """
    Quarter Kelly bet sizing returned as units (0-5 scale).

    Kelly formula: k = (b*p - q) / b
      where b = decimal_odds - 1, p = our prob, q = 1 - p

    We cap at max_fraction (0.25 = quarter Kelly) and scale to units.
    unit_scale=20 means 1 unit = 5% of bankroll, so max bet = 5 units.
    """
    decimal_odds = american_to_decimal(american_odds)
    if decimal_odds is None or decimal_odds <= 1: return 0.0
    if model_prob is None or pd.isna(model_prob): return 0.0

    b = decimal_odds - 1
    p = model_prob
    q = 1 - p
    full_kelly = (b * p - q) / b
    if full_kelly <= 0: return 0.0  # no edge, don't bet

    fraction = min(full_kelly, max_fraction)
    units = round(fraction * unit_scale, 1)
    return units


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    game_date = args.date
    dry_run = args.dry_run
    season = int(game_date[:4])

    log.info("=" * 60)
    log.info("OTJ MLB Predictions — %s %s", game_date, "(DRY RUN)" if dry_run else "")
    log.info("=" * 60)

    if not dry_run and not SUPABASE_KEY:
        log.error("SUPABASE_SERVICE_KEY not set"); sys.exit(1)

    supabase = None if dry_run else create_client(SUPABASE_URL, SUPABASE_KEY)

    # Step 1: Today's games
    games = get_todays_games(game_date)
    if not games:
        log.info("no games today"); return

    # Step 2: Load models
    full_wl = load_model_bundle("full_with_line")
    full_nl = load_model_bundle("full_no_line")
    f5_nl = load_model_bundle("f5_no_line")

    if not full_nl:
        log.error("full_no_line models missing — cannot predict"); sys.exit(1)

    full_features = full_nl["features"]  # superset

    # Load cached arsenal + hitter splits from parquets
    arsenal_lookup, hitter_lookup = load_cached_lookups()

    # Step 3: Predict each game
    predictions = []
    for i, g in enumerate(games):
        log.info("[%s/%s] %s @ %s", i+1, len(games), g["away_abbrev"], g["home_abbrev"])
        try:
            row = build_features_for_game(g, season, game_date, full_features,
                                           arsenal_lookup=arsenal_lookup,
                                           hitter_lookup=hitter_lookup)
        except Exception as e:
            log.warning("  feature build failed: %s", e); continue

        # Run full_no_line always
        full_result = predict_one(full_nl, row)
        if not full_result:
            log.warning("  full_no_line prediction failed"); continue
        full_prob, full_bases = full_result

        # F5 prediction
        f5_result = predict_one(f5_nl, row) if f5_nl else None
        f5_prob = f5_result[0] if f5_result else None

        # Pick/lean
        pick = "HOME" if full_prob >= 0.5 else "AWAY"
        pick_team = g["home_abbrev"] if pick == "HOME" else g["away_abbrev"]
        confidence = prob_to_confidence(full_prob)

        # Run total lean (derived from arsenal/wx/park)
        run_total_lean = None
        hr_factor = row.get("wx_hr_factor") or 0
        if park_factor := row.get("park_factor"):
            park_score = (park_factor - 100) / 14  # -1 to +1 roughly
            total_score = hr_factor + park_score
            if total_score > 0.08: run_total_lean = "OVER"
            elif total_score < -0.08: run_total_lean = "UNDER"

        # Build signals
        signals = []
        if full_prob >= 0.5:
            pct = round(full_prob * 100, 1)
            signals.append({"type": "ML", "detail": f"Model gives {g['home_abbrev']} {pct}% to win"})
        else:
            pct = round((1 - full_prob) * 100, 1)
            signals.append({"type": "ML", "detail": f"Model gives {g['away_abbrev']} {pct}% to win"})

        if f5_prob is not None:
            f5_pct = round(max(f5_prob, 1 - f5_prob) * 100, 1)
            f5_pick = g["home_abbrev"] if f5_prob >= 0.5 else g["away_abbrev"]
            signals.append({"type": "F5", "detail": f"First 5: {f5_pick} {f5_pct}%"})

        # Top fundamental signal
        era_edge = row.get("era_edge")
        if era_edge is not None and abs(era_edge) > 0.5:
            favored = g["home_abbrev"] if era_edge < 0 else g["away_abbrev"]
            signals.append({"type": "Pitcher", "detail": f"{favored} has {abs(era_edge):.2f} ERA edge on starter matchup"})
        bp_edge = row.get("bp_era_edge")
        if bp_edge is not None and abs(bp_edge) > 1.0:
            favored = g["home_abbrev"] if bp_edge < 0 else g["away_abbrev"]
            signals.append({"type": "Bullpen", "detail": f"{favored} bullpen is sharper (7d ERA gap {abs(bp_edge):.2f})"})
        if run_total_lean:
            signals.append({"type": "Total", "detail": f"Conditions + park lean {run_total_lean}"})

        edge = {
            "lean": pick,
            "confidence": confidence,
            "signals": signals[:5],
            "scores": {
                "full_ml_home_prob": round(full_prob, 4),
                "full_ml_away_prob": round(1 - full_prob, 4),
                "f5_ml_home_prob": round(f5_prob, 4) if f5_prob else None,
                "f5_ml_away_prob": round(1 - f5_prob, 4) if f5_prob else None,
                "run_total_lean": run_total_lean,
                "base_model_probs": full_bases,
                "model_version": "v5_ensemble",
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        predictions.append({
            "matchup": g["matchup"],
            "game_pk": g["game_pk"],
            "pick": pick_team,
            "edge": edge,
        })

        pick_prob_pct = (full_prob if pick == "HOME" else (1 - full_prob)) * 100
        f5_pct_log = (max(f5_prob, 1 - f5_prob) * 100) if f5_prob else None

        log.info("  → %s %s (%.1f%%) | F5: %s | Total: %s",
                 pick_team, confidence, pick_prob_pct,
                 f"{f5_pct_log:.1f}%" if f5_pct_log else "N/A",
                 run_total_lean or "—")

    if not predictions:
        log.warning("no predictions generated"); return

    log.info("=" * 60)
    log.info("Generated %s predictions", len(predictions))

    # Step 4: Find today's slate_id
    if dry_run:
        log.info("DRY RUN — not writing to Supabase")
        for p in predictions:
            log.info("  %s: %s", p["matchup"], json.dumps(p["edge"], default=str)[:200])
        return

    slate_resp = supabase.table("slates").select("id").eq("sport", "mlb")\
        .eq("date", game_date).execute()
    if not slate_resp.data:
        log.error("no slate row for %s mlb — push slate first, then re-run predictor", game_date)
        log.info("predictions were generated but not saved. dump:")
        for p in predictions:
            log.info("  %s: %s pick, %s%% confidence",
                     p["matchup"], p["pick"],
                     round(max(p["edge"]["scores"].get("full_ml_home_prob", 0),
                               p["edge"]["scores"].get("full_ml_away_prob", 0)) * 100, 1))
        return
    slate_id = slate_resp.data[0]["id"]
    log.info("slate_id: %s", slate_id)

    # Fetch current odds for all games in this slate so we can compute Kelly
    games_resp = supabase.table("games").select("matchup, ml_home, ml_away")\
        .eq("slate_id", slate_id).execute()
    odds_by_matchup = {r["matchup"]: {"ml_home": r.get("ml_home"), "ml_away": r.get("ml_away")}
                       for r in (games_resp.data or [])}
    log.info("loaded odds for %s games", len(odds_by_matchup))

    # Step 5: Upsert predictions to games table
    now_iso = datetime.now(timezone.utc).isoformat()
    updated = 0
    for pred in predictions:
        # Compute Kelly for this game if odds are available
        odds_row = odds_by_matchup.get(pred["matchup"], {})
        ml_home = odds_row.get("ml_home")
        ml_away = odds_row.get("ml_away")
        home_prob = pred["edge"]["scores"].get("full_ml_home_prob")
        away_prob = pred["edge"]["scores"].get("full_ml_away_prob")

        lean = pred["edge"]["lean"]
        if lean == "HOME":
            kelly_u = kelly_units(home_prob, ml_home) if ml_home is not None else 0.0
            vegas_implied = 1.0 / american_to_decimal(ml_home) if ml_home else None
        elif lean == "AWAY":
            kelly_u = kelly_units(away_prob, ml_away) if ml_away is not None else 0.0
            vegas_implied = 1.0 / american_to_decimal(ml_away) if ml_away else None
        else:
            kelly_u = 0.0
            vegas_implied = None

        # Add Kelly fields to the scores
        pred["edge"]["scores"]["kelly_units"] = kelly_u
        pred["edge"]["scores"]["kelly_fraction"] = "quarter"
        if vegas_implied is not None:
            pred["edge"]["scores"]["vegas_implied_prob"] = round(vegas_implied, 4)
            model_prob = home_prob if lean == "HOME" else away_prob
            if model_prob:
                pred["edge"]["scores"]["model_edge"] = round(model_prob - vegas_implied, 4)

        try:
            supabase.table("games").update({
                "lean": pred["edge"]["lean"],
                "confidence": pred["edge"]["confidence"],
                "signals": pred["edge"]["signals"],
                "scores": pred["edge"]["scores"],
                "prediction_updated_at": now_iso,
            }).eq("slate_id", slate_id).eq("matchup", pred["matchup"]).execute()
            updated += 1
            kelly_str = f"{kelly_u}u" if kelly_u > 0 else "no bet"
            log.info("  ✅ %s updated (Kelly: %s)", pred["matchup"], kelly_str)
        except Exception as e:
            log.warning("  ❌ %s update failed: %s", pred["matchup"], e)

    log.info("=" * 60)
    log.info("DONE — %s/%s games updated with predictions", updated, len(predictions))


if __name__ == "__main__":
    main()
