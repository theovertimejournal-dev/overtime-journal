"""
mlb_recap.py — yesterday's MLB recap data for the OTJ journal.

Joins two things:
  1. OTJ's model picks for a date (from the `games` table the predict/push
     pipeline already fills: lean, confidence, scores).
  2. The actual final scores for that date (free MLB Stats API).

Then tags each game — did OTJ's pick win, was it an upset (market favorite
lost), was it a blowout — and returns structured data plus a text block the
multi-voice journal prompt can drop straight in.

Design note: this is a *recap provider*. It knows MLB; the journal renderer
stays generic. Add one provider per sport and the journal never has to care
where the data came from. The pure logic lives in `_assemble()` so it can be
tested without touching the network or Supabase.
"""

import sys
import requests

MLB_API = "https://statsapi.mlb.com/api/v1"

# ── Tunable thresholds (change these one place, not scattered in logic) ──────
BLOWOUT_MARGIN = 7      # runs; a genuinely lopsided final
MAJOR_FAV_ML   = -180   # a favorite this heavy losing = a "major" upset
TOP_MOVES      = 3      # how many of the model's highest-conviction picks to feature


def _favorite(ml_home, ml_away):
    """Which side the market favored (more-negative moneyline). None if unknown."""
    if ml_home is None or ml_away is None or ml_home == ml_away:
        return None
    return "home" if ml_home < ml_away else "away"


def get_mlb_final_scores(date):
    """{matchup: {...}} for every FINAL game on `date` (YYYY-MM-DD).
    matchup key is 'AWAY @ HOME' with team abbreviations — matches push/predict."""
    out = {}
    try:
        r = requests.get(f"{MLB_API}/schedule", params={
            "sportId": 1, "date": date, "hydrate": "team,linescore",
        }, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ⚠ MLB scores fetch failed: {e}", file=sys.stderr)
        return out

    for d in data.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("abstractGameState") != "Final":
                continue
            away, home = g["teams"]["away"], g["teams"]["home"]
            a_abbr = away.get("team", {}).get("abbreviation")
            h_abbr = home.get("team", {}).get("abbreviation")
            a_score, h_score = away.get("score"), home.get("score")
            if not (a_abbr and h_abbr) or a_score is None or h_score is None:
                continue
            out[f"{a_abbr} @ {h_abbr}"] = {
                "away": a_abbr, "home": h_abbr,
                "away_score": a_score, "home_score": h_score,
                "winner": h_abbr if h_score > a_score else a_abbr,
                "margin": abs(h_score - a_score),
            }
    return out


def get_otj_games(date, supabase):
    """{matchup: {pick, confidence, kelly_units, ml_home, ml_away}} for the MLB
    slate on `date`, from the games table (OTJ's model output)."""
    out = {}
    try:
        slate = supabase.table("slates").select("id") \
            .eq("sport", "mlb").eq("date", date).single().execute()
        slate_id = slate.data["id"]
    except Exception:
        return out
    try:
        rows = supabase.table("games").select(
            "matchup, away_team, home_team, lean, confidence, scores, ml_home, ml_away"
        ).eq("slate_id", slate_id).execute().data or []
    except Exception:
        return out
    for row in rows:
        lean = row.get("lean")
        pick = row.get("home_team") if lean == "HOME" else \
               row.get("away_team") if lean == "AWAY" else None
        scores = row.get("scores") or {}
        out[row["matchup"]] = {
            "pick": pick,
            "confidence": row.get("confidence"),
            "kelly_units": scores.get("kelly_units", 0) or 0,
            "ml_home": row.get("ml_home"),
            "ml_away": row.get("ml_away"),
        }
    return out


def _assemble(scores, otj):
    """Pure logic: join final scores with OTJ picks, tag upsets/blowouts/moves.
    Kept separate from the getters so it's testable without network/Supabase."""
    games, upsets, blowouts = [], [], []
    hits = graded = 0

    for matchup, res in scores.items():
        info = otj.get(matchup, {})
        pick = info.get("pick")
        entry = {
            **res, "matchup": matchup,
            "otj_pick": pick,
            "otj_hit": (pick == res["winner"]) if pick else None,
            "confidence": info.get("confidence"),
            "kelly_units": info.get("kelly_units", 0),
        }
        if pick:
            graded += 1
            hits += 1 if entry["otj_hit"] else 0

        # Upset = the market favorite lost
        fav = _favorite(info.get("ml_home"), info.get("ml_away"))
        if fav:
            fav_abbr = res["home"] if fav == "home" else res["away"]
            fav_ml = info["ml_home"] if fav == "home" else info["ml_away"]
            if res["winner"] != fav_abbr:
                entry = {**entry, "upset": True, "fav_ml": fav_ml,
                         "major": fav_ml <= MAJOR_FAV_ML}
                upsets.append(entry)

        if res["margin"] >= BLOWOUT_MARGIN:
            blowouts.append(entry)
        games.append(entry)

    top_moves = sorted(
        [g for g in games if g.get("otj_pick")],
        key=lambda g: g.get("kelly_units", 0) or 0, reverse=True,
    )[:TOP_MOVES]
    upsets.sort(key=lambda g: g.get("fav_ml", 0))            # heaviest fav first
    blowouts.sort(key=lambda g: g.get("margin", 0), reverse=True)  # biggest first

    return {
        "date": None, "games": games, "upsets": upsets, "blowouts": blowouts,
        "top_moves": top_moves, "record": {"hits": hits, "graded": graded},
    }


def build_mlb_recap(date, supabase):
    """Top-level entry: pull both sources for `date` and assemble the recap."""
    recap = _assemble(get_mlb_final_scores(date), get_otj_games(date, supabase))
    recap["date"] = date
    return recap


def format_mlb_recap_for_prompt(recap):
    """Render the recap as a text block for the journal prompt (facts only —
    the voices supply the commentary)."""
    lines = []
    rec = recap["record"]
    if rec["graded"]:
        misses = rec["graded"] - rec["hits"]
        lines.append(f"OTJ MODEL RECORD YESTERDAY: {rec['hits']}-{misses} "
                     f"({rec['graded']} graded games)")

    if recap["top_moves"]:
        lines.append("\nOTJ'S TOP MOVES (highest-conviction model picks):")
        for m in recap["top_moves"]:
            result = "WON ✅" if m["otj_hit"] else "LOST ❌"
            u = f" [{m['kelly_units']}u]" if m.get("kelly_units") else ""
            lines.append(f"  {m['otj_pick']}{u} — {result}  "
                         f"({m['away']} {m['away_score']}, {m['home']} {m['home_score']})")

    if recap["upsets"]:
        lines.append("\nUPSETS (market favorite lost):")
        for u in recap["upsets"]:
            tag = "MAJOR UPSET" if u.get("major") else "Upset"
            lines.append(f"  {tag}: {u['winner']} won  "
                         f"({u['away']} {u['away_score']}, {u['home']} {u['home_score']}; "
                         f"favorite was {u['fav_ml']:+d})")

    if recap["blowouts"]:
        lines.append("\nBLOWOUTS (decided by 7+):")
        for b in recap["blowouts"]:
            lines.append(f"  {b['winner']} rolled  "
                         f"{b['away']} {b['away_score']}, {b['home']} {b['home_score']} "
                         f"(by {b['margin']})")

    return "\n".join(lines) if lines else "No completed MLB games for this date."
