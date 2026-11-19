"""
build_rosters.py  —  team roster + season-average payloads for the OTJ cards
============================================================================
Powers the clickable "view roster" panel: each team's rotation players with
season averages (PPG/RPG/APG/FG%/3P%/MIN) and a live OUT flag.

Zero new data sources — it reuses the exact helpers the props slate already
calls (get_player_props_for_game → get_player_info → get_player_season_averages),
just grouped by TEAM instead of by prop. The "roster" is the rotation set (players
who have props today = the stars + key rotation), which is who users actually care
about; deep bench with no averages is skipped on purpose.

Called from push_to_supabase.py after the props slate is built. Writes one row
per team per day to the team_rosters table (see team_rosters_migration.sql).
"""
from nba_edge_analyzer import (
    get_player_props_for_game,
    get_player_info,
    get_player_season_averages,
    current_nba_season,
)


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def build_team_rosters(games: list, todays_injuries: dict | None = None,
                       season: int | None = None) -> dict:
    """games: list of game dicts with a 'game_id'. todays_injuries: {TEAM: [names]}.
    Returns {TEAM_ABBR: [ {name, pos, ppg, rpg, apg, spg, bpg, fg_pct, fg3_pct,
                            min, gp, status}, ... ]}, each team sorted by PPG."""
    season = season or current_nba_season()
    todays_injuries = todays_injuries or {}
    injured = {t: {_norm(n) for n in (names or [])} for t, names in todays_injuries.items()}

    # 1) gather rotation player_ids from the same props feed the slate uses
    player_ids = set()
    for g in games:
        gid = g.get("game_id") or g.get("id")
        if gid is None:
            continue
        try:
            for p in get_player_props_for_game(gid):
                pid = p.get("player_id")
                if pid:
                    player_ids.add(pid)
        except Exception as e:
            print(f"  ⚠ roster props fetch failed ({g.get('matchup', gid)}): {e}")

    player_ids = list(player_ids)
    if not player_ids:
        print("  ℹ️  No props player_ids — no rosters built")
        return {}

    info = get_player_info(player_ids)
    avgs = get_player_season_averages(player_ids, season=season)

    rosters: dict[str, list] = {}
    for pid in player_ids:
        pi = info.get(pid) or {}
        team = pi.get("team", "")
        if not team:
            continue
        a = avgs.get(pid) or {}
        name = pi.get("name", "")
        nm = _norm(name)
        tinj = injured.get(team, set())
        is_out = nm in tinj or (nm.split()[-1] if nm else "") in tinj

        def _f(key, mult=1.0):
            try:
                return round(float(a.get(key, 0) or 0) * mult, 1)
            except (TypeError, ValueError):
                return 0.0

        rosters.setdefault(team, []).append({
            "name":    name,
            "pos":     pi.get("pos", ""),
            "ppg":     _f("pts"),
            "rpg":     _f("reb"),
            "apg":     _f("ast"),
            "spg":     _f("stl"),
            "bpg":     _f("blk"),
            "fg_pct":  _f("fg_pct", 100.0),   # BDL returns a decimal (0.47 -> 47.0)
            "fg3_pct": _f("fg3_pct", 100.0),
            "min":     a.get("min"),          # BDL gives "34:12" or a number; show as-is
            "gp":      a.get("games_played"),
            "status":  "OUT" if is_out else "",
        })

    for team in rosters:
        rosters[team].sort(key=lambda r: r["ppg"], reverse=True)
    return rosters


if __name__ == "__main__":
    # tiny offline smoke test of the grouping logic (no network)
    class _Stub:
        pass
    sample_info = {1: {"name": "Star A", "team": "LAL", "pos": "G"},
                   2: {"name": "Role B", "team": "LAL", "pos": "F"},
                   3: {"name": "Star C", "team": "BOS", "pos": "G"}}
    sample_avgs = {1: {"pts": 27.3, "reb": 5.1, "ast": 8.2, "fg_pct": 0.49, "fg3_pct": 0.38, "min": "35:10", "games_played": 12},
                   2: {"pts": 9.1, "reb": 6.0, "ast": 1.2, "fg_pct": 0.55, "fg3_pct": 0.33, "min": "22:00", "games_played": 12},
                   3: {"pts": 24.0, "reb": 4.0, "ast": 6.0, "fg_pct": 0.46, "fg3_pct": 0.40, "min": "33:00", "games_played": 11}}
    # monkeypatch the imported helpers for the smoke test
    import build_rosters as self_mod
    self_mod.get_player_props_for_game = lambda gid: [{"player_id": 1}, {"player_id": 2}, {"player_id": 3}]
    self_mod.get_player_info = lambda ids: sample_info
    self_mod.get_player_season_averages = lambda ids, season=2026: sample_avgs
    out = build_team_rosters([{"game_id": 99, "matchup": "LAL @ BOS"}],
                             todays_injuries={"LAL": ["Role B"]}, season=2026)
    import json
    print(json.dumps(out, indent=2))
