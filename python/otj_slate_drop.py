"""
otj_slate_drop.py  —  post the morning board to Discord
========================================================
Runs right after otj_slate_push (see otj_slate_push.yml). Reads the finished
slate from Supabase and posts a clean daily "here's the board" drop to the
channel so the whole crew gets it: the real plays (SHARP/LEAN spreads with
Kelly size), the ML value tags, the trap warnings, and the parlay.

Reads only — it never writes. A failure here never affects the slate.

Needs: SUPABASE_SERVICE_KEY, OTJ_ALERT_WEBHOOK  (env / secrets).

    python otj_slate_drop.py
    python otj_slate_drop.py --date=2026-11-24
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
WEBHOOK      = os.environ.get("OTJ_ALERT_WEBHOOK", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set"); sys.exit(0)
if not WEBHOOK:
    print("⚠ OTJ_ALERT_WEBHOOK not set — nothing to post"); sys.exit(0)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

game_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]

def _f(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def spread_str(g, lean, home, away):
    """The lean side's spread as a tidy string."""
    is_home = lean == home
    sp = _f(g.get("spread_home") if is_home else g.get("spread_away"))
    return f"{lean} {sp:+g}" if sp is not None else lean

# ── Load slate ───────────────────────────────────────────────────────────────
try:
    slate = supabase.table("slates").select("games, otj_parlay") \
        .eq("sport", "nba").eq("date", game_date).single().execute()
    games = slate.data.get("games") or []
    parlay = slate.data.get("otj_parlay") or {}
except Exception as e:
    print(f"  ❌ no slate for {game_date}: {e}"); sys.exit(0)
if not games:
    print("  ℹ️  no games — nothing to drop"); sys.exit(0)

plays, ml_value, traps = [], [], []
for g in games:
    edge = g.get("edge") or {}
    conf = (edge.get("confidence") or "INFO").upper()
    lean = edge.get("lean")
    home = (g.get("home") or {}).get("team", "")
    away = (g.get("away") or {}).get("team", "")
    su   = edge.get("su_ml") or {}
    tag  = su.get("tag")
    stake = _f(edge.get("suggested_stake_pct")) or 0.0

    if conf in ("SHARP", "LEAN") and lean:
        size = f" · 🎯 {stake*100:.1f}%" if stake > 0 else ""
        icon = "🔴" if conf == "SHARP" else "🟡"
        plays.append(f"{icon} **{spread_str(g, lean, home, away)}**  _{conf}_{size}")

    if tag == "VALUE" and su.get("su_pick"):
        pml = su.get("pick_ml")
        ml_value.append(f"💰 **{su.get('su_pick')} ML {pml}**  _{su.get('archetype','')}_")
    elif tag == "TRAP":
        traps.append(f"⚠️ {g.get('matchup','')} — _{su.get('archetype','')}_")

# ── Build the drop ───────────────────────────────────────────────────────────
blocks = []
if plays:
    blocks.append("**🎯 Tonight's plays**\n" + "\n".join(plays))
else:
    blocks.append("**🎯 Tonight's plays**\n_No model spread plays — straights only, keep it light._")
if ml_value:
    blocks.append("**💰 Moneyline value**\n" + "\n".join(ml_value))
legs = parlay.get("legs") or []
if legs:
    leg_line = "  ·  ".join(l.get("pick", "") for l in legs if l.get("pick"))
    blocks.append(f"**🧱 OTJ parlay**\n{leg_line}")
if traps:
    blocks.append("**⚠️ Traps to skip**\n" + "\n".join(traps))

desc = "\n\n".join(blocks)
desc += "\n\n_Sizes are fractional-Kelly. Verify lines at your book · not financial advice 🏀_"

pretty_date = datetime.strptime(game_date, "%Y-%m-%d").strftime("%a %b %-d")
try:
    r = requests.post(WEBHOOK, json={"embeds": [{
        "title": f"🏀 OTJ Board — {pretty_date} · {len(games)} games",
        "description": desc[:4000],
        "color": 3447003,
        "footer": {"text": "overtimejournal.com"},
    }]}, timeout=15)
    r.raise_for_status()
    print(f"  📣 slate drop posted — {len(plays)} plays, {len(ml_value)} ML value, {len(legs)}-leg parlay")
except Exception as e:
    print(f"  ⚠ slate drop failed (non-fatal): {e}")
