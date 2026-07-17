import { useState, useEffect } from 'react';
import { useSlate } from '../../hooks/useSlate';
import DateNav from '../common/DateNav';
import { Pill } from '../common/Pill';
import { LoginModal } from '../common/LoginModal';
import { supabase } from '../../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

// 2025 bullpen ERA by team — used as fallback when current IP < 5 (Opening Week)
// Source: 2025 final season stats
const PRIOR_BULLPEN_ERA = {
  LAD: { era: 3.21, whip: 1.14 }, ATL: { era: 3.54, whip: 1.18 },
  NYY: { era: 3.61, whip: 1.19 }, MIL: { era: 3.67, whip: 1.21 },
  HOU: { era: 3.72, whip: 1.22 }, CLE: { era: 3.74, whip: 1.23 },
  SD:  { era: 3.81, whip: 1.24 }, BAL: { era: 3.85, whip: 1.25 },
  PHI: { era: 3.91, whip: 1.26 }, SF:  { era: 3.94, whip: 1.27 },
  SEA: { era: 3.97, whip: 1.28 }, BOS: { era: 4.02, whip: 1.29 },
  MIN: { era: 4.05, whip: 1.30 }, STL: { era: 4.08, whip: 1.30 },
  NYM: { era: 4.11, whip: 1.31 }, DET: { era: 4.14, whip: 1.31 },
  AZ:  { era: 4.17, whip: 1.32 }, TOR: { era: 4.21, whip: 1.33 },
  TEX: { era: 4.24, whip: 1.33 }, KC:  { era: 4.28, whip: 1.34 },
  PIT: { era: 4.31, whip: 1.35 }, CIN: { era: 4.35, whip: 1.35 },
  TB:  { era: 4.38, whip: 1.36 }, MIA: { era: 4.42, whip: 1.37 },
  CHC: { era: 4.45, whip: 1.37 }, LAA: { era: 4.51, whip: 1.38 },
  CWS: { era: 4.54, whip: 1.39 }, WSH: { era: 4.58, whip: 1.40 },
  COL: { era: 5.12, whip: 1.52 }, ATH: { era: 4.61, whip: 1.40 },
};

const CONF_COLOR = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#6b7280" };
const FATIGUE_COLOR = { HIGH: "#ef4444", MODERATE: "#f59e0b", FRESH: "#22c55e" };

// MLB Divisions — for DIV badge
const MLB_DIVISIONS = {
  "AL East": ["NYY", "BOS", "TOR", "BAL", "TB"],
  "AL Central": ["CLE", "DET", "MIN", "CWS", "KC"],
  "AL West": ["HOU", "SEA", "TEX", "LAA", "ATH", "OAK"],
  "NL East": ["ATL", "NYM", "PHI", "MIA", "WSH"],
  "NL Central": ["CHC", "STL", "MIL", "PIT", "CIN"],
  "NL West": ["LAD", "SD", "SF", "COL", "AZ"],
};
const TEAM_DIV = {};
Object.entries(MLB_DIVISIONS).forEach(([div, teams]) => teams.forEach(t => TEAM_DIV[t] = div));
const isDivisional = (away, home) => TEAM_DIV[away] && TEAM_DIV[away] === TEAM_DIV[home];

// Team slugs for MLB.com links
const TEAM_SLUG = {
  AZ: "d-backs", ATL: "braves", BAL: "orioles", BOS: "red-sox",
  CHC: "cubs", CWS: "white-sox", CIN: "reds", CLE: "guardians",
  COL: "rockies", DET: "tigers", HOU: "astros", KC: "royals",
  LAA: "angels", LAD: "dodgers", MIA: "marlins", MIL: "brewers",
  MIN: "twins", NYM: "mets", NYY: "yankees", ATH: "athletics",
  OAK: "athletics", PHI: "phillies", PIT: "pirates", SD: "padres",
  SF: "giants", SEA: "mariners", STL: "cardinals", TB: "rays",
  TEX: "rangers", TOR: "blue-jays", WSH: "nationals",
};
const probablePitchersUrl = (team) => `https://www.mlb.com/${TEAM_SLUG[team] || team.toLowerCase()}/roster/probable-pitchers`;
const playerUrl = (name, id) => {
  if (id) return `https://www.mlb.com/player/${id}`;
  // Fallback: ESPN search by name
  return `https://www.espn.com/mlb/players?search=${encodeURIComponent(name)}`;
};
const FATIGUE_ICON  = { HIGH: "🔴", MODERATE: "🟡", FRESH: "🟢" };

function fmt(val, dec = 2) {
  if (val == null) return "—";
  return parseFloat(val).toFixed(dec);
}

function StatBox({ label, value, highlight, priorValue, priorLabel }) {
  const isSmall    = value == null;
  const displayVal = isSmall && priorValue != null ? priorValue : (value ?? "—");
  const color      = isSmall && priorValue != null ? "#6b7280" : highlight ? "#ef4444" : "#e2e8f0";
  return (
    <div style={{
      background: highlight && !isSmall ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${highlight && !isSmall ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center"
    }}>
      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{displayVal}</div>
      {isSmall && priorValue != null && (
        <div style={{ fontSize: 8, color: "#374151", marginTop: 1 }}>{priorLabel || "'25"}</div>
      )}
    </div>
  );
}

function FatigueBar({ score }) {
  if (score == null) return null;
  const pct = Math.min(score, 100);
  const color = pct >= 60 ? "#ef4444" : pct >= 30 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
}

function SignalRow({ signal }) {
  const color = signal.strength === "STRONG" ? "#22c55e" : signal.strength === "MODERATE" ? "#f59e0b" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <span style={{
        fontSize: 9, padding: "2px 6px", borderRadius: 3, flexShrink: 0, marginTop: 1,
        background: `${color}15`, color, fontWeight: 700, minWidth: 54, textAlign: "center"
      }}>{signal.strength}</span>
      <span style={{ fontSize: 11, color: "#94a3b8", flex: 1, lineHeight: 1.5 }}>{signal.detail}</span>
      <span style={{ fontSize: 10, color: "#60a5fa", flexShrink: 0, fontWeight: 600 }}>→ {signal.favors}</span>
    </div>
  );
}

function RelieverTable({ relievers, team }) {
  if (!relievers?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", textTransform: "uppercase", marginBottom: 6 }}>{team} Pen</div>
      {relievers.slice(0, 5).map((r, i) => (
        <div key={i} style={{ padding: "4px 0", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          {/* Row 1: name */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>{FATIGUE_ICON[r.fatigue] || "⚪"}</span>
            <a href={playerUrl(r.name, r.id)}
               target="_blank" rel="noopener noreferrer"
               style={{ color: "#e2e8f0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: "none", borderBottom: "1px dotted #4a5568" }}>
              {r.name}<span style={{ color: "#4a5568" }}> ({r.hand})</span>
            </a>
          </div>
          {/* Row 2: stats — wraps cleanly on mobile */}
          <div style={{ display: "flex", gap: 10, marginLeft: 20, marginTop: 2, flexWrap: "wrap", fontSize: 10, color: "#6b7280" }}>
            <span>{r.pitches_last_3d}p/3d</span>
            <span style={{ color: r.days_rest === 0 ? "#ef4444" : "#6b7280" }}>{r.days_rest}d rest</span>
            {r.display_era != null ? (
              <span style={{ color: r.display_era > 4.5 ? "#ef4444" : r.display_era < 3.0 ? "#22c55e" : "#94a3b8" }}
                    title={
                      r.display_era_source === "7d" ? "Last 7 days only — small sample"
                      : r.display_era_source && r.display_era_source !== String(new Date().getFullYear())
                        ? `${r.display_era_source} season ERA`
                        : "Season ERA"
                    }>
                {fmt(r.display_era)} ERA
                {/* Only tag when it ISN'T the current season — an untagged
                    number means season-to-date, which is the default read. */}
                {r.display_era_source && r.display_era_source !== String(new Date().getFullYear()) && (
                  <span style={{ fontSize: 9, color: "#4a5568", marginLeft: 2 }}>
                    {r.display_era_source === "7d" ? "7d" : `'${r.display_era_source.slice(2)}`}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ color: "#374151" }}>— ERA</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MLB Game Card ─────────────────────────────────────────────────────────────

// ── Betting ───────────────────────────────────────────────────────────────────
// Ported from NBAGameCard's BettingPanel. The place_bet / cancel_bet RPCs are
// sport-agnostic (no p_sport arg), so MLB reuses them as-is. Payouts are settled
// by resolve_mlb_picks.py, which grades game_picks against MLB final scores.

function isGameLocked(game_time) {
  if (!game_time) return false;
  const firstPitch = new Date(game_time);
  const fiveMinBefore = new Date(firstPitch.getTime() - 5 * 60 * 1000);
  return new Date() >= fiveMinBefore;
}

function formatOdds(n) {
  if (n == null) return '—';
  const num = parseInt(n);
  return num > 0 ? `+${num}` : `${num}`;
}

function formatBucks(n) {
  if (n == null) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

// game_time is a raw ISO timestamp from the MLB API (e.g. 2026-07-08T23:40:00Z).
// Render it in the viewer's own timezone — a first pitch means nothing in UTC.
function formatStartTime(game_time) {
  if (!game_time || game_time === "TBD") return null;
  const d = new Date(game_time);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MLBBettingPanel({ game, user, profile, userPicks = [], onPickPlaced, onCancelPick }) {
  const locked = isGameLocked(game.game_time);
  const FONT = "'JetBrains Mono','SF Mono',monospace";

  const [pickType, setPickType] = useState('moneyline');
  const [pickSide, setPickSide] = useState(null);
  const [wager, setWager]       = useState(100);
  const [placing, setPlacing]   = useState(false);
  const [error, setError]       = useState('');

  const bankroll = profile?.bankroll || 0;
  const maxWager = Math.floor(bankroll * 0.9);   // matches place_bet's 90% rule

  function getLockedOdds() {
    if (pickType === 'moneyline') {
      return pickSide === 'home' ? parseInt(game.ml_home || 0) : parseInt(game.ml_away || 0);
    }
    if (pickType === 'runline') {
      return pickSide === 'home' ? (game.spread_home_odds || -110) : (game.spread_away_odds || -110);
    }
    return -110; // over/under default juice
  }

  function getLockedLine() {
    if (pickType === 'runline') {
      const sp = pickSide === 'home' ? game.spread_home : game.spread_away;
      if (sp != null) return parseFloat(String(sp).replace(/[^0-9.\-+]/g, ''));
      return pickSide === 'home' ? -1.5 : 1.5;   // MLB run line is ±1.5
    }
    if (pickType === 'over' || pickType === 'under') {
      return game.total != null ? parseFloat(String(game.total).replace(/[^0-9.]/g, '')) : null;
    }
    return null;
  }

  function getPickedTeam() {
    if (pickType === 'moneyline' || pickType === 'runline') {
      return pickSide === 'home' ? game.home_team : game.away_team;
    }
    return pickType === 'over' ? `Over ${getLockedLine()}` : `Under ${getLockedLine()}`;
  }

  function calcPotentialPayout() {
    const odds = getLockedOdds();
    if (!odds || !wager) return 0;
    if (odds > 0) return Math.round(wager + (wager * odds / 100));
    if (odds < 0) return Math.round(wager + (wager * 100 / Math.abs(odds)));
    return wager * 2;
  }

  async function placeBet() {
    if (!user || !pickSide || placing) return;
    setPlacing(true); setError('');
    const { data, error: rpcErr } = await supabase.rpc('place_bet', {
      p_user_id: user.id,
      p_game_id: String(game.id || game.game_id || game.matchup),
      p_slate_date: game.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
      p_matchup: game.matchup,
      p_picked_team: getPickedTeam(),
      p_game_time: game.game_time || null,
      // The resolver understands 'spread' — send that for the run line.
      p_pick_type: pickType === 'runline' ? 'spread' : pickType,
      p_pick_side: pickSide,
      p_locked_odds: getLockedOdds(),
      p_locked_line: getLockedLine(),
      p_wager: wager,
    });
    if (rpcErr) { setError(rpcErr.message); setPlacing(false); return; }
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result?.error) { setError(result.error); setPlacing(false); return; }
    const { data: pickData } = await supabase.from('game_picks').select('*').eq('id', result.pick_id).single();
    if (pickData) onPickPlaced(pickData, result.bankroll);
    setPickSide(null);
    setPlacing(false);
  }

  if (!user) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Sign in to place your pick
    </div>
  );

  if (locked && userPicks.length === 0) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Picks locked — first pitch
    </div>
  );

  const hasML = game.ml_home != null && game.ml_away != null;
  const hasTotal = game.total != null;
  const types = [
    hasML && { id: 'moneyline', label: 'ML' },
    hasML && { id: 'runline', label: 'RUN LINE' },
    hasTotal && { id: 'over', label: `O ${getLockedLine() ?? ''}` },
    hasTotal && { id: 'under', label: `U ${getLockedLine() ?? ''}` },
  ].filter(Boolean);

  const isTotalPick = pickType === 'over' || pickType === 'under';

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
      {/* Existing bets on this game */}
      {userPicks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {userPicks.map(pick => {
            const won = pick.result === 'win' || pick.result === 'W';
            const lost = pick.result === 'loss' || pick.result === 'L';
            const pending = !won && !lost;
            const typeLabel = pick.pick_type === 'moneyline' ? 'ML'
              : pick.pick_type === 'spread' ? `${pick.locked_line > 0 ? '+' : ''}${pick.locked_line}`
              : pick.pick_type === 'over' ? `O ${pick.locked_line}`
              : pick.pick_type === 'under' ? `U ${pick.locked_line}` : 'ML';
            return (
              <div key={pick.id} style={{
                padding: "10px 14px", borderRadius: 8, fontFamily: FONT,
                background: pending ? "rgba(59,130,246,0.06)" : won ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${pending ? "rgba(59,130,246,0.2)" : won ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pending ? "#60a5fa" : won ? "#22c55e" : "#ef4444" }}>
                    {pending ? '⏳' : won ? '✅' : '❌'} {pick.picked_team} {typeLabel} {formatOdds(pick.locked_odds)}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                    {formatBucks(pick.wager)} wagered
                    {!pending && pick.net != null && (
                      <span style={{ color: won ? "#22c55e" : "#ef4444", marginLeft: 6 }}>
                        {pick.net > 0 ? '+' : ''}{formatBucks(pick.net)}
                      </span>
                    )}
                  </div>
                </div>
                {pending && !locked && (
                  <button onClick={() => onCancelPick(pick.id)} style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                    color: "#6b7280", borderRadius: 6, padding: "4px 8px",
                    fontSize: 9, cursor: "pointer", fontFamily: FONT,
                  }}>CANCEL</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!locked && types.length > 0 && (
        <>
          {/* Bet type */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {types.map(t => (
              <button key={t.id}
                onClick={() => { setPickType(t.id); setPickSide(t.id === 'over' || t.id === 'under' ? 'over' : null); }}
                style={{
                  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: FONT, fontSize: 10,
                  background: pickType === t.id ? "rgba(59,130,246,0.15)" : "transparent",
                  border: `1px solid ${pickType === t.id ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: pickType === t.id ? "#60a5fa" : "#6b7280",
                }}>{t.label}</button>
            ))}
          </div>

          {/* Side */}
          {!isTotalPick && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {['away', 'home'].map(side => {
                const team = side === 'home' ? game.home_team : game.away_team;
                const odds = pickType === 'moneyline'
                  ? (side === 'home' ? game.ml_home : game.ml_away)
                  : (side === 'home' ? (game.spread_home_odds || -110) : (game.spread_away_odds || -110));
                const rl = pickType === 'runline' ? (side === 'home' ? -1.5 : +1.5) : null;
                const sel = pickSide === side;
                return (
                  <button key={side} onClick={() => setPickSide(side)} style={{
                    flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer", fontFamily: FONT,
                    background: sel ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${sel ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.06)"}`,
                    color: sel ? "#60a5fa" : "#9ca3af",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {team}{rl != null ? ` ${rl > 0 ? '+' : ''}${rl}` : ''}
                    </div>
                    <div style={{ fontSize: 10, color: sel ? "#60a5fa" : "#4a5568", marginTop: 2 }}>{formatOdds(odds)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Wager */}
          {pickSide && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <input type="range" min={10} max={Math.max(10, maxWager)} step={10}
                  value={Math.min(wager, Math.max(10, maxWager))}
                  onChange={e => setWager(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#3b82f6" }} />
                <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#60a5fa", minWidth: 70, textAlign: "right" }}>
                  {formatBucks(wager)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 10, color: "#4a5568", marginBottom: 10 }}>
                <span>Bankroll {formatBucks(bankroll)} · max {formatBucks(maxWager)}</span>
                <span style={{ color: "#22c55e" }}>To win {formatBucks(calcPotentialPayout())}</span>
              </div>

              {error && (
                <div style={{ fontFamily: FONT, fontSize: 10, color: "#ef4444", marginBottom: 8 }}>{error}</div>
              )}

              <button onClick={placeBet} disabled={placing || wager > maxWager || wager < 10}
                style={{
                  width: "100%", padding: "12px", borderRadius: 8, border: "none",
                  cursor: placing || wager > maxWager ? "not-allowed" : "pointer",
                  background: placing || wager > maxWager ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#3b82f6,#2563eb)",
                  color: placing || wager > maxWager ? "#4a5568" : "#fff",
                  fontFamily: FONT, fontSize: 12, fontWeight: 800,
                }}>
                {placing ? "PLACING…" : `PLACE ${formatBucks(wager)} ON ${getPickedTeam()}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MLBGameCard({ game, isExpanded, onToggle, isFree, user, profile }) {
  const analysis = game.analysis || {};
  const ab = analysis.away_bullpen || {};
  const hb = analysis.home_bullpen || {};
  const apyth = analysis.away_pythagorean || {};
  const hpyth = analysis.home_pythagorean || {};
  const park = analysis.park_factor || {};
  const realFeel = analysis.real_feel || {};
  const weather = analysis.weather || {};

  const lean = game.lean;
  const conf = game.confidence || "LOW";
  const signals = game.signals || [];
  const confColor = CONF_COLOR[conf] || "#6b7280";

  // ML model data (from predict_mlb_today.py → game.scores)
  const scores = game.scores || {};
  const isMLPrediction = scores.model_version === "v5_ensemble" || !!scores.base_model_probs;
  const fullHomeProb = scores.full_ml_home_prob;
  const fullAwayProb = scores.full_ml_away_prob;
  const f5HomeProb = scores.f5_ml_home_prob;
  const f5AwayProb = scores.f5_ml_away_prob;
  const runTotalLean = scores.run_total_lean;
  const kellyUnits = scores.kelly_units || 0;
  const modelEdge = scores.model_edge;

  const leanProb = lean === "HOME" ? fullHomeProb : lean === "AWAY" ? fullAwayProb : null;
  const leanTeam = lean === "HOME" ? game.home_team : lean === "AWAY" ? game.away_team : null;
  const f5Prob = f5HomeProb != null ? Math.max(f5HomeProb, f5AwayProb) : null;
  const f5Team = f5HomeProb != null ? (f5HomeProb >= f5AwayProb ? game.home_team : game.away_team) : null;

  const hasOdds = game.ml_home != null || game.ml_away != null;

  // ── User bets for this game ──
  const [userPicks, setUserPicks] = useState([]);
  const betGameId = game.id || game.game_id || game.matchup;

  useEffect(() => {
    if (!user || !betGameId) return;
    let alive = true;
    supabase
      .from('game_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('game_id', String(betGameId))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (alive && data) setUserPicks(data); });
    return () => { alive = false; };
  }, [user, betGameId]);

  function handlePickPlaced(pick, newBankroll) {
    setUserPicks(prev => [pick, ...prev]);
    if (profile) profile.bankroll = newBankroll;
  }

  async function handleCancelPick(pickId) {
    const { data } = await supabase.rpc('cancel_bet', { p_user_id: user.id, p_pick_id: pickId });
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result?.success) {
      setUserPicks(prev => prev.filter(p => p.id !== pickId));
      if (profile) profile.bankroll = result.bankroll;
    }
  }
  const awayML = game.ml_away != null ? (game.ml_away > 0 ? `+${game.ml_away}` : `${game.ml_away}`) : null;
  const homeML = game.ml_home != null ? (game.ml_home > 0 ? `+${game.ml_home}` : `${game.ml_home}`) : null;

  const parkLabel = park.label || "NEUTRAL";
  const parkColor = parkLabel === "HITTER_FRIENDLY" ? "#f59e0b"
                  : parkLabel === "PITCHER_FRIENDLY" ? "#22c55e"
                  : "#6b7280";

  const locked = !user && !isFree;

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${lean ? `${confColor}30` : "rgba(255,255,255,0.05)"}`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: lean && conf === "HIGH" ? `0 0 20px ${confColor}10` : "none",
      transition: "border-color 0.2s"
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Row 1: matchup + pills (left) + lean badge + arrow (right) */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>

            {/* Left: matchup + venue + pills */}
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                  {game.away_team} <span style={{ color: "#374151" }}>@</span> {game.home_team}
                </span>
                {park.factor && (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${parkColor}15`, color: parkColor, fontWeight: 600 }}>
                    PF {park.factor}
                  </span>
                )}
                {game.is_divisional || isDivisional(game.away_team, game.home_team) ? (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(245,158,11,0.12)", color: "#f59e0b", fontWeight: 700 }}>
                    DIV
                  </span>
                ) : null}
                {game.series_game && game.series_length && (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontWeight: 600 }}>
                    GM {game.series_game}/{game.series_length}
                  </span>
                )}
                {realFeel.score != null && (
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 600,
                    background: realFeel.score >= 70 ? "rgba(239,68,68,0.12)"
                              : realFeel.score >= 50 ? "rgba(245,158,11,0.12)"
                              : realFeel.score >= 35 ? "rgba(107,114,128,0.12)"
                              : "rgba(96,165,250,0.12)",
                    color: realFeel.score >= 70 ? "#ef4444"
                         : realFeel.score >= 50 ? "#f59e0b"
                         : realFeel.score >= 35 ? "#6b7280"
                         : "#60a5fa",
                  }}>
                    🌡️ {realFeel.score} {realFeel.label || ""}
                  </span>
                )}
                {formatStartTime(game.game_time) && (
                  <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 600 }}>
                    🕐 {formatStartTime(game.game_time)}
                  </span>
                )}
                {game.status && (
                  <span style={{ fontSize: 9, color: "#4a5568" }}>{game.status}</span>
                )}
              </div>
              {(game.venue || game.series_record || game.series_game) && (
                <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>
                  {game.venue}
                  {game.series_game && game.series_length && (
                    <span style={{ color: "#6b7280", marginLeft: 8 }}>
                      · Game {game.series_game} of {game.series_length}
                    </span>
                  )}
                  {game.series_record && (
                    <span style={{ color: "#6b7280", marginLeft: 8 }}>
                      · {game.series_record}
                    </span>
                  )}
                  {Array.isArray(game.series_games) && game.series_games.length > 0 && (
                    <span style={{ color: "#6b7280", marginLeft: 8 }}>
                      · {game.series_games.map(r => `${r.w} ${r.score}`).join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: lean badge + arrow (stays compact, never overflows) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {lean ? (
                <div style={{
                  padding: "5px 12px", borderRadius: 6,
                  background: `${confColor}15`, border: `1px solid ${confColor}30`,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {isMLPrediction && (
                    <span title="ML Ensemble Model" style={{ fontSize: 10 }}>🤖</span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 800, color: confColor }}>
                    {leanTeam || lean}
                  </span>
                  {leanProb != null ? (
                    <span style={{ fontSize: 11, color: confColor, fontWeight: 700 }}>
                      {(leanProb * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, color: confColor, opacity: 0.7 }}>{conf}</span>
                  )}
                  {kellyUnits > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#22c55e",
                      padding: "1px 5px", borderRadius: 3,
                      background: "rgba(34,197,94,0.12)",
                    }} title="Quarter Kelly recommended bet size">
                      {kellyUnits}u
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 11, color: "#374151" }}>No lean</span>
              )}
              <span style={{ fontSize: 12, color: "#374151" }}>{isExpanded ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* Row 2: starters — always clickable */}
          {(analysis.away_starter?.name || game.away_starter) && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              <a href={analysis.away_starter?.url || playerUrl(analysis.away_starter?.name || game.away_starter, analysis.away_starter?.id)}
                 target="_blank" rel="noopener noreferrer"
                 style={{ color: "#94a3b8", fontWeight: 600, textDecoration: "none", borderBottom: "1px dotted #4a5568" }}>
                {analysis.away_starter?.name || game.away_starter}
              </a>
              {analysis.away_starter?.era != null && (
                <span style={{ fontSize: 10, color: analysis.away_starter.era < 3.0 ? "#22c55e" : analysis.away_starter.era > 4.5 ? "#ef4444" : "#6b7280", marginLeft: 4 }}>
                  ({analysis.away_starter.era} ERA)
                </span>
              )}
              <span style={{ color: "#374151", margin: "0 6px" }}>vs</span>
              <a href={analysis.home_starter?.url || playerUrl(analysis.home_starter?.name || game.home_starter, analysis.home_starter?.id)}
                 target="_blank" rel="noopener noreferrer"
                 style={{ color: "#94a3b8", fontWeight: 600, textDecoration: "none", borderBottom: "1px dotted #4a5568" }}>
                {analysis.home_starter?.name || game.home_starter}
              </a>
              {analysis.home_starter?.era != null && (
                <span style={{ fontSize: 10, color: analysis.home_starter.era < 3.0 ? "#22c55e" : analysis.home_starter.era > 4.5 ? "#ef4444" : "#6b7280", marginLeft: 4 }}>
                  ({analysis.home_starter.era} ERA)
                </span>
              )}
              <span style={{ color: "#374151", margin: "0 8px" }}>·</span>
              <a href={probablePitchersUrl(game.home_team)} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 9, color: "#4a5568", textDecoration: "none", borderBottom: "1px dotted #374151" }}>
                matchup
              </a>
            </div>
          )}

          {/* Row 3: odds — own line, won't push off screen */}
          {(hasOdds || game.total) && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280", flexWrap: "wrap" }}>
              {hasOdds && (
                <span>{game.away_team} {awayML} / {game.home_team} {homeML}</span>
              )}
              {game.total && (
                <span>O/U {game.total}</span>
              )}
            </div>
          )}
        </div>

        {/* Narrative preview */}
        {game.narrative && !isExpanded && (
          <div style={{ fontSize: 11, color: "#4a5568", marginTop: 8, lineHeight: 1.5, fontStyle: "italic" }}>
            "{game.narrative.slice(0, 120)}{game.narrative.length > 120 ? "…" : ""}"
          </div>
        )}
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>

          {/* Lock gate for non-users */}
          {locked ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 18, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Sign in to see full analysis</div>
              <div style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Bullpen data · Pythagorean · Signals</div>
            </div>
          ) : (
            <>
              {/* Full narrative */}
              {game.narrative && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)", borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#60a5fa", marginBottom: 4, textTransform: "uppercase" }}>OTJ Analysis</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>{game.narrative}</div>
                </div>
              )}

              {/* ML Model Predictions */}
              {isMLPrediction && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }}>🤖</span>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      ML Ensemble Predictions
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                    {/* Full Game ML */}
                    {fullHomeProb != null && (
                      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Full Game ML</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                          {fullHomeProb >= fullAwayProb ? game.home_team : game.away_team}
                          <span style={{ color: confColor, marginLeft: 6 }}>
                            {(Math.max(fullHomeProb, fullAwayProb) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                          {game.away_team} {(fullAwayProb * 100).toFixed(0)}% / {game.home_team} {(fullHomeProb * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                    {/* First 5 Innings ML */}
                    {f5HomeProb != null && (
                      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>First 5 ML</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                          {f5Team}
                          <span style={{ color: "#a855f7", marginLeft: 6 }}>
                            {(f5Prob * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                          {game.away_team} {(f5AwayProb * 100).toFixed(0)}% / {game.home_team} {(f5HomeProb * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                    {/* Run Total Lean */}
                    {runTotalLean && (
                      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Run Total</div>
                        <div style={{
                          fontSize: 13, fontWeight: 700,
                          color: runTotalLean === "OVER" ? "#f59e0b" : runTotalLean === "UNDER" ? "#60a5fa" : "#94a3b8"
                        }}>
                          {runTotalLean}
                        </div>
                        <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                          park · arsenal · weather
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Optional: base model agreement */}
                  {scores.base_model_probs && (
                    <div style={{ marginTop: 10, fontSize: 9, color: "#4a5568", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: "#6b7280" }}>Models:</span>
                      {Object.entries(scores.base_model_probs).map(([m, p]) => (
                        <span key={m}>
                          {m.toUpperCase()} <span style={{ color: "#94a3b8" }}>{(p * 100).toFixed(0)}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Starting Pitchers */}
              {(analysis.away_starter?.name || analysis.home_starter?.name) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
                    Starting Pitchers
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    {[
                      { sp: analysis.away_starter, team: game.away_team, tto: analysis.away_tto },
                      { sp: analysis.home_starter, team: game.home_team, tto: analysis.home_tto },
                    ].map(({ sp, team, tto }, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 4 }}>{team}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
                          <a href={sp?.url || playerUrl(sp?.name || "TBD", sp?.id)}
                             target="_blank" rel="noopener noreferrer"
                             style={{ color: "#e2e8f0", textDecoration: "none", borderBottom: "1px dotted #4a5568" }}>
                            {sp?.name || "TBD"}
                          </a>
                          {sp?.era != null && (
                            <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6,
                              color: sp.era < 3.0 ? "#22c55e" : sp.era > 4.5 ? "#ef4444" : "#94a3b8" }}>
                              {sp.era} ERA
                            </span>
                          )}
                        </div>
                        {tto?.status === "OK" && tto?.degradation != null && (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            TTO degradation:{" "}
                            <span style={{ color: tto.degradation >= 0.08 ? "#ef4444" : tto.degradation >= 0.04 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                              {tto.degradation >= 0 ? "+" : ""}{(tto.degradation * 1000).toFixed(0)}pts BA 3rd time thru
                            </span>
                          </div>
                        )}
                        {tto?.status === "TBD" && (
                          <div style={{ fontSize: 10, color: "#374151" }}>Starter TBD</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bullpen comparison */}
              {(ab.team || hb.team) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>Bullpen Comparison (7d)</div>
                  {((ab.bullpen_ip_7d || 0) < 15 || (hb.bullpen_ip_7d || 0) < 15) && (
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 8, padding: "4px 8px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 4 }}>
                      ⚠ Early season — ERA/WHIP showing 2025 season where current IP &lt;15
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    {[ab, hb].map((bp, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{bp.team || (i === 0 ? game.away_team : game.home_team)}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {(() => {
                            const isSmall = (bp.bullpen_ip_7d || 0) < 15;
                            const teamKey = i === 0 ? game.away_team : game.home_team;
                            const staticFallback = PRIOR_BULLPEN_ERA[teamKey] || {};
                            const priorEra  = bp.prior_era  ?? staticFallback.era;
                            const priorWhip = bp.prior_whip ?? staticFallback.whip;
                            return (<>
                              <StatBox label="ERA"
                                value={!isSmall ? fmt(bp.bullpen_era) : null}
                                highlight={!isSmall && bp.bullpen_era >= 4.5}
                                priorValue={isSmall && priorEra != null ? fmt(priorEra) : null}
                                priorLabel="'25 ERA" />
                              <StatBox label="WHIP"
                                value={!isSmall ? fmt(bp.bullpen_whip) : null}
                                highlight={!isSmall && bp.bullpen_whip >= 1.4}
                                priorValue={isSmall && priorWhip != null ? fmt(priorWhip) : null}
                                priorLabel="'25 WHIP" />
                            </>);
                          })()}
                          <StatBox label="K/9" value={fmt(bp.bullpen_k_per_9 ?? bp.bullpen_k9)} />
                          <StatBox label="IP 7d" value={fmt(bp.bullpen_ip_7d, 1)} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a5568", marginBottom: 3 }}>
                            <span>Fatigue</span>
                            <span>{bp.fatigue_score ?? "—"}/100 · {bp.high_fatigue_count ?? 0} gassed</span>
                          </div>
                          <FatigueBar score={bp.fatigue_score} />
                        </div>
                        <RelieverTable relievers={bp.relievers} team={bp.team} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pythagorean */}
              {(apyth.actual_wpct != null || hpyth.actual_wpct != null) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Pythagorean Record</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, fontSize: 11 }}>
                    {[
                      { r: apyth, team: game.away_team },
                      { r: hpyth, team: game.home_team }
                    ].map(({ r, team }, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 10 }}>
                        <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>{team}</div>
                        <div style={{ color: "#94a3b8", lineHeight: 1.9 }}>
                          <div>W% <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmt(r.actual_wpct, 3)}</span> → Pythag <span style={{ color: "#e2e8f0" }}>{fmt(r.expected_wpct, 3)}</span></div>
                          <div>Luck <span style={{ color: r.luck_factor > 0 ? "#22c55e" : r.luck_factor < 0 ? "#ef4444" : "#94a3b8", fontWeight: 600 }}>{r.luck_factor > 0 ? "+" : ""}{fmt(r.luck_factor, 1)}W</span></div>
                          <div>RD/G <span style={{ color: r.run_diff_per_game > 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{r.run_diff_per_game > 0 ? "+" : ""}{fmt(r.run_diff_per_game, 2)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edge signals */}
              {signals.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Edge Signals</div>
                  {signals.map((s, i) => <SignalRow key={i} signal={s} />)}
                </div>
              )}

              {/* Real Feel HR Conditions */}
              {realFeel.score != null && (
                <div style={{
                  marginTop: 14, padding: "12px 14px", borderRadius: 8,
                  background: realFeel.score >= 70 ? "rgba(239,68,68,0.04)"
                            : realFeel.score >= 50 ? "rgba(245,158,11,0.04)"
                            : "rgba(255,255,255,0.02)",
                  border: `1px solid ${
                    realFeel.score >= 70 ? "rgba(239,68,68,0.12)"
                  : realFeel.score >= 50 ? "rgba(245,158,11,0.12)"
                  : "rgba(255,255,255,0.06)"
                  }`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                      🌡️ Real Feel HR Conditions
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em",
                      color: realFeel.score >= 70 ? "#ef4444"
                           : realFeel.score >= 50 ? "#f59e0b"
                           : realFeel.score >= 35 ? "#94a3b8"
                           : "#60a5fa",
                    }}>
                      {realFeel.score}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>/100</span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 10 }}>
                    <div style={{
                      height: "100%", borderRadius: 3, transition: "width 0.4s ease",
                      width: `${Math.min(realFeel.score, 100)}%`,
                      background: realFeel.score >= 70 ? "#ef4444"
                                : realFeel.score >= 50 ? "#f59e0b"
                                : realFeel.score >= 35 ? "#6b7280"
                                : "#60a5fa",
                    }} />
                  </div>

                  {/* Breakdown */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 2 }}>Park</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{realFeel.park_pts ?? "—"}<span style={{ fontSize: 9, color: "#4a5568" }}>/30</span></div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 2 }}>Wind</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: realFeel.wind_pts < 0 ? "#60a5fa" : "#e2e8f0" }}>
                        {realFeel.wind_pts ?? "—"}<span style={{ fontSize: 9, color: "#4a5568" }}>/30</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 2 }}>Temp</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{realFeel.temp_pts ?? "—"}<span style={{ fontSize: 9, color: "#4a5568" }}>/20</span></div>
                    </div>
                  </div>

                  {/* Weather detail line */}
                  {weather.temp_f != null && (
                    <div style={{ fontSize: 10, color: "#4a5568", marginTop: 8, textAlign: "center" }}>
                      {weather.dome ? "🏟 Dome — controlled environment" : (
                        <>
                          {weather.temp_f}°F · {weather.wind_speed_mph || 0}mph {(weather.wind_direction || "").replace(/_/g, " ")}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Park factor note */}
              {park.factor && (
                <div style={{ marginTop: 10, fontSize: 10, color: parkColor }}>
                  ⚾ {game.home_team} — {parkLabel.replace(/_/g, " ")} (PF {park.factor})
                </div>
              )}

              {/* Betting */}
              <MLBBettingPanel
                game={game}
                user={user}
                profile={profile}
                userPicks={userPicks}
                onPickPlaced={handlePickPlaced}
                onCancelPick={handleCancelPick}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MLBDashboard({ user, profile }) {
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const [selectedDate, setSelectedDate] = useState(today);
  const { slate, loading } = useSlate('mlb', selectedDate);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => { if (user) setShowModal(false); }, [user]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoadTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [loading]);

  // Auto-expand first HIGH confidence game
  useEffect(() => {
    if (!slate?.games?.length) return;
    const firstHigh = slate.games.findIndex(g => g.confidence === "HIGH");
    setExpanded({ [firstHigh >= 0 ? firstHigh : 0]: true });
  }, [slate?.date]);

  const games = (slate?.games || []).slice().sort((a, b) => {
    const timeA = a.game_time || "99:99";
    const timeB = b.game_time || "99:99";
    return timeA.localeCompare(timeB);
  });
  const highConf = games.filter(g => g.confidence === "HIGH");

  const toggle = (i) => {
    if (!user) { setShowModal(true); return; }
    setExpanded(p => ({ ...p, [i]: !p[i] }));
  };

  if (loading && !loadTimedOut) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 24 }}>⚾</div>
      <div style={{ fontSize: 13, color: "#4a5568" }}>Loading today's slate...</div>
      <div style={{ fontSize: 10, color: "#374151" }}>Connecting to pipeline</div>
    </div>
  );

  if (!slate && loadTimedOut) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <div style={{ fontSize: 24 }}>⚾</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Couldn't load today's slate</div>
      <div style={{ fontSize: 11, color: "#4a5568", textAlign: "center", lineHeight: 1.6 }}>
        The MLB pipeline runs at 11AM ET daily.<br />Check back then for today's games.
      </div>
      <button onClick={() => window.location.reload()}
        style={{ fontSize: 12, padding: "10px 24px", borderRadius: 8, cursor: "pointer", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 700 }}>
        🔄 Refresh
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      {showModal && <LoginModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26 }}>⚾</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
            MLB Bullpen Edge Analyzer
          </h1>
          <Pill text="v1.0" color="#22c55e" />
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>
          Bullpen ERA · Fatigue · Park Factors · Pythagorean · Run Diff · L/R Splits
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill text={`📅 ${slate?.date || selectedDate}`} color="#6b7280" />
          <Pill text={`${games.length} games`} color="#6b7280" />
          {highConf.length > 0 && (
            <Pill text={`🔥 ${highConf.length} HIGH confidence`} color="#ef4444" />
          )}
        </div>
      </div>

      {/* Date nav */}
      <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* High confidence callout */}
      {highConf.length > 0 && (
        <div style={{
          background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 16
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6, textTransform: "uppercase" }}>
            🔥 High Confidence Tonight
          </div>
          {highConf.map((g, i) => (
            <div key={i} style={{ fontSize: 13, color: "#fca5a5" }}>
              {g.matchup} → <strong>{g.lean}</strong>
            </div>
          ))}
        </div>
      )}

      {/* No slate yet */}
      {!loading && games.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#374151" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚾</div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>No MLB games found for {selectedDate}</div>
          <div style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>
            Pipeline runs at 11AM ET · Off-days happen
          </div>
        </div>
      )}

      {/* Game cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {games.map((game, i) => (
          <MLBGameCard
            key={game.matchup}
            game={game}
            isExpanded={!!expanded[i]}
            onToggle={() => toggle(i)}
            isFree={i === 0}
            user={user}
            profile={profile}
          />
        ))}
      </div>

      {/* Footer */}
      {games.length > 0 && (
        <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
          <strong style={{ color: "#4a5568" }}>Fatigue:</strong> 0 = fresh, 100 = gassed. &nbsp;
          <strong style={{ color: "#4a5568" }}>Luck:</strong> negative = due for regression UP. &nbsp;
          <strong style={{ color: "#4a5568" }}>Park Factor:</strong> 100 = neutral, &gt;105 = hitter friendly.
          <br />
          <strong style={{ color: "#4a5568" }}>Real Feel:</strong> 0-100 HR conditions (park + wind + temp). &nbsp;
          <span style={{ color: "#ef4444" }}>70+ ELITE</span> · <span style={{ color: "#f59e0b" }}>50-69 WARM</span> · 35-49 NEUTRAL · <span style={{ color: "#60a5fa" }}>&lt;35 COLD</span>
          <br />⚠ One factor among many. Always check line value. Gamble responsibly.
        </div>
      )}
    </div>
  );
}
