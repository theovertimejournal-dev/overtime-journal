"""
nba_supplemental.py
────────────────────────────────────────────────────────────────
Fetches bench net rating + close game record for all 30 NBA teams
using the free nba_api package (stats.nba.com).

Run once daily at 11am. Takes ~60-90 seconds due to rate limiting.
Output: dict keyed by team abbreviation, merged into nba_edge_analyzer.

Install: pip install nba_api pandas
────────────────────────────────────────────────────────────────
"""

import time
import json
from nba_api.stats.endpoints import (
    TeamDashboardByGeneralSplits,
    LeagueDashTeamClutch,
)
from nba_api.stats.static import teams as nba_teams_static

# ─── Config ──────────────────────────────────────────────────
SEASON = "2024-25"
DELAY = 1.2   # seconds between per-team calls

# Headers spoof — prevents stats.nba.com from blocking automated requests
NBA_HEADERS = {
    "Host": "stats.nba.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Referer": "https://www.nba.com/",
    "Connection": "keep-alive",
}

# ─── Team ID map ─────────────────────────────────────────────
def build_team_id_map():
    all_teams = nba_teams_static.get_teams()
    abbr_to_id = {t['abbreviation']: t['id'] for t in all_teams}
    id_to_abbr = {t['id']: t['abbreviation'] for t in all_teams}
    return abbr_to_id, id_to_abbr


# ─── Close Game Record (ALL 30 teams, 1 API call) ────────────
def get_all_clutch_stats(id_to_abbr):
    """
    LeagueDashTeamClutch — all 30 teams in one call.
    Close game = within 5 pts in final 5 minutes.
    """
    print("  Fetching clutch/close game stats (all 30 teams)...", end=" ", flush=True)
    try:
        clutch = LeagueDashTeamClutch(
            season=SEASON,
            clutch_time="Last 5 Minutes",
            point_diff="5",
            ahead_behind="Ahead or Behind",
            measure_type_detailed_defense="Base",
            per_mode_detailed="PerGame",
            headers=NBA_HEADERS,
            timeout=60
        )
        df = clutch.get_data_frames()[0]

        results = {}
        for _, row in df.iterrows():
            team_id = int(row['TEAM_ID'])
            abbr = id_to_abbr.get(team_id)
            if not abbr:
                continue
            w = int(row['W'])
            l = int(row['L'])
            total = w + l
            pct = round(w / total, 3) if total > 0 else 0.5
            results[abbr] = {
                'close_record': f"{w}-{l}",
                'close_wins': w,
                'close_losses': l,
                'close_pct': pct
            }

        print(f"✅ {len(results)} teams")
        return results

    except Exception as e:
        print(f"⚠ Failed: {e}")
        return {}


# ─── Bench Net Rating (per team) ─────────────────────────────
def get_bench_stats(team_id):
    """
    TeamDashboardByGeneralSplits — starters vs bench breakdown.
    Returns bench_net, bench_ppg, starter_net.
    """
    try:
        dash = TeamDashboardByGeneralSplits(
            team_id=team_id,
            season=SEASON,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="PerGame",
            headers=NBA_HEADERS,
            timeout=60
        )

        frames = dash.get_data_frames()

        # Find the starters/bench frame — has STARTERS_BENCH column
        bench_frame = None
        for frame in frames:
            if 'STARTERS_BENCH' in frame.columns:
                bench_frame = frame
                break

        if bench_frame is None or bench_frame.empty:
            return {'bench_net': 0.0, 'bench_ppg': 0.0, 'starter_net': 0.0}

        bench_row = bench_frame[bench_frame['STARTERS_BENCH'] == 'Bench']
        starter_row = bench_frame[bench_frame['STARTERS_BENCH'] == 'Starters']

        bench_net = round(float(bench_row['NET_RATING'].values[0]), 1) if len(bench_row) else 0.0
        bench_ppg = round(float(bench_row['PTS'].values[0]), 1) if len(bench_row) else 0.0
        starter_net = round(float(starter_row['NET_RATING'].values[0]), 1) if len(starter_row) else 0.0

        return {
            'bench_net': bench_net,
            'bench_ppg': bench_ppg,
            'starter_net': starter_net
        }

    except Exception as e:
        print(f"⚠ Bench stats failed: {e}")
        return {'bench_net': 0.0, 'bench_ppg': 0.0, 'starter_net': 0.0}


# ─── Main Fetcher ─────────────────────────────────────────────
def fetch_all_supplemental_stats(target_teams=None):
    """
    Fetches bench + close game stats for all 30 teams (or a subset).

    Args:
        target_teams: list of abbreviations e.g. ['BKN', 'DET']
                      or None to fetch all 30

    Returns dict keyed by team abbreviation with bench + close game data.
    """
    abbr_to_id, id_to_abbr = build_team_id_map()
    teams_to_fetch = target_teams if target_teams else list(abbr_to_id.keys())
    total = len(teams_to_fetch)

    print(f"\n📊 Fetching supplemental stats for {total} teams (season {SEASON})")

    # Step 1: All clutch stats in ONE call
    clutch_stats = get_all_clutch_stats(id_to_abbr)
    time.sleep(DELAY)

    # Step 2: Bench stats per team
    print(f"\n  Fetching bench net rating per team (~{int(total * DELAY)}s)...")
    bench_stats = {}
    for i, abbr in enumerate(teams_to_fetch):
        team_id = abbr_to_id.get(abbr)
        if not team_id:
            print(f"  [{i+1}/{total}] ⚠ Unknown team: {abbr}")
            continue

        print(f"  [{i+1}/{total}] {abbr}...", end=" ", flush=True)
        bench = get_bench_stats(team_id)
        bench_stats[abbr] = bench
        print(f"bench net {bench['bench_net']:+.1f} | bench PPG {bench['bench_ppg']}")
        time.sleep(DELAY)

    # Step 3: Merge
    results = {}
    for abbr in teams_to_fetch:
        results[abbr] = {
            **bench_stats.get(abbr, {'bench_net': 0.0, 'bench_ppg': 0.0, 'starter_net': 0.0}),
            **clutch_stats.get(abbr, {'close_record': '0-0', 'close_wins': 0, 'close_losses': 0, 'close_pct': 0.5})
        }

    print(f"\n✅ Done — {len(results)}/{total} teams fetched\n")
    return results


# ─── Merge into analyzer team data ───────────────────────────
def merge_supplemental(team_data: dict, supplemental: dict) -> dict:
    """
    Merges supplemental stats into a team dict from nba_edge_analyzer.
    Call this inside build_team_data() after Balldontlie stats are built.
    """
    abbr = team_data.get('team')
    supp = supplemental.get(abbr, {})

    team_data['bench_net'] = supp.get('bench_net', 0.0)
    team_data['bench_ppg'] = supp.get('bench_ppg', 0.0)
    team_data['close_record'] = supp.get('close_record', '0-0')
    team_data['close_pct'] = supp.get('close_pct', 0.5)

    return team_data


# ─── Run standalone to test ───────────────────────────────────
if __name__ == "__main__":
    test_teams = ['BKN', 'DET', 'GSW', 'OKC', 'BOS', 'LAL']
    stats = fetch_all_supplemental_stats(target_teams=test_teams)

    print("─" * 50)
    print(json.dumps(stats, indent=2))
