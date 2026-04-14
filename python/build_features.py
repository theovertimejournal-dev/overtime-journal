"""
build_features.py

Joins historical games + pitcher data, computes derived features for ML training.
Produces TWO output files:
  - mlb_training_data_with_line.parquet  (includes vegas line as feature)
  - mlb_training_data_no_line.parquet    (fundamentals only)

Why two: comparing model performance with/without the line answers whether the
model adds signal beyond the market. If accuracy is similar, the model has
learned real edges. If with-line >> no-line, the model is just riding the market.

LEAK-PROOF DESIGN:
  - All rolling team stats use ONLY games BEFORE the target game (shifted)
  - Pitcher season stats are end-of-season (slight leak in v1, accepted tradeoff)
  - No future scores, future records, or future odds in any feature
"""
import argparse
import logging
from pathlib import Path
import numpy as np
import pandas as pd

INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("features")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def american_to_implied_prob(odds):
    """Convert American odds to implied probability (0-1)."""
    if pd.isna(odds): return np.nan
    odds = float(odds)
    if odds < 0:
        return -odds / (-odds + 100)
    else:
        return 100 / (odds + 100)


def load_and_merge(years):
    """Load all year parquets, merge games+pitchers, return combined DataFrame."""
    games_dfs, pitcher_dfs = [], []
    for y in years:
        g_path = INPUT_DIR / f"mlb_historical_{y}.parquet"
        p_path = INPUT_DIR / f"pitcher_features_{y}.parquet"
        if not g_path.exists():
            log.error("missing %s", g_path); continue
        if not p_path.exists():
            log.error("missing %s", p_path); continue
        games_dfs.append(pd.read_parquet(g_path))
        pitcher_dfs.append(pd.read_parquet(p_path))

    games = pd.concat(games_dfs, ignore_index=True)
    pitchers = pd.concat(pitcher_dfs, ignore_index=True)
    log.info("loaded %s games, %s pitcher records", len(games), len(pitchers))

    # Inner join: only games where we have pitcher data (drops ~5-10%)
    df = games.merge(pitchers, on="event_id", how="inner")
    log.info("after merge: %s games", len(df))
    return df.sort_values("game_date").reset_index(drop=True)


# ---------------------------------------------------------------------------
# Feature builders
# ---------------------------------------------------------------------------

def add_market_features(df):
    """Decode betting odds into implied probabilities + vig."""
    df["home_implied_prob"] = df["open_home_ml"].apply(american_to_implied_prob)
    df["away_implied_prob"] = df["open_away_ml"].apply(american_to_implied_prob)
    # Vig = total implied prob - 1 (book's edge)
    df["market_vig"] = (df["home_implied_prob"] + df["away_implied_prob"]) - 1
    # Devig: divide by total to get fair probabilities
    total = df["home_implied_prob"] + df["away_implied_prob"]
    df["home_fair_prob"] = df["home_implied_prob"] / total
    df["away_fair_prob"] = df["away_implied_prob"] / total
    df["has_close_line"] = df["close_home_ml"].notna().astype(int)
    return df


def add_pitcher_matchup_features(df):
    """Pitcher edge features: home minus away. Negative = home pitcher better."""
    df["era_edge"] = df["home_p_era"] - df["away_p_era"]
    df["whip_edge"] = df["home_p_whip"] - df["away_p_whip"]
    df["k9_edge"] = df["home_p_k_per_9"] - df["away_p_k_per_9"]
    df["bb9_edge"] = df["home_p_bb_per_9"] - df["away_p_bb_per_9"]
    df["hr9_edge"] = df["home_p_hr_per_9"] - df["away_p_hr_per_9"]
    df["home_p_workload"] = df["home_p_innings_pitched"]
    df["away_p_workload"] = df["away_p_innings_pitched"]
    df["home_p_experience"] = df["home_p_games_started"]
    df["away_p_experience"] = df["away_p_games_started"]
    # Win% as a "pedigree" feature
    home_decisions = (df["home_p_wins"].fillna(0) + df["home_p_losses"].fillna(0))
    away_decisions = (df["away_p_wins"].fillna(0) + df["away_p_losses"].fillna(0))
    df["home_p_winpct"] = np.where(home_decisions > 0,
                                    df["home_p_wins"] / home_decisions, np.nan)
    df["away_p_winpct"] = np.where(away_decisions > 0,
                                    df["away_p_wins"] / away_decisions, np.nan)
    return df


def add_team_form_features(df):
    """
    Rolling team performance features computed LEAK-PROOF.

    For each team, walk through their games chronologically and compute:
      - rolling_winpct_l10: % of last 10 games won (BEFORE this game)
      - rolling_run_diff_l10: avg run differential last 10
      - rolling_runs_for_l10: avg runs scored last 10
      - current_streak: +N for win streak, -N for loss streak

    All values are SHIFTED so they reflect state BEFORE the current game.
    """
    df = df.sort_values("game_date").reset_index(drop=True)

    # Build a long-form per-team game log
    home_log = df[["game_date", "home_team", "home_score", "away_score", "home_win"]].copy()
    home_log.columns = ["game_date", "team", "runs_for", "runs_against", "won"]

    away_log = df[["game_date", "away_team", "away_score", "home_score", "home_win"]].copy()
    away_log.columns = ["game_date", "team", "runs_for", "runs_against", "won"]
    away_log["won"] = 1 - away_log["won"]  # away wins when home loses

    long = pd.concat([home_log, away_log], ignore_index=True)
    long["run_diff"] = long["runs_for"] - long["runs_against"]
    long = long.sort_values(["team", "game_date"]).reset_index(drop=True)

    # Rolling stats SHIFTED so they exclude the current game (no leak)
    g = long.groupby("team", group_keys=False)
    long["winpct_l10"] = g["won"].apply(
        lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    long["run_diff_l10"] = g["run_diff"].apply(
        lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    long["runs_for_l30"] = g["runs_for"].apply(
        lambda s: s.shift(1).rolling(30, min_periods=5).mean())

    # Streak: +N for current win streak, -N for loss streak
    def compute_streak(won_series):
        won_shifted = won_series.shift(1)  # exclude current game
        streaks = []
        cur = 0
        for w in won_shifted:
            if pd.isna(w):
                streaks.append(np.nan); continue
            if w == 1:
                cur = cur + 1 if cur > 0 else 1
            else:
                cur = cur - 1 if cur < 0 else -1
            streaks.append(cur)
        return pd.Series(streaks, index=won_series.index)

    long["streak"] = g["won"].apply(compute_streak)

    # Now merge back to games on (game_date, team) for both home and away
    home_form = long.rename(columns={
        "team": "home_team",
        "winpct_l10": "home_winpct_l10",
        "run_diff_l10": "home_run_diff_l10",
        "runs_for_l30": "home_runs_for_l30",
        "streak": "home_streak",
    })[["game_date", "home_team", "home_winpct_l10", "home_run_diff_l10",
        "home_runs_for_l30", "home_streak"]]

    away_form = long.rename(columns={
        "team": "away_team",
        "winpct_l10": "away_winpct_l10",
        "run_diff_l10": "away_run_diff_l10",
        "runs_for_l30": "away_runs_for_l30",
        "streak": "away_streak",
    })[["game_date", "away_team", "away_winpct_l10", "away_run_diff_l10",
        "away_runs_for_l30", "away_streak"]]

    df = df.merge(home_form, on=["game_date", "home_team"], how="left")
    df = df.merge(away_form, on=["game_date", "away_team"], how="left")

    # Derived edges
    df["winpct_edge"] = df["home_winpct_l10"] - df["away_winpct_l10"]
    df["run_diff_edge"] = df["home_run_diff_l10"] - df["away_run_diff_l10"]
    df["offense_edge"] = df["home_runs_for_l30"] - df["away_runs_for_l30"]

    return df


def add_situational_features(df):
    """Rest, B2B, month, day-of-week."""
    df = df.sort_values("game_date").reset_index(drop=True)

    # Rest days per team (days since last game)
    home_log = df[["game_date", "home_team"]].rename(columns={"home_team": "team"})
    away_log = df[["game_date", "away_team"]].rename(columns={"away_team": "team"})
    long = pd.concat([home_log, away_log], ignore_index=True)
    long = long.sort_values(["team", "game_date"]).reset_index(drop=True)
    long["last_game"] = long.groupby("team")["game_date"].shift(1)
    long["rest_days"] = (long["game_date"] - long["last_game"]).dt.days

    # Merge rest back for home and away
    home_rest = long.rename(columns={"team": "home_team", "rest_days": "home_rest_days"})[
        ["game_date", "home_team", "home_rest_days"]].drop_duplicates(
        subset=["game_date", "home_team"])
    away_rest = long.rename(columns={"team": "away_team", "rest_days": "away_rest_days"})[
        ["game_date", "away_team", "away_rest_days"]].drop_duplicates(
        subset=["game_date", "away_team"])
    df = df.merge(home_rest, on=["game_date", "home_team"], how="left")
    df = df.merge(away_rest, on=["game_date", "away_team"], how="left")

    df["rest_edge"] = df["home_rest_days"] - df["away_rest_days"]
    df["home_is_b2b"] = (df["home_rest_days"] == 1).astype(int)
    df["away_is_b2b"] = (df["away_rest_days"] == 1).astype(int)

    # Calendar features
    df["month"] = df["game_date"].dt.month
    df["day_of_week"] = df["game_date"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

    return df


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

FEATURE_COLS_BASE = [
    # Target
    "home_win",
    # Pitcher matchup
    "era_edge", "whip_edge", "k9_edge", "bb9_edge", "hr9_edge",
    "home_p_era", "away_p_era",
    "home_p_whip", "away_p_whip",
    "home_p_k_per_9", "away_p_k_per_9",
    "home_p_workload", "away_p_workload",
    "home_p_experience", "away_p_experience",
    "home_p_winpct", "away_p_winpct",
    # Team form
    "winpct_edge", "run_diff_edge", "offense_edge",
    "home_winpct_l10", "away_winpct_l10",
    "home_run_diff_l10", "away_run_diff_l10",
    "home_runs_for_l30", "away_runs_for_l30",
    "home_streak", "away_streak",
    # Situational
    "home_rest_days", "away_rest_days", "rest_edge",
    "home_is_b2b", "away_is_b2b",
    "month", "day_of_week", "is_weekend",
]

FEATURE_COLS_MARKET = [
    "home_implied_prob", "away_implied_prob",
    "home_fair_prob", "away_fair_prob",
    "market_vig", "has_close_line",
]

# Identifier cols kept for joining/inspection but excluded from training
ID_COLS = ["event_id", "game_date", "season",
           "home_team", "away_team", "home_team_name", "away_team_name",
           "home_starter_name", "away_starter_name"]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--years", nargs="+", type=int, default=[2024, 2025])
    args = p.parse_args()

    df = load_and_merge(args.years)

    log.info("computing market features...")
    df = add_market_features(df)

    log.info("computing pitcher matchup features...")
    df = add_pitcher_matchup_features(df)

    log.info("computing team form features (rolling)...")
    df = add_team_form_features(df)

    log.info("computing situational features...")
    df = add_situational_features(df)

    # Drop rows where target or core pitcher features are missing
    n_before = len(df)
    df = df.dropna(subset=["home_win", "era_edge"])
    log.info("dropped %s rows missing core features (kept %s)", n_before - len(df), len(df))

    # Two output versions
    cols_with_line = ID_COLS + FEATURE_COLS_BASE + FEATURE_COLS_MARKET
    cols_no_line = ID_COLS + FEATURE_COLS_BASE

    cols_with_line = [c for c in cols_with_line if c in df.columns]
    cols_no_line = [c for c in cols_no_line if c in df.columns]

    out_with = OUTPUT_DIR / "mlb_training_data_with_line.parquet"
    out_no = OUTPUT_DIR / "mlb_training_data_no_line.parquet"
    df[cols_with_line].to_parquet(out_with, index=False, compression="snappy")
    df[cols_no_line].to_parquet(out_no, index=False, compression="snappy")

    # Preview CSVs (first 50 rows for phone viewing)
    df[cols_with_line].head(50).to_csv(OUTPUT_DIR / "preview_features_with_line.csv", index=False)
    df[cols_no_line].head(50).to_csv(OUTPUT_DIR / "preview_features_no_line.csv", index=False)

    # Summary report
    log.info("=" * 60)
    log.info("FINAL DATASET")
    log.info("=" * 60)
    log.info("rows: %s", len(df))
    log.info("home_win rate: %.3f", df["home_win"].mean())
    log.info("with_line: %s features (%s cols total)",
             len([c for c in cols_with_line if c not in ID_COLS]) - 1,  # -1 for target
             len(cols_with_line))
    log.info("no_line:   %s features (%s cols total)",
             len([c for c in cols_no_line if c not in ID_COLS]) - 1,
             len(cols_no_line))
    log.info("")
    log.info("Feature null rates (with_line):")
    null_rates = df[cols_with_line].isna().mean().sort_values(ascending=False)
    for col, rate in null_rates.items():
        if rate > 0.01:
            log.info("  %s: %.1f%% null", col, 100 * rate)

    log.info("")
    log.info("Sanity: correlation of key features with home_win:")
    for col in ["home_implied_prob", "era_edge", "winpct_edge",
                "run_diff_edge", "rest_edge"]:
        if col in df.columns:
            corr = df[col].corr(df["home_win"])
            log.info("  %s: %+.3f", col, corr)

    log.info("DONE")


if __name__ == "__main__":
    main()
