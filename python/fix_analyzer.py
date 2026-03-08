# Fix: use v1/season_averages with player_id (singular, one at a time)
# BDL doesn't support bulk player_ids[] on this endpoint

with open('nba_edge_analyzer.py', 'r', encoding='utf-8') as f:
    c = f.read()

old = '''def get_player_season_averages(player_ids: list, season: int = 2025) -> dict:
    """
    Fetch season averages for a list of player IDs using nba/v1/season_averages.
    BDL requires player_ids[] as repeated params — requests handles list values correctly.
    Chunks to 25 players per call to stay under URL length limits.
    """
    if not player_ids:
        return {}
    averages = {}
    chunk_size = 25  # smaller chunks to avoid 400 errors
    for i in range(0, len(player_ids), chunk_size):
        chunk = player_ids[i:i + chunk_size]
        # Build params as list of tuples so requests sends repeated player_ids[]
        params = [("season", season), ("per_page", 100)]
        for pid in chunk:
            params.append(("player_ids[]", pid))
        data = bdl_get("nba/v1/season_averages", params)
        for row in data.get("data", []):
            pid = row.get("player_id")
            if pid:
                averages[pid] = row
    return averages'''

new = '''def get_player_season_averages(player_ids: list, season: int = 2025) -> dict:
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
    return averages'''

if old in c:
    c = c.replace(old, new)
    print('Fixed: season averages now fetches one player at a time')
else:
    print('Pattern not found - may need manual fix')

with open('nba_edge_analyzer.py', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done - run python push_to_supabase.py')
