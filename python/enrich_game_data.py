"""
enrich_game_data.py
====================
Pulls rich game details from BDL API for last night's games.
Feeds the multi-voice blog characters with REAL stories:
- Who scored 30+? 40+? 50+?
- Who had a double-double, triple-double?
- Which teams were on streaks?
- What were the quarter-by-quarter scores?
- Any blowouts? Comebacks? OT games?

Called by multi_voice_blog.py before generating the blog.
Returns a list of game story objects the characters can reference.

Usage:
    from enrich_game_data import enrich_games
    stories = enrich_games("2026-03-19")
"""

import os
import sys
import requests
from datetime import datetime, timedelta

BDL_KEY = os.environ.get("BALLDONTLIE_API_KEY", "")
BASE_URL = "https://api.balldontlie.io"
HEADERS = {"Authorization": BDL_KEY}

# ── Nickname lookup — API names → what fans actually call them ────────────────
NICKNAMES = {
    "Airious Bailey": "Ace Bailey",
    "LeBron Raymone James": "LeBron James",
    "Wardell Curry": "Steph Curry",
    "Stephen Curry": "Steph Curry",
    "Jaren Jackson": "Jaren Jackson Jr.",
    "Robert Williams": "Rob Williams",
    "Herbert Jones": "Herb Jones",
    "Nickeil Alexander-Walker": "NAW",
    "Luguentz Dort": "Lu Dort",
    "Shai Gilgeous-Alexander": "SGA",
    "Kentavious Caldwell-Pope": "KCP",
    "PJ Washington": "P.J. Washington",
    "Nicolas Claxton": "Nic Claxton",
    "Jabari Smith": "Jabari Smith Jr.",
    "GG Jackson": "GG Jackson II",
    "Trey Murphy": "Trey Murphy III",
    "Dereck Lively": "Dereck Lively II",
    "Jaime Jaquez": "Jaime Jaquez Jr.",
    "Tim Hardaway": "Tim Hardaway Jr.",
    "Gary Trent": "Gary Trent Jr.",
    "Larry Nance": "Larry Nance Jr.",
    "Kenyon Martin": "KJ Martin",
    "Dennis Smith": "Dennis Smith Jr.",
    "Kelly Oubre": "Kelly Oubre Jr.",
    "Wendell Carter": "Wendell Carter Jr.",
    "Marcus Morris": "Marcus Morris Sr.",
    "Otto Porter": "Otto Porter Jr.",
    "Lonnie Walker": "Lonnie Walker IV",
    "Jalen Williams": "J-Will",
}

def get_display_name(first_name, last_name):
    """Get the name fans actually use."""
    full = f"{first_name} {last_name}".strip()
    return NICKNAMES.get(full, full)


def bdl_get(endpoint, params=None):
    try:
        resp = requests.get(f"{BASE_URL}/{endpoint}", params=params, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  ⚠ BDL error ({endpoint}): {e}", file=sys.stderr)
        return {}


def get_game_scores(date: str) -> list:
    """Get all final games for a date."""
    # Fetch target + next UTC date for West Coast spillover
    date_dt = datetime.strptime(date, "%Y-%m-%d")
    next_date = (date_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    
    all_games = []
    for d in [date, next_date]:
        data = bdl_get("v1/games", {"dates[]": d, "per_page": 100})
        for g in data.get("data", []):
            hs = g.get("home_team_score", 0) or 0
            vs = g.get("visitor_team_score", 0) or 0
            if hs < 50 or vs < 50:
                continue
            all_games.append(g)
    return all_games


def get_box_score(game_id: int) -> list:
    """Get player stats for a game."""
    data = bdl_get("v1/stats", {"game_ids[]": game_id, "per_page": 100})
    return data.get("data", [])


def enrich_games(date: str) -> list:
    """
    Pull rich game data and identify storylines for the blog characters.
    Returns list of game story dicts.
    """
    print(f"  ⏳ Enriching game data for {date}...", file=sys.stderr)
    
    games = get_game_scores(date)
    if not games:
        print(f"  ⚠ No games found for {date}", file=sys.stderr)
        return []
    
    stories = []
    
    for game in games:
        game_id = game["id"]
        home = game["home_team"]["abbreviation"]
        away = game["visitor_team"]["abbreviation"]
        hs = int(game.get("home_team_score", 0))
        vs = int(game.get("visitor_team_score", 0))
        
        matchup = f"{away} @ {home}"
        margin = abs(hs - vs)
        winner = home if hs > vs else away
        loser = away if hs > vs else home
        total_points = hs + vs
        
        story = {
            "matchup": matchup,
            "home": home,
            "away": away,
            "home_score": hs,
            "away_score": vs,
            "winner": winner,
            "loser": loser,
            "margin": margin,
            "total_points": total_points,
            "final": f"{vs}-{hs}" if hs > vs else f"{hs}-{vs}",
            "storylines": [],
            "standout_players": [],
        }
        
        # Classify the game type
        if margin >= 25:
            story["game_type"] = "blowout"
            story["storylines"].append(f"{winner} demolished {loser} by {margin} points")
        elif margin <= 3:
            story["game_type"] = "thriller"
            story["storylines"].append(f"Decided by just {margin} points — {winner} survives")
        elif margin <= 7:
            story["game_type"] = "competitive"
            story["storylines"].append(f"Competitive game — {winner} pulls away late")
        else:
            story["game_type"] = "comfortable"
        
        if total_points >= 240:
            story["storylines"].append(f"Shootout — {total_points} combined points")
        elif total_points <= 195:
            story["storylines"].append(f"Defensive grind — only {total_points} total points")
        
        # Pull box score for standout performances
        box = get_box_score(game_id)
        
        for player_stat in box:
            player = player_stat.get("player", {})
            name = get_display_name(player.get('first_name', ''), player.get('last_name', ''))
            team_abbr = player_stat.get("team", {}).get("abbreviation", "")
            
            pts = int(player_stat.get("pts", 0) or 0)
            reb = int(player_stat.get("reb", 0) or 0)
            ast = int(player_stat.get("ast", 0) or 0)
            stl = int(player_stat.get("stl", 0) or 0)
            blk = int(player_stat.get("blk", 0) or 0)
            fg3m = int(player_stat.get("fg3m", 0) or 0)
            fga = int(player_stat.get("fga", 0) or 0)
            fgm = int(player_stat.get("fgm", 0) or 0)
            turnover = int(player_stat.get("turnover", 0) or 0)
            
            min_str = player_stat.get("min", "0") or "0"
            try:
                minutes = int(min_str.split(":")[0]) if ":" in str(min_str) else int(float(min_str))
            except:
                minutes = 0
            
            if minutes < 10:
                continue  # skip garbage time players
            
            fg_pct = round(fgm / fga * 100, 1) if fga > 0 else 0
            
            perf = {
                "name": name,
                "team": team_abbr,
                "pts": pts,
                "reb": reb,
                "ast": ast,
                "stl": stl,
                "blk": blk,
                "fg3m": fg3m,
                "fg_pct": fg_pct,
                "minutes": minutes,
                "highlights": [],
            }
            
            # Flag standout performances
            if pts >= 50:
                perf["highlights"].append(f"🔥 {pts} POINTS — historic night")
                story["storylines"].append(f"{name} ERUPTED for {pts} points")
            elif pts >= 40:
                perf["highlights"].append(f"🔥 {pts} points — dominant")
                story["storylines"].append(f"{name} went off for {pts}")
            elif pts >= 30:
                perf["highlights"].append(f"{pts} points")
            
            # Double-double / triple-double
            doubles = sum(1 for s in [pts, reb, ast, stl, blk] if s >= 10)
            if doubles >= 3:
                perf["highlights"].append(f"TRIPLE-DOUBLE: {pts}/{reb}/{ast}")
                story["storylines"].append(f"{name} recorded a triple-double ({pts}/{reb}/{ast})")
            elif doubles >= 2:
                perf["highlights"].append(f"Double-double: {pts}/{reb}/{ast}")
            
            # Efficient scoring
            if pts >= 25 and fg_pct >= 60:
                perf["highlights"].append(f"Hyper-efficient: {fg_pct}% from the field")
            
            # Three-point barrage
            if fg3m >= 7:
                perf["highlights"].append(f"Rained {fg3m} threes")
                story["storylines"].append(f"{name} hit {fg3m} threes")
            elif fg3m >= 5:
                perf["highlights"].append(f"{fg3m} threes")
            
            # Defensive monster
            combined_def = stl + blk
            if combined_def >= 5:
                perf["highlights"].append(f"Defensive beast: {stl} steals, {blk} blocks")
            
            # Dime dropper
            if ast >= 12:
                perf["highlights"].append(f"Floor general: {ast} assists")
                story["storylines"].append(f"{name} dished {ast} assists")
            
            # Only keep players with actual highlights
            if perf["highlights"] or pts >= 25:
                story["standout_players"].append(perf)
        
        # Sort standout players by points
        story["standout_players"].sort(key=lambda p: p["pts"], reverse=True)
        # Keep top 4 per game
        story["standout_players"] = story["standout_players"][:4]
        
        stories.append(story)
        print(f"  ✅ {matchup}: {vs}-{hs} | {len(story['standout_players'])} standouts | {len(story['storylines'])} storylines", file=sys.stderr)
    
    print(f"  ✅ Enriched {len(stories)} games with {sum(len(s['storylines']) for s in stories)} total storylines", file=sys.stderr)
    return stories


def format_stories_for_prompt(stories: list) -> str:
    """Format enriched game stories into text for the blog prompt."""
    if not stories:
        return "No detailed game data available."
    
    lines = []
    for s in stories:
        lines.append(f"\n{'─' * 40}")
        lines.append(f"🏀 {s['matchup']} — Final: {s['away_score']}-{s['home_score']} ({s['game_type']})")
        lines.append(f"   Winner: {s['winner']} by {s['margin']}")
        
        if s["storylines"]:
            for sl in s["storylines"]:
                lines.append(f"   📌 {sl}")
        
        if s["standout_players"]:
            lines.append(f"   STANDOUT PERFORMERS:")
            for p in s["standout_players"]:
                stat_line = f"{p['pts']}pts/{p['reb']}reb/{p['ast']}ast"
                highlights = " · ".join(p["highlights"]) if p["highlights"] else ""
                lines.append(f"   ★ {p['name']} ({p['team']}): {stat_line} {highlights}")
    
    return "\n".join(lines)


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    stories = enrich_games(date)
    print(format_stories_for_prompt(stories))
