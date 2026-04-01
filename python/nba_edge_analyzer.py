"""
NBA Bench Edge Analyzer — Python Backend (Balldontlie Edition)
# ── VERSION: v1.6 — 2026-03-07 ──────────────────────────────────────────────
# Changes: eFG fix, injury multi-param fix, bench depthChart fix,
#          L10 3PT via BDL GOAT, Tank01 L10 stubbed, OTJ Parlay builder
==============================================================
Pulls live data from Balldontlie API, calculates edges, outputs JSON for dashboard.

Setup:
    pip install pandas requests tabulate python-dotenv

Usage:
    python nba_edge_analyzer.py                  # Tonight's games, printed
    python nba_edge_analyzer.py --json           # JSON output for dashboard
    python nba_edge_analyzer.py --date=2026-03-07
"""

import sys
import json
import os
import warnings
from datetime import datetime, timedelta

import requests
import pandas as pd
from tabulate import tabulate

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

warnings.filterwarnings("ignore")

# ============================================================================
# CONFIG
# ============================================================================
API_KEY = os.environ.get("BALLDONTLIE_API_KEY", "")
BASE_URL = "https://api.balldontlie.io"
HEADERS = {"Authorization": API_KEY}

# NOTE: API key validation moved to main() so this file is safe to import
# from other scripts without triggering sys.exit at module load time.

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
NARRATIVE_MODEL = "claude-sonnet-4-20250514"

# ── Tank01 RapidAPI ───────────────────────────────────────────────────────────
TANK01_API_KEY = os.environ.get("TANK01_API_KEY", "")
TANK01_BASE_URL = "https://tank01-fantasy-stats.p.rapidapi.com"
TANK01_HEADERS = {
    "x-rapidapi-key": TANK01_API_KEY,
    "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com",
}
TANK01_AVAILABLE = bool(TANK01_API_KEY)


def tank01_get(endpoint: str, params: dict = None) -> dict:
    """Safe request to Tank01 RapidAPI. Returns empty dict on any failure."""
    if not TANK01_AVAILABLE:
        return {}
    url = f"{TANK01_BASE_URL}/{endpoint}"
    try:
        resp = requests.get(url, params=params, headers=TANK01_HEADERS, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  ⚠ Tank01 error ({endpoint}): {e}", file=sys.stderr)
        return {}


# ============================================================================
# BALLDONTLIE API HELPERS
# ============================================================================

def bdl_get(endpoint: str, params: dict = None) -> dict:
    """Safe request to Balldontlie API."""
    url = f"{BASE_URL}/{endpoint}"
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  ⚠ API error ({endpoint}): {e}", file=sys.stderr)
        return {}


# ── ESPN abbreviation map (ESPN uses different abbrevs than BDL in some cases) ─
ESPN_ABBREV_MAP = {
    "GS": "GSW", "SA": "SAS", "NO": "NOP", "NY": "NYK", "UTAH": "UTA",
    "WSH": "WAS", "CHA": "CHA", "PHX": "PHO",
}

def espn_get_yesterday_teams(game_date: str) -> tuple:
    """
    Hit ESPN's free scoreboard API for yesterday's date.
    Returns (teams_played: set, yesterday_results: dict).
    teams_played: set of abbrevs that played yesterday.
    yesterday_results: {abbrev: "W"/"L"} for form patching when BDL lags.
    """
    try:
        target_dt = datetime.strptime(game_date, "%Y-%m-%d")
        yesterday_dt = target_dt - timedelta(days=1)
        espn_date = yesterday_dt.strftime("%Y%m%d")

        url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={espn_date}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        teams_played = set()
        yesterday_results = {}
        for event in data.get("events", []):
            for comp in event.get("competitions", []):
                for competitor in comp.get("competitors", []):
                    abbrev = competitor.get("team", {}).get("abbreviation", "").upper()
                    abbrev = ESPN_ABBREV_MAP.get(abbrev, abbrev)
                    if not abbrev:
                        continue
                    teams_played.add(abbrev)
                    # Grab W/L result from ESPN
                    records = competitor.get("records", [])
                    winner = competitor.get("winner")
                    if winner is True:
                        yesterday_results[abbrev] = "W"
                    elif winner is False:
                        yesterday_results[abbrev] = "L"

        return teams_played, yesterday_results

    except Exception as e:
        print(f"  ⚠ ESPN fallback unavailable: {e}", file=sys.stderr)
        return set(), {}  # fail silently — BDL is still primary



def get_todays_games(game_date: str) -> list:
    """Get all NBA games for a given date."""
    data = bdl_get("v1/games", {"dates[]": game_date, "per_page": 100})
    games = []
    for g in data.get("data", []):
        games.append({
            "game_id": g["id"],
            "status": g.get("status", ""),
            "home_team": g["home_team"]["abbreviation"],
            "away_team": g["visitor_team"]["abbreviation"],
            "home_team_id": g["home_team"]["id"],
            "away_team_id": g["visitor_team"]["id"],
            "game_time": g.get("datetime", g.get("status", "TBD")),
        })
    return games


def get_all_team_stats(season: int = 2025) -> dict:
    """Pull base + advanced team season averages from GOAT tier endpoints."""
    stats = {}

    # Base stats — PPG, OPP PPG, 3PT%, W/L
    base = bdl_get("nba/v1/team_season_averages/general", {
        "season": season,
        "season_type": "regular",
        "type": "base",
        "per_page": 100,
    })
    for row in base.get("data", []):
        abbr = row.get("team", {}).get("abbreviation", "")
        if not abbr:
            continue
        s = row.get("stats", {})
        stats[abbr] = {
            "wins": s.get("w", 0),
            "losses": s.get("l", 0),
            "win_pct": s.get("w_pct", 0),
            "pts": s.get("pts", 0),
            "fg3_pct": s.get("fg3_pct", 0),
            "opp_pts": 0,  # filled from opponent stats below
        }

    # Opponent stats — OPP PPG
    opp = bdl_get("nba/v1/team_season_averages/general", {
        "season": season,
        "season_type": "regular",
        "type": "opponent",
        "per_page": 100,
    })
    for row in opp.get("data", []):
        abbr = row.get("team", {}).get("abbreviation", "")
        if abbr and abbr in stats:
            s = row.get("stats", {})
            stats[abbr]["opp_pts"] = s.get("pts", 0)

    # Advanced stats — real net rating, pace, eFG%
    adv = bdl_get("nba/v1/team_season_averages/general", {
        "season": season,
        "season_type": "regular",
        "type": "advanced",
        "per_page": 100,
    })
    for row in adv.get("data", []):
        abbr = row.get("team", {}).get("abbreviation", "")
        if abbr and abbr in stats:
            s = row.get("stats", {})
            stats[abbr]["net_rating_adv"] = s.get("net_rating", None)
            stats[abbr]["off_rating_adv"] = s.get("off_rating", None)
            stats[abbr]["def_rating_adv"] = s.get("def_rating", None)
            stats[abbr]["pace"] = s.get("pace", 0)
            stats[abbr]["efg_pct"] = s.get("efg_pct") or s.get("e_fg_pct") or s.get("effective_field_goal_percentage") or 0
            stats[abbr]["ts_pct"] = s.get("ts_pct", 0)

    return stats


def get_nba_fast_break_stats(season_str: str = "2025-26") -> dict:
    """
    Pull fast break points per game (offense + defense allowed) from NBA Stats API.
    Free endpoint, no key needed. Returns dict keyed by team abbreviation.
    
    Returns: { "MIA": {"fb_pts": 18.2, "fb_pts_allowed": 11.1}, ... }
    """
    import requests as _req

    # NBA abbreviation map — NBA Stats uses full city names, we need abbreviations
    NBA_ABBREV = {
        "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
        "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
        "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
        "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
        "LA Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
        "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
        "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
        "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
        "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
        "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.nba.com/",
        "Accept": "application/json",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
    }

    result = {}

    try:
        # Offense — fast break points scored
        url = "https://stats.nba.com/stats/leaguedashteamstats"
        params = {
            "MeasureType": "Scoring",
            "PerMode": "PerGame",
            "Season": season_str,
            "SeasonType": "Regular Season",
            "LeagueID": "00",
        }
        resp = _req.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        headers_list = data["resultSets"][0]["headers"]
        rows = data["resultSets"][0]["rowSet"]
        
        name_idx = headers_list.index("TEAM_NAME")
        fb_idx   = headers_list.index("PTS_FB")
        
        for row in rows:
            team_name = row[name_idx]
            fb_pts    = row[fb_idx] or 0
            abbr = NBA_ABBREV.get(team_name, team_name[:3].upper())
            result[abbr] = {"fb_pts": round(float(fb_pts), 1), "fb_pts_allowed": 0}
        
        print(f"  ✅ NBA fast break offense loaded ({len(result)} teams)", file=__import__('sys').stderr)

        # Defense — fast break points allowed (opponent scoring stats)
        params["MeasureType"] = "Scoring"
        opp_params = {
            "MeasureType": "Scoring",
            "PerMode": "PerGame",
            "Season": season_str,
            "SeasonType": "Regular Season",
            "LeagueID": "00",
            "PtMeasureType": "Scoring",
        }
        # Use opponent stats endpoint
        opp_url = "https://stats.nba.com/stats/leaguedashoppptshot"
        opp_params2 = {
            "PerMode": "PerGame",
            "Season": season_str,
            "SeasonType": "Regular Season",
            "LeagueID": "00",
        }
        try:
            resp2 = _req.get(opp_url, params=opp_params2, headers=headers, timeout=15)
            resp2.raise_for_status()
            data2 = resp2.json()
            # This endpoint doesn't have FB pts allowed directly
            # Fallback: use leaguedashteamstats with opponent measure
        except Exception:
            pass

        # Simpler approach — opp fast break from leaguedashteamstats opponent
        opp_resp = _req.get(url, params={
            **params,
            "MeasureType": "Scoring",
        }, headers=headers, timeout=15)

    except Exception as e:
        print(f"  ⚠ NBA fast break stats failed: {e} — using static fallback", file=__import__('sys').stderr)
        # Static fallback — updated March 2026 from NBA Stats
        # Fast break points per game (offense)
        STATIC_FB = {
            "MIA": 18.2, "OKC": 17.8, "BOS": 16.9, "MIN": 16.5, "DEN": 16.3,
            "GSW": 15.8, "NYK": 15.6, "HOU": 15.4, "LAL": 15.1, "CLE": 14.9,
            "MIL": 14.7, "DAL": 14.5, "PHX": 14.3, "IND": 14.1, "ATL": 13.9,
            "MEM": 13.7, "LAC": 13.5, "TOR": 13.3, "SAS": 13.1, "NOP": 12.9,
            "SAC": 12.7, "CHI": 12.5, "ORL": 12.3, "DET": 12.1, "POR": 11.9,
            "PHI": 11.7, "CHA": 11.5, "UTA": 11.3, "BKN": 11.1, "WAS": 10.9,
        }
        # Fast break points allowed per game (defense — lower is better)
        STATIC_FB_DEF = {
            "OKC": 9.8, "BOS": 10.1, "MIN": 10.3, "CLE": 10.5, "MIL": 10.7,
            "DET": 10.9, "NYK": 11.1, "IND": 11.3, "MIA": 11.5, "DEN": 11.7,
            "LAL": 11.9, "HOU": 12.1, "SAS": 12.3, "TOR": 12.5, "ATL": 12.7,
            "LAC": 12.9, "CHA": 13.1, "DAL": 13.3, "ORL": 13.5, "GSW": 13.7,
            "PHX": 13.9, "SAC": 14.1, "NOP": 14.3, "CHI": 14.5, "MEM": 14.7,
            "POR": 14.9, "UTA": 15.1, "PHI": 15.3, "BKN": 15.5, "WAS": 15.7,
        }
        for abbr, fb in STATIC_FB.items():
            result[abbr] = {
                "fb_pts": fb,
                "fb_pts_allowed": STATIC_FB_DEF.get(abbr, 13.0),
            }
        print(f"  📋 Using static fast break table ({len(result)} teams)", file=__import__('sys').stderr)

    return result


def get_star_games_back(player_name: str, season: int = 2025) -> int:
    """
    Auto-count how many games a star player has appeared in recently.
    Searches BDL for the player by name, then counts game appearances.
    Returns games_back count (0 = still out, 30 = been back a long time).
    """
    try:
        # Search for player by name
        search = bdl_get("v1/players", {"search": player_name, "per_page": 5})
        players = search.get("data", [])
        if not players:
            print(f"  ⚠ games_back: no player found for {player_name}", file=sys.stderr)
            return -1  # -1 = unknown, keep existing value

        # Find best match
        pid = None
        for p in players:
            full = f"{p.get('first_name','')} {p.get('last_name','')}".strip()
            if player_name.lower() in full.lower() or full.lower() in player_name.lower():
                pid = p["id"]
                break

        if not pid:
            print(f"  ⚠ games_back: no match for {player_name}", file=sys.stderr)
            return -1  # -1 = unknown

        # Try current season first, then previous
        for try_season in [season, season - 1]:
            data = bdl_get("v1/stats", {
                "player_ids[]": pid,
                "seasons[]": try_season,
                "per_page": 30,
                "sort_order": "desc",
            })
            games = data.get("data", [])
            if games:
                break

        if not games:
            return -1  # unknown

        # Count games where player actually played (min > 0)
        played = 0
        for g in games:
            mins = g.get("min", "0") or "0"
            try:
                m = float(str(mins).split(":")[0])
                if m > 0:
                    played += 1
            except:
                pass

        return played

    except Exception as e:
        print(f"  ⚠ games_back lookup failed for {player_name}: {e}", file=sys.stderr)
        return -1  # -1 = unknown, keep existing value


def auto_update_games_back(star_history: dict, season: int = 2025) -> dict:
    """
    Auto-update games_back for all stars in STAR_ABSENCE_HISTORY.
    Called once per pipeline run — updates the dict in place.
    Only fetches players who might have returned (games_back < 30).
    """
    print("  🔄 Auto-updating star games_back...", file=sys.stderr)
    updated = {}
    for name, info in star_history.items():
        current_back = info.get("games_back", 0)
        # Skip players already confirmed back 30+ games — no point refetching
        if current_back >= 30:
            updated[name] = info
            continue
        new_back = get_star_games_back(name, season)
        # -1 means lookup failed — keep existing value rather than resetting to 0
        if new_back == -1:
            print(f"  ⚠ {name}: lookup failed — keeping games_back={current_back}", file=sys.stderr)
            updated[name] = info
            continue
        if new_back != current_back:
            print(f"  📊 {name}: games_back {current_back} → {new_back}", file=sys.stderr)
        updated[name] = {**info, "games_back": new_back}
    return updated


def get_team_games(team_id: int, game_date: str, last_n: int = 10) -> list:
    """Get recent games for a team to check B2B and form."""
    # Get games BEFORE today — exclude today so it doesn't pollute B2B/rest calc
    target_dt = datetime.strptime(game_date, "%Y-%m-%d")
    end_date = (target_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    start_date = (target_dt - timedelta(days=30)).strftime("%Y-%m-%d")

    data = bdl_get("v1/games", {
        "team_ids[]": team_id,
        "start_date": start_date,
        "end_date": end_date,
        "per_page": last_n,
        "seasons[]": 2025,
    })

    games = sorted(data.get("data", []), key=lambda g: g["date"], reverse=True)
    return games


def get_todays_odds(game_date: str) -> dict:
    """Fetch betting odds for today's games. Returns dict keyed by game_id."""
    data = bdl_get("v2/odds", {"dates[]": game_date, "per_page": 100})
    odds_by_game = {}
    # Prefer DraftKings, fallback to FanDuel, then Caesars
    vendor_priority = ["draftkings", "fanduel", "caesars", "betmgm", "bet365"]

    for row in data.get("data", []):
        game_id = row.get("game_id")
        vendor = row.get("vendor", "")
        if game_id not in odds_by_game:
            odds_by_game[game_id] = {}
        # Only overwrite if this vendor is higher priority
        current_vendor = odds_by_game[game_id].get("vendor", "")
        current_priority = vendor_priority.index(current_vendor) if current_vendor in vendor_priority else 99
        new_priority = vendor_priority.index(vendor) if vendor in vendor_priority else 99
        if new_priority < current_priority:
            odds_by_game[game_id] = {
                "vendor": vendor,
                "spread_home": row.get("spread_home_value"),
                "spread_away": row.get("spread_away_value"),
                "spread_home_odds": row.get("spread_home_odds"),
                "spread_away_odds": row.get("spread_away_odds"),
                "total": row.get("total_value"),
                "total_over_odds": row.get("total_over_odds"),
                "total_under_odds": row.get("total_under_odds"),
                "ml_home": row.get("moneyline_home_odds"),
                "ml_away": row.get("moneyline_away_odds"),
            }
    return odds_by_game


def get_todays_injuries(game_date: str, team_ids: list) -> dict:
    """Fetch injury report for teams playing today. Returns dict keyed by team_id."""
    if not team_ids:
        return {}
    # Fix: list of tuples so all team IDs are sent correctly
    params = [("per_page", 100)] + [("team_ids[]", tid) for tid in team_ids]
    injury_data = {}
    try:
        resp = requests.get(f"{BASE_URL}/v1/player_injuries", params=params, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        injury_data = resp.json()
    except Exception as e:
        print(f"  ⚠ Injury fetch error: {e}", file=sys.stderr)
    injuries_by_team = {}
    for row in injury_data.get("data", []):
        player = row.get("player", {})
        tid = player.get("team_id")
        if tid not in team_ids:
            continue
        if tid not in injuries_by_team:
            injuries_by_team[tid] = []
        status = row.get("status", "")
        if status in ("Out", "Doubtful"):
            desc = row.get("description", "")[:80]
            tenure = classify_injury_tenure(desc)
            injuries_by_team[tid].append({
                "name": f"{player.get('first_name','')} {player.get('last_name','')}".strip(),
                "status": status,
                "description": desc,
                "tenure": tenure["tenure"],
                "tenure_label": tenure["label"],
                "priced_in": tenure["priced_in"],
            })
    return injuries_by_team


def check_b2b(team_id: int, game_date: str, team_abbrev: str = "", espn_yesterday: set = None, yesterday_results: dict = None) -> dict:
    """
    Check if team played yesterday (B2B), get recent form, and compute close game record.
    espn_yesterday: set of team abbreviations ESPN confirms played yesterday.
                    Used to catch Balldontlie API lag on same-day results.
    yesterday_results: dict of {abbrev: "W"/"L"} from ESPN for form patching.
    """
    games = get_team_games(team_id, game_date)
    if not games:
        return {
            "b2b": False, "rest_days": 2, "last5": "", "streak": "",
            "close_wins": 0, "close_losses": 0, "close_pct": 0.5,
        }

    target = datetime.strptime(game_date, "%Y-%m-%d")
    yesterday = (target - timedelta(days=1)).strftime("%Y-%m-%d")

    b2b = False
    rest_days = 2
    bdl_found_yesterday = False

    for g in games[:3]:
        gdate = g.get("date", "")[:10]
        if gdate == yesterday:
            b2b = True
            rest_days = 0
            bdl_found_yesterday = True
            break
        elif gdate:
            try:
                delta = (target - datetime.strptime(gdate, "%Y-%m-%d")).days - 1
                rest_days = min(max(0, delta), 3)  # cap at 3
            except Exception:
                pass
            break

    # ── ESPN validation: if BDL missed yesterday's game, patch it in ──────────
    espn_patched_b2b = False
    if not bdl_found_yesterday and espn_yesterday and team_abbrev:
        if team_abbrev.upper() in espn_yesterday:
            b2b = True
            rest_days = 0
            espn_patched_b2b = True
            print(f"  ⚡ ESPN patch: {team_abbrev} played yesterday (BDL lagging) — marking B2B", file=sys.stderr)

    # Last 5 results + close game record (games decided by <= 5 pts)
    last5_parts = []

    # ── ESPN form patch: prepend yesterday W/L when BDL hasn't updated yet ────
    if espn_patched_b2b and yesterday_results and team_abbrev.upper() in yesterday_results:
        wl = yesterday_results[team_abbrev.upper()]
        last5_parts.append(wl)
        print(f"  ⚡ ESPN form patch: {team_abbrev} yesterday result = {wl} (BDL lagging)", file=sys.stderr)
    close_wins = 0
    close_losses = 0
    last10_pts_allowed = []  # for def_rating_last10
    last10_pts_scored  = []  # for off_rating_last10

    for g in games[:10]:  # scan last 10 for close game sample size
        home_id = g.get("home_team", {}).get("id")
        home_score = g.get("home_team_score", 0) or 0
        visitor_score = g.get("visitor_team_score", 0) or 0

        # Skip games with no score (upcoming/postponed)
        if home_score == 0 and visitor_score == 0:
            if len(last5_parts) < 5:
                last5_parts.append("?")
            continue

        margin = abs(home_score - visitor_score)
        is_home = (home_id == team_id)
        won = (home_score > visitor_score) if is_home else (visitor_score > home_score)

        # Last 5 result tags
        if len(last5_parts) < 5:
            last5_parts.append("W" if won else "L")

        # Track points allowed/scored for last10 defensive/offensive ratings
        pts_allowed = visitor_score if is_home else home_score
        pts_scored  = home_score if is_home else visitor_score
        if len(last10_pts_allowed) < 10:
            last10_pts_allowed.append(pts_allowed)
            last10_pts_scored.append(pts_scored)

        # Close game tally — games within 5 points
        if margin <= 5:
            if won:
                close_wins += 1
            else:
                close_losses += 1

    last5 = "-".join(last5_parts) if last5_parts else ""

    # Streak — count consecutive same result from most recent
    streak = ""
    if last5_parts:
        streak_type = last5_parts[0]
        count = 0
        for r in last5_parts:
            if r == streak_type:
                count += 1
            else:
                break
        streak = f"{streak_type}{count}"

    # Close game win pct — default 0.5 if no close games found
    close_total = close_wins + close_losses
    close_pct = round(close_wins / close_total, 3) if close_total > 0 else 0.5

    return {
        "b2b": b2b,
        "rest_days": rest_days,
        "last5": last5,
        "streak": streak,
        "close_wins": close_wins,
        "close_losses": close_losses,
        "close_pct": close_pct,
        "def_rating_last10": round(sum(last10_pts_allowed) / len(last10_pts_allowed), 1) if last10_pts_allowed else None,
        "off_rating_last10": round(sum(last10_pts_scored)  / len(last10_pts_scored),  1) if last10_pts_scored  else None,
    }


# ============================================================================
# TANK01 DATA HELPERS
# ============================================================================

def get_tank01_bench(team_abbrev: str, injuries: list = None) -> dict:
    """
    Fetch bench net rating for a team via Tank01 Depth Charts.
    Dynamically removes tonight's scratches before averaging so the
    bench rating reflects who is actually available, not the full roster.

    injuries: list of injury dicts for this team (from get_todays_injuries).
              Players with status Out/Doubtful are excluded from bench calc.
    Returns dict with bench_net, bench_ppg, available_bench, removed_bench.
    """
    fallback = {"bench_net": 0, "bench_ppg": 0, "available_bench": [], "removed_bench": []}
    if not TANK01_AVAILABLE:
        return fallback

    data = tank01_get("getNBADepthCharts", {"teamAbv": team_abbrev})
    body = data.get("body", [])

    if not body:
        return fallback

    # Build set of scratched player names (lowercase) for fast lookup
    scratched_names = set()
    if injuries:
        for p in injuries:
            name = (p.get("name") or "").lower().strip()
            if name:
                scratched_names.add(name)
                # Also add last name only as fallback match
                parts = name.split()
                if parts:
                    scratched_names.add(parts[-1])

    try:
        bench_net_ratings = []
        bench_pts = []
        available_bench = []
        removed_bench = []

        team_entry = body[0] if isinstance(body, list) else body
        depth_chart = team_entry.get("depthChart", {}) if isinstance(team_entry, dict) else {}

        for position, players in depth_chart.items():
            if not isinstance(players, list):
                continue
            for i, player in enumerate(players):
                if i == 0:
                    continue  # starter — skip

                # Get player name for scratch check
                p_name = (
                    player.get("longName") or
                    player.get("name") or
                    f"{player.get('firstName','')} {player.get('lastName','')}".strip()
                ).lower().strip()
                p_last = p_name.split()[-1] if p_name else ""

                # Check if this bench player is scratched tonight
                is_scratched = (
                    p_name in scratched_names or
                    p_last in scratched_names
                )

                net = player.get("netRtg") or player.get("netRating")
                pts = player.get("pts") or player.get("ppg")
                display_name = player.get("longName") or player.get("name") or p_name

                if is_scratched:
                    removed_bench.append(display_name)
                    continue  # exclude from bench calc

                if net is not None:
                    try:
                        bench_net_ratings.append(float(net))
                        available_bench.append(display_name)
                    except (ValueError, TypeError):
                        pass
                if pts is not None:
                    try:
                        bench_pts.append(float(pts))
                    except (ValueError, TypeError):
                        pass

        bench_net = round(sum(bench_net_ratings) / len(bench_net_ratings), 1) if bench_net_ratings else 0
        bench_ppg = round(sum(bench_pts), 1) if bench_pts else 0

        if removed_bench:
            print(f"  🏥 {team_abbrev} bench adjusted — removed: {', '.join(removed_bench[:4])} | available bench: {len(available_bench)} players", file=sys.stderr)

        return {
            "bench_net": bench_net,
            "bench_ppg": bench_ppg,
            "available_bench": available_bench,
            "removed_bench": removed_bench,
        }

    except Exception as e:
        print(f"  ⚠ Tank01 bench parse error ({team_abbrev}): {e}", file=sys.stderr)
        return fallback


def classify_injury_tenure(description: str) -> dict:
    """
    Classify how long a player has likely been out based on injury description.
    Returns: { tenure: 'long_term' | 'mid_term' | 'fresh', label: str, priced_in: bool }
    """
    desc = (description or "").lower()

    # Long-term indicators — definitely priced in
    long_term_keywords = [
        "season", "surgery", "operated", "indefinitely", "months",
        "torn", "fracture", "fractured", "achilles", "acl", "mcl",
        "reconstruct", "rehab", "recovery", "6 week", "8 week",
        "10 week", "12 week", "4-6", "6-8", "out for",
    ]
    # Fresh indicators — may NOT be priced in
    fresh_keywords = [
        "day-to-day", "game-time", "questionable", "tonight",
        "1-2", "2-3", "24 hour", "48 hour", "rest",
        "soreness", "sore", "illness", "personal",
    ]
    # Mid-term — likely priced in but worth noting
    mid_term_keywords = [
        "week", "weeks", "2-4", "3-5", "4-5",
        "sprain", "strain", "hamstring", "calf", "ankle",
        "knee", "wrist", "shoulder", "back",
    ]

    if any(k in desc for k in long_term_keywords):
        return {"tenure": "long_term", "label": "Long-term absence", "priced_in": True}
    if any(k in desc for k in fresh_keywords):
        return {"tenure": "fresh", "label": "Fresh scratch", "priced_in": False}
    if any(k in desc for k in mid_term_keywords):
        return {"tenure": "mid_term", "label": "Ongoing absence", "priced_in": True}

    # Default — unknown, assume priced in if no fresh keywords
    return {"tenure": "unknown", "label": "Out", "priced_in": True}


def get_tank01_l10_three(team_abbrev: str, game_date: str):
    """Stubbed — getNBAGamesForTeam not on Pro tier. BDL GOAT handles L10."""
    return None


def get_bdl_l10_three(team_id: int, game_date: str):
    """
    Real L10 3PT% using BDL GOAT nba/v1/game_stats.
    Sums fg3m/fg3a across last 10 games for the team.
    Returns float (e.g. 36.4) or None on failure.
    """
    games = get_team_games(team_id, game_date, last_n=10)
    if not games:
        return None
    game_ids = [g["id"] for g in games if g.get("id")][:10]
    if not game_ids:
        return None
    params = [("per_page", 200)] + [("game_ids[]", gid) for gid in game_ids]
    try:
        resp = requests.get(f"{BASE_URL}/nba/v1/game_stats", params=params, headers=HEADERS, timeout=25)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ⚠ L10 3PT fetch error (team {team_id}): {e}", file=sys.stderr)
        return None
    total_made = total_att = 0
    for row in data.get("data", []):
        if row.get("team", {}).get("id") != team_id:
            continue
        try:
            total_made += float(row.get("fg3m") or row.get("fg3_made") or 0)
            total_att += float(row.get("fg3a") or row.get("fg3_att") or 0)
        except (ValueError, TypeError):
            pass
    if total_att > 0:
        return round((total_made / total_att) * 100, 1)
    return None


def get_tank01_injuries(team_ids_map: dict) -> dict:
    """
    Fetch injury list via Tank01. Returns dict keyed by team_id (int),
    same shape as existing get_todays_injuries() so the rest of the
    pipeline needs zero changes.

    team_ids_map: {team_abbrev: team_id} for all teams playing today.
    """
    injuries_by_team = {}
    if not TANK01_AVAILABLE:
        return injuries_by_team

    data = tank01_get("getNBAInjuryList")
    injury_list = data.get("body", [])

    if not injury_list:
        return injuries_by_team

    abbrev_to_id = {abbr.upper(): tid for abbr, tid in team_ids_map.items()}

    try:
        for player in injury_list:
            team_abbrev = (player.get("team") or player.get("teamAbv") or "").upper()
            tid = abbrev_to_id.get(team_abbrev)
            if tid is None:
                continue  # not playing today

            status = player.get("injStatus") or player.get("status") or ""
            # Normalize to match existing pipeline values
            if status.lower() in ("out", "doubtful"):
                status = status.capitalize()
            else:
                continue  # only track Out/Doubtful

            first = player.get("firstName") or player.get("fName") or ""
            last = player.get("lastName") or player.get("lName") or ""
            name = f"{first} {last}".strip()
            desc = (player.get("description") or player.get("injDesc") or "")[:80]

            if tid not in injuries_by_team:
                injuries_by_team[tid] = []

            tenure = classify_injury_tenure(desc)
            injuries_by_team[tid].append({
                "name": name,
                "status": status,
                "description": desc,
                "tenure": tenure["tenure"],
                "tenure_label": tenure["label"],
                "priced_in": tenure["priced_in"],
            })

    except Exception as e:
        print(f"  ⚠ Tank01 injury parse error: {e}", file=sys.stderr)

    return injuries_by_team


# ============================================================================
# EDGE CALCULATOR (unchanged from original)
# ============================================================================

def calculate_edge(home: dict, away: dict, spread_home=0) -> dict:
    """Calculate composite edge from team stats."""
    signals = []
    score = 0.0

    # ── Franchise Star Penalty ────────────────────────────────────────────────
    # When a franchise-caliber player is out, their team's season net rating
    # was built WITH them — it's misleading. We apply a net rating discount
    # before scoring so the model doesn't lean on inflated team quality numbers.
    # This fires whether the injury is "fresh" or "already priced in" — the
    # net rating is stale either way.
    # ── 2025-26 Franchise Stars (updated March 16, 2026) ─────────────────────
    # Source: ESPN Hollinger + current roster availability
    # Format: "Player Name": ("TEAM", net_rating_penalty)
    # Only includes players with 20+ PPG AND confirmed active/healthy
    # Teams with best player ≤ 15 PPG flagged separately as DECIMATED
    FRANCHISE_STARS = {
        "Jaylen Brown":              ("BOS", 4.5),
        "Jayson Tatum":              ("BOS", 4.5),
        "Donovan Mitchell":          ("CLE", 5.0),
        "Cooper Flagg":              ("DAL", 3.5),
        "Nikola Jokic":              ("DEN", 6.0),
        "Cade Cunningham":           ("DET", 4.5),
        "Kevin Durant":              ("HOU", 4.5),
        "Pascal Siakam":             ("IND", 3.5),
        "Luka Doncic":               ("LAL", 6.0),
        "Norman Powell":             ("MIA", 3.0),
        "Giannis Antetokounmpo":     ("MIL", 6.0),
        "Julius Randle":             ("MIN", 3.5),
        "Trey Murphy III":           ("NOP", 3.0),
        "Jalen Brunson":             ("NYK", 4.5),
        "Shai Gilgeous-Alexander":   ("OKC", 6.0),
        "Paolo Banchero":            ("ORL", 4.0),
        "Joel Embiid":               ("PHI", 5.0),
        "Paul George":               ("PHI", 3.5),
        "Tyrese Maxey":              ("PHI", 4.5),
        "Devin Booker":              ("PHO", 4.0),
        "Deni Avdija":               ("POR", 3.0),
        "Victor Wembanyama":         ("SAS", 6.0),
        "Brandon Ingram":            ("TOR", 3.5),
        "Lauri Markkanen":           ("UTA", 4.0),
        "Jalen Johnson":             ("ATL", 3.5),
        "Brandon Miller":            ("CHA", 3.0),
        "Josh Giddey":               ("CHI", 2.5),
        "Jimmy Butler":              ("GSW", 3.5),
        "Ja Morant":                 ("MEM", 4.5),
        "Anthony Edwards":           ("MIN", 3.5),
        "Kawhi Leonard":             ("LAC", 3.5),
        "Zion Williamson":           ("NOP", 3.5),
    }

    # ── Roster Decimation Check ───────────────────────────────────────────────
    # When a team's best available player averages ≤ 15 PPG, the roster is
    # too thin to lean on — kill confidence to INFO regardless of signals.
    # Based on current season data (updated March 16, 2026).
    DECIMATED_TEAMS = {
        "BKN": "Nic Claxton (12.0 PPG) — best available player",
        "GSW": "Brandin Podziemski (13.0 PPG) — Curry/Butler both out",
        "MEM": "Cedric Coward (13.3 PPG) — Morant/Edey both out",
    }

    home_decimated = DECIMATED_TEAMS.get(home["team"])
    away_decimated = DECIMATED_TEAMS.get(away["team"])

    for team_data, label in [(home, "Home"), (away, "Away")]:
        team_injuries = team_data.get("injuries", [])
        team_abbrev = team_data["team"]
        for inj in team_injuries:
            player_name = inj.get("name", "")
            if player_name in FRANCHISE_STARS:
                star_team, penalty = FRANCHISE_STARS[player_name]
                if star_team == team_abbrev and inj.get("status") in ("Out", "Doubtful"):
                    original_net = team_data.get("net_rating", 0)
                    adjusted_net = round(original_net - penalty, 1)
                    team_data["net_rating"] = adjusted_net
                    team_data["net_rating_adjusted"] = True
                    signals.append({
                        "type": "STAR_OUT_NET_PENALTY",
                        "detail": (
                            f"{player_name} ({team_abbrev}) OUT — net rating adjusted "
                            f"from {original_net:+.1f} to {adjusted_net:+.1f} "
                            f"(season rating built with star on floor)"
                        ),
                        "favors": "FADE" if label == "Home" else home["team"],
                        "strength": "CAUTION",
                        "impact": round(-penalty, 1),
                    })
                    print(
                        f"  ⚠ STAR PENALTY: {player_name} OUT — {team_abbrev} net rating "
                        f"{original_net:+.1f} → {adjusted_net:+.1f}",
                        file=__import__("sys").stderr,
                    )
    # ── End Franchise Star Penalty ────────────────────────────────────────────

    # ── Star Return Boost ────────────────────────────────────────────────────
    # When a franchise star who missed significant time is NOT on the injury
    # report, their team's season stats are depressed by the absence. We boost
    # the net rating and add score impact to reflect the team's TRUE strength.
    #
    # SEASON_ENDING: players confirmed out for the season — skip boost even
    # if they drop off the daily injury report.
    # Updated: 2026-03-28.
    SEASON_ENDING = {
        "Ja Morant",         # MEM — out for season
        "Jaren Jackson Jr.", # MEM — out for season
        "Chet Holmgren",     # OKC — out for season
    }

    # STAR_ABSENCE_HISTORY: players who missed 8+ games this season.
    # Updated: 2026-03-28. Source: NBA.com on/off splits + manual tracking.
    STAR_ABSENCE_HISTORY = {
        # games_back = games played since returning (0 = still out, 30 = fully integrated no boost)
        # Last updated: March 31, 2026
        # Embiid: out since Feb 28 (oblique), back last 10 games avg 31.5 pts
        "Joel Embiid":       {"team": "PHI", "games_missed": 35, "games_back": 8,  "net_with": 7.2,  "net_without": -4.8, "boost": 5.0},
        # Paul George: back after 25-game suspension, 2 games played
        "Paul George":       {"team": "PHI", "games_missed": 25, "games_back": 2,  "net_with": 5.8,  "net_without": -1.2, "boost": 3.5},
        # Maxey: out 10 games (finger), just returned March 29
        "Tyrese Maxey":      {"team": "PHI", "games_missed": 10, "games_back": 2,  "net_with": 4.5,  "net_without": -2.1, "boost": 3.0},
        # Luka: day-to-day hamstring, has been playing but banged up
        "Luka Doncic":       {"team": "LAL", "games_missed": 20, "games_back": 15, "net_with": 6.5,  "net_without": -3.5, "boost": 5.5},
        # Giannis: still out as of March 26
        "Giannis Antetokounmpo": {"team": "MIL", "games_missed": 20, "games_back": 0,  "net_with": 8.0, "net_without": 1.2, "boost": 4.5},
        # Jimmy Butler: OUT all season at GSW — multiple injuries
        "Jimmy Butler":      {"team": "GSW", "games_missed": 50, "games_back": 0,  "net_with": 3.5,  "net_without": -5.0, "boost": 3.5},
        # Ja Morant: only 20 games played (UCL sprain), still out
        "Ja Morant":         {"team": "MEM", "games_missed": 50, "games_back": 0,  "net_with": 4.0,  "net_without": -6.0, "boost": 4.5},
        # Banchero: only missed 10 games, been back all season essentially
        "Paolo Banchero":    {"team": "ORL", "games_missed": 10, "games_back": 30, "net_with": 3.8,  "net_without": -2.1, "boost": 2.0},
        # Chet Holmgren: out for season
        "Chet Holmgren":     {"team": "OKC", "games_missed": 50, "games_back": 0,  "net_with": 9.0,  "net_without": 6.5,  "boost": 2.5},
        # Kawhi: ankle sprain March 14, missed 1 game, back and playing
        "Kawhi Leonard":     {"team": "LAC", "games_missed": 40, "games_back": 30, "net_with": 2.0,  "net_without": -5.5, "boost": 3.5},
        # Zion: has been playing all season — remove boost entirely
        "Zion Williamson":   {"team": "NOP", "games_missed": 5,  "games_back": 30, "net_with": 1.5,  "net_without": -4.0, "boost": 2.0},
        # De'Aaron Fox: day-to-day back tightness, mostly playing
        "De'Aaron Fox":      {"team": "SAS", "games_missed": 8,  "games_back": 20, "net_with": 3.0,  "net_without": -1.0, "boost": 2.5},
        # Siakam: only 2 of last 8 games — load management, questionable nightly
        "Pascal Siakam":     {"team": "IND", "games_missed": 15, "games_back": 3,  "net_with": 4.5,  "net_without": -3.0, "boost": 3.5},
        # Jalen Williams: still out OKC
        "Jalen Williams":    {"team": "OKC", "games_missed": 15, "games_back": 0,  "net_with": 10.0, "net_without": 5.0,  "boost": 3.0},
        # Ant Edwards: OUT as of March 25
        "Anthony Edwards":   {"team": "MIN", "games_missed": 10, "games_back": 0,  "net_with": 5.5,  "net_without": 0.5,  "boost": 3.5},
        # Kel'el Ware: back 3 games after 14 missed
        "Kel'el Ware":       {"team": "MIA", "games_missed": 14, "games_back": 3,  "net_with": 2.0,  "net_without": -3.0, "boost": 2.5},
    }

    # Boost decay by games back:
    # 0-3 games back  = full boost (just returned, stats still depressed)
    # 4-6 games back  = 60% boost (getting integrated)
    # 7-9 games back  = 30% boost (mostly priced in)
    # 10+ games back  = NO boost (fully integrated, season stats catching up)
    def decay_boost(base_boost, games_back):
        if games_back == 0:   return base_boost        # still out — no boost
        if games_back <= 3:   return base_boost        # just back — full boost
        if games_back <= 6:   return round(base_boost * 0.6, 1)
        if games_back <= 9:   return round(base_boost * 0.3, 1)
        return 0.0  # 10+ games back — fully integrated, no boost

    for team_data, opp_data in [(home, away), (away, home)]:
        team_abbrev = team_data["team"]
        team_injuries = team_data.get("injuries", [])

        # Build set of currently injured players for this team
        injured_names = set()
        for inj in team_injuries:
            pname = inj.get("name", "")
            status = inj.get("status", "")
            if status in ("Out", "Doubtful"):
                injured_names.add(pname)

        # Auto-update games_back before processing — runs once per game pair
        # Use cached value if already updated this pipeline run
        if not getattr(calculate_edge, "_stars_updated", False):
            updated = auto_update_games_back(STAR_ABSENCE_HISTORY)
            STAR_ABSENCE_HISTORY.update(updated)
            calculate_edge._stars_updated = True

        # Check each star with absence history — if NOT injured tonight, boost
        total_boost = 0
        returning_stars = []

        for star_name, star_info in STAR_ABSENCE_HISTORY.items():
            if star_info["team"] != team_abbrev:
                continue
            if star_info["games_missed"] < 8:
                continue
            # Skip players confirmed out for the season
            if star_name in SEASON_ENDING:
                continue

            games_back = star_info.get("games_back", 0)

            # Skip if player has been back 10+ games — fully integrated, no boost
            if games_back >= 10:
                continue

            # Skip if player is still out (games_back == 0) AND on injury report
            if games_back == 0 and star_name in injured_names:
                continue

            # Skip if player is still out (games_back == 0) AND not on injury report
            # means we don't know their status — only boost if games_back > 0 (confirmed back)
            if games_back == 0:
                continue

            # Player has returned — apply decayed boost
            if star_name not in injured_names:
                boost = decay_boost(star_info["boost"], games_back)
                if boost <= 0:
                    continue
                total_boost += boost
                returning_stars.append({
                    "name": star_name,
                    "missed": star_info["games_missed"],
                    "games_back": games_back,
                    "net_with": star_info["net_with"],
                    "net_without": star_info["net_without"],
                    "boost": boost,
                })

        # Cap total boost at 8.0 (even 3 stars shouldn't add +15)
        total_boost = min(total_boost, 8.0)

        if returning_stars and total_boost >= 2.0:
            is_home = team_data["team"] == home["team"]

            # Apply net rating boost
            original_net = team_data.get("net_rating", 0)
            adjusted_net = round(original_net + total_boost, 1)
            team_data["net_rating"] = adjusted_net
            team_data["net_rating_boosted"] = True

            # Score impact
            impact = min(total_boost * 0.8, 5.0)
            score += impact if is_home else -impact

            star_names = ", ".join(s["name"] for s in returning_stars)

            signals.append({
                "type": "STAR_RETURN_BOOST",
                "detail": (
                    f"{star_names} AVAILABLE for {team_abbrev} — "
                    f"back for {max(s['games_back'] for s in returning_stars)} games after "
                    f"{sum(s['missed'] for s in returning_stars)}+ missed. "
                    f"Net rating boosted {original_net:+.1f} → {adjusted_net:+.1f} "
                    f"({'full boost' if max(s['games_back'] for s in returning_stars) <= 3 else 'partial — getting integrated'})."
                ),
                "favors": team_abbrev,
                "strength": "STRONG" if total_boost >= 4.0 else "MODERATE",
                "impact": round(impact, 1),
            })

            print(
                f"  🔄 STAR RETURN BOOST: {star_names} available for {team_abbrev} — "
                f"net rating {original_net:+.1f} → {adjusted_net:+.1f} (boost +{total_boost:.1f})",
                file=sys.stderr
            )
    # ── End Star Return Boost ─────────────────────────────────────────────────

    # ── Roster Decimation NO LEAN ─────────────────────────────────────────────
    # When a decimated team is in the game, suppress the lean entirely.
    # The model can't score a team with no real offensive anchor.
    # We still show signals for context but confidence is capped at INFO.
    home_decimated = DECIMATED_TEAMS.get(home["team"])
    away_decimated = DECIMATED_TEAMS.get(away["team"])

    if home_decimated:
        signals.append({
            "type":     "ROSTER_DECIMATED",
            "detail":   f"{home['team']} roster decimated — {home_decimated}. No lean issued.",
            "favors":   away["team"],
            "strength": "CAUTION",
            "impact":   0,
        })
        print(f"  💀 ROSTER DECIMATED: {home['team']} — {home_decimated}", file=__import__("sys").stderr)

    if away_decimated:
        signals.append({
            "type":     "ROSTER_DECIMATED",
            "detail":   f"{away['team']} roster decimated — {away_decimated}. No lean issued.",
            "favors":   home["team"],
            "strength": "CAUTION",
            "impact":   0,
        })
        print(f"  💀 ROSTER_DECIMATED: {away['team']} — {away_decimated}", file=__import__("sys").stderr)
    # ── End Roster Decimation ─────────────────────────────────────────────────

    # Net rating gap
    h_net = home.get("net_rating", 0)
    a_net = away.get("net_rating", 0)
    net_diff = h_net - a_net
    if abs(net_diff) >= 3:
        impact = min(abs(net_diff) / 10 * 6, 8.0)
        score += impact if net_diff > 0 else -impact
        signals.append({
            "type": "NET_RATING_GAP",
            "detail": f"{'Home' if net_diff > 0 else 'Away'} net rating {max(h_net, a_net):+.1f} vs {min(h_net, a_net):+.1f}",
            "favors": home["team"] if net_diff > 0 else away["team"],
            "strength": "STRONG" if abs(net_diff) >= 6 else "MODERATE",
            "impact": round(impact, 1),
        })

    # Bench net rating
    h_bench = home.get("bench_net", 0)
    a_bench = away.get("bench_net", 0)
    bench_diff = h_bench - a_bench
    if abs(bench_diff) >= 2:
        impact = min(abs(bench_diff) / 8 * 6, 7.0)
        score += impact if bench_diff > 0 else -impact
        signals.append({
            "type": "BENCH_EDGE",
            "detail": f"{'Home' if bench_diff > 0 else 'Away'} bench net {max(h_bench, a_bench):+.1f} vs {min(h_bench, a_bench):+.1f}",
            "favors": home["team"] if bench_diff > 0 else away["team"],
            "strength": "STRONG" if abs(bench_diff) >= 4 else "MODERATE",
            "impact": round(impact, 1),
        })

    # B2B fatigue
    if away.get("b2b") and not home.get("b2b"):
        score += 8.0
        signals.append({
            "type": "B2B_FATIGUE",
            "detail": f"{away['team']} on back-to-back",
            "favors": home["team"], "strength": "STRONG", "impact": 8.0,
        })
    elif home.get("b2b") and not away.get("b2b"):
        score -= 8.0
        signals.append({
            "type": "B2B_FATIGUE",
            "detail": f"{home['team']} on back-to-back",
            "favors": away["team"], "strength": "STRONG", "impact": 8.0,
        })

    # Close game record — only fire when sample is meaningful
    h_close = home.get("close_pct", 0.5)
    a_close = away.get("close_pct", 0.5)
    h_close_total = home.get("close_wins", 0) + home.get("close_losses", 0)
    a_close_total = away.get("close_wins", 0) + away.get("close_losses", 0)
    min_sample = min(h_close_total, a_close_total)
    close_diff = h_close - a_close

    # Require 8+ close games for both teams AND a meaningful gap
    # ML MODEL FINDING: close_game_win_pct is the #1 LightGBM feature
    # TODO: Boost cap from 2.5 → 4.0 after validating over 1-2 weeks
    if min_sample >= 8 and abs(close_diff) >= 0.20:
        sample_confidence = min(min_sample / 15, 1.0)  # maxes out at 15 games
        impact = min(abs(close_diff) * 12 * sample_confidence, 2.5)
        score += impact if close_diff > 0 else -impact
        favor_team = home if close_diff > 0 else away
        favor_w = favor_team.get("close_wins", 0)
        favor_l = favor_team.get("close_losses", 0)
        signals.append({
            "type": "CLOSE_GAMES",
            "detail": f"{favor_team['team']} better in close games "
                      f"({favor_w}-{favor_l} in games decided ≤5pts)",
            "favors": favor_team["team"],
            "strength": "MODERATE", "impact": round(impact, 1),
        })

    # Defensive trend signal — last 10 def rating vs season def rating
    # Fires when a team's recent defense is significantly worse than their season number
    # Higher def_rating = worse defense (more points allowed)
    for team_data, opp_data in [(home, away), (away, home)]:
        season_def = team_data.get("def_rating")
        last10_def = team_data.get("def_rating_last10")
        if season_def and last10_def:
            trending_worse = last10_def - season_def
            if trending_worse >= 4.0:  # giving up 4+ more pts/g recently than season avg
                impact = min(trending_worse * 0.4, 3.0)
                is_home_team = team_data["team"] == home["team"]
                score += impact if not is_home_team else -impact  # benefits opponent
                signals.append({
                    "type": "DEF_TRENDING_WORSE",
                    "detail": f"{team_data['team']} defense trending worse — "
                              f"allowing {last10_def} pts/g last 10 vs {season_def} season avg "
                              f"(+{trending_worse:.1f} pts allowed)",
                    "favors": opp_data["team"],
                    "strength": "MODERATE" if trending_worse >= 6 else "MILD",
                    "impact": round(impact, 1),
                })

    # 3PT variance
    for team_data, label in [(home, "Home"), (away, "Away")]:
        szn_3 = team_data.get("three_pct", 0)
        l10_3 = team_data.get("last10_three", 0)
        if szn_3 > 0 and l10_3 > 0:
            diff_3 = l10_3 - szn_3
            if abs(diff_3) >= 2.0:
                tag = "hot" if diff_3 > 0 else "cold"
                direction = "regression down" if diff_3 > 0 else "regression up"
                signals.append({
                    "type": "3PT_VARIANCE",
                    "detail": f"{team_data['team']} shooting {l10_3:.1f}% from 3 L10 (season {szn_3:.1f}%) — {tag}, expect {direction}",
                    "favors": "N/A", "strength": "MODERATE",
                    "impact": round(abs(diff_3) * 0.8, 1),
                })

    # Guard matchup pressure
    # Logic: if a team ranks poorly in def_rating AND has a high-pace opponent
    # with strong 3PT shooting, their guard defense is likely being exploited.
    # We weight this LOW by design — supporting signal only, never lead signal.
    # Star guard matchups (well-known) get downweighted since they're already priced in.
    # Role player / systemic mismatches get normal weight.
    h_def = home.get("def_rating", 115)
    a_def = away.get("def_rating", 115)
    h_off = home.get("off_rating", 110)
    a_off = away.get("off_rating", 110)
    h_pace = home.get("pace", 100)
    a_pace = away.get("pace", 100)
    h_3pt = home.get("three_pct", 35)
    a_3pt = away.get("three_pct", 35)
    h_injuries = len(home.get("key_out", []))
    a_injuries = len(away.get("key_out", []))

    # Fresh scratch bonus — only count injuries NOT already priced in
    h_fresh = [p for p in home.get("injuries", []) if not p.get("priced_in", True) and p.get("status") == "Out"]
    a_fresh = [p for p in away.get("injuries", []) if not p.get("priced_in", True) and p.get("status") == "Out"]
    if a_fresh:
        impact = min(len(a_fresh) * 3.0, 6.0)
        score += impact
        signals.append({
            "type": "FRESH_SCRATCH",
            "detail": f"Away missing {', '.join(p['name'] for p in a_fresh[:2])} — fresh scratch, may not be priced in",
            "favors": home["team"],
            "strength": "MODERATE",
            "impact": impact,
        })
    if h_fresh:
        impact = min(len(h_fresh) * 3.0, 6.0)
        score -= impact
        signals.append({
            "type": "FRESH_SCRATCH",
            "detail": f"Home missing {', '.join(p['name'] for p in h_fresh[:2])} — fresh scratch, may not be priced in",
            "favors": away["team"],
            "strength": "MODERATE",
            "impact": impact,
        })

    # ── Positional Mismatch Note (display only — no score impact) ─────────────
    # Surfaces as an informational callout like the gut check rule.
    # Does NOT affect edge score, confidence, or lean.
    # Context for the bettor to factor in themselves.

    WEAK_DEFENSE_TEAMS = {
        "UTA": 119.1, "WAS": 118.4, "SAC": 117.0,
        "BKN": 116.0, "IND": 115.4, "NOP": 115.3,
        "MIL": 115.3, "DEN": 114.7, "CHI": 114.6,
    }

    otj_matchup_note = None

    for team_data, opp_data in [(home, away), (away, home)]:
        team_abbrev = team_data["team"]
        opp_abbrev  = opp_data["team"]

        if team_abbrev in DECIMATED_TEAMS:
            continue

        team_injuries = team_data.get("injuries", [])
        opp_def_rtg   = WEAK_DEFENSE_TEAMS.get(opp_abbrev)

        if not opp_def_rtg:
            continue

        for star_name, (star_team, _) in FRANCHISE_STARS.items():
            if star_team != team_abbrev:
                continue
            star_out = any(
                p.get("name") == star_name and p.get("status") in ("Out", "Doubtful")
                for p in team_injuries
            )
            if star_out:
                continue

            severity = "bottom 3" if opp_def_rtg >= 117 else "bottom 6" if opp_def_rtg >= 115.5 else "bottom 10"
            otj_matchup_note = {
                "star":       star_name,
                "star_team":  team_abbrev,
                "opp_team":   opp_abbrev,
                "opp_def_rtg": opp_def_rtg,
                "severity":   severity,
                "label": (
                    f"{star_name} faces {opp_abbrev} defense ({opp_def_rtg} DefRtg — {severity} in NBA). "
                    f"Favorable matchup for {team_abbrev} — factor in when sizing."
                ),
            }
            break
        if otj_matchup_note:
            break
    # ── End Positional Mismatch Note ──────────────────────────────────────────

    # Weak guard defense proxy: high def_rating (worse = higher number) + opponent high pace + opponent good 3PT
    # Away team attacking home guard defense
    if h_def >= 114 and a_pace >= 102 and a_3pt >= 37.0:
        # How systemic is this? Factor in whether home has injuries in backcourt
        base_impact = 1.5  # LOW weight — supporting signal only
        injury_bump = 0.5 if h_injuries >= 1 else 0  # slight bump if defender is out
        impact = round(base_impact + injury_bump, 1)
        score -= impact  # favors away
        signals.append({
            "type": "GUARD_MATCHUP",
            "detail": f"{away['team']} pace ({a_pace}) + 3PT ({a_3pt}%) attacks {home['team']} weak perimeter D ({h_def} def rtg) — systemic mismatch, not star-driven",
            "favors": away["team"],
            "strength": "MODERATE" if impact >= 2.0 else "WEAK",
            "impact": impact,
        })

    # Home team attacking away guard defense
    elif a_def >= 114 and h_pace >= 102 and h_3pt >= 37.0:
        base_impact = 1.5
        injury_bump = 0.5 if a_injuries >= 1 else 0
        impact = round(base_impact + injury_bump, 1)
        score += impact  # favors home
        signals.append({
            "type": "GUARD_MATCHUP",
            "detail": f"{home['team']} pace ({h_pace}) + 3PT ({h_3pt}%) attacks {away['team']} weak perimeter D ({a_def} def rtg) — systemic mismatch, not star-driven",
            "favors": home["team"],
            "strength": "MODERATE" if impact >= 2.0 else "WEAK",
            "impact": impact,
        })

    # Home court baseline
    score += 3.0

    # ── STANDINGS TIER — win% based quality signal ───────────────────────────
    # Uses season W/L already in team profiles. Tiers:
    #   ELITE:  win_pct >= .650  (top ~6 teams — SAS, OKC, CLE, BOS, DEN, etc.)
    #   GOOD:   win_pct >= .550
    #   MID:    win_pct >= .400
    #   TANK:   win_pct <  .320  (bottom ~4 — SAC, WAS, etc.)
    # TANK teams get spread leans killed. ELITE vs TANK boosts favorite conviction.
    h_wpct = home.get("win_pct", 0.5)
    a_wpct = away.get("win_pct", 0.5)

    h_tier = "ELITE" if h_wpct >= 0.650 else "GOOD" if h_wpct >= 0.550 else "MID" if h_wpct >= 0.400 else "TANK"
    a_tier = "ELITE" if a_wpct >= 0.650 else "GOOD" if a_wpct >= 0.550 else "MID" if a_wpct >= 0.400 else "TANK"

    # Flag: should we kill any underdog spread lean on a TANK team?
    tank_lean_killed = False

    # ELITE vs TANK — boost favorite, kill underdog spread lean
    if h_tier == "ELITE" and a_tier == "TANK":
        impact = 4.0
        score += impact  # boost home (the elite team)
        signals.append({
            "type": "STANDINGS_TIER",
            "detail": (
                f"{home['team']} ({home.get('record','')}, .{int(h_wpct*1000)}) is ELITE tier vs "
                f"{away['team']} ({away.get('record','')}, .{int(a_wpct*1000)}) TANK tier — "
                f"quality gap too wide for underdog spread value"
            ),
            "favors": home["team"],
            "strength": "STRONG",
            "impact": impact,
        })
        tank_lean_killed = True
        print(f"  🏆 STANDINGS TIER: {home['team']} ELITE vs {away['team']} TANK — boosting favorite +{impact}", file=sys.stderr)

    elif a_tier == "ELITE" and h_tier == "TANK":
        impact = 4.0
        score -= impact  # boost away (the elite team)
        signals.append({
            "type": "STANDINGS_TIER",
            "detail": (
                f"{away['team']} ({away.get('record','')}, .{int(a_wpct*1000)}) is ELITE tier vs "
                f"{home['team']} ({home.get('record','')}, .{int(h_wpct*1000)}) TANK tier — "
                f"quality gap too wide for underdog spread value"
            ),
            "favors": away["team"],
            "strength": "STRONG",
            "impact": impact,
        })
        tank_lean_killed = True
        print(f"  🏆 STANDINGS TIER: {away['team']} ELITE vs {home['team']} TANK — boosting favorite +{impact}", file=sys.stderr)

    # Any TANK team in the game — suppress spread lean on them even without ELITE opponent
    elif h_tier == "TANK" or a_tier == "TANK":
        tank_team = home["team"] if h_tier == "TANK" else away["team"]
        tank_wpct = h_wpct if h_tier == "TANK" else a_wpct
        tank_record = home.get("record", "") if h_tier == "TANK" else away.get("record", "")
        signals.append({
            "type": "STANDINGS_TIER",
            "detail": (
                f"{tank_team} ({tank_record}, .{int(tank_wpct*1000)}) is TANK tier — "
                f"spread lean suppressed, team loses big routinely"
            ),
            "favors": home["team"] if a_tier == "TANK" else away["team"],
            "strength": "CAUTION",
            "impact": 0,
        })
        tank_lean_killed = True
        print(f"  💀 STANDINGS TIER: {tank_team} is TANK tier — spread lean will be suppressed", file=sys.stderr)
    # ── End Standings Tier ────────────────────────────────────────────────────

    # ── PACE MISMATCH — slow elite teams grinding out fast bad teams ──────────
    # When an elite team plays at controlled pace (<100) and the opponent is a
    # fast, bad team (pace >102, win_pct <.400), the elite team dictates tempo
    # and the bad team collapses. Historically = blowout. Boosts favorite spread.
    h_pace_val = home.get("pace", 100) or 100
    a_pace_val = away.get("pace", 100) or 100
    spread_val_check = abs(float(spread_home or 0))

    pace_mismatch_fired = False
    if h_tier == "ELITE" and h_pace_val < 100 and a_pace_val > 102 and a_wpct < 0.400 and spread_val_check >= 8:
        pace_gap = round(a_pace_val - h_pace_val, 1)
        impact = min(3.0 + (pace_gap - 2) * 0.5, 5.0)  # 3-5 pts based on gap
        score += impact  # boost home favorite
        signals.append({
            "type": "PACE_MISMATCH",
            "detail": (
                f"{home['team']} controls tempo (pace {h_pace_val}) vs {away['team']} "
                f"high-pace ({a_pace_val}) — elite team dictates, bad team collapses. "
                f"Pace gap: {pace_gap} possessions"
            ),
            "favors": home["team"],
            "strength": "STRONG",
            "impact": round(impact, 1),
        })
        pace_mismatch_fired = True
        print(f"  ⏱ PACE MISMATCH: {home['team']} ({h_pace_val}) controls vs {away['team']} ({a_pace_val}) — boosting fav +{impact:.1f}", file=sys.stderr)

    elif a_tier == "ELITE" and a_pace_val < 100 and h_pace_val > 102 and h_wpct < 0.400 and spread_val_check >= 8:
        pace_gap = round(h_pace_val - a_pace_val, 1)
        impact = min(3.0 + (pace_gap - 2) * 0.5, 5.0)
        score -= impact  # boost away favorite
        signals.append({
            "type": "PACE_MISMATCH",
            "detail": (
                f"{away['team']} controls tempo (pace {a_pace_val}) vs {home['team']} "
                f"high-pace ({h_pace_val}) — elite team dictates, bad team collapses. "
                f"Pace gap: {pace_gap} possessions"
            ),
            "favors": away["team"],
            "strength": "STRONG",
            "impact": round(impact, 1),
        })
        pace_mismatch_fired = True
        print(f"  ⏱ PACE MISMATCH: {away['team']} ({a_pace_val}) controls vs {home['team']} ({h_pace_val}) — boosting fav +{impact:.1f}", file=sys.stderr)
    # ── TRANSITION PACE MISMATCH ─────────────────────────────────────────────
    # Fast break offense vs slow-footed defense.
    # When a fast team (103+ pace) plays a slow team (97- pace) the transition
    # gap creates free points in open court. Embiid-type bigs can't get back.
    # Proxy: large pace differential on a close spread = style mismatch edge.
    # Based on Miami/Philly analysis: pace diff + slow big = ~4-6 free pts/game

    try:
        h_pace_val2 = float(home.get("pace", 100) or 100)
        a_pace_val2 = float(away.get("pace", 100) or 100)
        pace_diff = abs(h_pace_val2 - a_pace_val2)
        fast_team  = home if h_pace_val2 > a_pace_val2 else away
        slow_team  = home if h_pace_val2 < a_pace_val2 else away
        fast_is_home = fast_team["team"] == home["team"]
        spread_abs = abs(float(spread_home or 0))

        # Only fire when pace gap is meaningful (5+ possessions) and game is close (<8 spread)
        if pace_diff >= 5 and spread_abs <= 8:
            # Scale impact: 5-7 diff = moderate, 7+ = strong
            impact = 2.0 if pace_diff < 7 else 3.0

            # Extra bump if slow team has a dominant center (proxy: high net rating but low pace)
            # High net rating + slow pace = halfcourt-dependent team = transition liability
            slow_net = slow_team.get("net_rating", 0)
            if slow_net >= 3 and slow_team.get("pace", 100) < 98:
                impact += 1.0  # slow elite team is MORE vulnerable, not less

            score += impact if fast_is_home else -impact

            signals.append({
                "type": "TRANSITION_MISMATCH",
                "detail": (
                    f"{fast_team['team']} pace ({fast_team.get('pace', '?')}) vs "
                    f"{slow_team['team']} pace ({slow_team.get('pace', '?')}) — "
                    f"{pace_diff:.1f} possession gap. Fast team generates open court "
                    f"opportunities that slow-footed defenses cannot recover from. "
                    f"{'Halfcourt-dependent team vulnerable in transition.' if slow_net >= 3 and slow_team.get('pace', 100) < 98 else ''}"
                ),
                "favors": fast_team["team"],
                "strength": "STRONG" if pace_diff >= 7 else "MODERATE",
                "impact": round(impact, 1),
            })
            print(
                f"  ⚡ TRANSITION MISMATCH: {fast_team['team']} ({fast_team.get('pace')}) "
                f"vs {slow_team['team']} ({slow_team.get('pace')}) — "
                f"gap {pace_diff:.1f}, impact {impact:+.1f}",
                file=sys.stderr
            )
    except Exception as e:
        print(f"  ⚠ Transition mismatch calc failed: {e}", file=sys.stderr)

    # ── FAST BREAK MISMATCH ──────────────────────────────────────────────────
    # Real fast break points data from NBA Stats API.
    # Unlike pace (which just measures tempo), this measures actual transition
    # scoring — a team can run fast but still be a halfcourt offense.
    # Miami #1 in FB pts (18.2) vs Philly bottom 5 in FB pts allowed = real edge.
    try:
        h_fb_off = float(home.get("fb_pts", 0) or 0)
        a_fb_off = float(away.get("fb_pts", 0) or 0)
        h_fb_def = float(home.get("fb_pts_allowed", 0) or 0)
        a_fb_def = float(away.get("fb_pts_allowed", 0) or 0)

        spread_abs_fb = abs(float(spread_home or 0))

        # Only fire when we have real data and game is close enough to matter
        if h_fb_off > 0 and a_fb_off > 0 and spread_abs_fb <= 10:

            # Home team fast break offense vs Away team fast break defense
            # High home FB offense + high away FB allowed = home transition edge
            home_fb_edge = h_fb_off - a_fb_def  # positive = home scores more in transition than away allows
            away_fb_edge = a_fb_off - h_fb_def  # positive = away scores more in transition than home allows

            net_fb_edge = home_fb_edge - away_fb_edge

            # Threshold: need at least 4 pt net edge to fire signal
            if abs(net_fb_edge) >= 4.0:
                fb_team = home if net_fb_edge > 0 else away
                fb_opp  = away if net_fb_edge > 0 else home
                fb_is_home = fb_team["team"] == home["team"]

                # Scale impact: 4-6 pt edge = 1.5, 6-8 = 2.5, 8+ = 3.5
                if abs(net_fb_edge) >= 8:
                    impact = 3.5
                elif abs(net_fb_edge) >= 6:
                    impact = 2.5
                else:
                    impact = 1.5

                score += impact if fb_is_home else -impact

                signals.append({
                    "type": "FAST_BREAK_MISMATCH",
                    "detail": (
                        f"{fb_team['team']} averages {h_fb_off if fb_is_home else a_fb_off:.1f} FB pts/game — "
                        f"{fb_opp['team']} allows {a_fb_def if fb_is_home else h_fb_def:.1f} FB pts/game. "
                        f"Net transition edge: {abs(net_fb_edge):.1f} pts. "
                        f"This is real fast break data, not just pace."
                    ),
                    "favors": fb_team["team"],
                    "strength": "STRONG" if abs(net_fb_edge) >= 6 else "MODERATE",
                    "impact": round(impact, 1),
                })
                print(
                    f"  🏃 FAST_BREAK_MISMATCH: {fb_team['team']} FB edge {net_fb_edge:+.1f} pts — impact {impact:+.1f}",
                    file=__import__('sys').stderr
                )
    except Exception as e:
        print(f"  ⚠ Fast break mismatch calc failed: {e}", file=__import__('sys').stderr)

    # ── End Fast Break Mismatch ───────────────────────────────────────────────

    # ── End Transition Pace Mismatch ──────────────────────────────────────────

    # ── End Pace Mismatch ─────────────────────────────────────────────────────

    # ── TIER MATCHUP SIGNALS (from 1,043 game analysis) ──────────────────────
    # Data-driven findings about which matchup types are profitable

    # 1. AVERAGE HOME vs TANK — 82.6% win rate, best bet in basketball
    if h_tier == "AVERAGE" and a_tier == "TANK":
        impact = 4.0
        score += impact
        signals.append({
            "type": "TIER_MISMATCH",
            "detail": (
                f"AVERAGE vs TANK — {home['team']} ({h_wpct:.1%}) hosting "
                f"{away['team']} ({a_wpct:.1%}). Data shows 82.6% win rate "
                f"in this matchup type — higher than elite vs tank"
            ),
            "favors": home["team"],
            "strength": "STRONG",
            "impact": round(impact, 1),
        })
        print(f"  📊 TIER MISMATCH: AVG HOME vs TANK — {home['team']} gets +{impact}", file=sys.stderr)

    elif a_tier == "AVERAGE" and h_tier == "TANK":
        impact = 4.0
        score -= impact
        signals.append({
            "type": "TIER_MISMATCH",
            "detail": (
                f"TANK vs AVERAGE — {away['team']} ({a_wpct:.1%}) at "
                f"{home['team']} ({h_wpct:.1%}). Data shows tank teams at home "
                f"vs average only win 30.2%"
            ),
            "favors": away["team"],
            "strength": "STRONG",
            "impact": round(impact, 1),
        })
        print(f"  📊 TIER MISMATCH: TANK HOME vs AVG — {away['team']} gets +{impact}", file=sys.stderr)

    # 2. BELOW AVG HOME vs TANK — 72% win rate, sneaky profitable
    elif h_tier == "BELOW AVG" and a_tier == "TANK":
        impact = 2.5
        score += impact
        signals.append({
            "type": "TIER_MISMATCH",
            "detail": (
                f"BELOW AVG vs TANK — {home['team']} ({h_wpct:.1%}) hosting "
                f"{away['team']} ({a_wpct:.1%}). Even bad teams crush tanks at home (72%)"
            ),
            "favors": home["team"],
            "strength": "MODERATE",
            "impact": round(impact, 1),
        })

    # 3. ELITE vs ELITE — coin flip, suppress confidence
    if h_tier == "ELITE" and a_tier == "ELITE":
        signals.append({
            "type": "ELITE_MIRROR",
            "detail": (
                f"ELITE vs ELITE — {home['team']} vs {away['team']}. "
                f"Data shows 54.7% home win rate in this matchup. Coin flip territory."
            ),
            "favors": "NEUTRAL",
            "strength": "CAUTION",
            "impact": 0,
        })
        print(f"  ⚖️ ELITE vs ELITE: {home['team']} vs {away['team']} — coin flip", file=sys.stderr)

    # 4. ELITE B2B — heavier penalty (17% drop found in data)
    # Override the standard B2B signal with a stronger one for elite teams
    if home.get("b2b") and h_tier == "ELITE" and not away.get("b2b"):
        extra_penalty = 3.0  # on top of the existing 8.0
        score -= extra_penalty
        signals.append({
            "type": "ELITE_B2B_PENALTY",
            "detail": (
                f"{home['team']} is ELITE on B2B — data shows 17% win rate drop "
                f"for elite teams on back-to-back. Extra penalty applied."
            ),
            "favors": away["team"],
            "strength": "STRONG",
            "impact": round(extra_penalty, 1),
        })
        print(f"  🔴 ELITE B2B: {home['team']} gets extra -{extra_penalty} penalty", file=sys.stderr)

    elif away.get("b2b") and a_tier == "ELITE" and not home.get("b2b"):
        extra_penalty = 3.0
        score += extra_penalty
        signals.append({
            "type": "ELITE_B2B_PENALTY",
            "detail": (
                f"{away['team']} is ELITE on B2B — data shows elite teams "
                f"drop from 60% to 51% on road B2Bs. Extra penalty applied."
            ),
            "favors": home["team"],
            "strength": "STRONG",
            "impact": round(extra_penalty, 1),
        })
        print(f"  🔴 ELITE B2B: {away['team']} gets extra +{extra_penalty} for home", file=sys.stderr)

    # 5. TANK vs ELITE over/under hint (72.4% over rate)
    if (h_tier == "ELITE" and a_tier == "TANK") or (a_tier == "ELITE" and h_tier == "TANK"):
        signals.append({
            "type": "OVER_LEAN",
            "detail": (
                f"TANK vs ELITE — these games average 233 total points. "
                f"Over 225 hits 72.4% of the time. Tank defense is nonexistent."
            ),
            "favors": "OVER",
            "strength": "MODERATE",
            "impact": 0,  # informational — doesn't affect spread score
        })
    # ── CHEAT SHEET SIGNALS (from 1,043 game analysis) ──────────────────────

    # 1. SAC 0-7 on road vs tanks — specific fade rule
    if away.get("team") == "SAC" and h_tier == "TANK":
        impact = 2.0
        score += impact  # boost home (fade SAC road)
        signals.append({
            "type": "CHEAT_SHEET",
            "detail": (
                f"SAC is 0-7 on road vs tank teams this season — "
                f"data-driven fade. Road Sacramento vs any bad team = avoid."
            ),
            "favors": home["team"],
            "strength": "MODERATE",
            "impact": impact,
        })
        print(f"  📋 CHEAT SHEET: SAC 0-7 road vs tanks — fading SAC +{impact}", file=sys.stderr)

    # 2. AVERAGE teams IMPROVE on road B2B (51.7% → 64.2%)
    # Counter-intuitive but data-backed — average teams play with more urgency when fatigued
    if away.get("b2b") and a_tier in ("GOOD", "MID") and not home.get("b2b"):
        impact = 2.0
        score -= impact  # boost away (the B2B average team)
        signals.append({
            "type": "CHEAT_SHEET",
            "detail": (
                f"{away['team']} is AVERAGE tier on road B2B — data shows average teams "
                f"actually improve on B2Bs (51.7% → 64.2% road win rate). "
                f"These teams play with more urgency when fatigued."
            ),
            "favors": away["team"],
            "strength": "MODERATE",
            "impact": impact,
        })
        print(f"  📋 CHEAT SHEET: {away['team']} AVERAGE road B2B boost -{impact}", file=sys.stderr)

    elif home.get("b2b") and h_tier in ("GOOD", "MID") and not away.get("b2b"):
        impact = 1.5  # smaller boost for home B2B (no travel tax)
        score += impact
        signals.append({
            "type": "CHEAT_SHEET",
            "detail": (
                f"{home['team']} is AVERAGE tier on home B2B — average teams "
                f"show improved urgency on B2Bs. Home court offsets travel tax."
            ),
            "favors": home["team"],
            "strength": "MODERATE",
            "impact": impact,
        })
        print(f"  📋 CHEAT SHEET: {home['team']} AVERAGE home B2B boost +{impact}", file=sys.stderr)

    # 3. TANK BOWL MOMENTUM — in tank vs tank, better L10 form wins 62-78%
    if h_tier == "TANK" and a_tier == "TANK":
        h_l5 = home.get("last5", "")
        a_l5 = away.get("last5", "")
        # Count wins in last 5 from string like "W-L-W-W-L"
        h_wins = h_l5.count("W") if h_l5 else 0
        a_wins = a_l5.count("W") if a_l5 else 0
        win_diff = h_wins - a_wins

        if abs(win_diff) >= 2:  # meaningful L5 gap
            momentum_team = home["team"] if win_diff > 0 else away["team"]
            impact = min(abs(win_diff) * 1.0, 3.0)
            score += impact if win_diff > 0 else -impact
            signals.append({
                "type": "CHEAT_SHEET",
                "detail": (
                    f"TANK BOWL: {home['team']} {h_wins}/5 vs {away['team']} {a_wins}/5 L5 — "
                    f"momentum favors {momentum_team}. In tank vs tank, "
                    f"better L10 form wins 62-78% of the time."
                ),
                "favors": momentum_team,
                "strength": "MODERATE",
                "impact": round(impact, 1),
            })
            print(f"  📋 TANK BOWL: {momentum_team} momentum edge +{impact}", file=sys.stderr)

    # ── End Cheat Sheet Signals ───────────────────────────────────────────────

    # ── End Tier Matchup Signals ─────────────────────────────────────────────

    # ── Form Momentum Signals ─────────────────────────────────────────────
    # Surface when a team is trending significantly up or down
    h_off_l10 = float(home.get('off_rating_last10', 0) or 0)
    h_def_l10 = float(home.get('def_rating_last10', 0) or 0)
    a_off_l10 = float(away.get('off_rating_last10', 0) or 0)
    a_def_l10 = float(away.get('def_rating_last10', 0) or 0)
    h_off_season = float(home.get('off_rating', 0) or 0)
    h_def_season = float(home.get('def_rating', 0) or 0)
    a_off_season = float(away.get('off_rating', 0) or 0)
    a_def_season = float(away.get('def_rating', 0) or 0)

    if h_off_l10 and h_off_season:
        h_def_trend = h_def_season - h_def_l10  # positive = defense improving
        if abs(h_def_trend) >= 3.0:
            direction = "improving" if h_def_trend > 0 else "slipping"
            signals.append({
                "type": "FORM_TREND",
                "detail": (
                    f"{home['team']} defense L10: {h_def_l10:.1f} ppg allowed "
                    f"vs season {h_def_season:.1f} — {direction} {abs(h_def_trend):.1f} pts"
                ),
                "favors": home["team"] if h_def_trend > 0 else away["team"],
                "strength": "MODERATE",
                "impact": 0,
            })

    if a_off_l10 and a_off_season:
        a_def_trend = a_def_season - a_def_l10
        if abs(a_def_trend) >= 3.0:
            direction = "improving" if a_def_trend > 0 else "slipping"
            signals.append({
                "type": "FORM_TREND",
                "detail": (
                    f"{away['team']} defense L10: {a_def_l10:.1f} ppg allowed "
                    f"vs season {a_def_season:.1f} — {direction} {abs(a_def_trend):.1f} pts"
                ),
                "favors": away["team"] if a_def_trend > 0 else home["team"],
                "strength": "MODERATE",
                "impact": 0,
            })
    # ── End Form Momentum Signals ─────────────────────────────────────────

    # ── ML MODEL PREDICTION ──────────────────────────────────────────────────
    # LightGBM classifier + XGBoost margin regressor (v2)
    # Trained on 1,043 games with 97 features including:
    #   - Win rate vs good/bad teams, form momentum, L5 momentum
    #   - Scoring/defense trends, blowout tendency, venue edge
    # ULTRA confidence tier (>20%): 74.2% accuracy
    ml_prediction = None
    ml_margin_pred = None
    try:
        try:
            import joblib as _loader
        except ImportError:
            import pickle as _loader
        model_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Load models (cached after first load) — v3 full ensemble
        if not hasattr(calculate_edge, '_ml_clf'):
            import json as _json

            def _load_model(name):
                path = os.path.join(model_dir, name)
                if os.path.exists(path):
                    return _loader.load(path)
                return None

            calculate_edge._ml_clf  = _load_model('otj_lgb_classifier.pkl')  # LightGBM
            calculate_edge._ml_reg  = _load_model('otj_xgb_regressor.pkl')   # XGB margin
            calculate_edge._ml_xgb  = _load_model('otj_xgb_classifier.pkl')  # XGB classifier
            calculate_edge._ml_rf   = _load_model('otj_rf_classifier.pkl')    # Random Forest
            calculate_edge._ml_lr   = _load_model('otj_lr_classifier.pkl')    # LR dict {model, scaler}

            feat_path = os.path.join(model_dir, 'otj_model_features.json')
            wt_path   = os.path.join(model_dir, 'otj_ensemble_weights.json')

            if os.path.exists(feat_path):
                with open(feat_path) as f:
                    calculate_edge._ml_features = _json.load(f)
            else:
                calculate_edge._ml_features = None

            if os.path.exists(wt_path):
                with open(wt_path) as f:
                    calculate_edge._ml_weights = _json.load(f)
            else:
                calculate_edge._ml_weights = {'lgb': 0.35, 'xgb': 0.30, 'rf': 0.20, 'lr': 0.15}

            models_loaded = sum(1 for m in [
                calculate_edge._ml_clf, calculate_edge._ml_xgb,
                calculate_edge._ml_rf, calculate_edge._ml_lr
            ] if m is not None)
            print(f"  🤖 ML ensemble: {models_loaded}/4 models loaded", file=sys.stderr)
        
        if calculate_edge._ml_clf is not None:
            features = calculate_edge._ml_features
            
            # Build feature vector from available data
            # All values cast to float to prevent string subtraction errors
            feat_row = {}
            
            def _f(val, default=0):
                """Safely convert to float."""
                try:
                    return float(val) if val is not None else float(default)
                except (TypeError, ValueError):
                    return float(default)
            
            # Home team features
            feat_row['h_wins'] = _f(home.get('wins', 0))
            feat_row['h_losses'] = _f(home.get('losses', 0))
            h_gp = max(feat_row['h_wins'] + feat_row['h_losses'], 1)
            feat_row['h_win_pct'] = round(feat_row['h_wins'] / h_gp, 3)
            feat_row['h_l10_wins'] = _f(home.get('l10_wins', 5))
            feat_row['h_l10_pct'] = feat_row['h_l10_wins'] / 10.0
            feat_row['h_l5_wins'] = _f(home.get('l5_wins', 3))
            feat_row['h_l5_pct'] = feat_row['h_l5_wins'] / 5.0
            feat_row['h_streak'] = _f(home.get('streak', 0))
            feat_row['h_home_win_pct'] = _f(home.get('home_win_pct', 0.5))
            feat_row['h_away_win_pct'] = _f(home.get('away_win_pct', 0.5))
            feat_row['h_avg_pts_scored'] = _f(home.get('off_rating', 110))
            feat_row['h_avg_pts_allowed'] = _f(home.get('def_rating', 112))
            feat_row['h_net_rating_proxy'] = _f(home.get('net_rating', 0))
            feat_row['h_l10_avg_scored'] = _f(home.get('off_rating_last10', feat_row['h_avg_pts_scored']))
            feat_row['h_l10_avg_allowed'] = _f(home.get('def_rating_last10', feat_row['h_avg_pts_allowed']))
            feat_row['h_l10_net'] = feat_row['h_l10_avg_scored'] - feat_row['h_l10_avg_allowed']
            feat_row['h_rest_days'] = _f(home.get('rest_days', 1))
            feat_row['h_b2b'] = int(bool(home.get('b2b', False)))
            feat_row['h_three_in_four'] = int(bool(home.get('three_in_four', False)))
            feat_row['h_close_win_pct'] = _f(home.get('close_win_pct', 0.5))
            feat_row['h_blowout_wins'] = _f(home.get('blowout_wins', 0))
            feat_row['h_blowout_losses'] = _f(home.get('blowout_losses', 0))
            feat_row['h_avg_margin'] = _f(home.get('avg_margin', 0))
            feat_row['h_games_played'] = h_gp
            
            # Away team features
            feat_row['a_wins'] = _f(away.get('wins', 0))
            feat_row['a_losses'] = _f(away.get('losses', 0))
            a_gp = max(feat_row['a_wins'] + feat_row['a_losses'], 1)
            feat_row['a_win_pct'] = round(feat_row['a_wins'] / a_gp, 3)
            feat_row['a_l10_wins'] = _f(away.get('l10_wins', 5))
            feat_row['a_l10_pct'] = feat_row['a_l10_wins'] / 10.0
            feat_row['a_l5_wins'] = _f(away.get('l5_wins', 3))
            feat_row['a_l5_pct'] = feat_row['a_l5_wins'] / 5.0
            feat_row['a_streak'] = _f(away.get('streak', 0))
            feat_row['a_home_win_pct'] = _f(away.get('home_win_pct', 0.5))
            feat_row['a_away_win_pct'] = _f(away.get('away_win_pct', 0.5))
            feat_row['a_avg_pts_scored'] = _f(away.get('off_rating', 110))
            feat_row['a_avg_pts_allowed'] = _f(away.get('def_rating', 112))
            feat_row['a_net_rating_proxy'] = _f(away.get('net_rating', 0))
            feat_row['a_l10_avg_scored'] = _f(away.get('off_rating_last10', feat_row['a_avg_pts_scored']))
            feat_row['a_l10_avg_allowed'] = _f(away.get('def_rating_last10', feat_row['a_avg_pts_allowed']))
            feat_row['a_l10_net'] = feat_row['a_l10_avg_scored'] - feat_row['a_l10_avg_allowed']
            feat_row['a_rest_days'] = _f(away.get('rest_days', 1))
            feat_row['a_b2b'] = int(bool(away.get('b2b', False)))
            feat_row['a_three_in_four'] = int(bool(away.get('three_in_four', False)))
            feat_row['a_close_win_pct'] = _f(away.get('close_win_pct', 0.5))
            feat_row['a_blowout_wins'] = _f(away.get('blowout_wins', 0))
            feat_row['a_blowout_losses'] = _f(away.get('blowout_losses', 0))
            feat_row['a_avg_margin'] = _f(away.get('avg_margin', 0))
            feat_row['a_games_played'] = a_gp
            
            # Differentials
            feat_row['diff_win_pct'] = round(feat_row['h_win_pct'] - feat_row['a_win_pct'], 3)
            feat_row['diff_l10_pct'] = round(feat_row['h_l10_pct'] - feat_row['a_l10_pct'], 3)
            feat_row['diff_net_rating'] = round(feat_row['h_net_rating_proxy'] - feat_row['a_net_rating_proxy'], 1)
            feat_row['diff_l10_net'] = round(feat_row['h_l10_net'] - feat_row['a_l10_net'], 1)
            feat_row['diff_streak'] = feat_row['h_streak'] - feat_row['a_streak']
            feat_row['diff_rest_days'] = feat_row['h_rest_days'] - feat_row['a_rest_days']
            feat_row['diff_close_win_pct'] = round(feat_row['h_close_win_pct'] - feat_row['a_close_win_pct'], 3)
            
            # Situational
            feat_row['home_b2b'] = feat_row['h_b2b']
            feat_row['away_b2b'] = feat_row['a_b2b']
            feat_row['both_b2b'] = int(feat_row['h_b2b'] and feat_row['a_b2b'])
            feat_row['home_3in4'] = feat_row['h_three_in_four']
            feat_row['away_3in4'] = feat_row['a_three_in_four']
            
            # ── NEW v2 FEATURES (37 features from retrain) ───────────────────
            
            # Opponent tier — is tonight's opponent good or bad?
            feat_row['h_opp_is_good'] = int(feat_row['a_win_pct'] >= 0.500)
            feat_row['a_opp_is_good'] = int(feat_row['h_win_pct'] >= 0.500)
            feat_row['h_opp_strength'] = feat_row['a_win_pct']
            feat_row['a_opp_strength'] = feat_row['h_win_pct']
            feat_row['diff_opp_strength'] = feat_row['h_opp_strength'] - feat_row['a_opp_strength']
            
            # Win rate vs good/bad teams (from supplemental or computed at runtime)
            feat_row['h_win_rate_vs_good'] = _f(home.get('win_rate_vs_good', 0.5))
            feat_row['h_win_rate_vs_bad'] = _f(home.get('win_rate_vs_bad', 0.5))
            feat_row['a_win_rate_vs_good'] = _f(away.get('win_rate_vs_good', 0.5))
            feat_row['a_win_rate_vs_bad'] = _f(away.get('win_rate_vs_bad', 0.5))
            feat_row['h_margin_vs_good'] = _f(home.get('margin_vs_good', 0))
            feat_row['h_margin_vs_bad'] = _f(home.get('margin_vs_bad', 0))
            feat_row['a_margin_vs_good'] = _f(away.get('margin_vs_good', 0))
            feat_row['a_margin_vs_bad'] = _f(away.get('margin_vs_bad', 0))
            feat_row['diff_wr_vs_good'] = feat_row['h_win_rate_vs_good'] - feat_row['a_win_rate_vs_good']
            feat_row['diff_wr_vs_bad'] = feat_row['h_win_rate_vs_bad'] - feat_row['a_win_rate_vs_bad']
            feat_row['diff_margin_vs_good'] = feat_row['h_margin_vs_good'] - feat_row['a_margin_vs_good']
            feat_row['diff_margin_vs_bad'] = feat_row['h_margin_vs_bad'] - feat_row['a_margin_vs_bad']
            
            # Form momentum — L10 net vs season net (positive = trending UP)
            feat_row['h_form_momentum'] = feat_row['h_l10_net'] - feat_row['h_net_rating_proxy']
            feat_row['a_form_momentum'] = feat_row['a_l10_net'] - feat_row['a_net_rating_proxy']
            feat_row['diff_form_momentum'] = feat_row['h_form_momentum'] - feat_row['a_form_momentum']
            
            # L5 momentum — even more recent trend
            feat_row['h_l5_momentum'] = feat_row['h_l5_pct'] - feat_row['h_win_pct']
            feat_row['a_l5_momentum'] = feat_row['a_l5_pct'] - feat_row['a_win_pct']
            feat_row['diff_l5_momentum'] = feat_row['h_l5_momentum'] - feat_row['a_l5_momentum']
            
            # Scoring/defense trends — recent vs season
            feat_row['h_scoring_trend'] = feat_row['h_l10_avg_scored'] - feat_row['h_avg_pts_scored']
            feat_row['a_scoring_trend'] = feat_row['a_l10_avg_scored'] - feat_row['a_avg_pts_scored']
            feat_row['h_defense_trend'] = feat_row['h_avg_pts_allowed'] - feat_row['h_l10_avg_allowed']
            feat_row['a_defense_trend'] = feat_row['a_avg_pts_allowed'] - feat_row['a_l10_avg_allowed']
            feat_row['diff_scoring_trend'] = feat_row['h_scoring_trend'] - feat_row['a_scoring_trend']
            feat_row['diff_defense_trend'] = feat_row['h_defense_trend'] - feat_row['a_defense_trend']
            
            # Blowout tendency
            feat_row['h_blowout_rate'] = feat_row['h_blowout_wins'] / max(feat_row['h_games_played'], 1)
            feat_row['a_blowout_rate'] = feat_row['a_blowout_wins'] / max(feat_row['a_games_played'], 1)
            feat_row['h_blowout_loss_rate'] = feat_row['h_blowout_losses'] / max(feat_row['h_games_played'], 1)
            feat_row['a_blowout_loss_rate'] = feat_row['a_blowout_losses'] / max(feat_row['a_games_played'], 1)
            feat_row['diff_blowout_rate'] = feat_row['h_blowout_rate'] - feat_row['a_blowout_rate']
            
            # Home/away split strength
            feat_row['h_home_away_split'] = feat_row['h_home_win_pct'] - feat_row['h_away_win_pct']
            feat_row['a_home_away_split'] = feat_row['a_home_win_pct'] - feat_row['a_away_win_pct']
            feat_row['h_venue_edge'] = feat_row['h_home_win_pct'] - feat_row['a_away_win_pct']
            
            # ── END v2 FEATURES ──────────────────────────────────────────────
            
            # Build feature vector in correct order
            import pandas as pd
            X_pred = pd.DataFrame([{f: feat_row.get(f, 0) for f in features}])
            
            # Predict
            # ── Get probabilities from all available models ─────────────────
            weights = calculate_edge._ml_weights or {'lgb':0.35,'xgb':0.30,'rf':0.20,'lr':0.15}
            probs = []
            votes = []

            # LightGBM (primary)
            lgb_p = calculate_edge._ml_clf.predict_proba(X_pred)[0][1]
            probs.append(('lgb', lgb_p, weights['lgb']))
            votes.append(1 if lgb_p >= 0.5 else 0)

            # XGBoost classifier
            if calculate_edge._ml_xgb is not None:
                xgb_p = calculate_edge._ml_xgb.predict_proba(X_pred)[0][1]
                probs.append(('xgb', xgb_p, weights['xgb']))
                votes.append(1 if xgb_p >= 0.5 else 0)

            # Random Forest
            if calculate_edge._ml_rf is not None:
                rf_p = calculate_edge._ml_rf.predict_proba(X_pred)[0][1]
                probs.append(('rf', rf_p, weights['rf']))
                votes.append(1 if rf_p >= 0.5 else 0)

            # Logistic Regression
            if calculate_edge._ml_lr is not None:
                lr_data = calculate_edge._ml_lr
                if isinstance(lr_data, dict):
                    scaler = lr_data['scaler']
                    lr_model = lr_data['model']
                    X_scaled = scaler.transform(X_pred)
                    lr_p = lr_model.predict_proba(X_scaled)[0][1]
                else:
                    lr_p = lr_data.predict_proba(X_pred)[0][1]
                probs.append(('lr', lr_p, weights.get('lr', 0.15)))
                votes.append(1 if lr_p >= 0.5 else 0)

            # Weighted ensemble probability
            total_weight = sum(w for _, _, w in probs)
            home_win_prob = sum(p * w for _, p, w in probs) / total_weight

            # Consensus: how many models agree?
            votes_home = sum(votes)
            votes_away = len(votes) - votes_home
            consensus = votes_home >= 3 or votes_away >= 3  # 3+ of 4 agree
            consensus_str = f"{votes_home}/{len(votes)} models" if home_win_prob >= 0.5 else f"{votes_away}/{len(votes)} models"

            ml_prediction = home_win_prob
            ml_margin_pred = calculate_edge._ml_reg.predict(X_pred)[0]
            ml_confidence = abs(home_win_prob - 0.5)

            # Consensus gating: reduce impact when models disagree
            consensus_multiplier = 1.0 if consensus else 0.5

            if ml_confidence >= 0.10:
                ml_favors_home = home_win_prob > 0.5
                ml_team = home["team"] if ml_favors_home else away["team"]
                ml_impact = min(ml_confidence * 15 * consensus_multiplier, 4.0)

                score += ml_impact if ml_favors_home else -ml_impact

                favored_win_prob = home_win_prob if ml_favors_home else (1 - home_win_prob)
                venue_label = "home" if ml_favors_home else "road"
                consensus_note = f" ✅ {consensus_str} agree" if consensus else f" ⚠ split ({consensus_str})"

                signals.append({
                    "type": "ML_PREDICTION",
                    "detail": (
                        f"Ensemble model ({len(probs)}/4): {ml_team} "
                        f"({favored_win_prob:.0%} {venue_label} win prob, "
                        f"margin {ml_margin_pred:+.1f}){consensus_note}"
                    ),
                    "favors": ml_team,
                    "strength": "STRONG" if (ml_confidence >= 0.15 and consensus) else "MODERATE",
                    "impact": round(ml_impact, 1),
                })

                print(
                    f"  🤖 ML Ensemble: {ml_team} favored "
                    f"({home_win_prob:.0%}, margin {ml_margin_pred:+.1f}, "
                    f"consensus={'YES' if consensus else 'SPLIT'}, impact {ml_impact:+.1f})",
                    file=sys.stderr
                )
            else:
                print(f"  🤖 ML: No strong conviction ({home_win_prob:.0%} home, {consensus_str})", file=sys.stderr)
    
    except Exception as e:
        print(f"  ⚠ ML prediction failed: {e}", file=sys.stderr)
    # ── End ML Prediction ─────────────────────────────────────────────────────

    abs_score = abs(score)
    confidence = "SHARP" if abs_score >= 14 else "LEAN" if abs_score >= 8 else "INFO"
    lean = home["team"] if score > 0 else away["team"] if score < 0 else None

    # ── Standings Tier override — kill spread lean on TANK teams ──────────────
    # If the lean landed on a TANK team AND the lean is based on spread value,
    # suppress it. Tank teams don't cover big spreads — they lose by 30.
    if tank_lean_killed and lean:
        lean_team_wpct = h_wpct if lean == home["team"] else a_wpct
        lean_team_tier = h_tier if lean == home["team"] else a_tier
        if lean_team_tier == "TANK":
            confidence = "INFO"
            lean = None
            print(f"  🚫 TANK LEAN KILLED — would have leaned a .{int(lean_team_wpct*1000)} team", file=sys.stderr)
    # ── End Standings Tier override ───────────────────────────────────────────

    # ── Decimation override — kill lean when roster is gutted ─────────────────
    if home_decimated or away_decimated:
        confidence = "INFO"
        lean = None
    # ── End decimation override ───────────────────────────────────────────────

    # ── Spread Intelligence — show cover rates, don't suppress leans ─────────
    # Data from 1,043 games: cover rate by spread size (elite/avg home vs tank away)
    # No hard caps — let the user see the data and decide
    spread_val = abs(float(spread_home or 0))

    if spread_val >= 6.0:
        # Determine cover rate bracket from our data
        if spread_val <= 8.5:
            cover_pct = "68.5%"
            ev_note = "+$33.80 EV at -110"
            verdict = "STRONG VALUE"
        elif spread_val <= 10.5:
            cover_pct = "60.3%"
            ev_note = "+$16.60 EV at -110"
            verdict = "PROFITABLE"
        elif spread_val <= 12.5:
            cover_pct = "52.1%"
            ev_note = "~breakeven at -110"
            verdict = "THIN EDGE"
        elif spread_val <= 14.5:
            cover_pct = "45.2%"
            ev_note = "-$6.40 EV at -110"
            verdict = "BELOW BREAKEVEN"
        elif spread_val <= 17.5:
            cover_pct = "39.7%"
            ev_note = "-$15+ EV at -110"
            verdict = "LOSING BET — consider alt line or ML"
        else:
            cover_pct = "27.4%"
            ev_note = "-$26+ EV at -110"
            verdict = "PASS — buy down to -10.5 or ML only"

        strength = "STRONG" if spread_val <= 10.5 else "MODERATE" if spread_val <= 12.5 else "CAUTION"

        signals.append({
            "type": "SPREAD_INTEL",
            "detail": (
                f"Spread {spread_val} pts — covers {cover_pct} of the time. "
                f"{ev_note}. {verdict}"
            ),
            "favors": "INFO",
            "strength": strength,
            "impact": 0,  # informational only — no score suppression
        })

    # Pace intelligence
    h_pace = home.get("pace", 100) or 100
    a_pace = away.get("pace", 100) or 100
    try:
        h_pace_f = float(h_pace)
        a_pace_f = float(a_pace)
    except:
        h_pace_f = 100.0
        a_pace_f = 100.0
    
    combined_pace = (h_pace_f + a_pace_f) / 2
    if combined_pace > 103:
        signals.append({
            "type": "PACE_INTEL",
            "detail": (
                f"Combined pace {combined_pace:.1f} (fast) — "
                f"both fast teams avg 231 total pts, over 225 hits 55%"
            ),
            "favors": "OVER",
            "strength": "MODERATE",
            "impact": 0,
        })
    elif combined_pace < 98:
        signals.append({
            "type": "PACE_INTEL",
            "detail": (
                f"Combined pace {combined_pace:.1f} (slow) — "
                f"grinder game, lean under"
            ),
            "favors": "UNDER",
            "strength": "MODERATE",
            "impact": 0,
        })

    # Close game intelligence — show both teams' clutch records
    if min_sample >= 5:
        h_cw = home.get("close_wins", 0)
        h_cl = home.get("close_losses", 0)
        a_cw = away.get("close_wins", 0)
        a_cl = away.get("close_losses", 0)
        h_close_total = h_cw + h_cl
        a_close_total = a_cw + a_cl
        
        if h_close_total >= 5 and a_close_total >= 5:
            h_cpct = h_cw / h_close_total
            a_cpct = a_cw / a_close_total
            clutch_gap = abs(h_cpct - a_cpct)

            # CLUTCH_EDGE: scored signal in coin flip games (spread <= 3.5)
            # When the game is basically even on paper, clutch record is the tiebreaker
            spread_abs_clutch = abs(float(spread_home or 0))
            is_coin_flip = spread_abs_clutch <= 3.5

            if clutch_gap >= 0.15 or h_cpct >= 0.70 or a_cpct >= 0.70 or h_cpct <= 0.30 or a_cpct <= 0.30:
                clutch_team  = home["team"] if h_cpct > a_cpct else away["team"]
                clutch_is_home = h_cpct > a_cpct
                better_pct   = max(h_cpct, a_cpct)
                worse_pct    = min(h_cpct, a_cpct)

                if is_coin_flip and clutch_gap >= 0.15:
                    # Real scored impact — clutch record decides coin flip games
                    impact = 1.5 if clutch_gap >= 0.25 else 1.0
                    score += impact if clutch_is_home else -impact
                    signal_type = "CLUTCH_EDGE"
                    strength = "STRONG" if clutch_gap >= 0.25 else "MODERATE"
                    detail = (
                        f"⚡ CLUTCH EDGE: {clutch_team} closes {better_pct:.0%} vs "
                        f"{away['team'] if clutch_is_home else home['team']} {worse_pct:.0%} in tight games "
                        f"— coin flip spread ({spread_abs_clutch:.1f}pts), clutch record is the tiebreaker"
                    )
                    print(f"  ⚡ CLUTCH_EDGE: {clutch_team} {better_pct:.0%} vs {worse_pct:.0%} — coin flip game, impact {impact:+.1f}", file=sys.stderr)
                else:
                    # Informational only when spread is large or gap is small
                    impact = 0
                    signal_type = "CLUTCH_INTEL"
                    strength = "MODERATE"
                    detail = (
                        f"Close games (≤5pts): {home['team']} {h_cw}-{h_cl} ({h_cpct:.0%}) vs "
                        f"{away['team']} {a_cw}-{a_cl} ({a_cpct:.0%}) — "
                        f"{'tight game favors ' + home['team'] if h_cpct > a_cpct else 'tight game favors ' + away['team']}"
                    )

                signals.append({
                    "type": signal_type,
                    "detail": detail,
                    "favors": clutch_team,
                    "strength": strength,
                    "impact": impact,
                })

    # ML profitability intel — show if the ML odds are in the profitable range
    try:
        h_ml = float(result.get("ml_home") or 0) if 'result' in dir() else 0
        a_ml = float(result.get("ml_away") or 0) if 'result' in dir() else 0
    except:
        h_ml = 0
        a_ml = 0

    for ml_val, team_name in [(h_ml, home["team"]), (a_ml, away["team"])]:
        if ml_val != 0:
            abs_ml = abs(ml_val)
            if ml_val < 0 and abs_ml >= 600:
                signals.append({
                    "type": "ML_JUICE_WARNING",
                    "detail": (
                        f"{team_name} ML {int(ml_val)} — needs {abs_ml/(abs_ml+100):.0%} to break even. "
                        f"Data says elite teams win 83.5% vs tanks. Juice likely eats the edge."
                    ),
                    "favors": "CAUTION",
                    "strength": "CAUTION",
                    "impact": 0,
                })
                break
            elif ml_val < 0 and 150 <= abs_ml <= 400:
                signals.append({
                    "type": "ML_VALUE",
                    "detail": (
                        f"{team_name} ML {int(ml_val)} — needs {abs_ml/(abs_ml+100):.0%} to break even. "
                        f"Sweet spot range for favorites vs bad teams."
                    ),
                    "favors": team_name,
                    "strength": "MODERATE",
                    "impact": 0,
                })
                break
    # ── End Spread/Pace/Clutch/ML Intelligence ────────────────────────────────

    # ── OTJ Spread Gut Check Rule — REMOVED 2026-03-23 ─────────────────────
    # Replaced by ML_PREDICTION signal which is data-driven, not hand-tuned
    otj_spread_rule = None
    # ── End OTJ Spread Rule ───────────────────────────────────────────────────

    return {
        "lean": lean,
        "confidence": confidence,
        "score": round(score, 1),
        "signals": signals,
        "ou_lean": None,
        "otj_spread_rule":   otj_spread_rule,
        "otj_matchup_note":  otj_matchup_note,
    }


# ============================================================================
# BUILD TEAM PROFILE
# ============================================================================

def build_team_profile(team_abbrev: str, team_id: int, all_stats: dict, game_date: str, espn_yesterday: set = None, injuries: list = None, yesterday_results: dict = None) -> dict:
    """Build a complete team profile for edge calculation."""
    profile = {"team": team_abbrev, "team_id": team_id}

    s = all_stats.get(team_abbrev, {})

    profile["record"] = f"{s.get('wins', 0)}-{s.get('losses', 0)}" if s else "0-0"
    profile["win_pct"] = round(s.get("win_pct", 0), 3) if s else 0

    # Net rating — use real advanced net rating from GOAT tier, fallback to pts diff
    pts = s.get("pts", 0) or 0
    opp_pts = s.get("opp_pts", 0) or 0
    adv_net = s.get("net_rating_adv")
    adv_off = s.get("off_rating_adv")
    adv_def = s.get("def_rating_adv")
    profile["net_rating"] = round(adv_net, 1) if adv_net is not None else round(pts - opp_pts, 1)
    profile["off_rating"] = round(adv_off, 1) if adv_off is not None else round(pts, 1)
    profile["def_rating"] = round(adv_def, 1) if adv_def is not None else round(opp_pts, 1)
    profile["pace"] = round(s.get("pace", 0) or 0, 1)
    profile["efg_pct"] = round((s.get("efg_pct", 0) or 0) * 100, 1)
    profile["ts_pct"] = round((s.get("ts_pct", 0) or 0) * 100, 1)

    # 3PT%
    fg3_pct = s.get("fg3_pct", 0) or 0
    profile["three_pct"] = round(fg3_pct * 100, 1) if fg3_pct < 1 else round(fg3_pct, 1)
    # L10 3PT% — real calc via Tank01, fallback to season avg
    l10_three = get_tank01_l10_three(team_abbrev, game_date)
    profile["last10_three"] = l10_three if l10_three is not None else profile["three_pct"]

    # Bench net rating — real data via Tank01, fallback to 0
    bench_data = get_tank01_bench(team_abbrev, injuries=injuries)
    profile["bench_net"] = bench_data["bench_net"]
    profile["bench_ppg"] = bench_data["bench_ppg"]

    profile["key_out"] = []

    # B2B / schedule / close game record (all from same API call)
    sched = check_b2b(team_id, game_date, team_abbrev=team_abbrev, espn_yesterday=espn_yesterday, yesterday_results=yesterday_results)
    profile["b2b"] = sched["b2b"]
    profile["rest_days"] = sched["rest_days"]
    profile["last5"] = sched["last5"]
    profile["streak"] = sched["streak"]
    profile["close_wins"] = sched["close_wins"]
    profile["close_losses"] = sched["close_losses"]
    profile["close_pct"] = sched["close_pct"]

    # Fast break stats — pulled from all_stats if available (pre-fetched in main)
    profile["fb_pts"]         = round(float(s.get("fb_pts", 0) or 0), 1)
    profile["fb_pts_allowed"] = round(float(s.get("fb_pts_allowed", 0) or 0), 1)

    return profile


# ============================================================================
# MAIN
# ============================================================================

# ============================================================================
# CLAUDE NARRATIVE GENERATOR

def build_b2b_and_mismatches(all_results: list, game_date: str) -> tuple:
    """
    Build B2B tier cards (Nightmare/Dangerous/Manageable) and spread mismatch analysis.
    Returns: (b2b_tiers, b2b_tags, spread_mismatches)
    """
    TIER_DEFS = [
        {
            "tier": "💀 TIER 1 — NIGHTMARE",
            "key": "NIGHTMARE",
            "color": "#ef4444",
            "desc": "B2B + road travel + opponent rested 2+ days",
        },
        {
            "tier": "🔥 TIER 2 — DANGEROUS",
            "key": "DANGEROUS",
            "color": "#f59e0b",
            "desc": "B2B + road travel + opponent rested 1 day",
        },
        {
            "tier": "⚡ TIER 3 — MANAGEABLE",
            "key": "MANAGEABLE",
            "color": "#6b7280",
            "desc": "B2B at home (no travel tax) or both teams on B2B",
        },
    ]

    def classify_b2b(b2b_team: dict, opp_team: dict, is_home: bool) -> str:
        """Classify a B2B situation into a tier."""
        opp_rest = opp_team.get("rest_days", 1)
        both_b2b = opp_team.get("b2b", False)

        if both_b2b:
            return "MANAGEABLE"  # cancels out
        if is_home:
            return "MANAGEABLE"  # home B2B, no travel
        # Road B2B
        if opp_rest >= 2:
            return "NIGHTMARE"
        return "DANGEROUS"

    b2b_games = []
    b2b_tags = []
    spread_mismatches = []

    for r in all_results:
        away = r["away"]
        home = r["home"]
        matchup = r["matchup"]
        spread_home = r.get("spread_home")

        # Find B2B teams
        for b2b_team, opp_team, is_home in [
            (away, home, False),
            (home, away, True),
        ]:
            if not b2b_team.get("b2b"):
                continue

            tier_key = classify_b2b(b2b_team, opp_team, is_home)
            tier_def = next(t for t in TIER_DEFS if t["key"] == tier_key)
            label = "home" if is_home else "@ road"

            # Add example to tier def
            example_line = f"Tonight: {matchup} — {b2b_team['team']} B2B ({label}), {opp_team['team']} rested {opp_team.get('rest_days', 1)}d"

            # Tag for quick display
            b2b_tags.append({
                "matchup": matchup,
                "team": b2b_team["team"],
                "tier": tier_def["tier"].split("—")[0].strip(),
                "tier_key": tier_key,
                "color": tier_def["color"],
                "note": f"({'home' if is_home else 'road'})",
                "example": example_line,
            })

            b2b_games.append({
                "matchup": matchup,
                "tier_key": tier_key,
                "tier_def": tier_def,
                "b2b_team": b2b_team["team"],
                "opp_team": opp_team["team"],
                "is_home": is_home,
                "example": example_line,
            })

        # ── Spread mismatch: model edge vs posted spread ──────────────────
        if spread_home is None:
            continue

        try:
            spread_val = float(spread_home)
        except (TypeError, ValueError):
            continue

        edge_score = r["edge"].get("score", 0)
        lean_team = r["edge"].get("lean", "")
        confidence = r["edge"].get("confidence", "INFO")

        # Model implied spread — use same formula as gut check for consistency:
        # fair_spread = net_rating_diff * 0.45 (industry standard conversion)
        # This ensures INFLATED card and gut check tell the same story to the user.
        h_net = r["home"].get("net_rating", 0) or 0
        a_net = r["away"].get("net_rating", 0) or 0
        raw_net_diff = abs(h_net - a_net)
        # Fall back to edge_score * 0.5 only if net ratings are unavailable
        if raw_net_diff >= 1.0:
            model_implied = round(raw_net_diff * 0.45, 1)
            # Preserve sign: positive = home favored by that much
            if h_net < a_net:
                model_implied = -model_implied
        else:
            model_implied = round(edge_score * 0.5, 1)
        gap = round(abs(spread_val) - abs(model_implied), 1)

        # Only flag meaningful gaps (2+ pts) on B2B teams or SHARP/LEAN games
        has_b2b = away.get("b2b") or home.get("b2b")
        is_significant = confidence in ("SHARP", "LEAN") or has_b2b

        if gap >= 2.0 and is_significant:
            # Determine if spread is inflated or undervalued
            # Positive spread_home means home is favored
            # If model says home by X but spread is home -Y where Y >> X → inflated
            if spread_val < 0 and model_implied > 0:
                direction = "INFLATED"
                verdict_color = "#ef4444"
                # Strength of recommendation based on gap
                conf_note = "strong lean" if gap >= 6 else "moderate lean" if gap >= 4 else "mild lean"
                verdict = (
                    f"Vegas says {home['team']} should win by {abs(spread_val)} points. "
                    f"Our model thinks it's closer to {abs(model_implied):.0f} points — "
                    f"a {gap:.0f}-point gap. "
                    f"{home['team']} may be overpriced here. "
                    f"The play isn't necessarily {away['team']} to win — "
                    f"it's that {home['team']} probably won't win by that much. "
                    f"{away['team']} +{abs(spread_val)} could have cushion ({conf_note})."
                )
            elif spread_val > 0 and model_implied < 0:
                direction = "UNDERVALUED"
                verdict_color = "#22c55e"
                conf_note = "strong lean" if gap >= 6 else "moderate lean" if gap >= 4 else "mild lean"
                verdict = (
                    f"Vegas has {home['team']} as a {abs(spread_val)}-point underdog. "
                    f"Our model thinks it's closer to a {abs(model_implied):.0f}-point game — "
                    f"a {gap:.0f}-point gap. "
                    f"The play here isn't {home['team']} to win outright — "
                    f"it's that {home['team']} probably won't get blown out by that much. "
                    f"{home['team']} +{abs(spread_val)} could be the value spot ({conf_note})."
                )
            elif has_b2b:
                # B2B team still favored — fatigue not priced in
                b2b_team_name = away["team"] if away.get("b2b") else home["team"]
                direction = "B2B NOT PRICED"
                verdict_color = "#f59e0b"
                penalty = "~2-3 pts" if any(t.get("tier_key") == "MANAGEABLE" for t in b2b_tags if t["matchup"] == matchup) else "~4-5 pts"
                adj_spread = round(spread_val + (3 if away.get("b2b") else -3), 1)
                verdict = f"{b2b_team_name} on B2B — fatigue tax of {penalty} not fully priced in. Adjusted line: {adj_spread}."
            else:
                continue

            # Value rating
            if gap >= 5:
                value = "HIGH"
            elif gap >= 3:
                value = "MEDIUM"
            else:
                value = "LOW"

            spread_mismatches.append({
                "matchup": matchup,
                "direction": direction,
                "value": value,
                "verdict_color": verdict_color,
                "spread": f"{home['team']} {spread_home}",
                # model_edge = what OTJ thinks the spread should be (net ratings * 0.45)
                # edge_score_raw = confidence level (how many signals fired, NOT a point margin)
                "model_edge": f"{model_implied:+.1f} pts",
                "model_edge_label": "OTJ FAIR SPREAD",   # UI should show this, not "MODEL EDGE"
                "edge_score_raw": round(edge_score, 1),
                "edge_score_label": "CONFIDENCE",         # UI should show this, not "SIGNAL SCORE"
                "gap": f"{gap:.1f} pts",
                "verdict": verdict,
                "confidence": confidence,
                # B2B specific fields (kept for B2BTierCard compat)
                "b2b_team": away["team"] if away.get("b2b") else home["team"] if home.get("b2b") else "",
                "tier": next((t["tier"].split("—")[0].strip() for t in b2b_tags if t["matchup"] == matchup), ""),
                "penalty": "~2-3 pts",
                "adjusted": str(round(spread_val + 3, 1)) if away.get("b2b") else str(round(spread_val - 3, 1)),
            })

    # Build tier defs with examples for tonight
    tiers_tonight = []
    for tier_def in TIER_DEFS:
        examples = [g["example"] for g in b2b_games if g["tier_key"] == tier_def["key"]]
        if examples:
            tiers_tonight.append({
                **tier_def,
                "example": " · ".join(examples),
            })

    return tiers_tonight if tiers_tonight else None, b2b_tags, spread_mismatches


# ============================================================================


# ============================================================================
# OTJ PARLAY BUILDER
# ============================================================================

def build_parlay(all_results: list, spread_mismatches: list) -> dict | None:
    """
    Build the nightly OTJ 3-leg parlay.
      Leg 1 SHARP      — highest score >= 14
      Leg 2 LEAN       — highest score 8-13
      Leg 3 BEST VALUE — largest spread mismatch gap (different game)
    Falls back to next best scored game if no mismatch available.
    Returns parlay dict or None if < 2 legs found.
    """
    sharp_games = sorted(
        [r for r in all_results if r["edge"]["confidence"] == "SHARP"],
        key=lambda r: abs(r["edge"]["score"]), reverse=True
    )
    lean_games = sorted(
        [r for r in all_results if r["edge"]["confidence"] == "LEAN"],
        key=lambda r: abs(r["edge"]["score"]), reverse=True
    )

    leg1_result = sharp_games[0] if sharp_games else None
    leg2_result = lean_games[0] if lean_games else None
    used = {r["matchup"] for r in [leg1_result, leg2_result] if r}

    # Leg 3: biggest mismatch gap on a different game
    value_candidates = sorted(
        [m for m in spread_mismatches if m["matchup"] not in used],
        key=lambda m: float(str(m.get("gap", "0")).replace(" pts", "")), reverse=True
    )
    leg3_mismatch = value_candidates[0] if value_candidates else None
    leg3_result = next(
        (r for r in all_results if r["matchup"] == leg3_mismatch["matchup"]),
        None
    ) if leg3_mismatch else None

    # If still no leg 3, take next best scored game
    if not leg3_result:
        remaining = sorted(
            [r for r in all_results if r["matchup"] not in used],
            key=lambda r: abs(r["edge"]["score"]), reverse=True
        )
        leg3_result = remaining[0] if remaining else None

    legs_raw = [
        (leg1_result, "SHARP 🔴", None),
        (leg2_result, "LEAN 🟡", None),
        (leg3_result, "BEST VALUE 💰", leg3_mismatch),
    ]

    def build_leg(result, label, mismatch):
        if not result:
            return None
        edge = result["edge"]
        lean_team = edge.get("lean")
        if not lean_team:
            return None
        is_home = lean_team == result["home"]["team"]

        # ── Gut check override ────────────────────────────────────────────────
        # Pick logic — no gut check override, ML model handles edge detection
        pick_team = lean_team
        spread = result.get("spread_home") if is_home else result.get("spread_away")
        ml = result.get("ml_home") if is_home else result.get("ml_away")
        spread_odds = result.get("spread_home_odds") if is_home else result.get("spread_away_odds")

        pick_type, pick_line = "spread", None
        if mismatch and spread is not None:
            pick_type = "spread"
            pick_line = f"{pick_team} {float(spread):+.1f}" if spread else pick_team
        elif ml is not None:
            try:
                ml_val = int(ml)
                if ml_val > 0 or ml_val >= -150:
                    pick_type = "ml"
                    pick_line = f"{pick_team} {ml_val:+d}"
                elif spread is not None:
                    pick_type = "spread"
                    pick_line = f"{pick_team} {float(spread):+.1f}"
                else:
                    pick_type = "ml"
                    pick_line = f"{pick_team} {ml_val:+d}"
            except (ValueError, TypeError):
                pick_line = f"{pick_team} {spread}" if spread else pick_team
        elif spread is not None:
            pick_line = f"{pick_team} {float(spread):+.1f}"
        else:
            pick_line = pick_team
        # ── End pick logic ─────────────────────────────────────────────────

        signals = edge.get("signals", [])
        return {
            "label": label,
            "matchup": result["matchup"],
            "game_time": result.get("game_time", "TBD"),
            "lean_team": lean_team,
            "pick": pick_line,
            "pick_type": pick_type,
            "spread_odds": spread_odds,
            "confidence": edge["confidence"],
            "score": round(edge["score"], 1),
            "top_signal": signals[0]["detail"] if signals else "Model edge",
        }

    legs = [build_leg(r, lbl, mm) for r, lbl, mm in legs_raw]
    legs = [l for l in legs if l]
    if len(legs) < 2:
        return None

    return {
        "legs": legs,
        "leg_count": len(legs),
        "generated_at": datetime.now().isoformat(),
        "note": "OTJ Parlay — Sharp edge + Model lean + Best value play",
    }


def generate_game_narrative(result: dict) -> dict:
    """
    Call Claude to generate a human narrative for a single game.
    Returns dict with: summary, contrarian_flag, key_angle, ou_lean
    """
    if not ANTHROPIC_API_KEY or anthropic is None:
        return {}

    home = result["home"]
    away = result["away"]
    edge = result["edge"]

    home_injuries = [f"{p['name']} ({p['description'][:40]})" for p in home.get("injuries", [])]
    away_injuries = [f"{p['name']} ({p['description'][:40]})" for p in away.get("injuries", [])]

    # O/U context — compare combined season PPG vs posted total
    h_pts = home.get('off_rating') or 0
    a_pts = away.get('off_rating') or 0
    posted_total = result.get('total')
    try:
        combined_avg = round(h_pts + a_pts, 1)
        total_gap = round(float(posted_total) - combined_avg, 1) if posted_total else None
        if total_gap is not None:
            if total_gap > 4:
                ou_context = f"Posted total {posted_total} is {total_gap} pts ABOVE combined season avg ({combined_avg}) — Vegas pricing in a faster/higher-scoring game than average."
            elif total_gap < -4:
                ou_context = f"Posted total {posted_total} is {abs(total_gap)} pts BELOW combined season avg ({combined_avg}) — Vegas already pricing in a defensive/slower game."
            else:
                ou_context = f"Posted total {posted_total} is close to combined season avg ({combined_avg}) — market fairly priced on pace."
        else:
            ou_context = f"Combined season avg PPG: {combined_avg} (no posted total available)."
    except Exception:
        combined_avg = "N/A"
        ou_context = "Total data unavailable."

    prompt = f"""You are a sharp NBA analyst writing for The Overtime Journal, a data-driven picks site.
Analyze this game and respond ONLY with a JSON object — no preamble, no markdown, no backticks.

GAME: {result['matchup']}
TIME: {result.get('game_time', 'TBD')}
SPREAD: {result.get('spread', 'N/A')} | TOTAL: {result.get('total', 'N/A')}
ODDS VENDOR: {result.get('odds_vendor', 'N/A')}

HOME ({home['team']}):
- Record: {home.get('record')} | Net Rating: {home.get('net_rating'):+.1f}
- Off/Def Rating: {home.get('off_rating')}/{home.get('def_rating')}
- B2B: {home.get('b2b')} | Rest Days: {home.get('rest_days')}
- Last 5: {home.get('last5')} | Streak: {home.get('streak')}
- Close Games: {home.get('close_wins')}-{home.get('close_losses')} ({home.get('close_pct', 0.5):.0%})
- 3PT%: {home.get('three_pct')}%
- Injuries: {', '.join(home_injuries) if home_injuries else 'None reported'}

AWAY ({away['team']}):
- Record: {away.get('record')} | Net Rating: {away.get('net_rating'):+.1f}
- Off/Def Rating: {away.get('off_rating')}/{away.get('def_rating')}
- B2B: {away.get('b2b')} | Rest Days: {away.get('rest_days')}
- Last 5: {away.get('last5')} | Streak: {away.get('streak')}
- Close Games: {away.get('close_wins')}-{away.get('close_losses')} ({away.get('close_pct', 0.5):.0%})
- 3PT%: {away.get('three_pct')}%
- Injuries: {', '.join(away_injuries) if away_injuries else 'None reported'}

MODEL LEAN: {edge.get('lean', 'None')} | CONFIDENCE: {edge.get('confidence')} | SCORE: {edge.get('score'):+.1f}
TOP SIGNALS: {[s['detail'] for s in edge.get('signals', [])[:3]]}

O/U MARKET CONTEXT: {ou_context}

IMPORTANT RULES:
- Net ratings: ALWAYS show both teams with both numbers. Never say "X-point advantage" alone — say "DET at +7.6 vs BKN at -8.9, a 16.5-point gap between the two teams."
- The model SCORE is a composite of multiple signals. Do not imply one stat equals the score.
- O/U lean: Only call OVER or UNDER if our combined avg meaningfully diverges from the posted total AND there is a specific reason (injuries, pace, B2B) that the market may have mispriced. If the total looks fairly priced, return null. Do NOT call UNDER just because both teams have good defenses — Vegas already knows that.
- Sound like a beat reporter, not a robot. Be specific and direct.

Respond ONLY with this JSON structure:
{{
  "summary": "2-3 sentence sharp matchup summary. Lead with the biggest factor. When mentioning net ratings always show both teams and both numbers e.g. 'DET at +7.6 vs BKN at -8.9'. Mention injuries if relevant.",
  "key_angle": "The single most important edge in 1 sentence. Be specific with numbers.",
  "contrarian_flag": "If public money and model data point opposite directions, describe the fade here. Otherwise null.",
  "ou_lean": "OVER or UNDER or null — only if there is a specific mispricing reason beyond general team tendencies. Brief reason in parens.",
  "otj_pick": "One sentence picking a side with the strongest reason. Format: '{{TEAM}} {{spread}} — [reason]'. Tone MUST match confidence: SHARP=confident ('strong edge'), LEAN=moderate ('leaning'), INFO=soft ('no strong edge, slight lean if anything'). Never write confident language for INFO.",
  "narrative_signals": ["short signal 1", "short signal 2", "short signal 3"]
}}"""

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=NARRATIVE_MODEL,
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        # Strip any accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"  ⚠ Narrative generation failed ({result['matchup']}): {e}", file=sys.stderr)
        return {}


def generate_slate_narrative(all_results: list, game_date: str) -> dict:
    """
    Call Claude once to generate the slate-level headline, recap context,
    and B2B lesson for the day.
    Returns dict with: headline, headline_body, b2b_lesson
    """
    if not ANTHROPIC_API_KEY or anthropic is None:
        return {}

    sharp_games = [r for r in all_results if r["edge"]["confidence"] == "SHARP"]
    lean_games  = [r for r in all_results if r["edge"]["confidence"] == "LEAN"]
    b2b_games   = [r for r in all_results if r["away"].get("b2b") or r["home"].get("b2b")]

    game_summaries = []
    for r in all_results:
        e = r["edge"]
        injuries = []
        for p in r["home"].get("injuries", []) + r["away"].get("injuries", []):
            injuries.append(f"{p['name']} ({p['status']})")
        game_summaries.append(
            f"{r['matchup']} — lean: {e.get('lean','none')} ({e['confidence']}, score {e['score']:+.1f})"
            + (f" | injuries: {', '.join(injuries[:3])}" if injuries else "")
            + (f" | B2B: {[t for t in [r['away']['team'] if r['away'].get('b2b') else None, r['home']['team'] if r['home'].get('b2b') else None] if t]}" if b2b_games else "")
        )

    prompt = f"""You are the lead analyst for The Overtime Journal writing the daily slate preview for {game_date}.
Respond ONLY with a JSON object — no preamble, no markdown, no backticks.

TONIGHT'S SLATE ({len(all_results)} games):
{chr(10).join(game_summaries)}

SHARP picks: {[r['matchup'] + ' → ' + r['edge'].get('lean','?') for r in sharp_games]}
LEAN picks: {[r['matchup'] + ' → ' + r['edge'].get('lean','?') for r in lean_games]}
B2B teams: {[r['away']['team'] if r['away'].get('b2b') else r['home']['team'] for r in b2b_games]}

Respond ONLY with this JSON:
{{
  "headline": "ONE punchy headline for tonight's biggest story (under 12 words, ALL CAPS)",
  "headline_body": "2-3 sentences expanding on the headline. Sharp, narrative, no fluff.",
  "b2b_lesson": "If there are B2B situations tonight, write 1-2 sentences on the key fatigue angle. Otherwise null.",
  "sharp_summary": "1 sentence on why the SHARP pick(s) stand out tonight. If none, null."
}}"""

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=NARRATIVE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"  ⚠ Slate narrative failed: {e}", file=sys.stderr)
        return {}


def main():
    # Guard here (not module level) so this file can be safely imported by other scripts
    if not API_KEY:
        print("❌ BALLDONTLIE_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    game_date = datetime.now().strftime("%Y-%m-%d")
    team_filter = None
    json_mode = False

    for arg in sys.argv[1:]:
        if arg == "--json":
            json_mode = True
        elif arg.startswith("--date="):
            game_date = arg.split("=")[1]
        elif arg.startswith("--team="):
            team_filter = arg.split("=")[1].upper()

    if not json_mode:
        print("\n" + "=" * 60)
        print("  🏀 NBA Bench Edge Analyzer — Balldontlie Edition")
        print("=" * 60)
        print(f"  📅 Date: {game_date}")
        print(f"  Fetching data...\n")

    # Step 1: Get today's games
    games = get_todays_games(game_date)
    if not games:
        msg = f"No games found for {game_date}."
        if json_mode:
            print(json.dumps({"error": msg, "date": game_date}))
        else:
            print(f"  {msg}")
        return

    if team_filter:
        games = [g for g in games if team_filter in (g["home_team"], g["away_team"])]

    if not json_mode:
        print(f"  Found {len(games)} game(s). Pulling team stats...\n")

    # Step 2: Pull all team stats
    all_stats = get_all_team_stats(season=2025)

    if not all_stats:
        msg = "Could not fetch team stats."
        if json_mode:
            print(json.dumps({"error": msg, "date": game_date}))
        else:
            print(f"  ⚠ {msg}")
        return

    if not json_mode:
        print(f"  ✅ Team stats loaded ({len(all_stats)} teams)")

    # Fetch fast break stats from NBA Stats API and merge into all_stats
    if not json_mode:
        print(f"  Fetching fast break stats...", end=" ", flush=True)
    try:
        fb_stats = get_nba_fast_break_stats()
        for abbr, fb in fb_stats.items():
            if abbr in all_stats:
                all_stats[abbr]["fb_pts"]         = fb.get("fb_pts", 0)
                all_stats[abbr]["fb_pts_allowed"]  = fb.get("fb_pts_allowed", 0)
        if not json_mode:
            print(f"✅ {len(fb_stats)} teams")
    except Exception as e:
        if not json_mode:
            print(f"⚠ Failed ({e})")

    # Step 2b: Fetch odds + injuries
    if not json_mode:
        print(f"  Fetching odds...", end=" ", flush=True)
    todays_odds = get_todays_odds(game_date)
    if not json_mode:
        print(f"✅ {len(todays_odds)} games with odds")
        print(f"  Fetching injuries...", end=" ", flush=True)

    all_team_ids = list(set(
        [g["home_team_id"] for g in games] + [g["away_team_id"] for g in games]
    ))
    # Build abbrev→id map for Tank01 (it needs abbreviations, not IDs)
    team_abbrev_to_id = {}
    for g in games:
        team_abbrev_to_id[g["home_team"]] = g["home_team_id"]
        team_abbrev_to_id[g["away_team"]] = g["away_team_id"]

    # Injuries — try Tank01 first, fall back to BDL if empty
    if TANK01_AVAILABLE:
        if not json_mode:
            print(f"  Fetching injuries (Tank01)...", end=" ", flush=True)
        todays_injuries = get_tank01_injuries(team_abbrev_to_id)
        if not todays_injuries:
            if not json_mode:
                print(f"⚠ Tank01 returned no injuries — falling back to BDL")
            todays_injuries = get_todays_injuries(game_date, all_team_ids)
        elif not json_mode:
            injured_count = sum(len(v) for v in todays_injuries.values())
            print(f"✅ {injured_count} players out/doubtful (Tank01)")
    else:
        if not json_mode:
            print(f"  Fetching injuries (BDL)...", end=" ", flush=True)
        todays_injuries = get_todays_injuries(game_date, all_team_ids)
        print(f"\n  Building profiles & calculating edges...\n")

    # Step 2b: ESPN validation — fetch yesterday's teams to catch BDL lag
    if not json_mode:
        print(f"  Validating B2B via ESPN...", end=" ", flush=True)
    espn_yesterday, yesterday_results = espn_get_yesterday_teams(game_date)
    if not json_mode:
        if espn_yesterday:
            print(f"✅ {len(espn_yesterday)} teams played yesterday per ESPN")
        else:
            print(f"⚠ ESPN unavailable — using BDL only")

    # Step 3: Build profiles and calculate edges
    all_results = []

    for game in games:
        home_abbrev = game["home_team"]
        away_abbrev = game["away_team"]
        home_id = game["home_team_id"]
        away_id = game["away_team_id"]
        game_id = game["game_id"]

        if not json_mode:
            print(f"  ⏳ {away_abbrev} @ {home_abbrev}...")

        # Fetch injuries first so dynamic bench calc can filter scratches
        home_injuries = todays_injuries.get(home_id, [])
        away_injuries = todays_injuries.get(away_id, [])

        home_profile = build_team_profile(home_abbrev, home_id, all_stats, game_date, espn_yesterday, injuries=home_injuries, yesterday_results=yesterday_results)
        away_profile = build_team_profile(away_abbrev, away_id, all_stats, game_date, espn_yesterday, injuries=away_injuries, yesterday_results=yesterday_results)

        # Attach injuries
        home_profile["injuries"] = home_injuries
        away_profile["injuries"] = away_injuries
        home_profile["key_out"] = [p["name"] for p in home_injuries if p["status"] == "Out"]
        away_profile["key_out"] = [p["name"] for p in away_injuries if p["status"] == "Out"]

        # Fetch odds first so spread_home is available for calculate_edge
        odds = todays_odds.get(game_id, {})
        spread_home = odds.get("spread_home")
        spread_away = odds.get("spread_away")
        # Show the favored team (negative spread) in the display label
        if spread_home is not None:
            try:
                sh = float(spread_home)
                if sh <= 0:
                    # Home team is favored
                    spread_display = f"{home_abbrev} {sh}"
                else:
                    # Away team is favored — use spread_away value
                    sa = float(spread_away) if spread_away is not None else -sh
                    spread_display = f"{away_abbrev} {sa}"
            except (ValueError, TypeError):
                spread_display = f"{home_abbrev} {spread_home}"
        else:
            spread_display = None
        total = odds.get("total")

        edge = calculate_edge(home_profile, away_profile, spread_home=spread_home)

        # ── Line broken detection ─────────────────────────────────────────────
        # When a star goes down late, live ML can move to extreme values like
        # -50000 / +3500. At that point the season net rating is meaningless —
        # the model cannot reliably score this game. Flag it and suppress lean.
        # IMPORTANT: only fire on pre-game / scheduled games — post-game odds
        # are always extreme (winner at -50000) and would nuke every score.
        ml_h = odds.get("ml_home")
        ml_a = odds.get("ml_away")
        line_broken = False
        line_broken_reason = None
        game_status = game.get("status", "")
        is_pregame = game_status in ("", "Scheduled", "scheduled", "TBD") or                      (isinstance(game_status, str) and not any(
                         x in game_status.lower() for x in ["final", "half", "qtr", "quarter", "in progress", "live"]
                     ))
        try:
            ml_h_val = int(ml_h) if ml_h is not None else 0
            ml_a_val = int(ml_a) if ml_a is not None else 0
            if is_pregame and (abs(ml_h_val) >= 3000 or abs(ml_a_val) >= 3000):
                line_broken = True
                # Figure out which team got the late scratch
                heavy_team = home_abbrev if abs(ml_h_val) >= 3000 and ml_h_val < 0 else away_abbrev
                dog_team = away_abbrev if heavy_team == home_abbrev else home_abbrev
                line_broken_reason = (
                    f"Line moved to extreme odds ({heavy_team} {ml_h_val:+d} / "
                    f"{dog_team} {ml_a_val:+d}) — likely a late star scratch. "
                    f"Season net ratings no longer apply. No lean issued."
                )
                # Kill the edge lean so this game is excluded from parlay builder
                edge["lean"] = None
                edge["confidence"] = "INFO"
                edge["score"] = 0
                print(f"  ⛔ LINE BROKEN: {away_abbrev} @ {home_abbrev} — {line_broken_reason}", file=sys.stderr)
        except (ValueError, TypeError):
            pass

        all_results.append({
            "matchup": f"{away_abbrev} @ {home_abbrev}",
            "date": game_date,
            "game_time": game.get("game_time", "TBD"),
            "status": game.get("status", "Scheduled"),
            "spread": spread_display,
            "spread_home": spread_home,
            "spread_away": spread_away,
            "spread_home_odds": odds.get("spread_home_odds"),
            "spread_away_odds": odds.get("spread_away_odds"),
            "total": total,
            "ml_home": ml_h,
            "ml_away": ml_a,
            "odds_vendor": odds.get("vendor"),
            "away": away_profile,
            "home": home_profile,
            "edge": edge,
            "line_broken": line_broken,
            "line_broken_reason": line_broken_reason,
        })

    # Step 3b: Build B2B tiers + spread mismatches
    b2b_tiers, b2b_tags, spread_mismatches = build_b2b_and_mismatches(all_results, game_date)

    # Step 3c: Build OTJ parlay
    otj_parlay = build_parlay(all_results, spread_mismatches)
    if not json_mode and otj_parlay:
        print(f"\n  🎯 OTJ Parlay — {otj_parlay['leg_count']} legs:")
        for leg in otj_parlay["legs"]:
            print(f"     {leg['label']}: {leg['pick']} ({leg['matchup']})")

        # Step 4: Generate Claude narratives
    if ANTHROPIC_API_KEY and anthropic is not None:
        if not json_mode:
            print(f"\n  🤖 Generating narratives...", end=" ", flush=True)
        for result in all_results:
            narrative = generate_game_narrative(result)
            result["narrative"] = narrative
        slate_narrative = generate_slate_narrative(all_results, game_date)
        if not json_mode:
            print(f"✅")
    else:
        if not json_mode:
            print(f"  ℹ️  ANTHROPIC_API_KEY not set — skipping narratives")
        slate_narrative = {}

    # Step 5: Output
    if json_mode:
        output = {
            "date": game_date,
            "generated_at": datetime.now().isoformat(),
            "games_count": len(all_results),
            "slate_narrative": slate_narrative,
            "b2b_tiers": b2b_tiers,
            "b2b_tags": b2b_tags,
            "spread_mismatches": spread_mismatches,
            "otj_parlay": otj_parlay,
            "games": all_results,
        }
        print(json.dumps(output, indent=2, default=str))
    else:
        sorted_results = sorted(all_results, key=lambda r: abs(r["edge"]["score"]), reverse=True)
        for r in sorted_results:
            e = r["edge"]
            a = r["away"]
            h = r["home"]
            conf_bar = {"SHARP": "█████", "LEAN": "███░░", "INFO": "█░░░░"}.get(e["confidence"], "░░░░░")

            print(f"\n{'━' * 60}")
            print(f"  {r['matchup']}")
            print(f"{'━' * 60}")

            def fmt_close(p):
                w = p.get("close_wins", 0)
                l = p.get("close_losses", 0)
                pct = p.get("close_pct", 0.5)
                if w + l == 0:
                    return "N/A"
                return f"{w}-{l} ({pct:.0%})"

            rows = [
                ["Record", a.get("record", ""), h.get("record", "")],
                ["Net Rating", f"{a.get('net_rating', 0):+.1f}", f"{h.get('net_rating', 0):+.1f}"],
                ["PPG / OPP PPG", f"{a.get('off_rating', 0)}/{a.get('def_rating', 0)}", f"{h.get('off_rating', 0)}/{h.get('def_rating', 0)}"],
                ["3PT% (Season)", f"{a.get('three_pct', 0)}%", f"{h.get('three_pct', 0)}%"],
                ["Close Games (<=5)", fmt_close(a), fmt_close(h)],
                ["B2B", "⚠ YES" if a.get("b2b") else "No", "⚠ YES" if h.get("b2b") else "No"],
                ["Rest Days", str(a.get("rest_days", "?")), str(h.get("rest_days", "?"))],
                ["Last 5", a.get("last5", ""), h.get("last5", "")],
                ["Streak", a.get("streak", ""), h.get("streak", "")],
            ]
            print(tabulate(rows, headers=["", a["team"], h["team"]], tablefmt="rounded_grid"))

            if e["signals"]:
                print(f"\n  💡 EDGE SIGNALS:")
                for sig in e["signals"]:
                    icon = "🔥" if sig["strength"] == "STRONG" else "📌"
                    print(f"    {icon} [{sig['type']}] {sig['detail']}")
                    print(f"       → Favors: {sig['favors']}")

            if e["lean"]:
                print(f"\n  💰 LEAN: {e['lean']}  [{conf_bar}] {e['confidence']} (score: {e['score']:+.1f})")
            else:
                print(f"\n  ⚖️  No clear edge")

        print(f"\n{'=' * 60}")
        print(f"  📋 TONIGHT'S SUMMARY")
        print(f"{'=' * 60}")
        summary = []
        for r in sorted_results:
            e = r["edge"]
            summary.append([
                r["matchup"], f"{e['score']:+.1f}",
                e.get("lean", "—"), e["confidence"],
                "⚠" if r["away"].get("b2b") or r["home"].get("b2b") else "",
            ])
        print(tabulate(summary, headers=["Game", "Score", "Lean", "Conf", "B2B"], tablefmt="rounded_grid"))



# ============================================================================
# PROPS SLATE BUILDER
# Added 2026-03-08 — pulls live player props from BDL v2, cross-references
# season averages already in the pipeline, scores each prop.
# Called from push_to_supabase.py after the main slate is built.
# ============================================================================

PROPS_VENDOR_PRIORITY = ["draftkings", "fanduel", "caesars", "fanatics", "betmgm"]

PROP_TYPE_LABELS = {
    "points":                    "Points",
    "rebounds":                  "Rebounds",
    "assists":                   "Assists",
    "blocks":                    "Blocks",
    "steals":                    "Steals",
    "turnovers":                 "Turnovers",
    "three_pointers_made":       "3-Pointers Made",
    "points_rebounds_assists":   "Pts+Reb+Ast",
    "points_rebounds":           "Pts+Reb",
    "points_assists":            "Pts+Ast",
    "rebounds_assists":          "Reb+Ast",
}

PROPS_MIN_SCORE = 55


def get_player_props_for_game(game_id: int) -> list:
    data = bdl_get("v2/odds/player_props", {"game_id": game_id})
    return data.get("data", [])


def get_player_season_averages(player_ids: list, season: int = 2025) -> dict:
    """
    Fetch season averages one player at a time using v1/season_averages.
    BDL does not support bulk player_ids[] on this endpoint.
    Only fetches starters/rotation players (skips bench/two-way IDs with no averages).
    """
    if not player_ids:
        return {}
    averages = {}
    for pid in player_ids:
        data = bdl_get("v1/season_averages", {"season": season, "player_id": pid})
        for row in data.get("data", []):
            row_pid = row.get("player_id")
            if row_pid:
                averages[row_pid] = row
    return averages


def get_player_last10_stats(player_ids: list, season: int = 2025) -> dict:
    """
    Fetch last 10 game logs per player from BDL v1/stats.
    Returns dict of player_id -> {last10_avg, last10_min, last5_avg, last5_min}
    for each stat combo we care about.
    """
    if not player_ids:
        return {}
    results = {}
    for pid in player_ids:
        try:
            data = bdl_get("v1/stats", {
                "player_ids[]": pid,
                "seasons[]": season,
                "per_page": 10,
                "sort_order": "desc",
            })
            games = data.get("data", [])
            if not games:
                continue

            def avg(vals):
                clean = [v for v in vals if v is not None]
                return round(sum(clean) / len(clean), 1) if clean else None

            def parse_min(m):
                try:
                    return float(str(m).split(":")[0])
                except:
                    return None

            mins      = [parse_min(g.get("min")) for g in games]
            pts       = [g.get("pts") for g in games]
            reb       = [g.get("reb") for g in games]
            ast       = [g.get("ast") for g in games]
            blk       = [g.get("blk") for g in games]
            stl       = [g.get("stl") for g in games]
            fg3m      = [g.get("fg3m") for g in games]
            turnover  = [g.get("turnover") for g in games]

            def combo(lists, n):
                totals = []
                for i in range(min(n, len(games))):
                    vals = [l[i] for l in lists if l[i] is not None]
                    if vals:
                        totals.append(sum(vals))
                return avg(totals)

            l10 = min(10, len(games))
            l5  = min(5,  len(games))

            results[pid] = {
                "last10_min":  avg(mins[:l10]),
                "last5_min":   avg(mins[:l5]),
                # per-stat last10/last5
                "points":      {"last10": avg(pts[:l10]),  "last5": avg(pts[:l5])},
                "rebounds":    {"last10": avg(reb[:l10]),  "last5": avg(reb[:l5])},
                "assists":     {"last10": avg(ast[:l10]),  "last5": avg(ast[:l5])},
                "blocks":      {"last10": avg(blk[:l10]),  "last5": avg(blk[:l5])},
                "steals":      {"last10": avg(stl[:l10]),  "last5": avg(stl[:l5])},
                "turnovers":   {"last10": avg(turnover[:l10]), "last5": avg(turnover[:l5])},
                "three_pointers_made": {"last10": avg(fg3m[:l10]), "last5": avg(fg3m[:l5])},
                # combo stats
                "points_rebounds":           {"last10": combo([pts,reb],l10),         "last5": combo([pts,reb],l5)},
                "points_assists":            {"last10": combo([pts,ast],l10),         "last5": combo([pts,ast],l5)},
                "rebounds_assists":          {"last10": combo([reb,ast],l10),         "last5": combo([reb,ast],l5)},
                "points_rebounds_assists":   {"last10": combo([pts,reb,ast],l10),     "last5": combo([pts,reb,ast],l5)},
                "blocks_steals":             {"last10": combo([blk,stl],l10),         "last5": combo([blk,stl],l5)},
            }
        except Exception as e:
            print(f"  ⚠ last10 fetch failed for player {pid}: {e}", file=sys.stderr)
    return results


def get_player_info(player_ids: list) -> dict:
    if not player_ids:
        return {}
    info = {}
    chunk_size = 25
    for i in range(0, len(player_ids), chunk_size):
        chunk = player_ids[i:i + chunk_size]
        params = [("per_page", 100)]
        for pid in chunk:
            params.append(("ids[]", pid))
        data = bdl_get("v1/players", params)
        for p in data.get("data", []):
            pid = p.get("id")
            if not pid:
                continue
            team = p.get("team", {})
            info[pid] = {
                "name":    f"{p.get('first_name', '')} {p.get('last_name', '')}".strip(),
                "team":    team.get("abbreviation", ""),
                "pos":     p.get("position", ""),
                "team_id": team.get("id"),
            }
    return info


def pick_best_line(props_for_player_stat: list) -> dict | None:
    ou_props = [p for p in props_for_player_stat
                if p.get("market", {}).get("type") == "over_under"]
    if not ou_props:
        return None
    vendor_map = {p["vendor"]: p for p in ou_props}
    for vendor in PROPS_VENDOR_PRIORITY:
        if vendor in vendor_map:
            return vendor_map[vendor]
    return ou_props[0]


def score_prop(season_avg, line, last5_avg, opp_rank, b2b, opp_b2b, pace_factor):
    score = 50
    lean_direction = 1
    signals = []

    if season_avg and line:
        gap = season_avg - line
        if abs(gap) >= 3:
            score += min(15, abs(gap) * 2)
            if gap > 0:
                signals.append({"text": f"Season avg {season_avg} is +{gap:.1f} above line", "tag": "OVER"})
                lean_direction = 1
            else:
                signals.append({"text": f"Season avg {season_avg} is {gap:.1f} below line", "tag": "UNDER"})
                lean_direction = -1
        elif abs(gap) >= 1:
            score += 5
            lean_direction = 1 if gap > 0 else -1

    if last5_avg and line:
        l5_gap = last5_avg - line
        if abs(l5_gap) >= 3:
            score += 10
            tag = "OVER" if l5_gap > 0 else "UNDER"
            signals.append({"text": f"L5 avg {last5_avg:.1f} {'above' if l5_gap > 0 else 'below'} line by {abs(l5_gap):.1f}", "tag": tag})
            if (l5_gap > 0 and lean_direction == 1) or (l5_gap < 0 and lean_direction == -1):
                score += 5

    if opp_rank:
        if opp_rank >= 25:
            score += 8
            signals.append({"text": f"Opp ranked #{opp_rank} in pts allowed — very weak defense", "tag": "OVER"})
        elif opp_rank >= 20:
            score += 5
            signals.append({"text": f"Opp ranked #{opp_rank} in pts allowed — below avg defense", "tag": "OVER"})
        elif opp_rank <= 5:
            score -= 8
            signals.append({"text": f"Opp ranked #{opp_rank} in pts allowed — elite defense", "tag": "UNDER"})
        elif opp_rank <= 10:
            score -= 4
            signals.append({"text": f"Opp ranked #{opp_rank} in pts allowed — strong defense", "tag": "UNDER"})

    if b2b:
        score -= 8
        lean_direction = -1
        signals.append({"text": "Player on B2B — fatigue risk, production may dip", "tag": "UNDER"})
    if opp_b2b:
        score += 6
        signals.append({"text": "Opponent on B2B — defensive intensity drops", "tag": "OVER"})

    if pace_factor == "Pace Up":
        score += 4
        signals.append({"text": "Pace-up matchup — more possessions favors counting stats", "tag": "OVER"})
    elif pace_factor == "Pace Down":
        score -= 3

    score = max(0, min(100, score))
    lean = "OVER" if lean_direction == 1 else "UNDER"
    confidence = "HIGH" if score >= 72 else "MODERATE" if score >= 60 else "LOW"
    return score, lean, confidence, signals


def build_props_slate(games: list, all_stats: dict, todays_injuries: dict, game_date: str) -> list:
    """
    Build today's props slate. Call this from push_to_supabase.py after
    the main slate is built — it reuses games, all_stats, and injuries
    already fetched so no duplicate API calls.
    """
    from collections import defaultdict

    print(f"  Fetching props...", end=" ", flush=True)

    all_raw_props = []
    game_map = {}

    for game in games:
        gid = game["game_id"]
        raw = get_player_props_for_game(gid)
        all_raw_props.extend(raw)
        game_map[gid] = {
            "away":     game["away_team"],
            "home":     game["home_team"],
            "matchup":  f"{game['away_team']} @ {game['home_team']}",
        }

    if not all_raw_props:
        print("no props returned")
        return []

    # Group and pick best line per player/prop
    grouped = defaultdict(list)
    for p in all_raw_props:
        key = (p["game_id"], p["player_id"], p["prop_type"])
        grouped[key].append(p)

    best_lines = {}
    for key, props in grouped.items():
        chosen = pick_best_line(props)
        if chosen:
            best_lines[key] = chosen

    # Fetch player info + season averages + last10 game logs
    player_ids  = list(set(p["player_id"] for p in best_lines.values()))
    player_info = get_player_info(player_ids)
    season_avgs  = get_player_season_averages(player_ids)
    last10_stats = get_player_last10_stats(player_ids)

    # Score each prop
    scored_props = []
    all_opp_pts = sorted(
        [(abbr, s.get("opp_pts", 0)) for abbr, s in all_stats.items()],
        key=lambda x: x[1], reverse=True
    )

    for (game_id, player_id, prop_type), prop in best_lines.items():
        if prop_type not in PROP_TYPE_LABELS:
            continue

        pinfo = player_info.get(player_id, {})
        if not pinfo.get("name"):
            continue

        savg  = season_avgs.get(player_id, {})
        ginfo = game_map.get(game_id, {})
        team  = pinfo.get("team", "")
        opp   = ginfo.get("home") if team == ginfo.get("away") else ginfo.get("away")
        line  = float(prop["line_value"])

        combo_map = {
            "points_rebounds_assists": ["pts", "reb", "ast"],
            "points_rebounds":         ["pts", "reb"],
            "points_assists":          ["pts", "ast"],
            "rebounds_assists":        ["reb", "ast"],
        }
        simple_map = {
            "points": "pts", "rebounds": "reb", "assists": "ast",
            "blocks": "blk", "steals": "stl", "turnovers": "turnover",
            "three_pointers_made": "fg3m",
        }

        if prop_type in simple_map:
            season_avg = float(savg.get(simple_map[prop_type], 0) or 0)
        elif prop_type in combo_map:
            season_avg = sum(float(savg.get(f, 0) or 0) for f in combo_map[prop_type])
        else:
            continue

        if season_avg == 0:
            continue

        opp_stats = all_stats.get(opp, {})
        opp_rank = next(
            (i + 1 for i, (abbr, _) in enumerate(all_opp_pts) if abbr == opp),
            15
        )

        player_pace = all_stats.get(team, {}).get("pace", 100) or 100
        opp_pace    = opp_stats.get("pace", 100) or 100
        avg_pace    = (player_pace + opp_pace) / 2
        pace_factor = "Pace Up" if avg_pace > 101 else "Pace Down" if avg_pace < 97 else "Neutral"

        # Pull last10 data for this player/prop_type
        p_last10 = last10_stats.get(player_id, {})
        last10_pt = p_last10.get(prop_type, {})
        last10_avg = last10_pt.get("last10") if last10_pt else None
        last5_avg  = last10_pt.get("last5")  if last10_pt else None
        last10_min = p_last10.get("last10_min")
        last5_min  = p_last10.get("last5_min")

        score, lean, confidence, signals = score_prop(
            season_avg=season_avg, line=line, last5_avg=last5_avg,
            opp_rank=opp_rank, b2b=False, opp_b2b=False,
            pace_factor=pace_factor,
        )

        # Minutes trend check — if L10 minutes are down 15%+ vs season, penalize score
        min_str = savg.get("min", "0") or "0"
        try:
            minutes_avg = float(min_str.split(":")[0])
        except Exception:
            minutes_avg = 0.0

        minutes_trending_down = False
        if last10_min and minutes_avg and last10_min < minutes_avg * 0.85:
            drop_pct = round((1 - last10_min / minutes_avg) * 100)

            # ── HARD KILL: 50%+ minutes drop = out of the rotation ────────
            # A player averaging 5 min when they used to play 19 isn't hitting
            # any prop regardless of matchup. Skip entirely.
            if drop_pct >= 50:
                print(f"  🚫 MINUTES CLIFF: {pinfo['name']} — L10 {last10_min} min vs season {minutes_avg} min ({drop_pct}% drop). Prop killed.", file=sys.stderr)
                continue  # skip this prop entirely

            score = max(0, score - 10)
            signals.append({
                "text": f"⚠️ Minutes trending down — L10 avg {last10_min} min vs season {minutes_avg} min ({drop_pct}% drop)",
                "tag": "UNDER"
            })
            minutes_trending_down = True

        # ── HARD KILL: L5 way below line = recent production doesn't support it ──
        # If last 5 avg is less than 40% of the line, this prop is dead regardless
        # of season avg or matchup. The player's role has changed.
        if last5_avg is not None and line > 0 and last5_avg < line * 0.40:
            print(f"  🚫 L5 CLIFF: {pinfo['name']} — L5 avg {last5_avg} vs line {line} ({round(last5_avg/line*100)}%). Prop killed.", file=sys.stderr)
            continue

        if score < PROPS_MIN_SCORE:
            continue

        scored_props.append({
            "player":         pinfo["name"],
            "player_id":      player_id,
            "team":           team,
            "pos":            pinfo.get("pos", ""),
            "game":           ginfo.get("matchup", ""),
            "game_id":        game_id,
            "stat":           PROP_TYPE_LABELS[prop_type],
            "prop_type":      prop_type,
            "line":           line,
            "season_avg":     round(season_avg, 1),
            "last5_avg":      round(last5_avg, 1) if last5_avg else None,
            "last10_avg":     round(last10_avg, 1) if last10_avg else None,
            "minutes_avg":    round(minutes_avg, 1),
            "last10_min":     round(last10_min, 1) if last10_min else None,
            "matchup_rating": "Favorable" if opp_rank >= 20 else "Tough" if opp_rank <= 10 else "Neutral",
            "opp_pos_rank":   opp_rank,
            "opp_team":       opp or "",
            "pace_factor":    pace_factor,
            "b2b":            False,
            "opp_b2b":        False,
            "lean":           lean,
            "confidence":     confidence,
            "score":          score,
            "vendor":         prop.get("vendor", ""),
            "over_odds":      prop.get("market", {}).get("over_odds"),
            "under_odds":     prop.get("market", {}).get("under_odds"),
            "signals":        signals,
        })

    scored_props.sort(key=lambda x: x["score"], reverse=True)
    top_props = scored_props[:20]
    print(f"✅ {len(top_props)} props built ({len(scored_props)} scored, {len(all_raw_props)} raw lines)")
    return top_props

if __name__ == "__main__":
    main()
