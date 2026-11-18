"""
kelly_stake.py — fractional-Kelly staking for OTJ spread leans
==============================================================
Turns a tier + price + bankroll into a disciplined bet size, so one -400 upset
or an 18-for-20 night can't torch the roll. Variance is not model error; sizing
is how you survive it.

Win probability per tier = the MEASURED ATS cover% from 401 graded picks on frozen
opening lines (Mar-Nov 2026), then SHRUNK toward break-even — because point
estimates overbet (a 60.9% sample is not a 60.9% truth). Quarter-Kelly by default,
with a hard cap on every bet.

Core math:
  b  = decimal net odds (profit per 1 staked):  -110 -> 0.909,  +120 -> 1.20
  f* = (b*p - q) / b        # full-Kelly fraction of bankroll;  <=0 => no bet
  stake = bankroll * kelly_mult * max(f*, 0), capped at max_frac of bankroll.

Everything is config-driven; retune TIER_COVER as the live sample grows.
"""

BREAK_EVEN_110 = 0.5238   # -110 juice

# Measured ATS cover% by tier (spread bets, opening line). Retune with sample.
TIER_COVER = {"SHARP": 0.609, "LEAN": 0.580}
TIER_N     = {"SHARP": 174,   "LEAN": 50}

# Fade = road-favorite inverse. Measured 83% but n=12, so trust it like a ~58%
# until it proves out forward, and hard-cap the stake to a sliver.
FADE_COVER    = 0.58
FADE_MAX_FRAC = 0.01


def american_to_decimal_b(odds: float) -> float:
    """Net decimal odds b (profit per 1u staked)."""
    o = float(odds)
    return o / 100.0 if o > 0 else 100.0 / abs(o)


def kelly_fraction(p: float, odds: float) -> float:
    """Full-Kelly fraction of bankroll. <= 0 means 'not +EV, no bet'."""
    b = american_to_decimal_b(odds)
    q = 1.0 - p
    return (b * p - q) / b


def shrink_prob(p_measured: float, shrink: float = 0.5,
                floor: float = BREAK_EVEN_110) -> float:
    """Pull a measured win-rate toward break-even. shrink=0.5 trusts HALF the edge.
    If the measured rate is already at/below break-even, leave it (Kelly -> no bet)."""
    if p_measured <= floor:
        return p_measured
    return floor + shrink * (p_measured - floor)


def stake(bankroll: float, p: float, odds: float,
          kelly_mult: float = 0.25, max_frac: float = 0.05) -> float:
    """Dollar stake. Fractional Kelly, floored at 0, capped at max_frac of roll."""
    f = kelly_fraction(p, odds)
    if f <= 0:
        return 0.0
    frac = min(kelly_mult * f, max_frac)
    return round(bankroll * frac, 2)


def recommend_stake(bankroll: float, confidence: str, odds: float = -110,
                    is_fade: bool = False, kelly_mult: float = 0.25,
                    shrink: float = 0.5, max_frac: float = 0.05) -> dict:
    """Main entry. tier + price + roll -> dict(stake, stake_pct, p_used, note)."""
    if is_fade:
        p = FADE_COVER
        amt = stake(bankroll, p, odds, kelly_mult=kelly_mult, max_frac=FADE_MAX_FRAC)
        return {"stake": amt, "stake_pct": round(amt / bankroll, 4) if bankroll else 0,
                "p_used": p, "note": f"FADE (n=12) — {kelly_mult:.0%}-Kelly, capped {FADE_MAX_FRAC:.0%}, tracking"}

    cover = TIER_COVER.get(confidence)
    if cover is None:                       # INFO / PASS / anything unknown
        return {"stake": 0.0, "stake_pct": 0.0, "p_used": None,
                "note": f"{confidence}: no play"}

    p = shrink_prob(cover, shrink=shrink)
    amt = stake(bankroll, p, odds, kelly_mult=kelly_mult, max_frac=max_frac)
    return {"stake": amt, "stake_pct": round(amt / bankroll, 4) if bankroll else 0,
            "p_used": round(p, 3), "kelly_frac": round(kelly_fraction(p, odds), 4),
            "note": (f"{confidence}: {kelly_mult:.0%}-Kelly on shrunk p={p:.3f} "
                     f"(measured {cover:.1%}, n={TIER_N[confidence]})")}


if __name__ == "__main__":
    roll = 10000
    print(f"Bankroll ${roll:,} — suggested stakes at -110:\n")
    for conf in ("SHARP", "LEAN", "INFO"):
        r = recommend_stake(roll, conf)
        print(f"  {conf:6} -> ${r['stake']:>7.2f}  ({r['stake_pct']*100:4.1f}% of roll)   {r['note']}")
    r = recommend_stake(roll, "INFO", is_fade=True)
    print(f"  {'FADE':6} -> ${r['stake']:>7.2f}  ({r['stake_pct']*100:4.1f}% of roll)   {r['note']}")

    print("\nSame tiers at a juicier -140 favorite price:")
    for conf in ("SHARP", "LEAN"):
        r = recommend_stake(roll, conf, odds=-140)
        print(f"  {conf:6} -> ${r['stake']:>7.2f}  ({r['stake_pct']*100:4.1f}% of roll)")
