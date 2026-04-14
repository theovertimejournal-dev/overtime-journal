"""
pull_hitter_pitch_splits.py

For each unique starting batter, pull pitch-by-pitch data via Statcast and
compute their performance against each pitch type bucket.

Output: hitter_pitch_splits_{year}.parquet, keyed by (batter_id, season)

Features per hitter:
  - vs_fastball_woba: wOBA when facing fastball-bucket pitches
  - vs_breaking_woba: wOBA vs breaking
  - vs_offspeed_woba: wOBA vs offspeed
  - vs_fastball_whiff: swing-and-miss rate
  - vs_breaking_whiff
  - vs_offspeed_whiff
  - sample_size_pa (so we can ignore small-sample noise downstream)

These get matched against pitcher arsenal in build_features.py.
"""
import os, sys, time, argparse, logging
from pathlib import Path
import pandas as pd

INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("hitter_splits")

FASTBALL = {"FF", "FT", "FA", "SI", "FC"}
BREAKING = {"SL", "CU", "KC", "SV", "ST", "CS"}
OFFSPEED = {"CH", "FS", "FO", "SC"}

SWING_EVENTS = {"swinging_strike", "swinging_strike_blocked",
                "missed_bunt", "foul_tip"}
SWINGS = {"foul", "foul_tip", "hit_into_play", "hit_into_play_no_out",
          "hit_into_play_score", "swinging_strike",
          "swinging_strike_blocked", "missed_bunt"}


def import_pybaseball():
    try:
        import pybaseball as pb
        pb.cache.enable()
        return pb
    except ImportError:
        log.error("pybaseball not installed. pip install pybaseball")
        sys.exit(1)


def get_hitter_splits(pb, batter_id, season):
    start = f"{season}-03-01"
    end = f"{season}-11-30"

    try:
        df = pb.statcast_batter(start, end, batter_id)
    except Exception as e:
        log.warning("statcast pull failed for %s: %s", batter_id, e)
        return {}

    if df is None or len(df) == 0:
        return {}

    df = df.copy()
    df["bucket"] = "other"
    df.loc[df["pitch_type"].isin(FASTBALL), "bucket"] = "fastball"
    df.loc[df["pitch_type"].isin(BREAKING), "bucket"] = "breaking"
    df.loc[df["pitch_type"].isin(OFFSPEED), "bucket"] = "offspeed"

    def bucket_metrics(sub):
        if len(sub) == 0:
            return {}
        n_swings = sub["description"].isin(SWINGS).sum()
        n_whiffs = sub["description"].isin(SWING_EVENTS).sum()
        whiff = round(n_whiffs / n_swings, 3) if n_swings > 0 else None
        # estimated_woba_using_speedangle is per batted ball
        # for an aggregate "vs this pitch type" use the average xwOBA per pitch
        xwoba_vals = sub["estimated_woba_using_speedangle"].dropna()
        xwoba = round(xwoba_vals.mean(), 3) if len(xwoba_vals) else None
        return {"woba": xwoba, "whiff": whiff, "pitches": len(sub)}

    fb = bucket_metrics(df[df["bucket"] == "fastball"])
    br = bucket_metrics(df[df["bucket"] == "breaking"])
    off = bucket_metrics(df[df["bucket"] == "offspeed"])

    return {
        "vs_fastball_woba": fb.get("woba"),
        "vs_fastball_whiff": fb.get("whiff"),
        "vs_fastball_pitches": fb.get("pitches", 0),
        "vs_breaking_woba": br.get("woba"),
        "vs_breaking_whiff": br.get("whiff"),
        "vs_breaking_pitches": br.get("pitches", 0),
        "vs_offspeed_woba": off.get("woba"),
        "vs_offspeed_whiff": off.get("whiff"),
        "vs_offspeed_pitches": off.get("pitches", 0),
        "total_pitches_seen": len(df),
    }


def process_year(year, pb):
    # We pull unique batters directly from boxscores (via gamePks in pitcher_features)
    # so we don't actually need the lineup file - just the pitcher one.
    pitcher_path = INPUT_DIR / f"pitcher_features_{year}.parquet"
    if not pitcher_path.exists():
        log.error("missing %s", pitcher_path); return

    # Pull unique batter IDs from boxscores
    import requests
    pitchers = pd.read_parquet(pitcher_path)
    game_pks = pitchers["gamePk"].dropna().astype(int).unique()
    log.info("[%s] scanning %s boxscores for unique batters...", year, len(game_pks))

    unique_batters = set()
    for i, gpk in enumerate(game_pks):
        try:
            r = requests.get(f"https://statsapi.mlb.com/api/v1/game/{gpk}/boxscore", timeout=15)
            r.raise_for_status()
            box = r.json()
            for side in ("home", "away"):
                # Take first 9 from batting order
                batters = box.get("teams", {}).get(side, {}).get("batters", []) or []
                unique_batters.update(batters[:9])
        except Exception:
            continue
        if (i + 1) % 200 == 0:
            log.info("  boxscan: %s/%s | %s unique batters so far",
                     i + 1, len(game_pks), len(unique_batters))
        time.sleep(0.05)

    log.info("[%s] %s unique batters to pull", year, len(unique_batters))

    rows = []
    for i, bid in enumerate(unique_batters):
        splits = get_hitter_splits(pb, int(bid), year)
        rows.append({"batter_id": int(bid), "season": year, **splits})
        if (i + 1) % 25 == 0:
            log.info("  splits: %s/%s", i + 1, len(unique_batters))
        time.sleep(0.5)

    df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"hitter_pitch_splits_{year}.parquet"
    df.to_parquet(out_path, index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_hitter_splits_{year}.csv", index=False)
    cov = df["vs_fastball_woba"].notna().mean() if "vs_fastball_woba" in df.columns else 0
    log.info("[%s] saved %s rows | woba_cov=%.1f%%", year, len(df), 100 * cov)


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
