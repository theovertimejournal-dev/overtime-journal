"""
train_ensemble.py

Trains 5-model stacked ensemble with calibration for MLB predictions.

Architecture:
  Base models (each predicts P(home_wins)):
    1. LightGBM
    2. XGBoost
    3. Random Forest
    4. Logistic Regression (L2)
    5. CatBoost (handles categoricals natively)

  Stacking:
    Meta-learner (Logistic Regression) learns how to combine base predictions
    based on features. Replaces fixed weights.

  Calibration:
    Isotonic regression on held-out data ensures predicted probabilities
    are accurate (when model says 65%, it's actually right ~65% of the time).

  Training:
    Recency-weighted sample weights (exponential decay, 60-day half-life)
    Walk-forward CV: train on older data, validate on newer, backtest on newest

  Evaluation:
    Accuracy at various confidence thresholds
    Log loss + Brier score (calibration quality)
    ROI against closing line (if odds available)
    Kelly-recommended bet sizes for each confidence level

Outputs:
    models/{target}_{variant}/
      lgb_classifier.pkl, xgb_classifier.pkl, rf_classifier.pkl,
      lr_classifier.pkl, cat_classifier.pkl, stacker.pkl, calibrator.pkl,
      feature_list.json, model_report.json
"""
import os, sys, json, pickle, argparse, logging
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, log_loss, brier_score_loss, roc_auc_score
from sklearn.isotonic import IsotonicRegression
import lightgbm as lgb
import xgboost as xgb

try:
    from catboost import CatBoostClassifier
    HAS_CATBOOST = True
except ImportError:
    HAS_CATBOOST = False

INPUT_DIR = Path("data")
OUTPUT_DIR = Path("models")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("train")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ID_COLS = {"event_id", "game_date", "season",
           "home_team", "away_team", "home_team_name", "away_team_name",
           "home_starter_name", "away_starter_name"}

RECENCY_HALF_LIFE_DAYS = 60  # recent games weighted more heavily


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_feature_cols(df, target):
    """All numeric columns except ID columns and target."""
    return [c for c in df.columns
            if c not in ID_COLS
            and c != target
            and pd.api.types.is_numeric_dtype(df[c])]


def compute_recency_weights(dates, half_life_days=RECENCY_HALF_LIFE_DAYS):
    """Exponential decay: most recent game = 1.0, older games decay."""
    dates = pd.to_datetime(dates, utc=True)
    most_recent = dates.max()
    days_old = (most_recent - dates).dt.total_seconds() / 86400
    return np.power(0.5, days_old / half_life_days)


def american_odds_to_decimal(am):
    """Convert American odds to decimal (payout multiplier)."""
    if pd.isna(am):
        return np.nan
    am = float(am)
    if am < 0:
        return 1 + 100 / abs(am)
    return 1 + am / 100


def kelly_fraction(prob, decimal_odds, max_fraction=0.25):
    """
    Kelly Criterion: stake = (bp - q) / b where:
      b = decimal_odds - 1 (net odds)
      p = our probability
      q = 1 - p
    Capped at max_fraction (quarter Kelly by default for safety).
    """
    if pd.isna(prob) or pd.isna(decimal_odds) or decimal_odds <= 1:
        return 0.0
    b = decimal_odds - 1
    q = 1 - prob
    k = (b * prob - q) / b
    return max(0.0, min(k, max_fraction))


# ---------------------------------------------------------------------------
# Model builders
# ---------------------------------------------------------------------------

def build_lgb():
    return lgb.LGBMClassifier(
        n_estimators=400, learning_rate=0.03, max_depth=6, num_leaves=31,
        min_child_samples=20, subsample=0.85, colsample_bytree=0.85,
        reg_alpha=0.1, reg_lambda=0.1, random_state=42, verbose=-1)


def build_xgb():
    return xgb.XGBClassifier(
        n_estimators=400, learning_rate=0.03, max_depth=5,
        subsample=0.85, colsample_bytree=0.85, reg_alpha=0.1, reg_lambda=0.1,
        random_state=42, eval_metric="logloss", use_label_encoder=False,
        verbosity=0)


def build_rf():
    return RandomForestClassifier(
        n_estimators=300, max_depth=10, min_samples_split=10,
        min_samples_leaf=5, max_features="sqrt",
        random_state=42, n_jobs=-1)


def build_lr():
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(C=1.0, max_iter=500, random_state=42)),
    ])


def build_cat():
    if not HAS_CATBOOST:
        return None
    return CatBoostClassifier(
        iterations=400, learning_rate=0.03, depth=6,
        l2_leaf_reg=3.0, random_seed=42, verbose=False,
        allow_writing_files=False)


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------

def walk_forward_split(df, target, val_fraction=0.2, test_fraction=0.2):
    """
    Chronological split: oldest -> train, middle -> val, newest -> test.
    Preserves time ordering; no peeking at future games.
    """
    df = df.sort_values("game_date").reset_index(drop=True)
    n = len(df)
    n_test = int(n * test_fraction)
    n_val = int(n * val_fraction)
    n_train = n - n_test - n_val

    train = df.iloc[:n_train]
    val = df.iloc[n_train:n_train + n_val]
    test = df.iloc[n_train + n_val:]

    log.info("split: train=%s (%s to %s), val=%s (%s to %s), test=%s (%s to %s)",
             len(train),
             train["game_date"].min().date(), train["game_date"].max().date(),
             len(val),
             val["game_date"].min().date(), val["game_date"].max().date(),
             len(test),
             test["game_date"].min().date(), test["game_date"].max().date())

    return train, val, test


def train_base_models(X_train, y_train, sample_weights):
    """Train all 5 base models. Returns dict of name -> fitted model."""
    models = {}

    log.info("training LightGBM...")
    m = build_lgb()
    m.fit(X_train, y_train, sample_weight=sample_weights)
    models["lgb"] = m

    log.info("training XGBoost...")
    m = build_xgb()
    m.fit(X_train, y_train, sample_weight=sample_weights)
    models["xgb"] = m

    log.info("training Random Forest...")
    m = build_rf()
    m.fit(X_train, y_train, sample_weight=sample_weights)
    models["rf"] = m

    log.info("training Logistic Regression...")
    m = build_lr()
    m.fit(X_train, y_train, lr__sample_weight=sample_weights)
    models["lr"] = m

    if HAS_CATBOOST:
        log.info("training CatBoost...")
        m = build_cat()
        m.fit(X_train, y_train, sample_weight=sample_weights)
        models["cat"] = m
    else:
        log.warning("catboost not available, skipping")

    return models


def get_base_predictions(models, X):
    """Stack base model predictions into (n_samples, n_models) matrix."""
    preds = {}
    for name, m in models.items():
        preds[name] = m.predict_proba(X)[:, 1]
    return pd.DataFrame(preds)


def train_stacker(base_preds_val, y_val):
    """Meta-learner: learns optimal way to combine base predictions."""
    log.info("training stacker (logistic regression meta-learner)...")
    stacker = LogisticRegression(C=1.0, max_iter=500, random_state=42)
    stacker.fit(base_preds_val, y_val)
    return stacker


def train_calibrator(stacked_preds_val, y_val):
    """Isotonic regression: makes predicted probs match actual win rates."""
    log.info("training isotonic calibrator...")
    cal = IsotonicRegression(out_of_bounds="clip")
    cal.fit(stacked_preds_val, y_val)
    return cal


def full_predict(models, stacker, calibrator, X):
    """Full pipeline: base preds -> stacker -> calibrator."""
    base_preds = get_base_predictions(models, X)
    stacked = stacker.predict_proba(base_preds)[:, 1]
    calibrated = calibrator.predict(stacked)
    return calibrated, stacked, base_preds


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_at_thresholds(y_true, probs, thresholds=(0.5, 0.55, 0.60, 0.65, 0.70)):
    """Accuracy at various confidence thresholds (like NBA 'SHARP' metric)."""
    results = {}
    confidence = np.abs(probs - 0.5) + 0.5  # distance from 50/50

    for t in thresholds:
        mask = confidence >= t
        if mask.sum() == 0:
            results[f"acc_at_conf_{int(t*100)}"] = None
            results[f"n_at_conf_{int(t*100)}"] = 0
            continue
        picks = (probs > 0.5).astype(int)
        acc = accuracy_score(y_true[mask], picks[mask])
        results[f"acc_at_conf_{int(t*100)}"] = round(acc, 4)
        results[f"n_at_conf_{int(t*100)}"] = int(mask.sum())
        results[f"pct_at_conf_{int(t*100)}"] = round(mask.mean(), 3)
    return results


def evaluate_roi(df_test, probs, target, odds_home_col, odds_away_col):
    """ROI if we bet flat $100 on every pick above 55% confidence."""
    if odds_home_col not in df_test.columns or odds_away_col not in df_test.columns:
        return None

    picks = (probs > 0.5).astype(int)  # 1 = bet home, 0 = bet away
    confidence = np.abs(probs - 0.5) + 0.5
    mask = confidence >= 0.55

    if mask.sum() == 0:
        return None

    bets = df_test[mask].copy()
    bet_probs = probs[mask]
    bet_picks = picks[mask]
    bet_truth = df_test[target].values[mask]

    # Decimal odds for the side we bet
    odds_h = bets[odds_home_col].apply(american_odds_to_decimal).values
    odds_a = bets[odds_away_col].apply(american_odds_to_decimal).values
    bet_odds = np.where(bet_picks == 1, odds_h, odds_a)

    # Filter bets with no odds
    valid = ~np.isnan(bet_odds)
    if valid.sum() == 0:
        return None
    bet_picks = bet_picks[valid]
    bet_truth = bet_truth[valid]
    bet_odds = bet_odds[valid]
    bet_probs = bet_probs[valid]

    won = (bet_picks == bet_truth).astype(int)
    profit = np.where(won == 1, 100 * (bet_odds - 1), -100)
    total_wagered = 100 * len(bet_picks)
    total_profit = profit.sum()
    roi = total_profit / total_wagered if total_wagered else 0

    # Kelly sizing version
    kelly_stakes = np.array([
        kelly_fraction(p, o) * 100  # pretend bankroll = $100 per bet unit
        for p, o in zip(bet_probs, bet_odds)
    ])
    kelly_profit = np.where(won == 1, kelly_stakes * (bet_odds - 1), -kelly_stakes)
    kelly_wagered = kelly_stakes.sum()
    kelly_roi = kelly_profit.sum() / kelly_wagered if kelly_wagered > 0 else 0

    return {
        "n_bets": int(len(bet_picks)),
        "flat_roi": round(float(roi), 4),
        "flat_profit": round(float(total_profit), 2),
        "flat_wagered": round(float(total_wagered), 2),
        "kelly_roi": round(float(kelly_roi), 4),
        "kelly_avg_stake_pct": round(float(kelly_stakes.mean()), 3),
        "win_rate": round(float(won.mean()), 4),
    }


# ---------------------------------------------------------------------------
# Full pipeline for one variant
# ---------------------------------------------------------------------------

def train_variant(df, target, variant_name, odds_home_col=None, odds_away_col=None):
    log.info("")
    log.info("=" * 60)
    log.info("TRAINING: %s", variant_name)
    log.info("=" * 60)

    features = get_feature_cols(df, target)
    log.info("target: %s | features: %s | rows: %s", target, len(features), len(df))

    train, val, test = walk_forward_split(df, target)

    # Build training matrices
    X_train = train[features]
    y_train = train[target].astype(int)
    X_val = val[features]
    y_val = val[target].astype(int)
    X_test = test[features]
    y_test = test[target].astype(int)

    # Recency weights
    weights_train = compute_recency_weights(train["game_date"])
    log.info("recency weights: min=%.3f, max=%.3f, mean=%.3f",
             weights_train.min(), weights_train.max(), weights_train.mean())

    # Train base models
    models = train_base_models(X_train, y_train, weights_train.values)

    # Base predictions on validation
    base_val = get_base_predictions(models, X_val)
    log.info("base model validation accuracies:")
    for name in base_val.columns:
        acc = accuracy_score(y_val, (base_val[name] > 0.5).astype(int))
        ll = log_loss(y_val, base_val[name], labels=[0, 1])
        log.info("  %s: acc=%.4f, logloss=%.4f", name, acc, ll)

    # Train stacker on validation predictions
    stacker = train_stacker(base_val, y_val)

    # Stacked predictions on validation for calibrator
    stacked_val = stacker.predict_proba(base_val)[:, 1]
    calibrator = train_calibrator(stacked_val, y_val)

    # Final test evaluation
    test_cal, test_stacked, test_base = full_predict(models, stacker, calibrator, X_test)

    # Metrics
    test_preds = (test_cal > 0.5).astype(int)
    test_acc = accuracy_score(y_test, test_preds)
    test_ll = log_loss(y_test, test_cal.clip(0.001, 0.999), labels=[0, 1])
    test_brier = brier_score_loss(y_test, test_cal)
    test_auc = roc_auc_score(y_test, test_cal)

    log.info("")
    log.info("=== TEST SET RESULTS ===")
    log.info("accuracy:  %.4f", test_acc)
    log.info("log loss:  %.4f", test_ll)
    log.info("Brier:     %.4f", test_brier)
    log.info("AUC-ROC:   %.4f", test_auc)

    # Threshold accuracies
    thresh_results = evaluate_at_thresholds(y_test.values, test_cal)
    log.info("")
    log.info("Accuracy at confidence thresholds:")
    for t in (50, 55, 60, 65, 70):
        k = f"acc_at_conf_{t}"
        n = thresh_results.get(f"n_at_conf_{t}", 0)
        pct = thresh_results.get(f"pct_at_conf_{t}", 0)
        if thresh_results.get(k) is not None:
            log.info("  >=%s%%: acc=%.4f (n=%s, %.1f%% of games)",
                     t, thresh_results[k], n, 100 * pct)

    # Feature importance (from LightGBM)
    log.info("")
    log.info("Top 15 features by LightGBM gain:")
    lgb_model = models["lgb"]
    fi = pd.DataFrame({
        "feature": features,
        "importance": lgb_model.feature_importances_,
    }).sort_values("importance", ascending=False).head(15)
    for _, row in fi.iterrows():
        log.info("  %s: %s", row["feature"], row["importance"])

    # ROI evaluation if odds available
    roi_results = None
    if odds_home_col and odds_away_col and odds_home_col in test.columns:
        roi_results = evaluate_roi(test, test_cal, target, odds_home_col, odds_away_col)
        if roi_results:
            log.info("")
            log.info("=== BETTING PERFORMANCE ===")
            log.info("bets placed: %s", roi_results["n_bets"])
            log.info("win rate:    %.1f%%", 100 * roi_results["win_rate"])
            log.info("flat ROI:    %+.2f%% (profit $%.2f on $%.2f wagered)",
                     100 * roi_results["flat_roi"],
                     roi_results["flat_profit"], roi_results["flat_wagered"])
            log.info("Kelly ROI:   %+.2f%% (avg stake: %.1f%% of unit)",
                     100 * roi_results["kelly_roi"],
                     100 * roi_results["kelly_avg_stake_pct"])

    # Save everything
    variant_dir = OUTPUT_DIR / variant_name
    variant_dir.mkdir(exist_ok=True)

    for name, m in models.items():
        with open(variant_dir / f"{name}_classifier.pkl", "wb") as f:
            pickle.dump(m, f)
    with open(variant_dir / "stacker.pkl", "wb") as f:
        pickle.dump(stacker, f)
    with open(variant_dir / "calibrator.pkl", "wb") as f:
        pickle.dump(calibrator, f)
    with open(variant_dir / "feature_list.json", "w") as f:
        json.dump(features, f)

    report = {
        "variant": variant_name,
        "target": target,
        "n_train": len(train), "n_val": len(val), "n_test": len(test),
        "n_features": len(features),
        "test_accuracy": round(test_acc, 4),
        "test_log_loss": round(test_ll, 4),
        "test_brier": round(test_brier, 4),
        "test_auc": round(test_auc, 4),
        "thresholds": thresh_results,
        "roi": roi_results,
        "top_features": [
            {"feature": r["feature"], "importance": int(r["importance"])}
            for _, r in fi.iterrows()
        ],
        "has_catboost": HAS_CATBOOST,
    }
    with open(variant_dir / "model_report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)

    log.info("saved -> %s/", variant_dir)
    return report


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--variant", choices=["all", "full_with_line", "full_no_line",
                                          "f5_with_line", "f5_no_line"],
                   default="all")
    args = p.parse_args()

    variants_config = {
        "full_with_line": {
            "file": "mlb_training_full_with_line.parquet",
            "target": "home_win",
            "odds_home": "open_home_ml",
            "odds_away": "open_away_ml",
        },
        "full_no_line": {
            "file": "mlb_training_full_no_line.parquet",
            "target": "home_win",
            "odds_home": None, "odds_away": None,
        },
        "f5_with_line": {
            "file": "mlb_training_f5_with_line.parquet",
            "target": "f5_home_win",
            "odds_home": "f5_open_home_ml",
            "odds_away": "f5_open_away_ml",
        },
        "f5_no_line": {
            "file": "mlb_training_f5_no_line.parquet",
            "target": "f5_home_win",
            "odds_home": None, "odds_away": None,
        },
    }

    variants = [args.variant] if args.variant != "all" else list(variants_config.keys())
    all_reports = []

    for v in variants:
        cfg = variants_config[v]
        path = INPUT_DIR / cfg["file"]
        if not path.exists():
            log.warning("missing %s, skipping", path); continue
        df = pd.read_parquet(path)
        df["game_date"] = pd.to_datetime(df["game_date"], utc=True)
        report = train_variant(
            df, cfg["target"], v,
            odds_home_col=cfg.get("odds_home"),
            odds_away_col=cfg.get("odds_away"),
        )
        all_reports.append(report)

    # Master summary
    log.info("")
    log.info("=" * 60)
    log.info("FINAL SUMMARY")
    log.info("=" * 60)
    log.info("%-20s %8s %8s %8s %10s", "Variant", "Acc", "LogLoss", "Brier", "ROI")
    for r in all_reports:
        roi = r.get("roi") or {}
        roi_str = f"{100*roi.get('flat_roi', 0):+.1f}%" if roi else "N/A"
        log.info("%-20s %.4f %.4f  %.4f  %10s",
                 r["variant"], r["test_accuracy"],
                 r["test_log_loss"], r["test_brier"], roi_str)

    with open(OUTPUT_DIR / "all_reports.json", "w") as f:
        json.dump(all_reports, f, indent=2, default=str)

    log.info("")
    log.info("DONE")


if __name__ == "__main__":
    main()
