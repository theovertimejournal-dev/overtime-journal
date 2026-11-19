"""
su_ml_layer.py  —  straight-up / moneyline archetype layer for OTJ
==================================================================
The model is good at picking WINNERS (SU), just not at beating spreads. This
layer harvests that: it classifies each game by tier matchup (elite/mid/bad/tank
from net rating), picks the SU side, and tags it as a moneyline VALUE play, a
reliable parlay BALLAST leg, or an overpriced TRAP — from the backtested history.

Backtest (400+ graded picks, yesterday_results). (su_win%, ml_roi, n) per
"SU-pick tier vs opponent tier". These are CONFIG — retune as the sample grows.
"""

ARCHETYPE_STATS = {
    ("elite", "tank"):  (0.918,  0.016, 61),
    ("mid",   "tank"):  (0.864,  0.094, 44),
    ("bad",   "tank"):  (0.750,  0.016, 16),
    ("mid",   "bad"):   (0.741,  0.035, 27),
    ("mid",   "mid"):   (0.714, -0.015, 14),
    ("elite", "mid"):   (0.711, -0.069, 90),
    ("elite", "bad"):   (0.674, -0.199, 43),
    ("elite", "elite"): (0.591,  0.095, 88),
    ("mid",   "elite"): (0.568,  0.138, 37),
}

# Tier cutoffs on net rating. Rough; tune with sample.
def classify_tier(net_rating):
    try:
        nr = float(net_rating)
    except (TypeError, ValueError):
        return None
    if nr >= 3:   return "elite"
    if nr >= -2:  return "mid"
    if nr >= -6:  return "bad"
    return "tank"


def _strip(t):
    return (t or "").replace("_NBA", "")


def evaluate_su_ml(lean, home_team, away_team, home_net, away_net,
                   ml_home=None, ml_away=None):
    """SU/ML archetype read for one game. `lean` is the model's pick (ATS lean);
    the stats are keyed on who the model leans, so dog leans (mid vs elite) are
    captured. If there is no lean, falls back to the net-rating favorite.
    Returns None if net ratings are missing."""
    ht, at = classify_tier(home_net), classify_tier(away_net)
    if ht is None or at is None:
        return None
    lean, home_team, away_team = _strip(lean), _strip(home_team), _strip(away_team)

    if lean == home_team:
        pick, opp, pick_tier, opp_tier, pick_ml = home_team, away_team, ht, at, ml_home
    elif lean == away_team:
        pick, opp, pick_tier, opp_tier, pick_ml = away_team, home_team, at, ht, ml_away
    else:
        # no model lean — use the net-rating favorite as the SU pick
        try:
            home_better = float(home_net) >= float(away_net)
        except (TypeError, ValueError):
            return None
        if home_better:
            pick, opp, pick_tier, opp_tier, pick_ml = home_team, away_team, ht, at, ml_home
        else:
            pick, opp, pick_tier, opp_tier, pick_ml = away_team, home_team, at, ht, ml_away

    archetype = f"{pick_tier} vs {opp_tier}"
    stats = ARCHETYPE_STATS.get((pick_tier, opp_tier))
    if not stats:
        return {"su_pick": pick, "opp": opp, "archetype": archetype,
                "tag": "", "note": "", "pick_ml": pick_ml}

    su_win, ml_roi, n = stats
    reliability = "BALLAST" if su_win >= 0.85 else "SOLID" if su_win >= 0.70 else "COINFLIP"
    value = "VALUE" if ml_roi >= 0.05 else "TRAP" if ml_roi <= -0.10 else ""
    tag = value or reliability          # VALUE/TRAP headline, else reliability

    note = f"{archetype}: {su_win*100:.0f}% SU (n={n})"
    if value == "VALUE":
        note += f" · +{ml_roi*100:.0f}% ML ROI — play the moneyline"
    elif value == "TRAP":
        note += f" · {ml_roi*100:.0f}% ML ROI — overpriced, skip the ML"
    elif reliability == "BALLAST":
        note += " — reliable parlay leg (low solo payout)"

    return {
        "su_pick": pick, "opp": opp, "archetype": archetype,
        "su_win_hist": round(su_win, 3), "ml_roi_hist": round(ml_roi, 3), "n": n,
        "reliability": reliability, "ml_value": value, "tag": tag,
        "note": note, "pick_ml": pick_ml,
    }


if __name__ == "__main__":
    import json
    # (name, lean, home, away, home_net, away_net, ml_home, ml_away)
    tests = [
        ("elite vs tank ballast",  "DEN", "DEN", "WAS",  8.0, -9.0, -600,  450),
        ("mid vs tank value",      "BKN", "BKN", "CHI", -4.0, -8.0, -180,  150),
        ("mid vs elite DOG value", "SAC", "BOS", "SAC",  6.0,  0.5, -240,  200),
        ("elite vs bad TRAP",      "OKC", "OKC", "POR",  7.0, -4.0, -450,  350),
    ]
    for name, lean, h, a, hn, an, mlh, mla in tests:
        r = evaluate_su_ml(lean, h, a, hn, an, mlh, mla)
        print(f"{name:26} -> {r['su_pick']:4} [{r['tag']:8}] {r['note']}")
