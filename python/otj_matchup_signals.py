"""
otj_matchup_signals.py  —  on-card edge tags from data you already store
========================================================================
Turns this week's findings into card signals, computed from the off_rating /
def_rating / spread / moneyline already on every game. Returns a list of
signal dicts in the SAME shape the card already renders
(type, label, detail, favors, strength, impact), so wiring is one line:

    from otj_matchup_signals import matchup_signals
    edge["signals"].extend(
        matchup_signals(home_profile, away_profile, spread_home, ml_h, ml_a)
    )

Call it right after calculate_edge() in the slate build, where spread_home
and the moneylines are already in hand (push_to_supabase main loop).

Signals produced
----------------
  PAPER TIGER      a big-spread favorite whose net rating is offense-propped
                   (leaky defense) — wins games, doesn't cover big numbers
  BACKDOOR RISK    a big-spread favorite vs a dog that can still score —
                   shootout keeps the dog within the number
  DEFENSE-BACKED   a big-spread favorite that actually defends vs a dog that
                   can't score — the number you can trust
  CHALK TRAP       a road favorite priced -100..-200 (the bleed bucket)
  HOME DOG VALUE   a home dog priced +100..+149 (the biggest ML edge)

Tunables live at the top — retune LEAGUE_AVG_RTG once a season as pace/
scoring drift (no dates, no per-season code changes needed).
"""

# ── Tunables (retune per season; ratings inflate over time) ──────────────────
LEAGUE_AVG_RTG   = 113.5   # league-avg offensive = defensive rating
BIG_SPREAD       = 6.5     # "big number" threshold (points the fav lays)
GOOD_D_MARGIN    = 2.5     # def this far BELOW avg = a real defense
LEAKY_D_MARGIN   = 0.5     # def this far ABOVE avg = offense-propped
WEAK_O_MARGIN    = 2.5     # off this far BELOW avg = can't score
LIVE_O_MARGIN    = 2.0     # off within this of avg (or better) = can hang
ROAD_FAV_TRAP    = (-200, -100)   # road-favorite ML bleed bucket (inclusive)
HOME_DOG_VALUE   = (100, 149)     # home-dog ML edge bucket (inclusive)


def _num(x, default=None):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _rtg(profile, key):
    return _num(profile.get(key), LEAGUE_AVG_RTG)


def matchup_signals(home, away, spread_home, ml_home=None, ml_away=None):
    """Return new card signals for this matchup. Pure function, no side effects."""
    out = []
    sh = _num(spread_home, 0.0) or 0.0

    # Sign convention (confirmed from the slate): spread_home > 0 => HOME is the
    # underdog getting points (AWAY favored); spread_home < 0 => HOME favored.
    if sh < 0:
        fav, dog = home, away
    elif sh > 0:
        fav, dog = away, home
    else:
        fav = dog = None
    fav_lays = abs(sh)

    # ── Spread quality: is this big number defense-backed or a paper tiger? ──
    if fav and dog and fav_lays >= BIG_SPREAD:
        fav_def = _rtg(fav, "def_rating")
        dog_off = _rtg(dog, "off_rating")
        fav_t, dog_t = fav.get("team", "Fav"), dog.get("team", "Dog")

        offense_propped = fav_def >= LEAGUE_AVG_RTG + LEAKY_D_MARGIN
        dog_can_score   = dog_off >= LEAGUE_AVG_RTG - LIVE_O_MARGIN
        defense_backed  = fav_def <= LEAGUE_AVG_RTG - GOOD_D_MARGIN
        dog_cant_score  = dog_off <= LEAGUE_AVG_RTG - WEAK_O_MARGIN

        if offense_propped:
            out.append({
                "type": "SPREAD_TRAP",
                "label": "PAPER TIGER",
                "detail": (f"PAPER TIGER — {fav_t} laying {fav_lays:.1f} but its "
                           f"{fav_def:.1f} defense is below league average. "
                           f"Offense-propped favorites win games, not covers. "
                           f"Lean {dog_t} +{fav_lays:.1f}."),
                "favors": dog_t, "strength": "CAUTION", "impact": -2.5,
            })
        elif dog_can_score:
            out.append({
                "type": "SPREAD_TRAP",
                "label": "BACKDOOR RISK",
                "detail": (f"BACKDOOR RISK — {dog_t} still scores "
                           f"({dog_off:.1f} offense), so this stays a shootout and "
                           f"the dog hangs within {fav_lays:.1f}. Take the points."),
                "favors": dog_t, "strength": "CAUTION", "impact": -2.0,
            })
        elif defense_backed and dog_cant_score:
            out.append({
                "type": "SPREAD_TRUSTED",
                "label": "DEFENSE-BACKED",
                "detail": (f"DEFENSE-BACKED — {fav_t} defends ({fav_def:.1f}) and "
                           f"{dog_t} can't score ({dog_off:.1f} offense). "
                           f"The kind of blowout that covers {fav_lays:.1f}."),
                "favors": fav_t, "strength": "STRONG", "impact": 2.5,
            })

    # ── Price buckets: chalk trap & home-dog value ──────────────────────────
    ml_h, ml_a = _num(ml_home), _num(ml_away)
    home_t, away_t = home.get("team", "Home"), away.get("team", "Away")

    if ml_a is not None and ROAD_FAV_TRAP[0] <= ml_a <= ROAD_FAV_TRAP[1]:
        # away = road team; negative ML = favored
        out.append({
            "type": "CHALK_TRAP",
            "label": "CHALK TRAP",
            "detail": (f"CHALK TRAP — {away_t} is a road favorite at {int(ml_a)}. "
                       f"Road favorites in the -100 to -200 bucket bleed -17% to "
                       f"-30% ROI. Lean the home dog {home_t}"
                       + (f" {int(ml_h):+d}." if ml_h is not None else ".")),
            "favors": home_t, "strength": "CAUTION", "impact": 0,
        })

    if ml_h is not None and HOME_DOG_VALUE[0] <= ml_h <= HOME_DOG_VALUE[1]:
        out.append({
            "type": "HOME_DOG_VALUE",
            "label": "HOME DOG VALUE",
            "detail": (f"HOME DOG VALUE — {home_t} home dog at +{int(ml_h)}. "
                       f"The +100/+149 home-dog bucket is the model's single "
                       f"biggest ML edge (~+27% ROI). Live moneyline play."),
            "favors": home_t, "strength": "STRONG", "impact": 0,
        })

    return out


if __name__ == "__main__":
    # Smoke test with tonight's DEN -? paper-tiger shape and a defense-backed one.
    den = {"team": "DEN", "off_rating": 118.8, "def_rating": 115.8}
    dal = {"team": "DAL", "off_rating": 111.8, "def_rating": 114.0}
    bos = {"team": "BOS", "off_rating": 116.9, "def_rating": 107.8}
    sac = {"team": "SAC", "off_rating": 108.3, "def_rating": 119.3}
    print("DEN -8 vs DAL (home dog):")
    for s in matchup_signals(dal, den, spread_home=8.0, ml_home=260, ml_away=-330):
        print("  ", s["label"], "·", s["favors"], "·", s["strength"])
    print("BOS -10 vs SAC (home dog):")
    for s in matchup_signals(sac, bos, spread_home=10.0, ml_home=400, ml_away=-520):
        print("  ", s["label"], "·", s["favors"], "·", s["strength"])
    print("DET -2.5 road fav vs ORL (chalk-ish):")
    for s in matchup_signals({"team": "ORL", "off_rating": 112.5, "def_rating": 114.2},
                             {"team": "DET", "off_rating": 115.2, "def_rating": 109.1},
                             spread_home=2.5, ml_home=120, ml_away=-142):
        print("  ", s["label"], "·", s["favors"], "·", s["strength"])
