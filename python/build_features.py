"""
build_features.py - v2

Modular feature engineering for both F5 and full game ML targets.
Outputs 4 training files (F5/Full x with_line/no_line).

Architecture: each feature group is a self-contained function. Add new ones
without rewrites. Park factors copied from mlb_bullpen_analyzer_v2.py.
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


PARK_FACTORS_BY_TEAM = {
    "COLORADO_ROCKIES_MLB": 114, "CINCINNATI_REDS_MLB": 107,
    "TEXAS_RANGERS_MLB": 106, "BOSTON_RED_SOX_MLB": 105,
    "CHICAGO_CUBS_MLB": 104, "PHILADELPHIA_PHILLIES_MLB": 103,
    "ATLANTA_BRAVES_MLB": 102, "MILWAUKEE_BREWERS_MLB": 102,
    "TORONTO_BLUE_JAYS_MLB": 101, "BALTIMORE_ORIOLES_MLB": 101,
    "MINNESOTA_TWINS_MLB": 101, "LOS_ANGELES_ANGELS_MLB": 100,
    "NEW_YORK_YANKEES_MLB": 100, "WASHINGTON_NATIONALS_MLB": 100,
    "CLEVELAND_GUARDIANS_MLB": 99, "DETROIT_TIGERS_MLB": 99,
    "STLOUIS_CARDINALS_MLB": 99, "ARIZONA_DIAMONDBACKS_MLB": 99,
    "KANSAS_CITY_ROYALS_MLB": 98, "SAN_FRANCISCO_GIANTS_MLB": 98,
    "CHICAGO_WHITE_SOX_MLB": 98, "HOUSTON_ASTROS_MLB": 97,
    "PITTSBURGH_PIRATES_MLB": 97, "TAMPA_BAY_RAYS_MLB": 96,
    "NEW_YORK_METS_MLB": 96, "LOS_ANGELES_DODGERS_MLB": 96,
    "SAN_DIEGO_PADRES_MLB": 95, "SEATTLE_MARINERS_MLB": 95,
    "MIAMI_MARLINS_MLB": 94, "OAKLAND_ATHLETICS_MLB": 94,
    "ATHLETICS_MLB": 94,
}

TEAM_NAME_TO_ID = {
    "arizona diamondbacks": 109, "atlanta braves": 144, "baltimore orioles": 110,
    "boston red sox": 111, "chicago cubs": 112, "chicago white sox": 145,
    "cincinnati reds": 113, "cleveland guardians": 114, "cleveland indians": 114,
    "colorado rockies": 115, "detroit tigers": 116, "houston astros": 117,
    "kansas city royals": 118, "los angeles angels": 108, "los angeles dodgers": 119,
    "miami marlins": 146, "milwaukee brewers": 158, "minnesota twins": 142,
    "new york mets": 121, "new york yankees": 147, "oakland athletics": 133,
    "athletics": 133, "philadelphia phillies": 143, "pittsburgh pirates": 134,
    "san diego padres": 135, "san francisco giants": 137, "seattle mariners": 136,
    "st louis cardinals": 138, "st. louis cardinals": 138, "stlouis cardinals": 138,
    "tampa bay rays": 139, "texas rangers": 140, "toronto blue jays": 141,
    "washington nationals": 120,
}


def normalize_name(n):
    if not n: return ""
    return str(n).replace(".", "").lower().strip()


def american_to_implied_prob(odds):
    if pd.isna(odds): return np.nan
    odds = float(odds)
    if odds < 0: return -odds / (-odds + 100)
    return 100 / (odds + 100)


def load_all(years):
    games_dfs, pitcher_dfs, bullpen_dfs = [], [], []
    for y in years:
        g = INPUT_DIR / f"mlb_historical_{y}.parquet"
        p = INPUT_DIR / f"pitcher_features_{y}.parquet"
        b = INPUT_DIR / f"bullpen_features_{y}.parquet"
        if g.exists(): games_dfs.append(pd.read_parquet(g))
        if p.exists(): pitcher_dfs.append(pd.read_parquet(p))
        if b.exists(): bullpen_dfs.append(pd.read_parquet(b))

    games = pd.concat(games_dfs, ignore_index=True)
    pitchers = pd.concat(pitcher_dfs, ignore_index=True)
    bullpen = pd.concat(bullpen_dfs, ignore_index=True)
    log.info("loaded: games=%s, pitchers=%s, bullpen=%s",
             len(games), len(pitchers), len(bullpen))

    df = games.merge(pitchers, on="event_id", how="inner")
    log.info("after pitcher merge: %s", len(df))

    df["home_team_id"] = df["home_team_name"].apply(
        lambda n: TEAM_NAME_TO_ID.get(normalize_name(n)))
    df["away_team_id"] = df["away_team_name"].apply(
        lambda n: TEAM_NAME_TO_ID.get(normalize_name(n)))
    df["game_date_str"] = df["game_date"].dt.strftime("%Y-%m-%d")

    bp_cols = ["bp_era_7d", "bp_whip_7d", "bp_k_per_9_7d",
               "bp_bb_per_9_7d", "bp_hr_per_9_7d",
               "bp_ip_7d", "bp_reliever_count_7d"]
    bp_subset = bullpen[["team_id", "game_date_str"] + bp_cols]

    home_bp = bp_subset.rename(columns={
        "team_id": "home_team_id",
        **{c: f"home_{c}" for c in bp_cols}})
    away_bp = bp_subset.rename(columns={
        "team_id": "away_team_id",
        **{c: f"away_{c}" for c in bp_cols}})

    df = df.merge(home_bp, on=["home_team_id", "game_date_str"], how="left")
    df = df.merge(away_bp, on=["away_team_id", "game_date_str"], how="left")
    log.info("after bullpen merge: %s", len(df))

    return df.sort_values("game_date").reset_index(drop=True)


def add_market_features_full(df):
    df["home_implied_prob"] = df["open_home_ml"].apply(american_to_implied_prob)
    df["away_implied_prob"] = df["open_away_ml"].apply(american_to_implied_prob)
    total = df["home_implied_prob"] + df["away_implied_prob"]
    df["market_vig"] = total - 1
    df["home_fair_prob"] = df["home_implied_prob"] / total
    df["away_fair_prob"] = df["away_implied_prob"] / total
    df["has_close_line"] = df["close_home_ml"].notna().astype(int)
    return df


def add_market_features_f5(df):
    df["f5_home_implied_prob"] = df["f5_open_home_ml"].apply(american_to_implied_prob)
    df["f5_away_implied_prob"] = df["f5_open_away_ml"].apply(american_to_implied_prob)
    f5_total = df["f5_home_implied_prob"] + df["f5_away_implied_prob"]
    df["f5_implied_tie_prob"] = (1 - f5_total).clip(lower=0)
    df["f5_has_line"] = df["f5_open_home_ml"].notna().astype(int)
    return df


def add_pitcher_features(df):
    df["era_edge"] = df["home_p_era"] - df["away_p_era"]
    df["whip_edge"] = df["home_p_whip"] - df["away_p_whip"]
    df["k9_edge"] = df["home_p_k_per_9"] - df["away_p_k_per_9"]
    df["bb9_edge"] = df["home_p_bb_per_9"] - df["away_p_bb_per_9"]
    df["hr9_edge"] = df["home_p_hr_per_9"] - df["away_p_hr_per_9"]
    df["home_p_workload"] = df["home_p_innings_pitched"]
    df["away_p_workload"] = df["away_p_innings_pitched"]
    df["home_p_experience"] = df["home_p_games_started"]
    df["away_p_experience"] = df["away_p_games_started"]
    home_dec = df["home_p_wins"].fillna(0) + df["home_p_losses"].fillna(0)
    away_dec = df["away_p_wins"].fillna(0) + df["away_p_losses"].fillna(0)
    df["home_p_winpct"] = np.where(home_dec > 0, df["home_p_wins"] / home_dec, np.nan)
    df["away_p_winpct"] = np.where(away_dec > 0, df["away_p_wins"] / away_dec, np.nan)
    return df


def add_bullpen_features(df):
    df["bp_era_edge"] = df["home_bp_era_7d"] - df["away_bp_era_7d"]
    df["bp_whip_edge"] = df["home_bp_whip_7d"] - df["away_bp_whip_7d"]
    df["bp_k9_edge"] = df["home_bp_k_per_9_7d"] - df["away_bp_k_per_9_7d"]
    df["home_bp_workload"] = df["home_bp_ip_7d"]
    df["away_bp_workload"] = df["away_bp_ip_7d"]
    df["bp_workload_edge"] = df["home_bp_ip_7d"] - df["away_bp_ip_7d"]
    return df


def add_park_features(df):
    df["park_factor"] = df["home_team"].map(PARK_FACTORS_BY_TEAM).fillna(100)
    df["park_pitcher_friendly"] = (100 - df["park_factor"]).clip(lower=0)
    return df


def add_team_form_features(df):
    df = df.sort_values("game_date").reset_index(drop=True)

    home_log = df[["game_date", "home_team", "home_score", "away_score", "home_win"]].copy()
    home_log.columns = ["game_date", "team", "runs_for", "runs_against", "won"]
    away_log = df[["game_date", "away_team", "away_score", "home_score", "home_win"]].copy()
    away_log.columns = ["game_date", "team", "runs_for", "runs_against", "won"]
    away_log["won"] = 1 - away_log["won"]

    long = pd.concat([home_log, away_log], ignore_index=True)
    long["run_diff"] = long["runs_for"] - long["runs_against"]
    long = long.sort_values(["team", "game_date"]).reset_index(drop=True)

    g = long.groupby("team", group_keys=False)
    long["winpct_l10"] = g["won"].apply(
        lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    long["run_diff_l10"] = g["run_diff"].apply(
        lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    long["runs_for_l30"] = g["runs_for"].apply(
        lambda s: s.shift(1).rolling(30, min_periods=5).mean())
    long["runs_against_l30"] = g["runs_against"].apply(
        lambda s: s.shift(1).rolling(30, min_periods=5).mean())

    def streak(won_series):
        won_shifted = won_series.shift(1)
        out, cur = [], 0
        for w in won_shifted:
            if pd.isna(w): out.append(np.nan); continue
            if w == 1: cur = cur + 1 if cur > 0 else 1
            else: cur = cur - 1 if cur < 0 else -1
            out.append(cur)
        return pd.Series(out, index=won_series.index)

    long["streak"] = g["won"].apply(streak)

    home_form = long.rename(columns={
        "team": "home_team",
        "winpct_l10": "home_winpct_l10",
        "run_diff_l10": "home_run_diff_l10",
        "runs_for_l30": "home_runs_for_l30",
        "runs_against_l30": "home_runs_against_l30",
        "streak": "home_streak",
    })[["game_date", "home_team", "home_winpct_l10", "home_run_diff_l10",
        "home_runs_for_l30", "home_runs_against_l30", "home_streak"]]

    away_form = long.rename(columns={
        "team": "away_team",
        "winpct_l10": "away_winpct_l10",
        "run_diff_l10": "away_run_diff_l10",
        "runs_for_l30": "away_runs_for_l30",
        "runs_against_l30": "away_runs_against_l30",
        "streak": "away_streak",
    })[["game_date", "away_team", "away_winpct_l10", "away_run_diff_l10",
        "away_runs_for_l30", "away_runs_against_l30", "away_streak"]]

    df = df.merge(home_form, on=["game_date", "home_team"], how="left")
    df = df.merge(away_form, on=["game_date", "away_team"], how="left")

    df["winpct_edge"] = df["home_winpct_l10"] - df["away_winpct_l10"]
    df["run_diff_edge"] = df["home_run_diff_l10"] - df["away_run_diff_l10"]
    df["offense_edge"] = df["home_runs_for_l30"] - df["away_runs_for_l30"]
    df["defense_edge"] = df["away_runs_against_l30"] - df["home_runs_against_l30"]
    return df


def add_situational_features(df):
    df = df.sort_values("game_date").reset_index(drop=True)
    home_log = df[["game_date", "home_team"]].rename(columns={"home_team": "team"})
    away_log = df[["game_date", "away_team"]].rename(columns={"away_team": "team"})
    long = pd.concat([home_log, away_log], ignore_index=True)
    long = long.sort_values(["team", "game_date"]).reset_index(drop=True)
    long["last_game"] = long.groupby("team")["game_date"].shift(1)
    long["rest_days"] = (long["game_date"] - long["last_game"]).dt.days

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
    df["month"] = df["game_date"].dt.month
    df["day_of_week"] = df["game_date"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)
    return df


ID_COLS = ["event_id", "game_date", "season",
           "home_team", "away_team", "home_team_name", "away_team_name",
           "home_starter_name", "away_starter_name"]

PITCHER_FEATURES = [
    "era_edge", "whip_edge", "k9_edge", "bb9_edge", "hr9_edge",
    "home_p_era", "away_p_era", "home_p_whip", "away_p_whip",
    "home_p_k_per_9", "away_p_k_per_9",
    "home_p_bb_per_9", "away_p_bb_per_9",
    "home_p_workload", "away_p_workload",
    "home_p_experience", "away_p_experience",
    "home_p_winpct", "away_p_winpct",
]

BULLPEN_FEATURES = [
    "bp_era_edge", "bp_whip_edge", "bp_k9_edge",
    "home_bp_era_7d", "away_bp_era_7d",
    "home_bp_whip_7d", "away_bp_whip_7d",
    "home_bp_workload", "away_bp_workload", "bp_workload_edge",
]

PARK_FEATURES = ["park_factor", "park_pitcher_friendly"]

FORM_FEATURES = [
    "winpct_edge", "run_diff_edge", "offense_edge", "defense_edge",
    "home_winpct_l10", "away_winpct_l10",
    "home_run_diff_l10", "away_run_diff_l10",
    "home_runs_for_l30", "away_runs_for_l30",
    "home_runs_against_l30", "away_runs_against_l30",
    "home_streak", "away_streak",
]

SITUATIONAL_FEATURES = [
    "home_rest_days", "away_rest_days", "rest_edge",
    "home_is_b2b", "away_is_b2b",
    "month", "day_of_week", "is_weekend",
]

MARKET_FEATURES_FULL = [
    "home_implied_prob", "away_implied_prob",
    "home_fair_prob", "away_fair_prob",
    "market_vig", "has_close_line",
]

MARKET_FEATURES_F5 = [
    "f5_home_implied_prob", "f5_away_implied_prob",
    "f5_implied_tie_prob", "f5_has_line",
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--years", nargs="+", type=int, default=[2024, 2025])
    args = p.parse_args()

    df = load_all(args.years)
    log.info("computing features...")
    df = add_market_features_full(df)
    df = add_market_features_f5(df)
    df = add_pitcher_features(df)
    df = add_bullpen_features(df)
    df = add_park_features(df)
    df = add_team_form_features(df)
    df = add_situational_features(df)

    fundamentals = (PITCHER_FEATURES + BULLPEN_FEATURES + PARK_FEATURES
                    + FORM_FEATURES + SITUATIONAL_FEATURES)

    # FULL GAME
    full_clean = df.dropna(subset=["home_win", "era_edge"]).copy()
    full_no_line_cols = [c for c in (ID_COLS + ["home_win"] + fundamentals)
                         if c in full_clean.columns]
    full_with_line_cols = full_no_line_cols + [c for c in MARKET_FEATURES_FULL
                                                if c in full_clean.columns]
    full_clean[full_no_line_cols].to_parquet(
        OUTPUT_DIR / "mlb_training_full_no_line.parquet",
        index=False, compression="snappy")
    full_clean[full_with_line_cols].to_parquet(
        OUTPUT_DIR / "mlb_training_full_with_line.parquet",
        index=False, compression="snappy")

    # F5 (drop ties for binary classification)
    f5_clean = df[df["f5_winner"].isin([0, 1])].dropna(subset=["era_edge"]).copy()
    f5_clean["f5_home_win"] = f5_clean["f5_winner"].astype(int)
    f5_no_line_cols = [c for c in (ID_COLS + ["f5_home_win"] + fundamentals)
                       if c in f5_clean.columns]
    f5_with_line_cols = f5_no_line_cols + [c for c in MARKET_FEATURES_F5
                                            if c in f5_clean.columns]
    f5_clean[f5_no_line_cols].to_parquet(
        OUTPUT_DIR / "mlb_training_f5_no_line.parquet",
        index=False, compression="snappy")
    f5_clean[f5_with_line_cols].to_parquet(
        OUTPUT_DIR / "mlb_training_f5_with_line.parquet",
        index=False, compression="snappy")

    # Previews
    full_clean[full_with_line_cols].head(50).to_csv(
        OUTPUT_DIR / "preview_features_full_with_line.csv", index=False)
    f5_clean[f5_with_line_cols].head(50).to_csv(
        OUTPUT_DIR / "preview_features_f5_with_line.csv", index=False)

    # Summary
    log.info("=" * 60)
    log.info("FULL GAME: %s rows | %s feats (with_line) | %s feats (no_line)",
             len(full_clean),
             len([c for c in full_with_line_cols if c not in ID_COLS]) - 1,
             len([c for c in full_no_line_cols if c not in ID_COLS]) - 1)
    log.info("  home_win rate: %.3f", full_clean["home_win"].mean())
    log.info("F5:        %s rows | %s feats (with_line) | %s feats (no_line)",
             len(f5_clean),
             len([c for c in f5_with_line_cols if c not in ID_COLS]) - 1,
             len([c for c in f5_no_line_cols if c not in ID_COLS]) - 1)
    log.info("  f5_home_win rate: %.3f", f5_clean["f5_home_win"].mean())

    log.info("")
    log.info("FULL game correlations with home_win:")
    for col in ["home_implied_prob", "era_edge", "bp_era_edge",
                "park_factor", "winpct_edge", "run_diff_edge", "bb9_edge"]:
        if col in full_clean.columns:
            log.info("  %s: %+.3f", col, full_clean[col].corr(full_clean["home_win"]))

    log.info("")
    log.info("F5 correlations with f5_home_win:")
    for col in ["f5_home_implied_prob", "era_edge", "k9_edge", "bb9_edge",
                "park_factor", "winpct_edge"]:
        if col in f5_clean.columns:
            log.info("  %s: %+.3f", col, f5_clean[col].corr(f5_clean["f5_home_win"]))

    log.info("DONE")


if __name__ == "__main__":
    main()
