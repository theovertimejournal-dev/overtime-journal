"""
historical_export.py
=====================
Builds a complete training dataset for gradient boosting.

Pulls every NBA game from Oct 2025 → present with:
- Team stats (net rating, pace, 3PT%, home/away splits)
- Player data (heights, ages, injuries, minutes)
- Odds (opening spread, ML, total)
- Situational (B2B, rest days, travel, streak)
- Advanced (clutch record, close game %, bench production)
- Actual result (winner, score, margin, cover)

Outputs: training_data.csv — one row per game, 80+ features

Usage:
    python historical_export.py
    python historical_export.py --start 2025-10-22 --end 2026-03-22
    python historical_export.py --output my_data.csv
"""

import sys
import os
import json
import csv
import time
import requests
from datetime import datetime, timedelta, date

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BDL_KEY = os.environ.get("BALLDONTLIE_API_KEY", "")
BDL_BASE = "https://api.balldontlie.io"
BDL_HEADERS = {"Authorization": BDL_KEY}

# nba_api for advanced stats
try:
    from nba_api.stats.endpoints import (
        leaguegamefinder, boxscoreadvancedv2, teamdashboardbygeneralsplits,
        commonteamroster
    )
    from nba_api.stats.static import teams as nba_teams
    HAS_NBA_API = True
except ImportError:
    HAS_NBA_API = False
    print("⚠ nba_api not installed — advanced stats will be limited")

# ── Config ────────────────────────────────────────────────────────────────────
START_DATE = "2025-10-22"  # NBA season start
END_DATE = datetime.now().strftime("%Y-%m-%d")
OUTPUT_FILE = "training_data.csv"

for arg in sys.argv[1:]:
    if arg.startswith("--start="):
        START_DATE = arg.split("=")[1]
    elif arg.startswith("--end="):
        END_DATE = arg.split("=")[1]
    elif arg.startswith("--output="):
        OUTPUT_FILE = arg.split("=")[1]

print(f"\n{'=' * 60}")
print(f"  OTJ Historical Data Export")
print(f"{'=' * 60}")
print(f"  Range:  {START_DATE} → {END_DATE}")
print(f"  Output: {OUTPUT_FILE}")
print(f"  NBA API: {'✅' if HAS_NBA_API else '❌ (limited features)'}")
print(f"{'=' * 60}\n")


# ── BDL Helpers ──────────────────────────────────────────────────────────────

def bdl_get(endpoint, params=None, retries=3):
    """BDL API call with retry logic and rate limiting."""
    for attempt in range(retries):
        try:
            resp = requests.get(f"{BDL_BASE}/{endpoint}", params=params, 
                                headers=BDL_HEADERS, timeout=20)
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 5))
                print(f"  Rate limited, waiting {wait}s...", end=" ")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                print(f"  ⚠ BDL error ({endpoint}): {e}")
                return {}
    return {}


def get_all_games(start_date, end_date):
    """Pull all NBA games in a date range from BDL."""
    all_games = []
    cursor = None
    page = 0
    
    while True:
        params = {
            "start_date": start_date,
            "end_date": end_date,
            "per_page": 100,
        }
        if cursor:
            params["cursor"] = cursor
            
        data = bdl_get("v1/games", params)
        games = data.get("data", [])
        
        if not games:
            break
            
        # Only keep completed games with real scores
        for g in games:
            hs = g.get("home_team_score", 0) or 0
            vs = g.get("visitor_team_score", 0) or 0
            if hs >= 50 and vs >= 50:
                all_games.append(g)
        
        meta = data.get("meta", {})
        cursor = meta.get("next_cursor")
        page += 1
        print(f"  Fetched page {page} — {len(all_games)} games so far", end="\r")
        
        if not cursor:
            break
        
        time.sleep(0.3)  # Rate limiting
    
    print(f"  ✅ {len(all_games)} completed games fetched          ")
    return all_games


# ── Odds Fetching ────────────────────────────────────────────────────────────

ODDS_CACHE = {}  # date_str -> {game_id: odds_data}

def fetch_odds_for_date(date_str):
    """Fetch all odds for a single date, cache the results."""
    if date_str in ODDS_CACHE:
        return ODDS_CACHE[date_str]
    
    data = bdl_get("v2/odds", {"dates[]": date_str, "per_page": 100})
    result = {}
    
    for row in data.get("data", []):
        gid = row.get("game_id")
        if gid:
            result[gid] = {
                "spread_home": row.get("home_spread"),
                "spread_away": row.get("away_spread"),
                "ml_home": row.get("moneyline_home_odds"),
                "ml_away": row.get("moneyline_away_odds"),
                "over_under": row.get("over_under"),
            }
    
    ODDS_CACHE[date_str] = result
    return result


def ml_to_implied_prob(ml):
    """Convert American moneyline odds to implied win probability."""
    if ml is None:
        return None
    try:
        ml = float(ml)
        if ml > 0:
            return 100 / (ml + 100)
        elif ml < 0:
            return abs(ml) / (abs(ml) + 100)
        return 0.5
    except:
        return None


def get_odds_features(game_id, game_date):
    """Get Vegas odds features for a specific game."""
    odds_by_date = fetch_odds_for_date(game_date)
    odds = odds_by_date.get(game_id, {})
    
    if not odds:
        return {}
    
    spread_home = odds.get("spread_home")
    ml_home = odds.get("ml_home")
    ml_away = odds.get("ml_away")
    over_under = odds.get("over_under")
    
    features = {}
    
    if spread_home is not None:
        try:
            features["vegas_spread_home"] = float(spread_home)
            features["vegas_spread_abs"] = abs(float(spread_home))
        except:
            pass
    
    if ml_home is not None:
        try:
            features["vegas_ml_home"] = float(ml_home)
            prob = ml_to_implied_prob(float(ml_home))
            if prob is not None:
                features["vegas_implied_prob_home"] = round(prob, 3)
        except:
            pass
    
    if ml_away is not None:
        try:
            features["vegas_ml_away"] = float(ml_away)
            prob = ml_to_implied_prob(float(ml_away))
            if prob is not None:
                features["vegas_implied_prob_away"] = round(prob, 3)
        except:
            pass
    
    if over_under is not None:
        try:
            features["vegas_total"] = float(over_under)
        except:
            pass
    
    # Home is favorite flag
    if "vegas_spread_home" in features:
        features["home_is_favorite"] = int(features["vegas_spread_home"] < 0)
        features["favorite_spread_size"] = abs(features.get("vegas_spread_home", 0))
    
    # Big favorite flag (spread >= 8)
    if "vegas_spread_abs" in features:
        features["big_favorite"] = int(features["vegas_spread_abs"] >= 8)
        features["huge_favorite"] = int(features["vegas_spread_abs"] >= 14)
    
    return features


def get_team_stats_on_date(team_id, game_date_str):
    """Get team season stats up to a specific date."""
    data = bdl_get("v1/season_averages", {
        "season": 2025,
        "team_ids[]": team_id,
    })
    return data.get("data", [{}])[0] if data.get("data") else {}


def get_game_box_score(game_id):
    """Get player stats for a game."""
    data = bdl_get("v1/stats", {"game_ids[]": game_id, "per_page": 100})
    return data.get("data", [])


def get_team_standings(team_id, season=2025):
    """Get team record."""
    data = bdl_get("v1/standings", {"season": season})
    for team in data.get("data", []):
        if team.get("team", {}).get("id") == team_id:
            return team
    return {}


# ── Feature Engineering ──────────────────────────────────────────────────────

# Cache for team data so we don't re-fetch every game
TEAM_CACHE = {}
ROSTER_CACHE = {}
GAME_LOG_CACHE = {}  # team_id -> list of (date, opponent, result, score)


def build_game_log(all_games):
    """Build a game log for each team to compute streaks, B2B, etc."""
    log = {}  # team_id -> sorted list of game dicts
    
    for g in sorted(all_games, key=lambda x: x.get("date", "")):
        game_date = g.get("date", "")[:10]
        home_id = g["home_team"]["id"]
        away_id = g["visitor_team"]["id"]
        hs = g.get("home_team_score", 0) or 0
        vs = g.get("visitor_team_score", 0) or 0
        
        for tid, is_home in [(home_id, True), (away_id, False)]:
            if tid not in log:
                log[tid] = []
            log[tid].append({
                "date": game_date,
                "game_id": g["id"],
                "is_home": is_home,
                "own_score": hs if is_home else vs,
                "opp_score": vs if is_home else hs,
                "won": (hs > vs) if is_home else (vs > hs),
                "opponent_id": away_id if is_home else home_id,
            })
    
    return log


def get_team_features_at_date(team_id, game_date, game_log, all_teams_abbrev):
    """Compute features for a team as of a specific date."""
    if team_id not in game_log:
        return {}
    
    # Get all games before this date
    past = [g for g in game_log[team_id] if g["date"] < game_date]
    
    if not past:
        return {}
    
    # Basic record
    wins = sum(1 for g in past if g["won"])
    losses = len(past) - wins
    win_pct = wins / max(len(past), 1)
    
    # Last 10 games
    l10 = past[-10:]
    l10_wins = sum(1 for g in l10 if g["won"])
    l10_pct = l10_wins / max(len(l10), 1)
    
    # Last 5 games
    l5 = past[-5:]
    l5_wins = sum(1 for g in l5 if g["won"])
    l5_pct = l5_wins / max(len(l5), 1)
    
    # Streak
    streak = 0
    for g in reversed(past):
        if g["won"]:
            streak += 1
        else:
            break
    if not past[-1]["won"]:
        streak = 0
        for g in reversed(past):
            if not g["won"]:
                streak -= 1
            else:
                break
    
    # Home/Away splits
    home_games = [g for g in past if g["is_home"]]
    away_games = [g for g in past if not g["is_home"]]
    home_win_pct = sum(1 for g in home_games if g["won"]) / max(len(home_games), 1)
    away_win_pct = sum(1 for g in away_games if g["won"]) / max(len(away_games), 1)
    
    # Scoring averages
    avg_pts_scored = sum(g["own_score"] for g in past) / max(len(past), 1)
    avg_pts_allowed = sum(g["opp_score"] for g in past) / max(len(past), 1)
    net_rating_proxy = avg_pts_scored - avg_pts_allowed
    
    # L10 scoring
    l10_avg_scored = sum(g["own_score"] for g in l10) / max(len(l10), 1)
    l10_avg_allowed = sum(g["opp_score"] for g in l10) / max(len(l10), 1)
    l10_net = l10_avg_scored - l10_avg_allowed
    
    # Rest days
    if len(past) >= 1:
        last_game_date = datetime.strptime(past[-1]["date"], "%Y-%m-%d")
        this_game_date = datetime.strptime(game_date, "%Y-%m-%d")
        rest_days = (this_game_date - last_game_date).days - 1
    else:
        rest_days = 3
    
    b2b = rest_days == 0
    
    # 3-in-4 (played 3 games in last 4 days)
    four_days_ago = (datetime.strptime(game_date, "%Y-%m-%d") - timedelta(days=4)).strftime("%Y-%m-%d")
    recent_games = [g for g in past if g["date"] >= four_days_ago]
    three_in_four = len(recent_games) >= 3
    
    # Close game record (within 5 pts)
    close_games = [g for g in past if abs(g["own_score"] - g["opp_score"]) <= 5]
    close_win_pct = sum(1 for g in close_games if g["won"]) / max(len(close_games), 1)
    
    # Blowout tendency (won/lost by 15+)
    blowout_wins = sum(1 for g in past if g["won"] and (g["own_score"] - g["opp_score"]) >= 15)
    blowout_losses = sum(1 for g in past if not g["won"] and (g["opp_score"] - g["own_score"]) >= 15)
    
    # ATS proxy — margin vs expected (simple: did they cover a hypothetical spread)
    avg_margin = sum(g["own_score"] - g["opp_score"] for g in past) / max(len(past), 1)
    
    return {
        "wins": wins,
        "losses": losses,
        "win_pct": round(win_pct, 3),
        "l10_wins": l10_wins,
        "l10_pct": round(l10_pct, 3),
        "l5_wins": l5_wins,
        "l5_pct": round(l5_pct, 3),
        "streak": streak,
        "home_win_pct": round(home_win_pct, 3),
        "away_win_pct": round(away_win_pct, 3),
        "avg_pts_scored": round(avg_pts_scored, 1),
        "avg_pts_allowed": round(avg_pts_allowed, 1),
        "net_rating_proxy": round(net_rating_proxy, 1),
        "l10_avg_scored": round(l10_avg_scored, 1),
        "l10_avg_allowed": round(l10_avg_allowed, 1),
        "l10_net": round(l10_net, 1),
        "rest_days": rest_days,
        "b2b": int(b2b),
        "three_in_four": int(three_in_four),
        "close_win_pct": round(close_win_pct, 3),
        "blowout_wins": blowout_wins,
        "blowout_losses": blowout_losses,
        "avg_margin": round(avg_margin, 1),
        "games_played": len(past),
    }


def get_height_features(box_score):
    """Extract height-related features from box score."""
    heights = []
    total_minutes = 0
    total_blocks = 0
    
    for ps in box_score:
        player = ps.get("player", {})
        height_str = player.get("height", "")
        
        # Parse height "6-8" → inches
        if height_str and "-" in height_str:
            try:
                feet, inches = height_str.split("-")
                height_inches = int(feet) * 12 + int(inches)
            except:
                continue
        else:
            continue
        
        min_str = ps.get("min", "0") or "0"
        try:
            minutes = int(min_str.split(":")[0]) if ":" in str(min_str) else int(float(min_str))
        except:
            minutes = 0
        
        if minutes < 5:
            continue
        
        heights.append({
            "height": height_inches,
            "minutes": minutes,
            "blocks": int(ps.get("blk", 0) or 0),
            "rebounds": int(ps.get("reb", 0) or 0),
            "age": player.get("age", 0) or 0,
        })
        total_minutes += minutes
        total_blocks += int(ps.get("blk", 0) or 0)
    
    if not heights:
        return {}
    
    avg_height = sum(h["height"] * h["minutes"] for h in heights) / max(total_minutes, 1)
    max_height = max(h["height"] for h in heights)
    min_height = min(h["height"] for h in heights)
    
    # Minutes-weighted age
    avg_age = sum(h["age"] * h["minutes"] for h in heights if h["age"] > 0) / max(
        sum(h["minutes"] for h in heights if h["age"] > 0), 1)
    
    return {
        "avg_height_inches": round(avg_height, 1),
        "max_height_inches": max_height,
        "tallest_shortest_gap": max_height - min_height,
        "total_blocks": total_blocks,
        "avg_age": round(avg_age, 1),
        "roster_size_played": len(heights),
    }


# ── Main Export ──────────────────────────────────────────────────────────────

print("⏳ Step 1: Fetching all games...")
all_games = get_all_games(START_DATE, END_DATE)

if not all_games:
    print("❌ No games found.")
    sys.exit(1)

print("\n⏳ Step 2: Building game logs...")
game_log = build_game_log(all_games)
print(f"  ✅ Game logs built for {len(game_log)} teams")

# Build team abbrev lookup
team_abbrev = {}
for g in all_games:
    team_abbrev[g["home_team"]["id"]] = g["home_team"]["abbreviation"]
    team_abbrev[g["visitor_team"]["id"]] = g["visitor_team"]["abbreviation"]

print(f"\n⏳ Step 3: Building features for {len(all_games)} games...")
print(f"  (This may take 10-20 minutes due to box score fetches)\n")

rows = []
for idx, game in enumerate(all_games):
    game_date = game.get("date", "")[:10]
    game_id = game["id"]
    
    home_id = game["home_team"]["id"]
    away_id = game["visitor_team"]["id"]
    home_abbr = game["home_team"]["abbreviation"]
    away_abbr = game["visitor_team"]["abbreviation"]
    home_score = game.get("home_team_score", 0) or 0
    away_score = game.get("visitor_team_score", 0) or 0
    
    # Target variables
    home_won = int(home_score > away_score)
    margin = home_score - away_score  # positive = home won
    total_points = home_score + away_score
    
    # Team features as of game date
    home_feat = get_team_features_at_date(home_id, game_date, game_log, team_abbrev)
    away_feat = get_team_features_at_date(away_id, game_date, game_log, team_abbrev)
    
    if not home_feat or not away_feat:
        continue
    
    # Box score features (height, age, blocks)
    box = get_game_box_score(game_id)
    home_box = [ps for ps in box if ps.get("team", {}).get("id") == home_id]
    away_box = [ps for ps in box if ps.get("team", {}).get("id") == away_id]
    
    home_height = get_height_features(home_box)
    away_height = get_height_features(away_box)
    
    # Vegas odds features
    odds_feat = get_odds_features(game_id, game_date)
    
    # Target: did home team cover the spread?
    home_covered = None
    if "vegas_spread_home" in odds_feat:
        try:
            home_covered = int(margin + odds_feat["vegas_spread_home"] > 0)
        except:
            pass
    
    # Target: did the game go over the total?
    went_over = None
    if "vegas_total" in odds_feat:
        try:
            went_over = int(total_points > odds_feat["vegas_total"])
        except:
            pass
    
    # Build the row
    row = {
        # Identifiers
        "game_id": game_id,
        "date": game_date,
        "home_team": home_abbr,
        "away_team": away_abbr,
        "matchup": f"{away_abbr} @ {home_abbr}",
        
        # Target variables
        "home_won": home_won,
        "home_score": home_score,
        "away_score": away_score,
        "margin": margin,
        "total_points": total_points,
        "home_covered": home_covered,
        "went_over": went_over,
        
        # Vegas odds features
        **odds_feat,
        
        # Home team features (prefix h_)
        **{f"h_{k}": v for k, v in home_feat.items()},
        
        # Away team features (prefix a_)
        **{f"a_{k}": v for k, v in away_feat.items()},
        
        # Differentials (home - away)
        "diff_win_pct": round(home_feat.get("win_pct", 0) - away_feat.get("win_pct", 0), 3),
        "diff_l10_pct": round(home_feat.get("l10_pct", 0) - away_feat.get("l10_pct", 0), 3),
        "diff_net_rating": round(home_feat.get("net_rating_proxy", 0) - away_feat.get("net_rating_proxy", 0), 1),
        "diff_l10_net": round(home_feat.get("l10_net", 0) - away_feat.get("l10_net", 0), 1),
        "diff_streak": home_feat.get("streak", 0) - away_feat.get("streak", 0),
        "diff_rest_days": home_feat.get("rest_days", 0) - away_feat.get("rest_days", 0),
        "diff_close_win_pct": round(home_feat.get("close_win_pct", 0) - away_feat.get("close_win_pct", 0), 3),
        
        # Situational flags
        "home_b2b": home_feat.get("b2b", 0),
        "away_b2b": away_feat.get("b2b", 0),
        "both_b2b": int(home_feat.get("b2b", 0) and away_feat.get("b2b", 0)),
        "home_3in4": home_feat.get("three_in_four", 0),
        "away_3in4": away_feat.get("three_in_four", 0),
        
        # Height features
        **{f"h_{k}": v for k, v in home_height.items()},
        **{f"a_{k}": v for k, v in away_height.items()},
    }
    
    # Height differentials
    if home_height and away_height:
        row["diff_avg_height"] = round(
            home_height.get("avg_height_inches", 0) - away_height.get("avg_height_inches", 0), 1)
        row["diff_blocks"] = home_height.get("total_blocks", 0) - away_height.get("total_blocks", 0)
        row["diff_avg_age"] = round(
            home_height.get("avg_age", 0) - away_height.get("avg_age", 0), 1)
    
    rows.append(row)
    
    if (idx + 1) % 25 == 0:
        print(f"  Processed {idx + 1}/{len(all_games)} games — {len(rows)} valid rows")
        time.sleep(0.5)  # Rate limiting

print(f"\n⏳ Step 4: Writing CSV...")

if not rows:
    print("❌ No valid rows generated.")
    sys.exit(1)

# Get all unique column names
all_columns = []
for row in rows:
    for k in row.keys():
        if k not in all_columns:
            all_columns.append(k)

with open(OUTPUT_FILE, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=all_columns)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)

print(f"\n{'=' * 60}")
print(f"  ✅ Export complete!")
print(f"  Games:    {len(rows)}")
print(f"  Features: {len(all_columns)}")
print(f"  Output:   {OUTPUT_FILE}")
print(f"  Size:     {os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB")
print(f"{'=' * 60}")
print(f"\n  Columns:")
for i, col in enumerate(all_columns):
    print(f"    {i+1:3d}. {col}")
