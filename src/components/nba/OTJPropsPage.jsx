/**
 * OTJPropsPage.jsx
 *
 * HOW TO WIRE IN:
 * 1. Add route in App.jsx: <Route path="/props" element={<OTJPropsPage user={user} profile={profile} />} />
 *    OR add as a sub-tab inside NBADashboard by importing and rendering conditionally.
 *
 * 2. Add nav tab in App.jsx SportTabs (recommended: between NBA and Record):
 *    <NavLink to="/props">🎯<span className="nav-tab-label"> Props</span></NavLink>
 *
 * 3. Supabase: Your Python pipeline needs to push props to a `props_slates` table.
 *    Shape: { date, props: [...] } — same structure as PROPS_DATA below.
 *    Then replace the MOCK_DATA block with:
 *      const { data } = await supabase.from('props_slates').select('*').eq('date', today).single()
 *
 * 4. The lock/unlock system matches NBADashboard — logged-out users see 1 free prop.
 *
 * PYTHON PIPELINE TODO (nba_edge_analyzer.py / push_to_supabase.py):
 *   - Add a build_props_slate() function that pulls player lines from Tank01 or another props API
 *   - Output shape should match PROPS_DATA.props array items below
 *   - Push to supabase: supabase.table('props_slates').upsert({ date: today, props: props_list })
 */

import { useState } from 'react';
import { usePropsSlate } from '../../hooks/usePropsSlate';

// ─── Mock data — replace with usePropsSlate() Supabase hook ─────────────────
const MOCK_PROPS = {
  date: (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })(),
  props: [
    {
      player: 'Devin Booker', team: 'PHX', pos: 'G', game: 'CHI @ PHX',
      stat: 'Points', line: 27.5,
      season_avg: 27.8, last5_avg: 29.5, last10_avg: 28.2, minutes_avg: 36.0,
      matchup_rating: 'Favorable', opp_pos_rank: 22, opp_team: 'CHI',
      pace_factor: 'Pace Up', b2b: false, opp_b2b: true,
      lean: 'OVER', confidence: 'HIGH', score: 82,
      signals: [
        { text: 'CHI on B2B — defensive intensity drops on the road', tag: 'OVER' },
        { text: 'CHI 22nd in pts allowed to SGs — weak guard defense', tag: 'OVER' },
        { text: 'L5 avg 29.5, trending above line', tag: 'OVER' },
      ],
    },
    {
      player: 'Nikola Jokic', team: 'DEN', pos: 'C', game: 'LAL @ DEN',
      stat: 'Points + Rebounds', line: 38.5,
      season_avg: 39.2, last5_avg: 41.0, last10_avg: 39.8, minutes_avg: 37.5,
      matchup_rating: 'Favorable', opp_pos_rank: 20, opp_team: 'LAL',
      pace_factor: 'Neutral', b2b: false, opp_b2b: false,
      lean: 'OVER', confidence: 'HIGH', score: 78,
      signals: [
        { text: 'LAL missing Luka (out) — depleted frontcourt', tag: 'OVER' },
        { text: 'Season avg 39.2 P+R already above line, L5 at 41.0', tag: 'OVER' },
        { text: 'Home at altitude — Jokic dominates at Ball Arena', tag: 'OVER' },
      ],
    },
    {
      player: 'Giannis Antetokounmpo', team: 'MIL', pos: 'F', game: 'ATL @ MIL',
      stat: 'Points', line: 24.5,
      season_avg: 30.5, last5_avg: 19.0, last10_avg: 22.5, minutes_avg: 25.0,
      matchup_rating: 'Favorable', opp_pos_rank: 22, opp_team: 'ATL',
      pace_factor: 'Neutral', b2b: false, opp_b2b: false,
      lean: 'UNDER', confidence: 'MODERATE', score: 65,
      signals: [
        { text: 'Just returned from injury — scored 19 in 25 min', tag: 'UNDER' },
        { text: 'Minutes limit expected (25-30) as MIL eases him back', tag: 'UNDER' },
        { text: 'Season avg 30.5 irrelevant — not at full load yet', tag: 'UNDER' },
      ],
    },
    {
      player: 'Anthony Edwards', team: 'MIN', pos: 'G', game: 'TOR @ MIN',
      stat: 'Points', line: 26.5,
      season_avg: 27.5, last5_avg: 28.8, last10_avg: 27.2, minutes_avg: 36.2,
      matchup_rating: 'Favorable', opp_pos_rank: 23, opp_team: 'TOR',
      pace_factor: 'Neutral', b2b: false, opp_b2b: false,
      lean: 'OVER', confidence: 'MODERATE', score: 63,
      signals: [
        { text: 'TOR 23rd in pts allowed to SGs', tag: 'OVER' },
        { text: 'Home game, L5 avg 28.8 trending above line', tag: 'OVER' },
        { text: 'Line is close to season avg — thin edge', tag: 'CAUTION' },
      ],
    },
    {
      player: 'Victor Wembanyama', team: 'SAS', pos: 'C', game: 'DET @ SAS',
      stat: 'Blocks', line: 3.5,
      season_avg: 3.8, last5_avg: 4.2, last10_avg: 3.9, minutes_avg: 34.5,
      matchup_rating: 'Favorable', opp_pos_rank: 18, opp_team: 'DET',
      pace_factor: 'Neutral', b2b: false, opp_b2b: false,
      lean: 'OVER', confidence: 'MODERATE', score: 72,
      signals: [
        { text: 'Season avg 3.8 blocks comfortably above 3.5 line', tag: 'OVER' },
        { text: 'L5 avg 4.2 — on a shot-blocking tear', tag: 'OVER' },
        { text: 'DET drives to rim aggressively — feeds Wemby block rate', tag: 'OVER' },
      ],
    },
  ],
};
// ─── End mock data ────────────────────────────────────────────────────────────

const TAG_COLORS  = { OVER: '#22c55e', UNDER: '#ef4444', NEUTRAL: '#6b7280', CAUTION: '#f59e0b', WARN: '#f59e0b' };
const CONF_COLORS = { HIGH: '#ef4444', MODERATE: '#f59e0b', LOW: '#6b7280' };
const CONF_LABELS = { HIGH: '🔥 HIGH', MODERATE: '⚡ MOD', LOW: 'ℹ INFO' };

const Pill = ({ text, color }) => (
  <span style={{
    fontSize: 10, padding: '2px 7px', borderRadius: 3,
    background: `${color}18`, color, fontWeight: 600, whiteSpace: 'nowrap',
  }}>{text}</span>
);

function PropCard({ prop, isExpanded, onToggle, locked, onLockClick, betLog, onLogBet }) {
  const leanColor = prop.lean === 'OVER' ? '#22c55e' : '#ef4444';
  const confColor = CONF_COLORS[prop.confidence];
  const matchId   = `${prop.player}-${prop.stat}`;
  const eb        = betLog.find(b => b.matchup === matchId);
  const diff5     = prop.last5_avg - prop.line;
  const diffSzn   = prop.season_avg - prop.line;

  const handleClick = () => {
    if (locked) { onLockClick(); return; }
    onToggle();
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 12, overflow: 'hidden',
      borderLeft: `3px solid ${confColor}`,
      opacity: locked ? 0.65 : 1,
      transition: 'opacity 0.15s',
    }}>
      <div onClick={handleClick} style={{
        padding: '12px 16px', cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{prop.player}</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{prop.team} · {prop.pos}</span>
            {eb && <Pill text={eb.result === 'W' ? '✓ HIT' : eb.result === 'L' ? '✗ MISS' : 'LOGGED'} color={eb.result === 'W' ? '#22c55e' : eb.result === 'L' ? '#ef4444' : '#6b7280'} />}
          </div>
          <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>
            {prop.game} · vs {prop.opp_team}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {prop.opp_b2b && <Pill text={`${prop.opp_team} B2B`} color="#ef4444" />}
            {prop.b2b    && <Pill text={`${prop.team} B2B`}      color="#ef4444" />}
            {prop.pace_factor === 'Pace Up' && <Pill text="PACE↑" color="#a855f7" />}
            <Pill
              text={`#${prop.opp_pos_rank} DEF`}
              color={prop.opp_pos_rank >= 20 ? '#22c55e' : prop.opp_pos_rank <= 10 ? '#ef4444' : '#6b7280'}
            />
          </div>
          <div style={{ textAlign: 'right', minWidth: 60 }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{prop.stat}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{prop.line}</div>
          </div>
          {locked ? (
            <span style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 4,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
              color: '#ef4444', fontWeight: 700,
            }}>🔒 Sign in</span>
          ) : (
            <div style={{ textAlign: 'right', minWidth: 50 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: leanColor }}>{prop.lean}</div>
              <div style={{ fontSize: 10, color: confColor }}>{CONF_LABELS[prop.confidence]}</div>
            </div>
          )}
          {!locked && (
            <div style={{
              color: '#4a5568', fontSize: 12,
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.2s',
            }}>▾</div>
          )}
        </div>
      </div>

      {isExpanded && !locked && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          {/* Bet log buttons */}
          {!eb && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => onLogBet(matchId, `${prop.player} ${prop.lean} ${prop.line} ${prop.stat}`, prop.confidence, null)}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                  background: `${leanColor}18`, border: `1px solid ${leanColor}40`,
                  color: leanColor, fontFamily: 'inherit',
                }}
              >📝 Log {prop.lean} {prop.line}</button>
            </div>
          )}
          {eb && !eb.result && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button onClick={() => onLogBet(matchId, eb.pick, eb.confidence, 'W')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontFamily: 'inherit', fontWeight: 600 }}>✓ Hit</button>
              <button onClick={() => onLogBet(matchId, eb.pick, eb.confidence, 'L')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontFamily: 'inherit', fontWeight: 600 }}>✗ Miss</button>
            </div>
          )}

          {/* Stats grid */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              ['Line',    prop.line,        '#e2e8f0', ''],
              ['Season',  prop.season_avg,  diffSzn > 0.5 ? '#22c55e' : diffSzn < -0.5 ? '#ef4444' : '#e2e8f0', `${diffSzn > 0 ? '+' : ''}${diffSzn.toFixed(1)}`],
              ['Last 10', prop.last10_avg,  '#e2e8f0', ''],
              ['Last 5',  prop.last5_avg != null ? prop.last5_avg : '—',
                prop.last5_avg != null ? (diff5 > 1 ? '#22c55e' : diff5 < -1 ? '#ef4444' : '#e2e8f0') : '#4a5568',
                prop.last5_avg != null ? `${diff5 > 0 ? '+' : ''}${diff5.toFixed(1)}` : ''],
            ].map(([label, val, color, delta], i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color }}>{val}</div>
                {delta && <div style={{ fontSize: 10, color }}>{delta} vs line</div>}
              </div>
            ))}
          </div>

          {/* Odds row */}
          {(prop.over_odds || prop.under_odds) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              {prop.over_odds && (
                <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                  OVER {prop.over_odds > 0 ? `+${prop.over_odds}` : prop.over_odds}
                  <span style={{ color: '#4a5568', marginLeft: 4 }}>
                    ({Math.round(100 / (1 + 100 / Math.abs(prop.over_odds)))}% implied)
                  </span>
                </div>
              )}
              {prop.under_odds && (
                <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                  UNDER {prop.under_odds > 0 ? `+${prop.under_odds}` : prop.under_odds}
                  <span style={{ color: '#4a5568', marginLeft: 4 }}>
                    ({Math.round(100 / (1 + 100 / Math.abs(prop.under_odds)))}% implied)
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            Min: {prop.minutes_avg} season
            {prop.last10_min && prop.last10_min < prop.minutes_avg * 0.85 && (
              <span style={{ color: '#f59e0b', fontWeight: 700 }}> · L10: {prop.last10_min} ⚠️</span>
            )}
            {prop.last10_min && prop.last10_min >= prop.minutes_avg * 0.85 && (
              <span> · L10: {prop.last10_min}</span>
            )}
            {' '}· Opp {prop.pos} DEF: #{prop.opp_pos_rank} · Score: {prop.score}/100
          </div>

          {/* Plain English value box */}
          {(prop.over_odds || prop.under_odds) && (() => {
            const leanOdds = prop.lean === 'OVER' ? prop.over_odds : prop.under_odds;
            if (!leanOdds) return null;
            const n = parseInt(leanOdds);
            const vegasImplied = n > 0
              ? Math.round(100 / (n + 100) * 100)
              : Math.round(Math.abs(n) / (Math.abs(n) + 100) * 100);
            // OTJ implied: score 50-100 maps to 50-70% on the lean direction
            const otjImplied = Math.min(70, Math.round(50 + (prop.score - 50) * 0.44));
            const edgeGap = otjImplied - vegasImplied;
            const leanWord = prop.lean === 'OVER' ? 'go over' : 'stay under';
            const oppositeLean = prop.lean === 'OVER' ? 'UNDER' : 'OVER';

            // Not enough signal either way
            if (Math.abs(edgeGap) < 5) return null;

            // OTJ confirms the lean — green value box
            if (edgeGap >= 5) {
              const vegasTimes = Math.round(vegasImplied / 10);
              const otjTimes = Math.round(otjImplied / 10);
              return (
                <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🎯 Value Spot — {prop.lean} {prop.line}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
                    Vegas prices this at a <strong style={{ color: '#f1f5f9' }}>{vegasImplied}% chance</strong> to {leanWord}.
                    Our model says <strong style={{ color: '#22c55e' }}>{otjImplied}%</strong> — a <strong style={{ color: '#22c55e' }}>+{edgeGap}% edge</strong>.
                  </div>
                  <div style={{ fontSize: 11, color: '#4a5568', marginTop: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
                    What that means: in 10 similar spots, Vegas pays you like this hits {vegasTimes} times — we think it hits {otjTimes} times. That gap is where the value is.
                  </div>
                </div>
              );
            }

            // OTJ disagrees with lean — yellow caution box
            return (
              <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, borderLeft: '3px solid #fbbf24' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ⚠️ Market Disagreement — {prop.lean} {prop.line}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
                  Vegas is pricing the {prop.lean} at <strong style={{ color: '#f1f5f9' }}>{vegasImplied}%</strong> but our model only sees <strong style={{ color: '#fbbf24' }}>{otjImplied}%</strong>. The market may be overvaluing this prop.
                </div>
                <div style={{ fontSize: 11, color: '#4a5568', marginTop: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
                  The lean is still {prop.lean} based on season stats — but Vegas and our model are pointing in different directions. The {oppositeLean} may have hidden value worth considering.
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: 10 }}>
            {prop.signals.map((sig, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3, minWidth: 52, textAlign: 'center',
                  background: `${TAG_COLORS[sig.tag] || '#6b7280'}15`,
                  color: TAG_COLORS[sig.tag] || '#6b7280', fontWeight: 600,
                }}>{sig.tag}</span>
                <span style={{ fontSize: 12, color: sig.tag === 'WARN' ? '#f59e0b' : '#94a3b8' }}>{sig.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropsTracker({ betLog }) {
  if (!betLog.length) return null;
  const w = betLog.filter(b => b.result === 'W').length;
  const l = betLog.filter(b => b.result === 'L').length;
  const p = betLog.filter(b => !b.result).length;
  const tot = w + l;
  const pct = tot > 0 ? ((w / tot) * 100).toFixed(1) : '—';

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' }}>🎯 Props Tracker</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4a5568' }}>RECORD</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            <span style={{ color: '#22c55e' }}>{w}</span>-<span style={{ color: '#ef4444' }}>{l}</span>
            {p > 0 && <span style={{ color: '#4a5568', fontSize: 13 }}> ({p}p)</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#4a5568' }}>HIT %</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct) >= 55 ? '#22c55e' : parseFloat(pct) >= 50 ? '#f59e0b' : '#ef4444' }}>
            {pct}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OTJPropsPage({ user, profile, onShowLogin }) {
  // Use local date — toISOString() returns UTC which breaks in AZ evening hours
  const today = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const { propsSlate, loading } = usePropsSlate(today);
  const data = propsSlate || { date: today, props: [] };

  const [expanded,   setExpanded]   = useState({ 0: true });
  const [leanFilter, setLeanFilter] = useState('all');
  const [confFilter, setConfFilter] = useState('all');
  const [betLog,     setBetLog]     = useState([]);

  const toggle    = i => setExpanded(p => ({ ...p, [i]: !p[i] }));
  const showLogin = onShowLogin || (() => {});

  const logBet = (matchup, pick, confidence, result) => {
    if (!user) { showLogin(); return; }
    setBetLog(prev => {
      const ex = prev.findIndex(b => b.matchup === matchup);
      if (ex >= 0) { const u = [...prev]; u[ex] = { ...u[ex], result }; return u; }
      return [...prev, { matchup, pick, confidence, result }];
    });
  };

  let filtered = [...data.props];
  if (leanFilter !== 'all') filtered = filtered.filter(p => p.lean === leanFilter);
  if (confFilter !== 'all') filtered = filtered.filter(p => p.confidence === confFilter);
  filtered.sort((a, b) => b.score - a.score);

  const highConf = data.props.filter(p => p.confidence === 'HIGH');

  // Free prop for logged-out users (highest score)
  const freePropIndex = 0;

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#4a5568', fontSize: 13 }}>
      Loading props...
    </div>
  );

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>🎯</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#f1f5f9', letterSpacing: '-0.03em' }}>
            Player Props Edge
          </h1>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#ef4444' + '18', color: '#ef4444', fontWeight: 600 }}>v1.1</span>
        </div>
        <p style={{ fontSize: 11, color: '#4a5568', margin: '0 0 12px' }}>
          Pace Matchup · Positional DEF · Recent Form · B2B Fatigue · Usage Boost · Injury Impact
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#6b728018', color: '#6b7280', fontWeight: 600 }}>
            📅 {data.date} · {data.props.length} props
          </span>
          {user && (
            <>
              <select value={leanFilter} onChange={e => setLeanFilter(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6b7280', fontFamily: 'inherit' }}>
                <option value="all">All Leans</option>
                <option value="OVER">Overs Only</option>
                <option value="UNDER">Unders Only</option>
              </select>
              <select value={confFilter} onChange={e => setConfFilter(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6b7280', fontFamily: 'inherit' }}>
                <option value="all">All Confidence</option>
                <option value="HIGH">HIGH Only</option>
                <option value="MODERATE">MODERATE+</option>
              </select>
            </>
          )}
          {!user && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#ef444418', color: '#ef4444', fontWeight: 600 }}>
              🔒 1 free · {data.props.length - 1} locked
            </span>
          )}
        </div>
      </div>

      {user && <PropsTracker betLog={betLog} />}

      {/* Top picks banner (logged-in only) */}
      {user && highConf.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 6, textTransform: 'uppercase' }}>🔥 Top Props Tonight</div>
          {highConf.map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fca5a5', marginBottom: 3 }}>
              <strong>{p.player}</strong>{' '}
              <span style={{ color: p.lean === 'OVER' ? '#22c55e' : '#ef4444' }}>{p.lean} {p.line} {p.stat}</span>
              <span style={{ color: '#6b7280', marginLeft: 8 }}>{p.game}</span>
              {p.opp_b2b && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· Opp B2B</span>}
            </div>
          ))}
        </div>
      )}

      {/* Props list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Free prop — always show */}
        {filtered.slice(0, 1).map((p, i) => (
          <PropCard
            key={i}
            prop={p}
            isExpanded={!!expanded[i]}
            onToggle={() => toggle(i)}
            locked={!user && i !== freePropIndex}
            onLockClick={showLogin}
            betLog={betLog}
            onLogBet={logBet}
          />
        ))}

        {/* Logged in — show all remaining */}
        {user && filtered.slice(1).map((p, i) => (
          <PropCard
            key={i + 1}
            prop={p}
            isExpanded={!!expanded[i + 1]}
            onToggle={() => toggle(i + 1)}
            locked={false}
            onLockClick={showLogin}
            betLog={betLog}
            onLogBet={logBet}
          />
        ))}

        {/* Logged out — single locked banner instead of 19 greyed cards */}
        {!user && filtered.length > 1 && (
          <div
            onClick={showLogin}
            style={{ cursor: 'pointer', padding: '18px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.04)'}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
                🔒 {filtered.length - 1} more props locked tonight
              </div>
              <div style={{ fontSize: 11, color: '#4a5568', marginTop: 3 }}>
                Sign in free to unlock all picks, scores, and analysis
              </div>
            </div>
            <span style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: 700 }}>
              Sign in →
            </span>
          </div>
        )}
      </div>

      {/* Sign-up CTA for logged-out */}
      {!user && (
        <div style={{ marginTop: 20, padding: '20px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
            Unlock all {data.props.length} props tonight
          </div>
          <div style={{ fontSize: 11, color: '#4a5568', marginBottom: 16 }}>Free account · No credit card · Just Google sign in</div>
          <button onClick={showLogin} style={{ fontSize: 13, padding: '10px 28px', borderRadius: 8, cursor: 'pointer', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontFamily: 'inherit', fontWeight: 700 }}>
            Create Free Account →
          </button>
        </div>
      )}

      <div style={{ marginTop: 24, padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 10, color: '#374151', lineHeight: 1.8 }}>
        <strong style={{ color: '#4a5568' }}>Score:</strong> 0–100 confidence.{' '}
        <strong style={{ color: '#4a5568' }}>Opp DEF Rank:</strong> Higher # = worse defense at that position.{' '}
        <strong style={{ color: '#4a5568' }}>CAUTION:</strong> Risk factors that could sink the pick.
        <br />
        <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠ DISCLAIMER:</span> All analysis is for informational and entertainment purposes only. Always check final injury reports. Gamble responsibly. <strong style={{ color: '#4a5568' }}>1-800-GAMBLER</strong>
      </div>
    </div>
  );
}
