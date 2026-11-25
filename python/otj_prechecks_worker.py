"""
otj_prechecks_worker.py — always-on pre-tip alert loop (Railway worker)
======================================================================
GitHub Actions cron is too delay-prone for time-sensitive pre-tip windows
(it's why the 7am push landed at 11am). This runs as a single always-on
Railway process that fires the pre-tip engine on a reliable fixed cadence,
so a late scratch like Cade actually reaches your Discord before tip.

It just shells out to otj_prechecks.py every few minutes (fresh process each
run = clean state, no refactor of the engine needed). The engine itself
no-ops when no game is in its [tip-35, tip-5] window, so off-hours this is
nearly free — and the loop backs off to a slow cadence when there's nothing
to watch.

Deploy as a Railway *background worker* (no public port, no healthcheck).
Start command:  python python/otj_prechecks_worker.py
Needs the same vars as the engine: SUPABASE_URL, SUPABASE_SERVICE_KEY,
TANK01_API_KEY, OTJ_ALERT_WEBHOOK  (set them in Railway → Variables).

Tunable via env (all optional, with safe defaults):
  PRECHECK_POLL_SECONDS   active cadence while games are on tap   (default 300 = 5 min)
  PRECHECK_IDLE_SECONDS   slow cadence when nothing to watch      (default 1800 = 30 min)
  PRECHECK_RUN_TIMEOUT    kill one engine run after N seconds      (default 240)
"""
import os
import sys
import time
import subprocess
from datetime import datetime, timezone

POLL_SECONDS = int(os.environ.get("PRECHECK_POLL_SECONDS", "300"))
IDLE_SECONDS = int(os.environ.get("PRECHECK_IDLE_SECONDS", "1800"))
RUN_TIMEOUT  = int(os.environ.get("PRECHECK_RUN_TIMEOUT", "240"))

HERE   = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "otj_prechecks.py")

# Phrases the engine prints when there's nothing to act on → back off to idle cadence.
IDLE_MARKERS = ("no games", "no slate", "nothing to watch", "no games in window")


def run_once():
    """Run the engine once; return its stdout (for idle detection)."""
    try:
        r = subprocess.run(
            [sys.executable, SCRIPT],
            cwd=HERE, timeout=RUN_TIMEOUT,
            capture_output=True, text=True,
        )
        out = (r.stdout or "").strip()
        if out:
            print(out, flush=True)
        if r.returncode != 0 and (r.stderr or "").strip():
            print(f"[worker] engine stderr: {r.stderr.strip()}", flush=True)
        return out
    except subprocess.TimeoutExpired:
        print(f"[worker] engine run exceeded {RUN_TIMEOUT}s — skipped this tick", flush=True)
        return ""
    except Exception as e:
        print(f"[worker] engine run failed: {e}", flush=True)
        return ""


def main():
    if not os.path.exists(SCRIPT):
        print(f"[worker] FATAL: can't find {SCRIPT}", flush=True)
        sys.exit(1)
    print(f"[worker] OTJ pre-tip worker up · active={POLL_SECONDS}s idle={IDLE_SECONDS}s", flush=True)
    while True:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[worker] {stamp} tick", flush=True)
        out = run_once().lower()
        idle = any(m in out for m in IDLE_MARKERS)
        time.sleep(IDLE_SECONDS if idle else POLL_SECONDS)


if __name__ == "__main__":
    main()
