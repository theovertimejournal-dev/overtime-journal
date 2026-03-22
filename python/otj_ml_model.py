"""
otj_ml_model.py — OTJ NBA Gradient Boost Training Pipeline
"""
import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score
from sklearn.metrics import accuracy_score, classification_report, mean_absolute_error
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import StackingClassifier
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import lightgbm as lgb
import json
import warnings
warnings.filterwarnings('ignore')

# ── Load Data ────────────────────────────────────────────────────────────────
df = pd.read_csv("/mnt/user-data/uploads/training_data.csv")

print(f"{'=' * 70}")
print(f"  OTJ NBA Gradient Boost Model Training")
print(f"{'=' * 70}")
print(f"  Games: {len(df)}")
print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
print(f"  Home win rate: {df['home_won'].mean():.1%}")
print(f"  Columns: {len(df.columns)}")

# ── Feature Selection ────────────────────────────────────────────────────────
# Drop identifiers, targets, and bad Vegas data (confirmed closing lines)
DROP_COLS = [
    'game_id', 'date', 'home_team', 'away_team', 'matchup',
    # Targets
    'home_won', 'home_score', 'away_score', 'margin', 'total_points',
    'home_covered', 'went_over',
    # Bad Vegas data (closing lines, not opening)
    'vegas_ml_home', 'vegas_ml_away', 'vegas_implied_prob_home',
    'vegas_implied_prob_away', 'vegas_spread_home', 'vegas_spread_abs',
    'vegas_total', 'home_is_favorite', 'big_favorite', 'huge_favorite',
    'favorite_spread_size',
    # Box score features FROM the game (leakage — we can't know these before tip)
    'h_total_blocks', 'a_total_blocks', 'diff_blocks',
    'h_avg_height_inches', 'a_avg_height_inches', 'diff_avg_height',
    'h_max_height_inches', 'a_max_height_inches',
    'h_tallest_shortest_gap', 'a_tallest_shortest_gap',
    'h_avg_age', 'a_avg_age', 'diff_avg_age',
    'h_roster_size_played', 'a_roster_size_played',
]

feature_cols = [c for c in df.columns if c not in DROP_COLS]
print(f"\n  Features used: {len(feature_cols)}")

X = df[feature_cols].fillna(0)
y_win = df['home_won']
y_margin = df['margin']

# ── Time-Based Split (NOT random — respects game order) ─────────────────────
df_sorted = df.sort_values('date').reset_index(drop=True)
X_sorted = df_sorted[feature_cols].fillna(0)
y_win_sorted = df_sorted['home_won']
y_margin_sorted = df_sorted['margin']

split_80 = int(len(df_sorted) * 0.80)
X_train, X_test = X_sorted[:split_80], X_sorted[split_80:]
y_win_train, y_win_test = y_win_sorted[:split_80], y_win_sorted[split_80:]
y_margin_train, y_margin_test = y_margin_sorted[:split_80], y_margin_sorted[split_80:]

test_df = df_sorted[split_80:].copy()

print(f"\n  Train: {len(X_train)} games ({df_sorted['date'].iloc[0]} → {df_sorted['date'].iloc[split_80-1]})")
print(f"  Test:  {len(X_test)} games ({df_sorted['date'].iloc[split_80]} → {df_sorted['date'].iloc[-1]})")
print(f"  Train home win rate: {y_win_train.mean():.1%}")
print(f"  Test home win rate:  {y_win_test.mean():.1%}")


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL 1: XGBoost Win/Loss Classifier
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 1: XGBoost Win/Loss Classifier")
print(f"{'─' * 70}")

xgb_clf = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
    eval_metric='logloss',
)
xgb_clf.fit(X_train, y_win_train, eval_set=[(X_test, y_win_test)], verbose=False)

xgb_pred = xgb_clf.predict(X_test)
xgb_prob = xgb_clf.predict_proba(X_test)[:, 1]
xgb_acc = accuracy_score(y_win_test, xgb_pred)

print(f"\n  XGBoost Accuracy: {xgb_acc:.1%}")
print(f"  Baseline (always pick home): {y_win_test.mean():.1%}")
print(f"  Edge over baseline: {(xgb_acc - y_win_test.mean())*100:+.1f}%")
print(f"\n  Classification Report:")
print(classification_report(y_win_test, xgb_pred, target_names=['Away Win', 'Home Win'], digits=3))

# Feature importances
xgb_importance = pd.DataFrame({
    'feature': feature_cols,
    'importance': xgb_clf.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  TOP 20 FEATURES (XGBoost):")
print(f"  {'Rank':<6}{'Feature':<35}{'Importance':<12}")
print(f"  {'─'*53}")
for i, row in xgb_importance.head(20).iterrows():
    bar = '█' * int(row['importance'] * 200)
    print(f"  {xgb_importance.index.get_loc(i)+1:<6}{row['feature']:<35}{row['importance']:.4f}  {bar}")


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL 2: LightGBM Win/Loss Classifier
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 2: LightGBM Win/Loss Classifier")
print(f"{'─' * 70}")

lgb_clf = lgb.LGBMClassifier(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_samples=10,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
    verbose=-1,
)
lgb_clf.fit(X_train, y_win_train)

lgb_pred = lgb_clf.predict(X_test)
lgb_prob = lgb_clf.predict_proba(X_test)[:, 1]
lgb_acc = accuracy_score(y_win_test, lgb_pred)

print(f"\n  LightGBM Accuracy: {lgb_acc:.1%}")
print(f"  Edge over baseline: {(lgb_acc - y_win_test.mean())*100:+.1f}%")

lgb_importance = pd.DataFrame({
    'feature': feature_cols,
    'importance': lgb_clf.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  TOP 20 FEATURES (LightGBM):")
print(f"  {'Rank':<6}{'Feature':<35}{'Importance':<12}")
print(f"  {'─'*53}")
for i, row in lgb_importance.head(20).iterrows():
    bar = '█' * int(row['importance'] / lgb_importance['importance'].max() * 30)
    print(f"  {lgb_importance.index.get_loc(i)+1:<6}{row['feature']:<35}{row['importance']:<12}{bar}")


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL 3: Logistic Regression (baseline)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 3: Logistic Regression (Baseline)")
print(f"{'─' * 70}")

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

lr_clf = LogisticRegression(max_iter=1000, C=0.1, random_state=42)
lr_clf.fit(X_train_scaled, y_win_train)

lr_pred = lr_clf.predict(X_test_scaled)
lr_prob = lr_clf.predict_proba(X_test_scaled)[:, 1]
lr_acc = accuracy_score(y_win_test, lr_pred)

print(f"\n  Logistic Regression Accuracy: {lr_acc:.1%}")
print(f"  Edge over baseline: {(lr_acc - y_win_test.mean())*100:+.1f}%")

# Top logistic features by absolute coefficient
lr_importance = pd.DataFrame({
    'feature': feature_cols,
    'coefficient': lr_clf.coef_[0],
    'abs_coef': np.abs(lr_clf.coef_[0])
}).sort_values('abs_coef', ascending=False)

print(f"\n  TOP 15 FEATURES (Logistic — by coefficient):")
print(f"  {'Rank':<6}{'Feature':<35}{'Coef':<12}{'Direction':<10}")
print(f"  {'─'*63}")
for idx, row in lr_importance.head(15).iterrows():
    direction = "HOME ↑" if row['coefficient'] > 0 else "AWAY ↑"
    print(f"  {lr_importance.index.get_loc(idx)+1:<6}{row['feature']:<35}{row['coefficient']:+.4f}    {direction}")


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL 4: Ensemble (Stacking)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 4: Stacking Ensemble (XGB + LGB + LR)")
print(f"{'─' * 70}")

stack_clf = StackingClassifier(
    estimators=[
        ('xgb', xgb.XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
                                    subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                                    random_state=42, eval_metric='logloss')),
        ('lgb', lgb.LGBMClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
                                    subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
                                    random_state=42, verbose=-1)),
        ('lr', LogisticRegression(max_iter=1000, C=0.1, random_state=42)),
    ],
    final_estimator=LogisticRegression(max_iter=500),
    cv=5,
    passthrough=False,
)

# Need to scale for the LR component
stack_clf.fit(X_train_scaled, y_win_train)
stack_pred = stack_clf.predict(X_test_scaled)
stack_prob = stack_clf.predict_proba(X_test_scaled)[:, 1]
stack_acc = accuracy_score(y_win_test, stack_pred)

print(f"\n  Stacking Ensemble Accuracy: {stack_acc:.1%}")
print(f"  Edge over baseline: {(stack_acc - y_win_test.mean())*100:+.1f}%")


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL 5: XGBoost Margin Regressor (for spread prediction)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 5: XGBoost Margin Regressor (Spread Prediction)")
print(f"{'─' * 70}")

xgb_reg = xgb.XGBRegressor(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
)
xgb_reg.fit(X_train, y_margin_train, eval_set=[(X_test, y_margin_test)], verbose=False)

margin_pred = xgb_reg.predict(X_test)
margin_mae = mean_absolute_error(y_margin_test, margin_pred)

# Check directional accuracy (did it predict the right winner?)
direction_correct = ((margin_pred > 0) == (y_margin_test > 0)).mean()

# Check spread accuracy — if we used the predicted margin as our spread, how often does the right side cover?
print(f"\n  Mean Absolute Error: {margin_mae:.1f} points")
print(f"  Directional Accuracy: {direction_correct:.1%} (predicted correct winner)")
print(f"  Avg predicted margin: {margin_pred.mean():.1f} (actual: {y_margin_test.mean():.1f})")

# Sample predictions vs actuals
print(f"\n  SAMPLE PREDICTIONS (last 15 games):")
print(f"  {'Matchup':<22}{'Predicted':<12}{'Actual':<10}{'Diff':<10}{'Correct'}")
print(f"  {'─'*66}")
for i in range(-15, 0):
    matchup = test_df.iloc[i]['matchup'][:20]
    pred_m = margin_pred[i]
    actual_m = y_margin_test.iloc[i]
    diff = abs(pred_m - actual_m)
    correct = "✅" if (pred_m > 0) == (actual_m > 0) else "❌"
    print(f"  {matchup:<22}{pred_m:>+7.1f}     {actual_m:>+6.0f}     {diff:>5.1f}     {correct}")


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIDENCE TIERS — how does accuracy change with confidence?
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  CONFIDENCE TIER ANALYSIS")
print(f"{'─' * 70}")

# Use XGBoost probabilities
test_results = pd.DataFrame({
    'matchup': test_df['matchup'].values,
    'actual': y_win_test.values,
    'xgb_prob': xgb_prob,
    'xgb_pred': xgb_pred,
    'margin_pred': margin_pred,
    'actual_margin': y_margin_test.values,
})

# Confidence = how far from 50% the prediction is
test_results['confidence'] = (test_results['xgb_prob'] - 0.5).abs()

tiers = [
    ('ALL GAMES', 0.0),
    ('LEAN (conf > 5%)', 0.05),
    ('STRONG (conf > 10%)', 0.10),
    ('SHARP (conf > 15%)', 0.15),
    ('ULTRA (conf > 20%)', 0.20),
]

print(f"\n  {'Tier':<25}{'Games':<8}{'Accuracy':<12}{'Edge vs 50%'}")
print(f"  {'─'*57}")
for name, threshold in tiers:
    mask = test_results['confidence'] >= threshold
    subset = test_results[mask]
    if len(subset) > 5:
        acc = accuracy_score(subset['actual'], subset['xgb_pred'])
        print(f"  {name:<25}{len(subset):<8}{acc:.1%}        {(acc-0.5)*100:+.1f}%")


# ═══════════════════════════════════════════════════════════════════════════════
# B2B ANALYSIS — does the model find fatigue effects?
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  SITUATIONAL ANALYSIS")
print(f"{'─' * 70}")

# B2B impact
home_b2b_games = test_results[X_test['home_b2b'] == 1]
away_b2b_games = test_results[X_test['away_b2b'] == 1]
no_b2b_games = test_results[(X_test['home_b2b'] == 0) & (X_test['away_b2b'] == 0)]

print(f"\n  B2B Impact:")
if len(home_b2b_games) > 5:
    print(f"    Home on B2B:  {len(home_b2b_games)} games, home wins {home_b2b_games['actual'].mean():.1%}")
if len(away_b2b_games) > 5:
    print(f"    Away on B2B:  {len(away_b2b_games)} games, home wins {away_b2b_games['actual'].mean():.1%}")
if len(no_b2b_games) > 5:
    print(f"    No B2B:       {len(no_b2b_games)} games, home wins {no_b2b_games['actual'].mean():.1%}")


# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'=' * 70}")
print(f"  MODEL COMPARISON SUMMARY")
print(f"{'=' * 70}")

baseline = y_win_test.mean()
models = [
    ("Always Pick Home (baseline)", baseline),
    ("Logistic Regression", lr_acc),
    ("XGBoost Classifier", xgb_acc),
    ("LightGBM Classifier", lgb_acc),
    ("Stacking Ensemble", stack_acc),
    ("XGBoost Margin (directional)", direction_correct),
]

print(f"\n  {'Model':<38}{'Accuracy':<12}{'vs Baseline'}")
print(f"  {'─'*62}")
for name, acc in models:
    bar = '█' * int((acc - 0.4) * 100)
    edge = f"{(acc - baseline)*100:+.1f}%" if name != "Always Pick Home (baseline)" else "—"
    print(f"  {name:<38}{acc:.1%}        {edge:<10} {bar}")

print(f"\n  BEST MODEL: ", end="")
best = max(models[1:], key=lambda x: x[1])
print(f"{best[0]} at {best[1]:.1%} ({(best[1]-baseline)*100:+.1f}% over baseline)")

print(f"\n{'=' * 70}")
print(f"  Training complete. Feature importances above show what ACTUALLY")
print(f"  predicts NBA game outcomes vs what you assumed.")
print(f"{'=' * 70}\n")
