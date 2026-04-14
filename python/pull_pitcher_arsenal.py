"""
pull_pitcher_arsenal.py

For each unique starting pitcher in our historical data, pull their pitch
arsenal from Statcast via pybaseball. Captures:
  - Pitch mix (% usage of each pitch type)
  - Per-pitch effectiveness (whiff%, avg velocity, xwOBA against)

Output: pitcher_arsenal_{year}.parquet, keyed by (pitcher_id, season)

Pitch type codes (Statcast convention):
  FF = 4-seam fastball, SI = sinker (2-seam), FC = cutter
  SL = slider, CU = curveball, KC = knuckle curve, SV = slurve
  CH = changeup, FS = splitter, FO = forkball
  KN = knuckleball, EP = eephus

We bucket these into 5 categories for matching against hitter splits:
  - fastball: FF, FT, FC, SI
  - breaking: SL, CU, KC, SV, ST (sweeper)
  - offspeed: CH, FS, FO
  - heater_velo: avg velo of fastball bucket
  - other: KN, EP, etc.
"""
import os, sys, time, argparse, logging
from pathlib import Path
from collections import defaultdict
import pandas as pd

INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("arsenal")


# Pitch type bucketing
FASTBALL = {"FF", "FT", "FA", "SI", "FC"}
BREAKING = {"SL", "CU", "KC", "SV", "ST", "CS"}
OFFSPEED = {"CH", "FS", "FO", "SC"}


def import_pybaseball():
    """Lazy import so we can fail gracefully with a clear message."""
    try:
        import pybaseball as pb
        # Disable cache messages
        pb.cache.enable()
        return pb
    except ImportError:
        log.error("pybaseball not installed. pip install pybaseball")
        sys.exit(1)


def get_pitcher_arsenal(pb, pitcher_id, season):
    """
    Pull all pitches thrown by this pitcher in this season, then aggregate.
    Returns dict of arsenal features.
    """
    # Date range covers regular season + playoffs
    start = f"{season}-03-01"
    end = f"{season}-11-30"

    try:
        df = pb.statcast_pitcher(start, end, pitcher_id)
    except Exception as e:
        log.warning("statcast pull failed for %s: %s", pitcher_id, e)
        return {}

    if df is None or len(df) == 0:
        return {}

    total_pitches = len(df)
    if total_pitches < 50:  # not enough data, probably a position player pitching
        return {}

    # Categorize each pitch
    df["bucket"] = "other"
    df.loc[df["pitch_type"].isin(FASTBALL), "bucket"] = "fastball"
    df.loc[df["pitch_type"].isin(BREAKING), "bucket"] = "breaking"
    df.loc[df["pitch_type"].isin(OFFSPEED), "bucket"] = "offspeed"

    bucket_counts = df["bucket"].value_counts(normalize=True)

    # Whiff rate per bucket: swings_and_misses / swings
    swing_events = ["swinging_strike", "swinging_strike_blocked",
                    "missed_bunt", "foul_tip"]
    swings = ["foul", "foul_tip", "hit_into_play", "hit_into_play_no_out",
              "hit_into_play_score", "swinging_strike",
              "swinging_strike_blocked", "missed_bunt"]

    def whiff_rate(sub_df):
        n_swings = sub_df["description"].isin(swings).sum()
        if n_swings == 0:
            return None
        n_whiffs = sub_df["description"].isin(swing_events).sum()
        return round(n_whiffs / n_swings, 3)

    fastball_df = df[df["bucket"] == "fastball"]
    breaking_df = df[df["bucket"] == "breaking"]
    offspeed_df = df[df["bucket"] == "offspeed"]

    # Velo (only meaningful for fastball)
    fb_velo = fastball_df["release_speed"].mean() if len(fastball_df) else None

    # Average xwOBA against (lower = better pitcher)
    def avg_xwoba(sub_df):
        x = sub_df["estimated_woba_using_speedangle"].dropna()
        return round(x.mean(), 3) if len(x) else None

    return {
        "arsenal_total_pitches": total_pitches,
        "arsenal_fastball_pct": round(bucket_counts.get("fastball", 0), 3),
        "arsenal_breaking_pct": round(bucket_counts.get("breaking", 0), 3),
        "arsenal_offspeed_pct": round(bucket_counts.get("offspeed", 0), 3),
        "arsenal_other_pct": round(bucket_counts.get("other", 0), 3),
        "arsenal_fb_velo": round(fb_velo, 1) if fb_velo else None,
        "arsenal_fb_whiff": whiff_rate(fastball_df),
        "arsenal_breaking_whiff": whiff_rate(breaking_df),
        "arsenal_offspeed_whiff": whiff_rate(offspeed_df),
        "arsenal_fb_xwoba": avg_xwoba(fastball_df),
        "arsenal_breaking_xwoba": avg_xwoba(breaking_df),
        "arsenal_offspeed_xwoba": avg_xwoba(offspeed_df),
        "arsenal_overall_xwoba": avg_xwoba(df),
    }


def process_year(year, pb):
    pitcher_path = INPUT_DIR / f"pitcher_features_{year}.parquet"
    if not pitcher_path.exists():
        log.error("missing %s", pitcher_path); return

    pitchers = pd.read_parquet(pitcher_path)
    unique_pitchers = set(pitchers["home_starter_id"].dropna()) | \
                      set(pitchers["away_starter_id"].dropna())
    log.info("[%s] pulling arsenal for %s unique pitchers", year, len(unique_pitchers))

    rows = []
    for i, pid in enumerate(unique_pitchers):
        arsenal = get_pitcher_arsenal(pb, int(pid), year)
        row = {"pitcher_id": int(pid), "season": year, **arsenal}
        rows.append(row)
        if (i + 1) % 25 == 0:
            log.info("  progress: %s/%s", i + 1, len(unique_pitchers))
        # pybaseball has internal rate limiting; small sleep to be safe
        time.sleep(0.5)

    df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"pitcher_arsenal_{year}.parquet"
    df.to_parquet(out_path, index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_arsenal_{year}.csv", index=False)
    cov = df["arsenal_fastball_pct"].notna().mean() if "arsenal_fastball_pct" in df.columns else 0
    log.info("[%s] saved %s rows | arsenal_cov=%.1f%%", year, len(df), 100 * cov)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, choices=[2024, 2025])
    args = p.parse_args()

    pb = import_pybaseball()
    years = [args.year] if args.year else [2024, 2025]
    for y in years:
        process_year(y, pb)
    log.info("DONE")


if __name__ == "__main__":
    main()
