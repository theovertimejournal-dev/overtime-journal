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

if not API_KEY:
    print("❌ BALLDONTLIE_API_KEY not set in .env", file=sys.stderr)
    sys.exit(1)

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
    FRANCHISE_STARS = {
        # Format: "PLAYER NAME": ("TEAM_ABBREV", net_rating_penalty)
        "Victor Wembanyama": ("SAS", 6.0),
        "Joel Embiid":       ("PHI", 5.0),
        "Giannis Antetokounmpo": ("MIL", 6.0),
        "Nikola Jokic":      ("DEN", 6.0),
        "Luka Doncic":       ("DAL", 6.0),
        "Stephen Curry":     ("GSW", 5.0),
        "LeBron James":      ("LAL", 4.0),
        "Kevin Durant":      ("PHO", 4.5),
        "Jayson Tatum":      ("BOS", 4.5),
        "Damian Lillard":    ("MIL", 4.5),
        "Anthony Davis":     ("LAL", 5.0),
        "Kawhi Leonard":     ("LAC", 4.5),
        "Paul George":       ("PHI", 3.5),
        "Zion Williamson":   ("NOP", 4.0),
        "Ja Morant":         ("MEM", 4.5),
    }

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
    # Cap impact at 2.5 (was 5.0) — close game record is noisy, don't let it dominate
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

    abs_score = abs(score)
    confidence = "SHARP" if abs_score >= 14 else "LEAN" if abs_score >= 8 else "INFO"
    lean = home["team"] if score > 0 else away["team"] if score < 0 else None

    # ── Spread cap rules — large spreads are garbage time traps ──────────────
    # Added 2026-03-08: MIN -23.5 loss proved blowouts don't cover late.
    # Rule: spread > 20 → cap at INFO. spread 14.5-20 → cap at LEAN max.
    spread_val = abs(float(spread_home or 0))

    if spread_val > 20.0:
        confidence = "INFO"   # Never pick massive spreads — garbage time kills them
    elif spread_val > 14.5 and confidence == "SHARP":
        confidence = "LEAN"   # Downgrade SHARP on large spreads

    if spread_val > 14.5:
        signals.append({
            "type": "LARGE_SPREAD_CAUTION",
            "detail": f"Spread of {spread_val} pts — garbage time risk",
            "favors": "FADE",
            "strength": "CAUTION",
            "impact": -2.0,
        })
    # ── End spread cap rules ──────────────────────────────────────────────────

    # ── OTJ Spread Gut Check Rule ─────────────────────────────────────────────
    # Concept: model estimates a "fair spread" from net rating diff.
    # If Vegas spread is 3+ pts wider than fair spread → underdog may have value.
    # Guards:
    #   - Only fire when Vegas spread >= 6 (skip pick'em games, too much noise)
    #   - Only fire when gap >= 3 pts (meaningful disagreement)
    #   - Work in absolute values, assign direction at end (no double-negative flips)
    #   - Don't fire if both teams within 1.5 net rating of each other (genuine toss-up)
    #   - Cap suggestion label at "mild" / "moderate" / "strong" — never a hard pick
    otj_spread_rule = None
    try:
        if spread_val >= 6.0:
            # Fair spread = net rating diff × 0.45 (industry standard conversion)
            raw_net_diff = abs(h_net - a_net)

            # Only proceed if there's a real gap between teams
            if raw_net_diff >= 1.5:
                fair_spread = round(raw_net_diff * 0.45, 1)
                gap = round(spread_val - fair_spread, 1)

                if gap >= 3.0:
                    # Figure out who is favored and who is the dog
                    # spread_home is negative when home is favored
                    try:
                        sh = float(spread_home or 0)
                    except (ValueError, TypeError):
                        sh = 0.0

                    if sh < 0:
                        # Home team is the favorite
                        favored_team = home["team"]
                        dog_team = away["team"]
                        dog_spread = f"+{spread_val}"
                    elif sh > 0:
                        # Away team is the favorite (positive spread_home = home is dog)
                        favored_team = away["team"]
                        dog_team = home["team"]
                        dog_spread = f"+{spread_val}"
                    else:
                        favored_team = None
                        dog_team = None
                        dog_spread = None

                    if dog_team and favored_team:
                        strength = "strong" if gap >= 6 else "moderate" if gap >= 4 else "mild"

                        # ── Gut check padding ─────────────────────────────────
                        # When model sees a closer game than Vegas, the raw dog
                        # spread is not where the value lives — cushion is.
                        # We recommend a padded number (+4 to +5 pts beyond
                        # fair spread) so the bettor has real margin of error.
                        # Example: Model says 6-pt game, Vegas -11.5
                        #   Raw dog = +11.5 (cuts it close if model is right)
                        #   Padded suggestion = +15 or better (real cushion)
                        # The bettor wins even if the model undershoots slightly.
                        try:
                            raw_dog_num = float(dog_spread.replace("+", "")) if dog_spread else spread_val
                            padding = 4.0 if gap < 5 else 5.0
                            padded_num = raw_dog_num + padding
                            # Round to nearest .5 for clean line shopping
                            padded_num = round(padded_num * 2) / 2
                            padded_spread = f"+{padded_num}"
                            padding_label = (
                                f"Gut check says {fair_spread}-pt game vs Vegas {spread_val}. "
                                f"Raw dog {dog_spread} is on the edge — if you play this, "
                                f"shop for {padded_spread} or better for real cushion. "
                                f"The value is in the number, not just the side."
                            )
                        except Exception:
                            padded_spread = dog_spread
                            padding_label = None

                        otj_spread_rule = {
                            "fair_spread": fair_spread,
                            "vegas_spread": spread_val,
                            "gap": gap,
                            "dog_team": dog_team,
                            "dog_spread": dog_spread,
                            "padded_spread": padded_spread,
                            "padding_label": padding_label,
                            "favored_team": favored_team,
                            "strength": strength,
                            "label": (
                                f"Model sees this as a {fair_spread}-pt game. "
                                f"Vegas has it at {spread_val}. "
                                f"Getting {dog_team} {dog_spread} may have {strength} value."
                            ),
                        }
    except Exception:
        otj_spread_rule = None
    # ── End OTJ Spread Rule ───────────────────────────────────────────────────

    return {
        "lean": lean,
        "confidence": confidence,
        "score": round(score, 1),
        "signals": signals,
        "ou_lean": None,
        "otj_spread_rule": otj_spread_rule,
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
        spread = result.get("spread_home") if is_home else result.get("spread_away")
        ml = result.get("ml_home") if is_home else result.get("ml_away")

        pick_type, pick_line = "spread", None
        if mismatch and spread is not None:
            pick_type = "spread"
            pick_line = f"{lean_team} {float(spread):+.1f}" if spread else lean_team
        elif ml is not None:
            try:
                ml_val = int(ml)
                if ml_val > 0 or ml_val >= -150:
                    pick_type = "ml"
                    pick_line = f"{lean_team} {ml_val:+d}"
                elif spread is not None:
                    pick_type = "spread"
                    pick_line = f"{lean_team} {float(spread):+.1f}"
                else:
                    pick_type = "ml"
                    pick_line = f"{lean_team} {ml_val:+d}"
            except (ValueError, TypeError):
                pick_line = f"{lean_team} {spread}" if spread else lean_team
        elif spread is not None:
            pick_line = f"{lean_team} {float(spread):+.1f}"
        else:
            pick_line = lean_team

        signals = edge.get("signals", [])
        # Spread odds for the lean team — used by frontend to show juice, NOT moneyline
        spread_odds = (
            result.get("spread_home_odds") if is_home else result.get("spread_away_odds")
        )
        return {
            "label": label,
            "matchup": result["matchup"],
            "game_time": result.get("game_time", "TBD"),
            "lean_team": lean_team,
            "pick": pick_line,
            "pick_type": pick_type,
            "spread_odds": spread_odds,   # e.g. -110, use this for spread display NOT ml
            "confidence": edge["confidence"],
            "score": round(edge["score"], 1),
            "top_signal": signals[0]["detail"] if signals else "Model edge",
            "mismatch_gap": mismatch.get("gap") if mismatch else None,
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
            score = max(0, score - 10)
            signals.append({
                "text": f"⚠️ Minutes trending down — L10 avg {last10_min} min vs season {minutes_avg} min ({drop_pct}% drop)",
                "tag": "UNDER"
            })
            minutes_trending_down = True

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
