from nba_edge_analyzer import get_team_games

# LAC = team_id 13, check what games the API returns
games = get_team_games(13, '2026-03-07')
print(f"Found {len(games)} games for LAC before 2026-03-07:\n")
for g in games[:5]:
    date = g.get('date', '')[:10]
    home = g.get('home_team', {}).get('abbreviation', '?')
    away = g.get('visitor_team', {}).get('abbreviation', '?')
    print(f"  {date}  {away} @ {home}")
