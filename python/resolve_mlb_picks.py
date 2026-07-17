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


def grade_user_bets(supabase, date):
    """Settle user-placed MLB bets in game_picks for `date`.

    Mirrors STEP 8 of the NBA resolve_picks.py: grades moneyline/spread/over/
    under against final scores, computes payout from locked_odds, credits
    profiles.bankroll, and logs to bucks_ledger.

    IMPORTANT: the wager was already deducted at placement, so a win credits
    (wager + profit) and a loss credits nothing.
    """
    from mlb_recap import get_mlb_final_scores
    scores = get_mlb_final_scores(date)
    if not scores:
        print(f"  ⚠ No final MLB scores for {date} — skipping bet settlement")
        return

    try:
        picks = supabase.table("game_picks").select("*") \
            .eq("slate_date", date).is_("result", "null").execute().data or []
    except Exception as e:
        print(f"  ⚠ Could not read game_picks: {e}")
        return

    # Only settle bets whose matchup is on the MLB slate for this date. This
    # keeps us from touching another sport's pending bets.
    picks = [p for p in picks if p.get("matchup") in scores]
    if not picks:
        print(f"  ✅ No pending MLB user bets for {date}")
        return

    print(f"  Found {len(picks)} pending MLB user bets for {date}")
    wins = losses = errors = 0

    for pick in picks:
        pid   = pick["id"]
        uid   = pick["user_id"]
        mu    = pick.get("matchup", "")
        ptype = pick.get("pick_type", "moneyline")
        team  = pick.get("picked_team", "")
        odds  = int(pick.get("locked_odds") or 0)
        line  = pick.get("locked_line")
        wager = float(pick.get("wager") or 0)

        final = scores[mu]
        home_score, away_score = final["home_score"], final["away_score"]
        margin = home_score - away_score          # positive = home won
        total_runs = home_score + away_score
        picked_is_home = team == final["home"]

        try:
            if ptype == "moneyline":
                won = home_score > away_score if picked_is_home else away_score > home_score
            elif ptype == "spread":                 # run line
                ln = float(line or 0)
                won = (margin + ln) > 0 if picked_is_home else (-margin + ln) > 0
            elif ptype == "over":
                won = total_runs > float(line or 0)
            elif ptype == "under":
                won = total_runs < float(line or 0)
            else:
                print(f"  ⚠ Unknown pick_type: {ptype}")
                errors += 1
                continue
        except (TypeError, ValueError):
            print(f"  ⚠ Bad line on bet #{pid}: {line}")
            errors += 1
            continue

        if won:
            profit = round(wager * odds / 100, 2) if odds > 0 else \
                     round(wager * 100 / abs(odds), 2) if odds < 0 else wager
            net = profit
        else:
            net = -wager

        try:
            supabase.table("game_picks").update({
                "result": "win" if won else "loss",
                "net": round(net, 2),
                "graded_at": datetime.now().isoformat(),
            }).eq("id", pid).execute()
        except Exception as e:
            print(f"  ⚠ Failed to update pick #{pid}: {e}")
            errors += 1
            continue

        try:
            prof = supabase.table("profiles").select("bankroll") \
                .eq("user_id", uid).single().execute()
            current = float((prof.data or {}).get("bankroll") or 0)
            # Wager already deducted at placement: win returns stake + profit.
            new_bankroll = round(current + wager + profit, 2) if won else current
            supabase.table("profiles").update({"bankroll": new_bankroll}) \
                .eq("user_id", uid).execute()
            try:
                supabase.table("bucks_ledger").insert({
                    "user_id": uid,
                    "amount": round(net, 2),
                    "balance_after": new_bankroll,
                    "type": "bet_result",
                    "note": f"{'W' if won else 'L'} — {team} {ptype} ({mu})",
                }).execute()
            except Exception:
                pass  # ledger is non-critical
        except Exception as e:
            print(f"  ⚠ Bankroll update failed for pick #{pid}: {e}")
            errors += 1
            continue

        wins += 1 if won else 0
        losses += 0 if won else 1

    print(f"  💰 User bets settled: {wins}W-{losses}L" + (f" ({errors} errors)" if errors else ""))


def grade_one(supabase, date, cumulative, settle_bets=True):
    """Grade a single date, write it, return updated cumulative (W, L)."""
    recap = build_mlb_recap(date, supabase)
    graded = grade_from_recap(recap)
    cumulative = (cumulative[0] + graded["wins"], cumulative[1] + graded["losses"])
    _write_day(supabase, date, graded, cumulative)
    print(f"  {date}: {graded['record']}  (season {cumulative[0]}-{cumulative[1]})")
    if settle_bets:
        grade_user_bets(supabase, date)
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
        # settle_bets=False: the backfill only rebuilds the MODEL record.
        # Re-running bet settlement across history could double-pay bankrolls.
        cumulative = grade_one(supabase, row["date"], cumulative, settle_bets=False)
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
