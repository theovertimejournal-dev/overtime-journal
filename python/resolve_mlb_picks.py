"""
resolve_mlb_picks.py — grade OTJ's MLB model picks and store the season record.

Reuses mlb_recap.py to figure out, for a given date, which games OTJ had a lean
on and whether that lean won. Writes the result into the SAME slate columns the
Record page already reads for NBA:
    yesterday_results  = [{"matchup","result":"W"/"L","lean","confidence"}, ...]
    yesterday_record   = "W-L"
    cumulative_record  = running season "W-L"

Modes:
    --backfill                 grade every past MLB slate and rebuild cumulative
    --date=YYYY-MM-DD          grade a single day (the daily job)
    (no args)                  grade yesterday (ET)

The grading logic (grade_from_recap) is pure so it can be unit-tested without
the network or Supabase.
"""

import os
import sys
import argparse
from datetime import datetime, timedelta

from mlb_recap import build_mlb_recap  # same folder


def grade_from_recap(recap: dict) -> dict:
    """Pure: turn an mlb_recap result into a day's W/L record.
    Only games where OTJ actually had a pick (lean) are graded."""
    results = []
    for g in recap.get("games", []):
        if not g.get("otj_pick"):
            continue
        results.append({
            "matchup": g["matchup"],
            "result": "W" if g.get("otj_hit") else "L",
            "lean": g["otj_pick"],
            "confidence": g.get("confidence"),
        })
    wins = sum(1 for r in results if r["result"] == "W")
    losses = len(results) - wins
    return {"results": results, "wins": wins, "losses": losses,
            "record": f"{wins}-{losses}"}


def _supabase():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _write_day(supabase, date, graded, cumulative):
    supabase.table("slates").update({
        "yesterday_results": graded["results"],
        "yesterday_record":  graded["record"],
        "cumulative_record": f"{cumulative[0]}-{cumulative[1]}",
    }).eq("sport", "mlb").eq("date", date).execute()


def grade_one(supabase, date, cumulative):
    """Grade a single date, write it, return updated cumulative (W, L)."""
    recap = build_mlb_recap(date, supabase)
    graded = grade_from_recap(recap)
    cumulative = (cumulative[0] + graded["wins"], cumulative[1] + graded["losses"])
    _write_day(supabase, date, graded, cumulative)
    print(f"  {date}: {graded['record']}  (season {cumulative[0]}-{cumulative[1]})")
    return cumulative


def backfill(supabase):
    """Grade every past MLB slate in order, rebuilding the cumulative record."""
    today = datetime.now().strftime("%Y-%m-%d")
    rows = supabase.table("slates").select("date") \
        .eq("sport", "mlb").lt("date", today) \
        .order("date", desc=False).execute().data or []
    print(f"Backfilling {len(rows)} MLB slate dates...")
    cumulative = (0, 0)
    for row in rows:
        cumulative = grade_one(supabase, row["date"], cumulative)
    print(f"✅ Season record: {cumulative[0]}-{cumulative[1]}")


def _prior_cumulative(supabase, date):
    """Most recent cumulative_record strictly before `date` (for the daily job)."""
    rows = supabase.table("slates").select("cumulative_record") \
        .eq("sport", "mlb").lt("date", date) \
        .not_.is_("cumulative_record", "null") \
        .order("date", desc=True).limit(1).execute().data or []
    if rows and rows[0].get("cumulative_record"):
        try:
            w, l = rows[0]["cumulative_record"].split("-")
            return (int(w), int(l))
        except (ValueError, AttributeError):
            pass
    return (0, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--date", default=None)
    args = ap.parse_args()

    supabase = _supabase()

    if args.backfill:
        backfill(supabase)
        return

    date = args.date or (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    cumulative = _prior_cumulative(supabase, date)
    grade_one(supabase, date, cumulative)


if __name__ == "__main__":
    main()
