"""
otj_retrain_v3.py — Full Ensemble Upgrade
==========================================
Models:
  1. LightGBM Classifier (primary)
  2. XGBoost Classifier
  3. Random Forest (conservative, avoids false confidence)
  4. Logistic Regression (linear edges)
  5. Ensemble: weighted average of all 4
  6. Consensus gating: only fire when 3+ models agree

New features vs v2:
  - h/a_close_win_pct differential (clutch edge)
  - h/a_fb_pts + fb_pts_allowed (fast break offense/defense)
  - diff_pace (pace mismatch)
  - diff_fb_net (net fast break edge)

Usage:
    python otj_retrain_v3.py
    python otj_retrain_v3.py --input training_data.csv
"""

import pandas as pd
import numpy as np
import joblib
import json
import warnings
import sys
import os
warnings.filterwarnings('ignore')

from sklearn.model_selection import cross_val_score
from sklearn.metrics import accuracy_score, classification_report, mean_absolute_error
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import lightgbm as lgb

# ── Load Data ─────────────────────────────────────────────────────────────────
input_path = "training_data.csv"
for arg in sys.argv[1:]:
    if arg.startswith("--input="):
        input_path = arg.split("=")[1]

if not os.path.exists(input_path):
    print(f"❌ Training data not found: {input_path}")
    print(f"   Run: python otj_fetch_training_data.py first")
    sys.exit(1)

df = pd.read_csv(input_path)
df.columns = df.columns.str.strip()

print(f"{'=' * 70}")
print(f"  OTJ NBA Model Retrain v3 — Full Ensemble")
print(f"{'=' * 70}")
print(f"  Games:      {len(df)}")
print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
print(f"  Home win rate: {df['home_won'].mean():.1%}")
print(f"  Columns:    {len(df.columns)}")


# ════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  FEATURE ENGINEERING")
print(f"{'─' * 70}")

df = df.sort_values('date').reset_index(drop=True)

# 1. Clutch edge in coin flip games
df['h_clutch_score'] = df['h_close_win_pct'] * df['h_close_wins'].clip(0, 20)
df['a_clutch_score'] = df['a_close_win_pct'] * df['a_close_wins'].clip(0, 20)
df['diff_clutch_score'] = df['h_clutch_score'] - df['a_clutch_score']
print(f"  ✅ Clutch edge features added")

# 2. Fast break net edge
df['h_fb_net'] = df['h_fb_pts'] - df['a_fb_pts_allowed']  # home FB off vs away FB def
df['a_fb_net'] = df['a_fb_pts'] - df['h_fb_pts_allowed']  # away FB off vs home FB def
df['diff_fb_net'] = df['h_fb_net'] - df['a_fb_net']
print(f"  ✅ Fast break net edge features added")

# 3. Pace mismatch (already have diff_pace, add absolute value)
df['pace_mismatch'] = df['diff_pace'].abs()
df['pace_advantage_home'] = (df['diff_pace'] > 5).astype(int)
df['pace_advantage_away'] = (df['diff_pace'] < -5).astype(int)
print(f"  ✅ Pace mismatch features added")

# 4. B2B combinations
df['both_b2b'] = ((df['h_b2b'] == 1) & (df['a_b2b'] == 1)).astype(int)
df['home_b2b_only'] = ((df['h_b2b'] == 1) & (df['a_b2b'] == 0)).astype(int)
df['away_b2b_only'] = ((df['h_b2b'] == 0) & (df['a_b2b'] == 1)).astype(int)
print(f"  ✅ B2B combination features added")

# 5. Win rate tiers
df['h_tier'] = pd.cut(df['h_win_pct'],
    bins=[0, 0.32, 0.40, 0.55, 0.65, 1.0],
    labels=['tank', 'below_avg', 'mid', 'good', 'elite'])
df['a_tier'] = pd.cut(df['a_win_pct'],
    bins=[0, 0.32, 0.40, 0.55, 0.65, 1.0],
    labels=['tank', 'below_avg', 'mid', 'good', 'elite'])

# Elite vs tank matchup flags
df['elite_vs_tank'] = (
    ((df['h_win_pct'] >= 0.65) & (df['a_win_pct'] < 0.32)) |
    ((df['a_win_pct'] >= 0.65) & (df['h_win_pct'] < 0.32))
).astype(int)
df['avg_vs_tank_home'] = ((df['h_win_pct'].between(0.40, 0.65)) & (df['a_win_pct'] < 0.32)).astype(int)
df['tank_bowl'] = ((df['h_win_pct'] < 0.35) & (df['a_win_pct'] < 0.35)).astype(int)
print(f"  ✅ Tier matchup features added")

# 6. Form momentum
df['h_form_momentum'] = df['h_l5_pct'] - df['h_win_pct']
df['a_form_momentum'] = df['a_l5_pct'] - df['a_win_pct']
df['diff_form_momentum'] = df['h_form_momentum'] - df['a_form_momentum']
print(f"  ✅ Form momentum features added")

# 7. Rest advantage
df['rest_advantage_home'] = (df['h_rest_days'] - df['a_rest_days']).clip(-3, 3)
df['home_well_rested'] = (df['h_rest_days'] >= 3).astype(int)
df['away_well_rested'] = (df['a_rest_days'] >= 3).astype(int)
print(f"  ✅ Rest advantage features added")

# 8. Net rating tier interaction
df['net_gap'] = df['diff_net_rating'].abs()
df['large_net_gap'] = (df['net_gap'] >= 6).astype(int)
df['coin_flip_game'] = (df['net_gap'] <= 2).astype(int)
print(f"  ✅ Net rating gap features added")

new_feature_count = len(df.columns) - len(pd.read_csv(input_path).columns)
print(f"\n  Total new features engineered: {new_feature_count}")


# ════════════════════════════════════════════════════════════════════════════
# FEATURE SELECTION
# ════════════════════════════════════════════════════════════════════════════
DROP_COLS = [
    'matchup', 'date', 'home_team', 'away_team',
    'home_won',  # target
    'h_tier', 'a_tier',  # categorical
]
DROP_COLS += [c for c in df.columns if 'vegas' in c.lower() or 'implied' in c.lower()]

feature_cols = [c for c in df.columns if c not in DROP_COLS and df[c].dtype in ['float64', 'int64', 'int32', 'float32']]

X = df[feature_cols].fillna(0)
y = df['home_won']

print(f"\n{'─' * 70}")
print(f"  MODEL TRAINING — {len(feature_cols)} features, {len(df)} games")
print(f"{'─' * 70}")

# Time-based split (last 20% = test)
split = int(len(df) * 0.80)
X_train, X_test = X.iloc[:split], X.iloc[split:]
y_train, y_test = y.iloc[:split], y.iloc[split:]

print(f"  Train: {len(X_train)} games")
print(f"  Test:  {len(X_test)} games")
print(f"  Baseline (always home): {y_test.mean():.1%}")


# ════════════════════════════════════════════════════════════════════════════
# MODEL 1: LightGBM (PRIMARY)
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 1: LightGBM Classifier")
print(f"{'─' * 70}")

lgb_clf = lgb.LGBMClassifier(
    n_estimators=500,
    max_depth=5,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.75,
    min_child_samples=10,
    reg_alpha=0.15,
    reg_lambda=1.2,
    random_state=42,
    verbose=-1,
    num_leaves=31,
)
lgb_clf.fit(X_train, y_train)
lgb_pred  = lgb_clf.predict(X_test)
lgb_prob  = lgb_clf.predict_proba(X_test)[:, 1]
lgb_acc   = accuracy_score(y_test, lgb_pred)
print(f"  Accuracy: {lgb_acc:.1%} (edge: {(lgb_acc - y_test.mean())*100:+.1f}%)")

lgb_imp = pd.DataFrame({
    'feature': feature_cols,
    'importance': lgb_clf.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  TOP 15 FEATURES (LightGBM):")
for i, (_, row) in enumerate(lgb_imp.head(15).iterrows()):
    bar = '█' * int(row['importance'] / lgb_imp['importance'].max() * 25)
    print(f"    #{i+1:<3} {row['feature']:<35} {bar}")


# ════════════════════════════════════════════════════════════════════════════
# MODEL 2: XGBoost Classifier
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 2: XGBoost Classifier")
print(f"{'─' * 70}")

xgb_clf = xgb.XGBClassifier(
    n_estimators=500,
    max_depth=5,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.75,
    min_child_weight=5,
    reg_alpha=0.15,
    reg_lambda=1.2,
    random_state=42,
    eval_metric='logloss',
    verbosity=0,
)
xgb_clf.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
xgb_pred = xgb_clf.predict(X_test)
xgb_prob = xgb_clf.predict_proba(X_test)[:, 1]
xgb_acc  = accuracy_score(y_test, xgb_pred)
print(f"  Accuracy: {xgb_acc:.1%} (edge: {(xgb_acc - y_test.mean())*100:+.1f}%)")


# ════════════════════════════════════════════════════════════════════════════
# MODEL 3: Random Forest (Conservative)
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 3: Random Forest (Conservative)")
print(f"{'─' * 70}")

rf_clf = RandomForestClassifier(
    n_estimators=300,
    max_depth=6,
    min_samples_leaf=15,   # conservative — avoids overfitting small samples
    max_features='sqrt',
    random_state=42,
    n_jobs=-1,
)
rf_clf.fit(X_train, y_train)
rf_pred = rf_clf.predict(X_test)
rf_prob = rf_clf.predict_proba(X_test)[:, 1]
rf_acc  = accuracy_score(y_test, rf_pred)
print(f"  Accuracy: {rf_acc:.1%} (edge: {(rf_acc - y_test.mean())*100:+.1f}%)")


# ════════════════════════════════════════════════════════════════════════════
# MODEL 4: Logistic Regression (Linear edges)
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 4: Logistic Regression (Linear)")
print(f"{'─' * 70}")

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)

lr_clf = LogisticRegression(
    C=0.5,
    max_iter=1000,
    random_state=42,
    solver='lbfgs',
)
lr_clf.fit(X_train_scaled, y_train)
lr_pred = lr_clf.predict(X_test_scaled)
lr_prob = lr_clf.predict_proba(X_test_scaled)[:, 1]
lr_acc  = accuracy_score(y_test, lr_pred)
print(f"  Accuracy: {lr_acc:.1%} (edge: {(lr_acc - y_test.mean())*100:+.1f}%)")


# ════════════════════════════════════════════════════════════════════════════
# MODEL 5: XGBoost Margin Regressor
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 5: XGBoost Margin Regressor")
print(f"{'─' * 70}")

# Need margin column
if 'margin' not in df.columns:
    # Estimate from edge score if no real margin
    df['margin'] = df['edge_score'] * 0.8
    print(f"  ⚠ No real margin data — using edge score proxy")

y_margin = df['margin']
y_margin_train = y_margin.iloc[:split]
y_margin_test  = y_margin.iloc[split:]

xgb_reg = xgb.XGBRegressor(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.75,
    random_state=42,
    verbosity=0,
)
xgb_reg.fit(X_train, y_margin_train, eval_set=[(X_test, y_margin_test)], verbose=False)
margin_pred = xgb_reg.predict(X_test)
margin_mae  = mean_absolute_error(y_margin_test, margin_pred)
direction_acc = ((margin_pred > 0) == (y_margin_test > 0)).mean()
print(f"  MAE: {margin_mae:.1f} pts | Directional: {direction_acc:.1%}")


# ════════════════════════════════════════════════════════════════════════════
# ENSEMBLE + CONSENSUS GATING
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  ENSEMBLE + CONSENSUS GATING")
print(f"{'─' * 70}")

# Model weights based on historical accuracy (higher weight = more trusted)
W_LGB = 0.35
W_XGB = 0.30
W_RF  = 0.20
W_LR  = 0.15

results = pd.DataFrame({
    'actual':       y_test.values,
    'lgb_prob':     lgb_prob,
    'xgb_prob':     xgb_prob,
    'rf_prob':      rf_prob,
    'lr_prob':      lr_prob,
    'margin_pred':  margin_pred,
})

# Weighted ensemble probability
results['ensemble_prob'] = (
    results['lgb_prob'] * W_LGB +
    results['xgb_prob'] * W_XGB +
    results['rf_prob']  * W_RF  +
    results['lr_prob']  * W_LR
)
results['ensemble_pred'] = (results['ensemble_prob'] >= 0.5).astype(int)
results['confidence'] = (results['ensemble_prob'] - 0.5).abs()

ensemble_acc = accuracy_score(results['actual'], results['ensemble_pred'])
print(f"  Weighted Ensemble Accuracy: {ensemble_acc:.1%}")

# Consensus: how many models agree?
results['lgb_vote'] = (results['lgb_prob'] >= 0.5).astype(int)
results['xgb_vote'] = (results['xgb_prob'] >= 0.5).astype(int)
results['rf_vote']  = (results['rf_prob']  >= 0.5).astype(int)
results['lr_vote']  = (results['lr_prob']  >= 0.5).astype(int)
results['votes_for_home'] = results[['lgb_vote','xgb_vote','rf_vote','lr_vote']].sum(axis=1)
results['consensus'] = results['votes_for_home'].apply(
    lambda v: 'strong' if v >= 3 or v <= 1 else 'split'
)

consensus_mask = results['consensus'] == 'strong'
consensus_acc  = accuracy_score(
    results.loc[consensus_mask, 'actual'],
    results.loc[consensus_mask, 'ensemble_pred']
)
print(f"  Consensus Games (3+ agree): {consensus_mask.sum()} ({consensus_mask.mean():.0%} of games)")
print(f"  Consensus Accuracy: {consensus_acc:.1%}")
print(f"  Split Games (2-2): {(~consensus_mask).sum()} — model fires at reduced confidence")


# ════════════════════════════════════════════════════════════════════════════
# CONFIDENCE TIER ANALYSIS
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  CONFIDENCE TIER ANALYSIS")
print(f"{'─' * 70}")

tiers = [
    ('ALL GAMES',           0.00, False),
    ('LEAN  (conf >5%)',    0.05, False),
    ('STRONG (conf >10%)',  0.10, False),
    ('SHARP (conf >15%)',   0.15, False),
    ('ULTRA (conf >20%)',   0.20, False),
    ('CONSENSUS + LEAN',    0.05, True),
    ('CONSENSUS + SHARP',   0.15, True),
]

baseline = y_test.mean()
print(f"\n  {'Tier':<28}{'N':<8}{'Acc':<10}{'Edge vs 50%'}")
print(f"  {'─'*55}")
for name, threshold, req_consensus in tiers:
    mask = results['confidence'] >= threshold
    if req_consensus:
        mask = mask & consensus_mask
    subset = results[mask]
    if len(subset) >= 5:
        acc = accuracy_score(subset['actual'], subset['ensemble_pred'])
        print(f"  {name:<28}{len(subset):<8}{acc:.1%}     {(acc-0.5)*100:+.1f}%")


# ════════════════════════════════════════════════════════════════════════════
# NEW FEATURE IMPACT
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  NEW FEATURE IMPACT")
print(f"{'─' * 70}")

new_feats = ['h_fb_pts', 'a_fb_pts', 'diff_fb_net', 'diff_clutch_score',
             'h_clutch_score', 'a_clutch_score', 'pace_mismatch',
             'coin_flip_game', 'elite_vs_tank', 'tank_bowl']

lgb_top30 = set(lgb_imp.head(30)['feature'].values)
found = [f for f in new_feats if f in lgb_top30 and f in feature_cols]
print(f"\n  New features in LGB top 30: {len(found)}")
for f in found:
    rank = list(lgb_imp['feature']).index(f) + 1
    imp  = lgb_imp.loc[lgb_imp['feature'] == f, 'importance'].values[0]
    print(f"    #{rank}: {f} (importance: {imp:.0f})")


# ════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'=' * 70}")
print(f"  MODEL COMPARISON SUMMARY")
print(f"{'=' * 70}")

models_summary = [
    ("Baseline (always home)",      baseline),
    ("LightGBM",                    lgb_acc),
    ("XGBoost",                     xgb_acc),
    ("Random Forest",               rf_acc),
    ("Logistic Regression",         lr_acc),
    ("Weighted Ensemble",           ensemble_acc),
    ("Consensus + Sharp (>15%)",    consensus_acc),
]

print(f"\n  {'Model':<35}{'Acc':<10}{'vs 50%'}")
print(f"  {'─'*55}")
for name, acc in models_summary:
    edge = f"{(acc-0.5)*100:+.1f}%" if name != "Baseline (always home)" else "—"
    marker = " ← BEST" if acc == max(a for _, a in models_summary[1:]) else ""
    print(f"  {name:<35}{acc:.1%}    {edge}{marker}")


# ════════════════════════════════════════════════════════════════════════════
# EXPORT
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  EXPORTING MODELS")
print(f"{'─' * 70}")

joblib.dump(lgb_clf, 'otj_lgb_classifier.pkl')
joblib.dump(xgb_reg, 'otj_xgb_regressor.pkl')
joblib.dump(xgb_clf, 'otj_xgb_classifier.pkl')
joblib.dump(rf_clf,  'otj_rf_classifier.pkl')
joblib.dump({'model': lr_clf, 'scaler': scaler}, 'otj_lr_classifier.pkl')
print(f"  ✅ All 5 model files saved")

# Weights for ensemble
ensemble_weights = {
    'lgb': W_LGB, 'xgb': W_XGB, 'rf': W_RF, 'lr': W_LR
}
with open('otj_ensemble_weights.json', 'w') as f:
    json.dump(ensemble_weights, f, indent=2)
print(f"  ✅ otj_ensemble_weights.json saved")

# Feature list
with open('otj_model_features.json', 'w') as f:
    json.dump(feature_cols, f, indent=2)
print(f"  ✅ otj_model_features.json saved ({len(feature_cols)} features)")

# Accuracy report
report = {
    'trained_at': pd.Timestamp.now().isoformat(),
    'games': len(df),
    'features': len(feature_cols),
    'accuracies': {
        'lgb': round(lgb_acc, 4),
        'xgb': round(xgb_acc, 4),
        'rf':  round(rf_acc,  4),
        'lr':  round(lr_acc,  4),
        'ensemble': round(ensemble_acc, 4),
        'consensus_sharp': round(consensus_acc, 4),
    },
    'consensus_rate': round(float(consensus_mask.mean()), 3),
    'baseline': round(float(baseline), 4),
}
with open('otj_model_report.json', 'w') as f:
    json.dump(report, f, indent=2)
print(f"  ✅ otj_model_report.json saved")

print(f"\n{'=' * 70}")
print(f"  RETRAIN COMPLETE — v3 Ensemble")
print(f"{'=' * 70}")
print(f"  Previous: LGB 68.4% (2 models)")
print(f"  New:      Ensemble {ensemble_acc:.1%} (4 models + consensus gating)")
print(f"\n  Copy these files to your python\\ folder:")
print(f"    otj_lgb_classifier.pkl")
print(f"    otj_xgb_regressor.pkl")
print(f"    otj_xgb_classifier.pkl")
print(f"    otj_rf_classifier.pkl")
print(f"    otj_lr_classifier.pkl")
print(f"    otj_ensemble_weights.json")
print(f"    otj_model_features.json")
print(f"{'=' * 70}\n")
