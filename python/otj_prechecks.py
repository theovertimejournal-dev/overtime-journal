"""
otj_prechecks.py  —  pre-tip injury / line / SCORE-DRIFT alerts to Discord
==========================================================================
Runs every ~5 min during game hours (see otj_prechecks.yml). For each game it
watches the final ~35 minutes before tip and pings Discord when the morning
slate is going stale:

  • SCORE DRIFT  — re-runs the ACTUAL model (calculate_edge) with the fresh
                   injuries + current line and compares the SCORE / lean / conf
                   to what the 7 AM slate said. This is the headline: yesterday
                   OKC was a ‑0.6 OKC lean; with SGA/Chet/JWill out it re-scores
                   to a big MIA number. That swing is the alert.
  • LATE SCRATCH — a player newly OUT vs the baseline snapshotted early today.
  • LINE MOVE    — spread moved ≥ 1.5 or ML ≥ 25 from the OPENING number
                   (opening line comes from odds_history.is_open).

How it knows WHEN: cron can't fire "30 min before each game", so this polls
often, reads each game's tip time from the slate, and acts only on games in the
[tip-35, tip-5] window. precheck_state remembers the baseline + whether we've
already pinged, so each change fires once, not every 5 minutes.

Needs: SUPABASE_SERVICE_KEY, TANK01_API_KEY, OTJ_ALERT_WEBHOOK  (env / secrets).
Keep in python/ next to nba_edge_analyzer.py (it imports calculate_edge).

    python otj_prechecks.py
    python otj_prechecks.py --date=2026-11-24
"""
import sys
import os
import re
import requests
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# Reuse the real model for the drift re-score. If this import ever fails, the
# script still runs — it just skips the drift check and keeps scratch/line alerts.
try:
    from nba_edge_analyzer import calculate_edge
except Exception as _e:
    calculate_edge = None
    print(f"⚠ calculate_edge import failed — score-drift disabled: {_e}")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nuemrevwtawatrjsmxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
TANK01_KEY   = os.environ.get("TANK01_API_KEY", "")
WEBHOOK      = os.environ.get("OTJ_ALERT_WEBHOOK", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set"); sys.exit(1)
if not WEBHOOK:
    print("⚠ OTJ_ALERT_WEBHOOK not set — will run but can't post")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
TANK01_HEADERS = {"x-rapidapi-key": TANK01_KEY,
                  "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com"}

# ── Tunables ────────────────────────────────────────────────────────────────
WINDOW_LATE  = 35    # start watching this many minutes before tip
WINDOW_EARLY = 5     # stop watching this many minutes before tip
SPREAD_MOVE  = 1.5   # spread move (pts) that counts as material
ML_MOVE      = 25    # moneyline move that counts as material
DRIFT_SCORE  = 3.0   # model SCORE change that counts as material drift

game_date = datetime.now().strftime("%Y-%m-%d")
for arg in sys.argv[1:]:
    if arg.startswith("--date="):
        game_date = arg.split("=")[1]

now_utc = datetime.now(timezone.utc)
print(f"\n{'='*52}\n  OTJ Pre-Tip Checks — {game_date}  ({now_utc:%H:%M UTC})\n{'='*52}")

FINAL = {"final", "completed", "complete", "f", "ft", "game over", "official", "post"}
def game_over(status):
    s = (status or "").strip().lower()
    return s in FINAL or '"completed":true' in s or '"displaylong":"final"' in s

def tip_time(game):
    """UTC datetime of tip, from game_time (preferred) or an ISO status."""
    for v in (game.get("game_time"), game.get("status")):
        if not v:
            continue
        try:
            dt = datetime.fromisoformat(str(v).strip().replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None

def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

_NUM = re.compile(r"^-?\d+(\.\d+)?$")
def _profile(side, out_names):
    """Copy a slate team profile, coerce numeric strings to floats, and swap in
    the fresh OUT list so calculate_edge re-applies the star-out penalty."""
    p = dict(side or {})
    for k, v in list(p.items()):
        if isinstance(v, str) and _NUM.match(v):
            p[k] = float(v)
    p["injuries"] = [{"name": n, "status": "Out"} for n in out_names]
    return p

def rescore(game, home_out, away_out):
    """Re-run the real model with fresh injuries + current spread. Returns the
    new edge dict, or None if unavailable (non-fatal)."""
    if calculate_edge is None:
        return None
    try:
        h = _profile(game.get("home"), home_out)
        a = _profile(game.get("away"), away_out)
        sp = _f(game.get("spread_home")) or 0.0
        return calculate_edge(h, a, sp)
    except Exception as e:
        print(f"  ⚠ rescore failed ({game.get('matchup','?')}): {e}")
        return None

def post_discord(title, desc, color):
    if not WEBHOOK:
        print(f"  [would post] {title}\n    {desc}"); return
    try:
        r = requests.post(WEBHOOK, json={"embeds": [{
            "title": title, "description": desc, "color": color,
            "footer": {"text": "OTJ pre-tip alert"},
            "timestamp": now_utc.isoformat(),
        }]}, timeout=15)
        r.raise_for_status()
        print(f"  📣 posted: {title}")
    except Exception as e:
        print(f"  ⚠ Discord post failed: {e}")

# ── Load today's slate ──────────────────────────────────────────────────────
try:
    slate = supabase.table("slates").select("games") \
        .eq("sport", "nba").eq("date", game_date).single().execute()
    games = slate.data.get("games") or []
except Exception as e:
    print(f"  ❌ no slate for {game_date}: {e}"); sys.exit(0)
if not games:
    print("  ℹ️  no games on slate"); sys.exit(0)

# ── Current injuries (Tank01) — same call refresh_odds uses ─────────────────
tank_out = {}
try:
    r = requests.get("https://tank01-fantasy-stats.p.rapidapi.com/getNBAInjuryList",
                     headers=TANK01_HEADERS, timeout=20)
    r.raise_for_status()
    for p in r.json().get("body", []):
        team = (p.get("team") or p.get("teamAbv") or "").upper()
        st = (p.get("injStatus") or p.get("status") or "").lower()
        if st in ("out", "doubtful"):
            tank_out.setdefault(team, []).append(
                f"{p.get('firstName','')} {p.get('lastName','')}".strip())
except Exception as e:
    print(f"  ⚠ Tank01 injuries failed (non-fatal): {e}")

# ── Opening lines (baseline for line moves) from odds_history.is_open ────────
opening = {}
try:
    rows = supabase.table("odds_history").select("game_id, ml_home, spread_home") \
        .eq("date", game_date).eq("is_open", True).execute().data or []
    for row in rows:
        opening[row["game_id"]] = row
except Exception as e:
    print(f"  ⚠ opening-line read failed (non-fatal): {e}")

# ── precheck_state (per-game baseline + de-dupe) ────────────────────────────
state = {}
try:
    for row in (supabase.table("precheck_state").select("*").eq("date", game_date).execute().data or []):
        state[row["matchup"]] = row
except Exception as e:
    print(f"  ⚠ precheck_state read failed: {e}")

def save_state(matchup, baseline_out, alerted):
    try:
        supabase.table("precheck_state").upsert({
            "date": game_date, "matchup": matchup,
            "baseline_out": baseline_out, "alerted": alerted,
            "updated_at": now_utc.isoformat(),
        }, on_conflict="date,matchup").execute()
    except Exception as e:
        print(f"  ⚠ state save failed ({matchup}): {e}")

# ── Main loop ───────────────────────────────────────────────────────────────
for g in games:
    matchup = g.get("matchup", "")
    if game_over(g.get("status", "")):
        continue
    tip = tip_time(g)
    if not tip:
        continue
    mtt = (tip - now_utc).total_seconds() / 60.0
    if mtt < WINDOW_EARLY or mtt > 48 * 60:
        continue

    home = (g.get("home") or {}).get("team", "")
    away = (g.get("away") or {}).get("team", "")
    current_out = [f"{n} ({home})" for n in tank_out.get(home, [])] + \
                  [f"{n} ({away})" for n in tank_out.get(away, [])]

    row = state.get(matchup)
    if row is None:
        save_state(matchup, current_out, False)   # first sight → baseline, no alert
        print(f"  • {matchup}: baseline set ({len(current_out)} out, tip in {mtt:.0f}m)")
        continue

    baseline = row.get("baseline_out") or []
    already  = bool(row.get("alerted"))
    if mtt > WINDOW_LATE:               # not in the alert window yet
        continue

    alerts, color = [], 15158332       # red default
    new_out = [p for p in current_out if p not in baseline]

    # ── Score drift: re-run the real model with fresh injuries + current line ──
    drift_material = False
    re_edge = rescore(g, tank_out.get(home, []), tank_out.get(away, []))
    if re_edge:
        m = g.get("edge") or {}
        m_sc, n_sc = _f(m.get("score")), _f(re_edge.get("score"))
        m_ln, n_ln = (m.get("lean") or "—"), (re_edge.get("lean") or "—")
        m_cf, n_cf = (m.get("confidence") or "INFO"), (re_edge.get("confidence") or "INFO")
        if m_sc is not None and n_sc is not None:
            if abs(n_sc - m_sc) >= DRIFT_SCORE or n_ln != m_ln or n_cf != m_cf:
                drift_material = True
                alerts.append(f"🧮 **Score drift:** {m_ln} {m_sc:+g} {m_cf}  →  {n_ln} {n_sc:+g} {n_cf}")

    if new_out:
        alerts.append("🚑 **Late scratch:** " + ", ".join(new_out))

    # ── Line move vs opening ──
    line_material = False
    op = opening.get(matchup)
    if op:
        cur_sh, op_sh = _f(g.get("spread_home")), _f(op.get("spread_home"))
        cur_mh, op_mh = _f(g.get("ml_home")), _f(op.get("ml_home"))
        if cur_sh is not None and op_sh is not None and abs(cur_sh - op_sh) >= SPREAD_MOVE:
            alerts.append(f"📈 **Line move:** {home} spread {op_sh:+g} → {cur_sh:+g}"); line_material = True
            color = 15844367
        elif cur_mh is not None and op_mh is not None and abs(cur_mh - op_mh) >= ML_MOVE:
            alerts.append(f"📈 **Line move:** {home} ML {op_mh:+g} → {cur_mh:+g}"); line_material = True
            color = 15844367

    # Fire once per game in-window; a FURTHER new scratch after that sends a follow-up.
    should = (not already and (drift_material or new_out or line_material)) or (already and new_out)
    if not should:
        continue

    desc = "\n".join(alerts) + f"\n\ntip in ~{mtt:.0f} min"
    if g.get("spread_home") is not None:
        desc += f"\n**Now:** {home} {g.get('spread_home')} · ML {g.get('ml_home')}/{g.get('ml_away')}"
    if drift_material:
        color = 15158332   # drift is the big one — keep it red
    post_discord(f"⚠️ {matchup} — pre-tip alert", desc, color)
    save_state(matchup, baseline + new_out, True)

print(f"\n  ✅ pre-tip check done ({now_utc:%H:%M UTC})\n")
