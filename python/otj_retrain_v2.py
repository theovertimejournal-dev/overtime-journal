"""
otj_retrain_v2.py — Add new features + retrain OTJ NBA models
=============================================================
New features computed from existing data (no API needed):
  1. Win rate vs good teams (.500+) vs bad teams (sub-.500)
  2. Margin vs good vs bad teams
  3. L10 form momentum (L10 net vs season net — trending up or down?)
  4. Opponent tier classification for this game
  5. Streak strength (weighted by opponent quality)

Then retrains XGB classifier, LGB classifier, XGB margin regressor,
and exports new pkl files + updated feature list.
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
import joblib
import json
import warnings
warnings.filterwarnings('ignore')

# ── Load Data ────────────────────────────────────────────────────────────────
df = pd.read_csv("/home/claude/training_data.csv")
df.columns = df.columns.str.strip()

print(f"{'=' * 70}")
print(f"  OTJ NBA Model Retrain v2 — New Features")
print(f"{'=' * 70}")
print(f"  Games: {len(df)}")
print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
print(f"  Home win rate: {df['home_won'].mean():.1%}")
print(f"  Original columns: {len(df.columns)}")


# ════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING — New features from existing data
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  FEATURE ENGINEERING")
print(f"{'─' * 70}")

# Sort by date for rolling calculations
df = df.sort_values('date').reset_index(drop=True)

# ── 1. Opponent tier: was the opponent .500+ or sub-.500? ────────────────
# For home team: opponent is the away team, so use a_win_pct
# For away team: opponent is the home team, so use h_win_pct
df['h_opp_is_good'] = (df['a_win_pct'] >= 0.500).astype(int)
df['a_opp_is_good'] = (df['h_win_pct'] >= 0.500).astype(int)

# Opponent strength as continuous (better than binary)
df['h_opp_strength'] = df['a_win_pct']
df['a_opp_strength'] = df['h_win_pct']
df['diff_opp_strength'] = df['h_opp_strength'] - df['a_opp_strength']

print(f"  ✅ Opponent tier features added")

# ── 2. Rolling win rate vs good/bad teams ────────────────────────────────
# For each game, compute that team's historical record vs good/bad opponents
# We do this by iterating through games chronologically per team

team_vs_good = {}  # {team: [wins_vs_good, games_vs_good]}
team_vs_bad = {}   # {team: [wins_vs_bad, games_vs_bad]}
team_margin_vs_good = {}  # {team: [total_margin, count]}
team_margin_vs_bad = {}

h_wr_good = []
h_wr_bad = []
a_wr_good = []
a_wr_bad = []
h_margin_good = []
h_margin_bad = []
a_margin_good = []
a_margin_bad = []

for idx, row in df.iterrows():
    ht = row['home_team']
    at = row['away_team']

    # Initialize if needed
    for t in [ht, at]:
        if t not in team_vs_good:
            team_vs_good[t] = [0, 0]
            team_vs_bad[t] = [0, 0]
            team_margin_vs_good[t] = [0, 0]
            team_margin_vs_bad[t] = [0, 0]

    # Record CURRENT state (before this game) as the feature
    # Home team's record vs good/bad
    g_good = team_vs_good[ht]
    g_bad = team_vs_bad[ht]
    h_wr_good.append(g_good[0] / g_good[1] if g_good[1] >= 3 else 0.5)
    h_wr_bad.append(g_bad[0] / g_bad[1] if g_bad[1] >= 3 else 0.5)
    h_margin_good.append(team_margin_vs_good[ht][0] / team_margin_vs_good[ht][1] if team_margin_vs_good[ht][1] >= 3 else 0.0)
    h_margin_bad.append(team_margin_vs_bad[ht][0] / team_margin_vs_bad[ht][1] if team_margin_vs_bad[ht][1] >= 3 else 0.0)

    # Away team's record vs good/bad
    g_good_a = team_vs_good[at]
    g_bad_a = team_vs_bad[at]
    a_wr_good.append(g_good_a[0] / g_good_a[1] if g_good_a[1] >= 3 else 0.5)
    a_wr_bad.append(g_bad_a[0] / g_bad_a[1] if g_bad_a[1] >= 3 else 0.5)
    a_margin_good.append(team_margin_vs_good[at][0] / team_margin_vs_good[at][1] if team_margin_vs_good[at][1] >= 3 else 0.0)
    a_margin_bad.append(team_margin_vs_bad[at][0] / team_margin_vs_bad[at][1] if team_margin_vs_bad[at][1] >= 3 else 0.0)

    # NOW update with this game's result
    margin = row['margin']  # positive = home won by X
    home_won = row['home_won']

    # Home team played against away team
    if row['a_win_pct'] >= 0.5:  # away team is good
        team_vs_good[ht][1] += 1
        team_vs_good[ht][0] += home_won
        team_margin_vs_good[ht][0] += margin
        team_margin_vs_good[ht][1] += 1
    else:
        team_vs_bad[ht][1] += 1
        team_vs_bad[ht][0] += home_won
        team_margin_vs_bad[ht][0] += margin
        team_margin_vs_bad[ht][1] += 1

    # Away team played against home team
    if row['h_win_pct'] >= 0.5:  # home team is good
        team_vs_good[at][1] += 1
        team_vs_good[at][0] += (1 - home_won)
        team_margin_vs_good[at][0] += (-margin)
        team_margin_vs_good[at][1] += 1
    else:
        team_vs_bad[at][1] += 1
        team_vs_bad[at][0] += (1 - home_won)
        team_margin_vs_bad[at][0] += (-margin)
        team_margin_vs_bad[at][1] += 1

df['h_win_rate_vs_good'] = h_wr_good
df['h_win_rate_vs_bad'] = h_wr_bad
df['a_win_rate_vs_good'] = a_wr_good
df['a_win_rate_vs_bad'] = a_wr_bad
df['h_margin_vs_good'] = h_margin_good
df['h_margin_vs_bad'] = h_margin_bad
df['a_margin_vs_good'] = a_margin_good
df['a_margin_vs_bad'] = a_margin_bad

# Diffs
df['diff_wr_vs_good'] = df['h_win_rate_vs_good'] - df['a_win_rate_vs_good']
df['diff_wr_vs_bad'] = df['h_win_rate_vs_bad'] - df['a_win_rate_vs_bad']
df['diff_margin_vs_good'] = df['h_margin_vs_good'] - df['a_margin_vs_good']
df['diff_margin_vs_bad'] = df['h_margin_vs_bad'] - df['a_margin_vs_bad']

print(f"  ✅ Win rate vs good/bad teams added (12 features)")

# ── 3. Form momentum — L10 net vs season net ─────────────────────────────
# Positive = team is trending UP (playing better recently than season avg)
# Negative = team is trending DOWN
df['h_form_momentum'] = df['h_l10_net'] - df['h_net_rating_proxy']
df['a_form_momentum'] = df['a_l10_net'] - df['a_net_rating_proxy']
df['diff_form_momentum'] = df['h_form_momentum'] - df['a_form_momentum']

# L5 momentum (even more recent)
# L5 net isn't directly in the data but we can approximate from L5 scoring
# h_l5_pct vs h_win_pct shows if last 5 is better/worse than season
df['h_l5_momentum'] = df['h_l5_pct'] - df['h_win_pct']
df['a_l5_momentum'] = df['a_l5_pct'] - df['a_win_pct']
df['diff_l5_momentum'] = df['h_l5_momentum'] - df['a_l5_momentum']

print(f"  ✅ Form momentum features added (6 features)")

# ── 4. Scoring trend — are they scoring more/less recently? ──────────────
df['h_scoring_trend'] = df['h_l10_avg_scored'] - df['h_avg_pts_scored']
df['a_scoring_trend'] = df['a_l10_avg_scored'] - df['a_avg_pts_scored']
df['h_defense_trend'] = df['h_avg_pts_allowed'] - df['h_l10_avg_allowed']  # positive = defense improving
df['a_defense_trend'] = df['a_avg_pts_allowed'] - df['a_l10_avg_allowed']
df['diff_scoring_trend'] = df['h_scoring_trend'] - df['a_scoring_trend']
df['diff_defense_trend'] = df['h_defense_trend'] - df['a_defense_trend']

print(f"  ✅ Scoring/defense trend features added (6 features)")

# ── 5. Blowout tendency ──────────────────────────────────────────────────
# Teams that blow out bad teams but lose close to good teams
df['h_blowout_rate'] = df['h_blowout_wins'] / df['h_games_played'].clip(lower=1)
df['a_blowout_rate'] = df['a_blowout_wins'] / df['a_games_played'].clip(lower=1)
df['h_blowout_loss_rate'] = df['h_blowout_losses'] / df['h_games_played'].clip(lower=1)
df['a_blowout_loss_rate'] = df['a_blowout_losses'] / df['a_games_played'].clip(lower=1)
df['diff_blowout_rate'] = df['h_blowout_rate'] - df['a_blowout_rate']

print(f"  ✅ Blowout tendency features added (5 features)")

# ── 6. Home/away split strength ──────────────────────────────────────────
# How much better/worse is this team at home vs away?
df['h_home_away_split'] = df['h_home_win_pct'] - df['h_away_win_pct']
df['a_home_away_split'] = df['a_home_win_pct'] - df['a_away_win_pct']
# Home team playing AT home (their strong suit?) vs away team on the road
df['h_venue_edge'] = df['h_home_win_pct'] - df['a_away_win_pct']

print(f"  ✅ Home/away split features added (3 features)")

new_feature_count = len(df.columns) - 85  # original was 85
print(f"\n  Total new features: {new_feature_count}")
print(f"  Total columns now: {len(df.columns)}")


# ════════════════════════════════════════════════════════════════════════════
# MODEL TRAINING
# ════════════════════════════════════════════════════════════════════════════

# ── Feature Selection ────────────────────────────────────────────────────
DROP_COLS = [
    'game_id', 'date', 'home_team', 'away_team', 'matchup',
    # Targets
    'home_won', 'home_score', 'away_score', 'margin', 'total_points',
    'home_covered', 'went_over',
    # Box score features (leakage)
    'h_total_blocks', 'a_total_blocks', 'diff_blocks',
    'h_avg_height_inches', 'a_avg_height_inches', 'diff_avg_height',
    'h_max_height_inches', 'a_max_height_inches',
    'h_tallest_shortest_gap', 'a_tallest_shortest_gap',
    'h_avg_age', 'a_avg_age', 'diff_avg_age',
    'h_roster_size_played', 'a_roster_size_played',
]

# Also drop any Vegas columns if they exist
DROP_COLS += [c for c in df.columns if 'vegas' in c.lower() or 'implied' in c.lower()]

feature_cols = [c for c in df.columns if c not in DROP_COLS]
print(f"\n{'─' * 70}")
print(f"  MODEL TRAINING — {len(feature_cols)} features")
print(f"{'─' * 70}")

X = df[feature_cols].fillna(0)
y_win = df['home_won']
y_margin = df['margin']

# ── Time-Based Split ─────────────────────────────────────────────────────
df_sorted = df.sort_values('date').reset_index(drop=True)
X_sorted = df_sorted[feature_cols].fillna(0)
y_win_sorted = df_sorted['home_won']
y_margin_sorted = df_sorted['margin']

split_80 = int(len(df_sorted) * 0.80)
X_train, X_test = X_sorted[:split_80], X_sorted[split_80:]
y_win_train, y_win_test = y_win_sorted[:split_80], y_win_sorted[split_80:]
y_margin_train, y_margin_test = y_margin_sorted[:split_80], y_margin_sorted[split_80:]

test_df = df_sorted[split_80:].copy()

print(f"  Train: {len(X_train)} games ({df_sorted['date'].iloc[0]} → {df_sorted['date'].iloc[split_80-1]})")
print(f"  Test:  {len(X_test)} games ({df_sorted['date'].iloc[split_80]} → {df_sorted['date'].iloc[-1]})")
print(f"  Train home win rate: {y_win_train.mean():.1%}")
print(f"  Test home win rate:  {y_win_test.mean():.1%}")


# ═══════════════════════════════════════════════════════════════════════════
# MODEL 1: LightGBM Classifier (PRIMARY)
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 1: LightGBM Classifier")
print(f"{'─' * 70}")

lgb_clf = lgb.LGBMClassifier(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.04,
    subsample=0.8,
    colsample_bytree=0.75,
    min_child_samples=10,
    reg_alpha=0.15,
    reg_lambda=1.2,
    random_state=42,
    verbose=-1,
    num_leaves=31,
)
lgb_clf.fit(X_train, y_win_train)

lgb_pred = lgb_clf.predict(X_test)
lgb_prob = lgb_clf.predict_proba(X_test)[:, 1]
lgb_acc = accuracy_score(y_win_test, lgb_pred)

print(f"\n  LightGBM Accuracy: {lgb_acc:.1%}")
print(f"  Baseline (always home): {y_win_test.mean():.1%}")
print(f"  Edge over baseline: {(lgb_acc - y_win_test.mean())*100:+.1f}%")

lgb_importance = pd.DataFrame({
    'feature': feature_cols,
    'importance': lgb_clf.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  TOP 25 FEATURES (LightGBM):")
print(f"  {'Rank':<6}{'Feature':<35}{'Importance':<12}")
print(f"  {'─'*53}")
for i, (_, row) in enumerate(lgb_importance.head(25).iterrows()):
    bar = '█' * int(row['importance'] / lgb_importance['importance'].max() * 30)
    print(f"  {i+1:<6}{row['feature']:<35}{row['importance']:<12}{bar}")


# ═══════════════════════════════════════════════════════════════════════════
# MODEL 2: XGBoost Classifier
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 2: XGBoost Classifier")
print(f"{'─' * 70}")

xgb_clf = xgb.XGBClassifier(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.04,
    subsample=0.8,
    colsample_bytree=0.75,
    min_child_weight=5,
    reg_alpha=0.15,
    reg_lambda=1.2,
    random_state=42,
    eval_metric='logloss',
)
xgb_clf.fit(X_train, y_win_train, eval_set=[(X_test, y_win_test)], verbose=False)

xgb_pred = xgb_clf.predict(X_test)
xgb_prob = xgb_clf.predict_proba(X_test)[:, 1]
xgb_acc = accuracy_score(y_win_test, xgb_pred)

print(f"\n  XGBoost Accuracy: {xgb_acc:.1%}")
print(f"  Edge over baseline: {(xgb_acc - y_win_test.mean())*100:+.1f}%")

xgb_importance = pd.DataFrame({
    'feature': feature_cols,
    'importance': xgb_clf.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  TOP 25 FEATURES (XGBoost):")
print(f"  {'Rank':<6}{'Feature':<35}{'Importance':<12}")
print(f"  {'─'*53}")
for i, (_, row) in enumerate(xgb_importance.head(25).iterrows()):
    bar = '█' * int(row['importance'] * 200)
    print(f"  {i+1:<6}{row['feature']:<35}{row['importance']:.4f}  {bar}")


# ═══════════════════════════════════════════════════════════════════════════
# MODEL 3: XGBoost Margin Regressor
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  MODEL 3: XGBoost Margin Regressor")
print(f"{'─' * 70}")

xgb_reg = xgb.XGBRegressor(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.04,
    subsample=0.8,
    colsample_bytree=0.75,
    min_child_weight=5,
    reg_alpha=0.15,
    reg_lambda=1.2,
    random_state=42,
)
xgb_reg.fit(X_train, y_margin_train, eval_set=[(X_test, y_margin_test)], verbose=False)

margin_pred = xgb_reg.predict(X_test)
margin_mae = mean_absolute_error(y_margin_test, margin_pred)
direction_correct = ((margin_pred > 0) == (y_margin_test > 0)).mean()

print(f"\n  MAE: {margin_mae:.1f} points")
print(f"  Directional Accuracy: {direction_correct:.1%}")


# ═══════════════════════════════════════════════════════════════════════════
# CONFIDENCE TIER ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  CONFIDENCE TIER ANALYSIS")
print(f"{'─' * 70}")

test_results = pd.DataFrame({
    'matchup': test_df['matchup'].values,
    'actual': y_win_test.values,
    'lgb_prob': lgb_prob,
    'lgb_pred': lgb_pred,
    'xgb_prob': xgb_prob,
    'xgb_pred': xgb_pred,
    'margin_pred': margin_pred,
    'actual_margin': y_margin_test.values,
})

# Use ensemble average
test_results['ensemble_prob'] = (test_results['lgb_prob'] + test_results['xgb_prob']) / 2
test_results['ensemble_pred'] = (test_results['ensemble_prob'] >= 0.5).astype(int)
test_results['confidence'] = (test_results['ensemble_prob'] - 0.5).abs()

ensemble_acc = accuracy_score(test_results['actual'], test_results['ensemble_pred'])
print(f"\n  Ensemble Accuracy: {ensemble_acc:.1%}")

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
        acc = accuracy_score(subset['actual'], subset['ensemble_pred'])
        print(f"  {name:<25}{len(subset):<8}{acc:.1%}        {(acc-0.5)*100:+.1f}%")


# ═══════════════════════════════════════════════════════════════════════════
# NEW FEATURE IMPACT ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  NEW FEATURE IMPACT — Do the new features matter?")
print(f"{'─' * 70}")

new_features = [
    'h_opp_is_good', 'a_opp_is_good', 'h_opp_strength', 'a_opp_strength', 'diff_opp_strength',
    'h_win_rate_vs_good', 'h_win_rate_vs_bad', 'a_win_rate_vs_good', 'a_win_rate_vs_bad',
    'h_margin_vs_good', 'h_margin_vs_bad', 'a_margin_vs_good', 'a_margin_vs_bad',
    'diff_wr_vs_good', 'diff_wr_vs_bad', 'diff_margin_vs_good', 'diff_margin_vs_bad',
    'h_form_momentum', 'a_form_momentum', 'diff_form_momentum',
    'h_l5_momentum', 'a_l5_momentum', 'diff_l5_momentum',
    'h_scoring_trend', 'a_scoring_trend', 'h_defense_trend', 'a_defense_trend',
    'diff_scoring_trend', 'diff_defense_trend',
    'h_blowout_rate', 'a_blowout_rate', 'h_blowout_loss_rate', 'a_blowout_loss_rate', 'diff_blowout_rate',
    'h_home_away_split', 'a_home_away_split', 'h_venue_edge',
]

# Check which new features made the top 30
lgb_top30 = set(lgb_importance.head(30)['feature'].values)
new_in_top30 = [f for f in new_features if f in lgb_top30]

print(f"\n  New features in LGB top 30: {len(new_in_top30)}")
for f in new_in_top30:
    rank = lgb_importance[lgb_importance['feature'] == f].index[0]
    imp = lgb_importance.loc[rank, 'importance']
    actual_rank = list(lgb_importance['feature']).index(f) + 1
    print(f"    #{actual_rank}: {f} (importance: {imp})")


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
baseline = y_win_test.mean()
print(f"\n{'=' * 70}")
print(f"  MODEL COMPARISON SUMMARY")
print(f"{'=' * 70}")

models = [
    ("Always Pick Home (baseline)", baseline),
    ("LightGBM Classifier", lgb_acc),
    ("XGBoost Classifier", xgb_acc),
    ("Ensemble (LGB+XGB avg)", ensemble_acc),
    ("XGBoost Margin (directional)", direction_correct),
]

print(f"\n  {'Model':<38}{'Accuracy':<12}{'vs Baseline'}")
print(f"  {'─'*62}")
for name, acc in models:
    edge = f"{(acc - baseline)*100:+.1f}%" if name != "Always Pick Home (baseline)" else "—"
    print(f"  {name:<38}{acc:.1%}        {edge}")

best = max(models[1:], key=lambda x: x[1])
print(f"\n  BEST: {best[0]} at {best[1]:.1%}")


# ═══════════════════════════════════════════════════════════════════════════
# EXPORT
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 70}")
print(f"  EXPORTING MODELS")
print(f"{'─' * 70}")

# Save models
joblib.dump(lgb_clf, '/home/claude/otj_lgb_classifier.pkl')
joblib.dump(xgb_reg, '/home/claude/otj_xgb_regressor.pkl')
print(f"  ✅ otj_lgb_classifier.pkl saved")
print(f"  ✅ otj_xgb_regressor.pkl saved")

# Save feature list
with open('/home/claude/otj_model_features.json', 'w') as f:
    json.dump(feature_cols, f, indent=2)
print(f"  ✅ otj_model_features.json saved ({len(feature_cols)} features)")

# Save enhanced training data
df.to_csv('/home/claude/training_data_v2.csv', index=False)
print(f"  ✅ training_data_v2.csv saved ({len(df)} games, {len(df.columns)} columns)")

print(f"\n{'=' * 70}")
print(f"  RETRAIN COMPLETE")
print(f"{'=' * 70}\n")
