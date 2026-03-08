# ============================================================================
# ADD THIS TO push_to_supabase.py
# ============================================================================
# 
# This adds props slate building + pushing to your existing daily pipeline.
# It reuses games, all_stats, and injuries already fetched — minimal extra work.
#
# STEP 1: Add this import at the top of push_to_supabase.py (with your others):
#
#   from nba_edge_analyzer import build_props_slate
#
# STEP 2: Find where you call the main analyzer and get back your slate data.
#   After you have `games`, `all_stats`, and `todays_injuries` available,
#   add this block:
#
# ─────────────────────────────────────────────────────────────────────────────

# Build props slate (uses same games/stats already fetched — no extra API cost)
props = build_props_slate(
    games=games,                    # same list from get_todays_games()
    all_stats=all_stats,            # same dict from get_all_team_stats()
    todays_injuries=todays_injuries, # same dict already fetched
    game_date=game_date,
)

# Push to Supabase props_slates table
if props:
    props_payload = {
        "date":        game_date,
        "props":       props,
        "games_count": len(set(p["game_id"] for p in props)),
        "generated_at": datetime.now().isoformat(),
    }

    result = supabase_client.table("props_slates").upsert(
        props_payload,
        on_conflict="date"   # update if already pushed today
    ).execute()

    print(f"  ✅ Props slate pushed — {len(props)} props for {game_date}")
else:
    print(f"  ⚠ No props to push for {game_date}")

# ─────────────────────────────────────────────────────────────────────────────
#
# STEP 3: Create the Supabase table (run once in your Supabase SQL editor):
#
#   create table props_slates (
#     id bigint generated always as identity primary key,
#     date date not null unique,
#     props jsonb not null default '[]',
#     games_count int default 0,
#     generated_at timestamptz default now()
#   );
#
#   alter table props_slates enable row level security;
#   create policy "anon read" on props_slates for select using (true);
#
# STEP 4: Update OTJPropsPage.jsx to use the real hook.
#   At the top of OTJPropsPage.jsx, add:
#
#   import { usePropsSlate } from '../../hooks/usePropsSlate';
#
#   Then inside the component, replace:
#   const data = MOCK_PROPS;
#
#   With:
#   const today = new Date().toISOString().split('T')[0];
#   const { propsSlate, loading } = usePropsSlate(today);
#   const data = propsSlate || { date: today, props: [] };
#
#   And add a loading state at the top of the return:
#   if (loading) return (
#     <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center',
#                   justifyContent: 'center', color: '#4a5568', fontSize: 13 }}>
#       Loading props...
#     </div>
#   );
#
# ============================================================================
