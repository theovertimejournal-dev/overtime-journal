"""
otj_next_man_up.py  —  flag backups who just inherited starter minutes
======================================================================
When a rotation player is ruled OUT, the guy behind him on the depth chart
soaks up the minutes — but the book is slow to move that backup's prop line,
because it's still priced for his bench role. That gap is the edge (see:
Christian Anderson, 5 ppg bench guy, drops 14 & 3 threes the night Schröder
sits). This surfaces those guys BEFORE tip so you can grab the over early.

For every team playing today it reads the Tank01 depth chart + injury list,
finds each position where someone above is OUT, and names the available player
who moves up — with his season ppg baseline so you can eyeball the value.
Posts a "Next Man Up" drop to Discord.

Reads only. Needs: SUPABASE_SERVICE_KEY, TANK01_API_KEY, OTJ_ALERT_WEBHOOK.
Run standalone, or wire it into the slate-push workflow like otj_slate_drop.

    python otj_next_man_up.py
    python otj_next_man_up.py --date=2026-11-24
"""
import sys
import os
import requests
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
TANK01_KEY   = os.environ.get("TANK01_API_KEY", "")
WEBHOOK      = os.environ.get("OTJ_ALERT_WEBHOOK", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set"); sys.exit(0)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
T_HOST = "tank01-fantasy-stats.p.rapidapi.com"
T_HEADERS = {"x-rapidapi-key": TANK01_KEY, "x-rapidapi-host": T_HOST}

# Only flag a bump into real minutes: new starter (rank 0) or primary backup (rank 1),
# and only when the beneficiary is actually a bench-priced guy (low ppg).
MAX_NEW_RANK = 1
MAX_BASELINE_PPG = 14.0   # above this he's already a known scorer — no hidden value

game_date = datetime.now().strftime("%Y-%m-%d")
for a in sys.argv[1:]:
    if a.startswith("--date="):
        game_date = a.split("=")[1]

def tank_get(endpoint, params):
    try:
        r = requests.get(f"https://{T_HOST}/{endpoint}", headers=T_HEADERS, params=params, timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  ⚠ Tank01 {endpoint} failed: {e}")
        return {}

def pname(pl):
    return (pl.get("longName") or pl.get("name")
            or f"{pl.get('firstName','')} {pl.get('lastName','')}".strip()).strip()

def _f(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def _is_out(nm, scratched):
    low = (nm or "").lower()
    return bool(low) and (low in scratched or low.split()[-1] in scratched)

# ── Teams playing today (from the slate) ─────────────────────────────────────
try:
    slate = supabase.table("slates").select("games").eq("sport", "nba").eq("date", game_date).single().execute()
    games = slate.data.get("games") or []
except Exception as e:
    print(f"  ❌ no slate for {game_date}: {e}"); sys.exit(0)
teams = []
for g in games:
    for side in ("home", "away"):
        t = (g.get(side) or {}).get("team")
        if t and t not in teams:
            teams.append(t)
if not teams:
    print("  ℹ️  no teams"); sys.exit(0)

# ── OUT players league-wide (one call) ───────────────────────────────────────
out_by_team = {}
inj = tank_get("getNBAInjuryList", {})
for p in inj.get("body", []):
    tm = (p.get("team") or p.get("teamAbv") or "").upper()
    st = (p.get("injStatus") or p.get("status") or "").lower()
    if st in ("out", "doubtful"):
        nm = pname(p).lower()
        if nm:
            s = out_by_team.setdefault(tm, set())
            s.add(nm); s.add(nm.split()[-1])

# ── Walk each team's depth chart for players bumped up ───────────────────────
candidates = []
for team in teams:
    data = tank_get("getNBADepthCharts", {"teamAbv": team})
    body = data.get("body", [])
    entry = body[0] if isinstance(body, list) and body else (body if isinstance(body, dict) else {})
    depth = entry.get("depthChart", {}) if isinstance(entry, dict) else {}
    scratched = out_by_team.get(team, set())

    for pos, players in depth.items():
        if not isinstance(players, list):
            continue
        avail_rank = 0
        for i, pl in enumerate(players):
            nm = pname(pl)
            if _is_out(nm, scratched):
                continue
            bumped_by = i - avail_rank          # how many OUT guys were above him
            if bumped_by >= 1 and avail_rank <= MAX_NEW_RANK:
                ppg = _f(pl.get("pts") or pl.get("ppg"))
                if ppg is None or ppg <= MAX_BASELINE_PPG:
                    out_above = [pname(x) for x in players[:i] if _is_out(pname(x), scratched)]
                    candidates.append({
                        "team": team, "pos": pos, "player": nm,
                        "ppg": ppg, "new_rank": avail_rank, "bumped_by": bumped_by,
                        "out_above": out_above,
                    })
            avail_rank += 1

if not candidates:
    print("  ℹ️  no next-man-up spots tonight"); sys.exit(0)

# New starters first, then by biggest minutes jump
candidates.sort(key=lambda c: (c["new_rank"], -c["bumped_by"], c["ppg"] if c["ppg"] is not None else 99))

lines = []
for c in candidates[:12]:
    role = "🟢 into STARTER minutes" if c["new_rank"] == 0 else "🔸 into primary-backup minutes"
    base = f"{c['ppg']:.1f} ppg" if c["ppg"] is not None else "low-usage"
    out = ", ".join(c["out_above"][:2]) or "injury above"
    lines.append(f"**{c['player']}** ({c['team']} {c['pos']}) — {role}\n"
                 f"   _{base} baseline · {out} out · watch his points/threes over_")

desc = "When a starter sits, the backup's minutes jump but his prop line lags. These are the guys to check:\n\n" + "\n".join(lines)
desc += "\n\n_Minutes bump only — confirm he's actually active & starting, and check the line value. Not financial advice 🏀_"

if not WEBHOOK:
    print("  [would post]\n" + desc); sys.exit(0)
try:
    r = requests.post(WEBHOOK, json={"embeds": [{
        "title": f"🔼 Next Man Up — {datetime.strptime(game_date,'%Y-%m-%d').strftime('%a %b %-d')}",
        "description": desc[:4000], "color": 5763719,
        "footer": {"text": "OTJ · backups inheriting minutes"},
    }]}, timeout=15)
    r.raise_for_status()
    print(f"  📣 next-man-up drop posted — {len(candidates)} spots")
except Exception as e:
    print(f"  ⚠ Discord post failed: {e}")
