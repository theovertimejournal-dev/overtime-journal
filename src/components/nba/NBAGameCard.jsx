import { useState, useEffect } from 'react';
import { Pill } from '../common/Pill';
import { NBATeamColumn } from './NBATeamColumn';
import { NBAEdgeSignals } from './NBAEdgeSignals';
import { supabase } from '../../lib/supabase';

const CONFIDENCE_COLORS = { SHARP: "#ef4444", LEAN: "#f59e0b", INFO: "#6b7280" };

// ── Line Movement Chart ───────────────────────────────────────────────────────
function LineMovementChart({ matchup, date, awayTeam, homeTeam, otjLean }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchup || !date) return;
    console.log('[LineMovementChart] querying:', matchup, date);
    supabase
      .from('odds_history')
      .select('logged_at, ml_home, ml_away, spread_home, is_open')
      .eq('game_id', matchup)
      .eq('date', date)
      .order('logged_at', { ascending: true })
      .then(({ data, error }) => {
        console.log('[LineMovementChart] result:', data?.length, 'rows', error);
        setHistory(data || []);
        setLoading(false);
      });
  }, [matchup, date]);

  if (loading) return (
    <div style={{ fontSize: 10, color: '#4a5568', padding: '10px 0' }}>Loading line movement...</div>
  );
  if (history.length < 2) return (
    <div style={{ fontSize: 10, color: '#4a5568', padding: '10px 0' }}>
      📊 Line movement chart — data builds up throughout the day as the slate refreshes.
    </div>
  );

  // Build chart points
  const mlValues  = history.map(h => h.ml_home).filter(v => v != null);
  const spValues  = history.map(h => h.spread_home).filter(v => v != null);
  const times     = history.map(h => new Date(h.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const mlMin = Math.min(...mlValues);
  const mlMax = Math.max(...mlValues);
  const spMin = Math.min(...spValues);
  const spMax = Math.max(...spValues);

  // Detect big move — flag if ML moved 100+ pts
  const mlMove = mlValues.length >= 2 ? mlValues[mlValues.length - 1] - mlValues[0] : 0;
  const bigMove = Math.abs(mlMove) >= 100;
  const movingTowardHome = mlMove < 0; // more negative = home more favored

  function sparkline(values, min, max, color, width = 200, height = 50) {
    if (values.length < 2) return null;
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    // Dot on last point
    const lastX = width;
    const lastY = height - ((values[values.length - 1] - min) / range) * height;
    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="3" fill={color} />
      </svg>
    );
  }

  const openMl   = history.find(h => h.is_open)?.ml_home;
  const currentMl = history[history.length - 1]?.ml_home;
  const openSp   = history.find(h => h.is_open)?.spread_home;
  const currentSp = history[history.length - 1]?.spread_home;

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          📈 Line Movement · {history.length} snapshots
        </div>
        <div style={{ fontSize: 10, color: '#4a5568' }}>
          {times[0]} → {times[times.length - 1]}
        </div>
      </div>

      {/* Alert banner on big move */}
      {bigMove && (
        <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12 }}>🚨</span>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
            ML moved {mlMove > 0 ? '+' : ''}{mlMove} pts — {movingTowardHome ? homeTeam : awayTeam} getting sharper money
            {otjLean && !movingTowardHome && otjLean === homeTeam ? ' · OTJ still likes ' + homeTeam : ''}
          </span>
        </div>
      )}

      {/* Value window — model likes team but line drifted away */}
      {otjLean && bigMove && (
        (() => {
          const leanIsHome = otjLean === homeTeam;
          const leanMovedAgainst = leanIsHome ? mlMove > 0 : mlMove < 0;
          if (!leanMovedAgainst) return null;
          const currentLeanMl = leanIsHome ? currentMl : history[history.length - 1]?.ml_away;
          return (
            <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>
                ⚡ Value window — OTJ leans {otjLean} but line drifted. Current ML {currentLeanMl > 0 ? '+' : ''}{currentLeanMl} may be better odds to buy in.
              </span>
            </div>
          );
        })()
      )}

      {/* Charts side by side */}
      <div style={{ display: 'flex', gap: 16 }}>
        {mlValues.length >= 2 && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 4 }}>
              {homeTeam} Moneyline
              <span style={{ marginLeft: 8, color: openMl !== currentMl ? '#f59e0b' : '#4a5568' }}>
                {openMl != null ? (openMl > 0 ? `+${openMl}` : openMl) : '—'}
                {openMl !== currentMl && currentMl != null && (
                  <span> → <strong style={{ color: '#f59e0b' }}>{currentMl > 0 ? `+${currentMl}` : currentMl}</strong></span>
                )}
              </span>
            </div>
            {sparkline(mlValues, mlMin, mlMax, '#378ADD')}
          </div>
        )}
        {spValues.length >= 2 && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 4 }}>
              {homeTeam} Spread
              <span style={{ marginLeft: 8, color: openSp !== currentSp ? '#f59e0b' : '#4a5568' }}>
                {openSp != null ? (openSp > 0 ? `+${openSp}` : openSp) : '—'}
                {openSp !== currentSp && currentSp != null && (
                  <span> → <strong style={{ color: '#f59e0b' }}>{currentSp > 0 ? `+${currentSp}` : currentSp}</strong></span>
                )}
              </span>
            </div>
            {sparkline(spValues, spMin, spMax, '#E24B4A')}
          </div>
        )}
      </div>

      <div style={{ fontSize: 9, color: '#1e293b', marginTop: 8 }}>
        Updates every push · {times[0]} open → now
      </div>
    </div>
  );
}

function formatGameTime(raw) {
  if (!raw) return '';

  // If it's already a formatted string like "7:30 PM ET" or "7:00 PM ET",
  // return it directly — Chrome can't parse these as dates and throws Invalid Date.
  // A real ISO datetime will contain a 'T' or '-' with digits.
  if (!/^\d{4}-|\d{4}T/.test(raw)) return raw;

  try {
    const d = new Date(raw);
    // Catch the Invalid Date case explicitly — NaN check on getTime()
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', hour12: true
    }) + ' ET';
  } catch { return raw; }
}

function isGameLocked(game_time) {
  if (!game_time) return false;
  const tipoff = new Date(game_time);
  const fiveMinBefore = new Date(tipoff.getTime() - 5 * 60 * 1000);
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

function BettingPanel({ game, user, profile, userPicks = [], onPickPlaced, onCancelPick }) {
  const locked = isGameLocked(game.game_time);
  const { away, home } = game;
  const FONT = "'JetBrains Mono','SF Mono',monospace";

  const [pickType, setPickType] = useState('moneyline');
  const [pickSide, setPickSide] = useState(null);
  const [wager, setWager]       = useState(100);
  const [placing, setPlacing]   = useState(false);
  const [error, setError]       = useState('');

  const bankroll = profile?.bankroll || 0;
  const maxWager = Math.floor(bankroll * 0.9);

  function getLockedOdds() {
    if (pickType === 'moneyline') return pickSide === 'home' ? parseInt(game.ml_home || 0) : parseInt(game.ml_away || 0);
    if (pickType === 'spread') return pickSide === 'home' ? (game.spread_home_odds || -110) : (game.spread_away_odds || -110);
    return -110;
  }

  function getLockedLine() {
    if (pickType === 'spread') {
      if (pickSide === 'home') { const sp = game.spread_home || game.spread; return sp ? parseFloat(String(sp).replace(/[^0-9.\-+]/g, '')) : null; }
      const sp = game.spread_away;
      if (sp) return parseFloat(String(sp).replace(/[^0-9.\-+]/g, ''));
      const hsp = game.spread_home || game.spread;
      return hsp ? -parseFloat(String(hsp).replace(/[^0-9.\-+]/g, '')) : null;
    }
    if (pickType === 'over' || pickType === 'under') { const t = game.total; return t ? parseFloat(String(t).replace(/[^0-9.]/g, '')) : null; }
    return null;
  }

  function getPickedTeam() {
    if (pickType === 'moneyline' || pickType === 'spread') return pickSide === 'home' ? home.team : away.team;
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
      p_slate_date: game.date || (() => { const d = new Date(); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); })(),
      p_matchup: game.matchup,
      p_picked_team: getPickedTeam(),
      p_game_time: game.game_time || null,
      p_pick_type: pickType,
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
    setPlacing(false);
  }

  if (!user) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Sign in to place your pick
    </div>
  );

  if (locked && userPicks.length === 0) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Picks locked — game started
    </div>
  );

  return (
    <div style={{ marginTop: 14 }}>
      {/* ── Existing bets ── */}
      {userPicks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {userPicks.map(pick => {
            const won = pick.result === 'win' || pick.result === 'W';
            const lost = pick.result === 'loss' || pick.result === 'L';
            const pending = !won && !lost;
            const canCancel = pending && !locked;
            const typeLabel = pick.pick_type === 'moneyline' ? 'ML'
              : pick.pick_type === 'spread' ? `${pick.locked_line > 0 ? '+' : ''}${pick.locked_line}`
              : pick.pick_type === 'over' ? `O ${pick.locked_line}`
              : pick.pick_type === 'under' ? `U ${pick.locked_line}` : 'ML';
            return (
              <div key={pick.id} style={{
                padding: "10px 14px", borderRadius: 8,
                background: pending ? "rgba(59,130,246,0.06)" : won ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${pending ? "rgba(59,130,246,0.2)" : won ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pending ? "#60a5fa" : won ? "#22c55e" : "#ef4444" }}>
                      {pending ? '⏳' : won ? '✅' : '❌'} {pick.picked_team} {typeLabel} {formatOdds(pick.locked_odds)}
                    </div>
                    <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                      {formatBucks(pick.wager)} wagered
                      {pick.net != null && <span style={{ color: won ? "#22c55e" : "#ef4444", fontWeight: 600, marginLeft: 6 }}>
                        {pick.net >= 0 ? '+' : ''}{formatBucks(pick.net)}
                      </span>}
                    </div>
                  </div>
                  {canCancel && (
                    <button onClick={() => onCancelPick(pick.id)} style={{
                      fontSize: 9, padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                      color: "#ef4444", fontFamily: FONT, fontWeight: 600,
                    }}>✕ CANCEL</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── New bet form (always visible unless game locked) ── */}
      {!locked && (
    <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10,
      background: "linear-gradient(135deg, rgba(255,255,255,0.02), rgba(239,68,68,0.03))",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em" }}>🎯 Lock Your Pick</div>
        <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>💰 {formatBucks(bankroll)}</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[{id:'moneyline',label:'ML'},{id:'spread',label:'SPREAD'},{id:'over',label:'OVER'},{id:'under',label:'UNDER'}].map(t => (
          <button key={t.id} onClick={() => { setPickType(t.id); setPickSide(t.id==='over'?'over':t.id==='under'?'under':null); }}
            style={{ flex:1, padding:"5px 4px", borderRadius:5, cursor:"pointer",
              background: pickType===t.id ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${pickType===t.id ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
              color: pickType===t.id ? "#ef4444" : "#6b7280", fontSize:10, fontWeight:700, fontFamily:FONT, letterSpacing:"0.06em",
            }}>{t.label}</button>
        ))}
      </div>
      {(pickType==='moneyline'||pickType==='spread') && (
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          {[{side:'away',team:away.team,odds:pickType==='moneyline'?game.ml_away:(game.spread_away_odds||-110),line:pickType==='spread'?(game.spread_away||(game.spread_home?(-parseFloat(String(game.spread_home).replace(/[^0-9.\-+]/g,''))):null)):null},
            {side:'home',team:home.team,odds:pickType==='moneyline'?game.ml_home:(game.spread_home_odds||-110),line:pickType==='spread'?(game.spread_home||game.spread):null}
          ].map(opt => (
            <button key={opt.side} onClick={() => setPickSide(opt.side)}
              style={{ flex:1, padding:"10px 8px", borderRadius:8, cursor:"pointer",
                background: pickSide===opt.side ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${pickSide===opt.side ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
                fontFamily:FONT, textAlign:"center",
              }}>
              <div style={{ fontSize:12, fontWeight:700, color: pickSide===opt.side ? "#ef4444" : "#e2e8f0" }}>{opt.team}</div>
              {pickType==='spread' && opt.line!=null && <div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>{parseFloat(opt.line)>0?'+':''}{opt.line}</div>}
              <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>{formatOdds(opt.odds)}</div>
            </button>
          ))}
        </div>
      )}
      {(pickType==='over'||pickType==='under') && (
        <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:10, background:"rgba(168,85,247,0.06)", border:"1px solid rgba(168,85,247,0.15)", textAlign:"center" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#a855f7" }}>{pickType==='over'?'⬆ OVER':'⬇ UNDER'} {game.total||'—'}</div>
          <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>-110</div>
        </div>
      )}
      {pickSide && (
        <div style={{ marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <div style={{ fontSize:10, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em" }}>Wager</div>
            <div style={{ display:"flex", gap:4 }}>
              {[50,100,250,500].map(amt => (
                <button key={amt} onClick={() => setWager(Math.min(amt, maxWager))}
                  style={{ fontSize:9, padding:"2px 6px", borderRadius:4, cursor:"pointer",
                    background: wager===amt ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${wager===amt ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
                    color: wager===amt ? "#ef4444" : "#4a5568", fontFamily:FONT,
                  }}>${amt}</button>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="number" min={10} max={maxWager} value={wager}
              onChange={e => { setWager(Math.max(10, Math.min(maxWager, parseInt(e.target.value)||10))); setError(''); }}
              style={{ flex:1, padding:"8px 10px", borderRadius:6, background:"rgba(255,255,255,0.04)",
                border:"1px solid rgba(255,255,255,0.1)", color:"#f1f5f9", fontSize:13, fontFamily:FONT, outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setWager(maxWager)}
              style={{ fontSize:9, padding:"8px 10px", borderRadius:6, cursor:"pointer",
                background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.2)",
                color:"#fbbf24", fontFamily:FONT, fontWeight:700 }}>MAX</button>
          </div>
          <div style={{ fontSize:9, color:"#374151", marginTop:3 }}>Min $10 · Max 90% ({formatBucks(maxWager)})</div>
        </div>
      )}
      {pickSide && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"rgba(255,255,255,0.02)", borderRadius:6, marginBottom:8, fontSize:10 }}>
            <span style={{ color:"#6b7280" }}>{getPickedTeam()} {pickType==='moneyline'?'ML':pickType==='spread'?getLockedLine():''} @ {formatOdds(getLockedOdds())}</span>
            <span style={{ color:"#22c55e", fontWeight:700 }}>To win: {formatBucks(calcPotentialPayout()-wager)}</span>
          </div>
          {error && <div style={{ fontSize:10, color:"#ef4444", marginBottom:8, padding:"6px 10px", background:"rgba(239,68,68,0.08)", borderRadius:6 }}>{error}</div>}
          <button onClick={placeBet} disabled={placing||!pickSide||wager<10}
            style={{ width:"100%", padding:"11px", borderRadius:8, cursor:placing?"not-allowed":"pointer",
              background:"#ef4444", border:"none", color:"#fff", fontSize:12, fontWeight:700,
              fontFamily:FONT, letterSpacing:"0.04em", opacity:placing?0.6:1 }}>
            {placing ? "PLACING..." : `LOCK IT IN — ${formatBucks(wager)}`}
          </button>
        </div>
      )}
    </div>
      )}
    </div>
  );
}

export function NBAGameCard({ game, isExpanded, onToggle, betLog, onLogBet, user, profile }) {
  const [userPicks, setUserPicks] = useState([]);

  if (!game || !game.away || !game.home || !game.edge) return null;

  const { away, home, edge, spread, total, win_prob, matchup, venue, game_time, narrative } = game;
  const cc = CONFIDENCE_COLORS[edge.confidence] || "#6b7280";

  const narrativeSummary    = narrative?.summary        || game.narrative_summary    || null;
  const narrativeKeyAngle   = narrative?.key_angle      || game.narrative_key_angle  || null;
  const narrativeContrarian = narrative?.contrarian_flag|| game.narrative_contrarian || null;
  const narrativeOuLean     = narrative?.ou_lean        || game.narrative_ou_lean    || null;
  const otjPick             = narrative?.otj_pick       || game.narrative_otj_pick   || null;
  const otjSpreadRule       = edge?.otj_spread_rule || null;
  const otjMatchupNote      = edge?.otj_matchup_note || null;

  const gameId = game.id || game.game_id || matchup;
  const slateDate = game.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Load ALL existing picks for this user+game
  useEffect(() => {
    if (!user || !gameId) return;
    supabase
      .from('game_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('game_id', String(gameId))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setUserPicks(data); });
  }, [user, gameId]);

  function handlePickPlaced(pick, newBankroll) {
    setUserPicks(prev => [pick, ...prev]);
    if (profile) profile.bankroll = newBankroll;
  }

  async function handleCancelPick(pickId) {
    const { data, error } = await supabase.rpc('cancel_bet', { p_user_id: user.id, p_pick_id: pickId });
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result?.success) {
      setUserPicks(prev => prev.filter(p => p.id !== pickId));
      if (profile) profile.bankroll = result.bankroll;
    }
  }

  const existingBet = betLog?.find(b => b.matchup === matchup);

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, overflow: "hidden"
    }}>
      {/* Header row */}
      <div onClick={onToggle} style={{ padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{matchup}</span>
            <Pill text={formatGameTime(game_time)} color="#6b7280" />
            {(away?.b2b || home?.b2b) && (
              <Pill text={`${away?.b2b ? away.team : home.team} B2B`} color="#f59e0b" />
            )}
            {/* Pick indicator in header */}
            {userPicks.length > 0 && (
              <Pill
                text={`${userPicks.length} bet${userPicks.length > 1 ? 's' : ''}`}
                color="#60a5fa"
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              {/* Lean — show open lean, flag if live lean differs */}
              <div style={{ fontSize: 10, color: "#4a5568" }}>LEAN</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cc }}>
                {game.open_lean || edge.lean}
                {game.open_lean && edge.lean && game.open_lean !== edge.lean && (
                  <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 4 }}>→ {edge.lean} <span style={{ color: "#4a5568" }}>📡</span></span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {/* Conf — show open conf, flag if live conf differs */}
              <div style={{ fontSize: 10, color: "#4a5568" }}>CONF</div>
              <div>
                <Pill text={game.open_confidence || edge.confidence} color={CONFIDENCE_COLORS[game.open_confidence || edge.confidence] || "#6b7280"} />
                {game.open_confidence && edge.confidence && game.open_confidence !== edge.confidence && (
                  <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4 }}>→ <Pill text={edge.confidence} color={cc} /> <span style={{ color: "#4a5568" }}>📡</span></span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {/* Score — open score frozen, live score shown if different */}
              <div style={{ fontSize: 10, color: "#4a5568" }}>SCORE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
                {game.open_score ?? edge.score}
                {game.open_score != null && edge.score != null && game.open_score !== edge.score && (
                  <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 4 }}>→ {edge.score} <span style={{ color: "#4a5568" }}>📡</span></span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 14, color: "#4a5568" }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Line info */}
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Spread: <span style={{ color: "#e2e8f0" }}>{game.opening_spread || spread}</span>
            {game.opening_spread && game.spread && game.opening_spread !== game.spread && (
              <span> → <span style={{ color: "#f59e0b" }}>{spread}</span> <span style={{ fontSize: 10, color: "#4a5568" }}>📡live</span></span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Total: <span style={{ color: "#e2e8f0" }}>O/U {game.opening_total || total}</span>
            {game.opening_total && game.total && game.opening_total !== game.total && (
              <span> → <span style={{ color: "#f59e0b" }}>{total}</span> <span style={{ fontSize: 10, color: "#4a5568" }}>📡live</span></span>
            )}
          </div>
          {game.ml_away && <div style={{ fontSize: 11, color: "#6b7280" }}>{away.team} ML: <span style={{ color: parseInt(game.opening_ml_away || game.ml_away) > 0 ? "#22c55e" : "#e2e8f0", fontWeight: 600 }}>{parseInt(game.opening_ml_away || game.ml_away) > 0 ? `+${game.opening_ml_away || game.ml_away}` : (game.opening_ml_away || game.ml_away)}</span>
            {game.opening_ml_away && game.ml_away && game.opening_ml_away !== game.ml_away && (
              <span> → <span style={{ color: "#f59e0b", fontWeight: 600 }}>{parseInt(game.ml_away) > 0 ? `+${game.ml_away}` : game.ml_away}</span> <span style={{ fontSize: 10, color: "#4a5568" }}>📡live</span></span>
            )}
          </div>}
          {game.ml_home && <div style={{ fontSize: 11, color: "#6b7280" }}>{home.team} ML: <span style={{ color: parseInt(game.opening_ml_home || game.ml_home) > 0 ? "#22c55e" : "#e2e8f0", fontWeight: 600 }}>{parseInt(game.opening_ml_home || game.ml_home) > 0 ? `+${game.opening_ml_home || game.ml_home}` : (game.opening_ml_home || game.ml_home)}</span>
            {game.opening_ml_home && game.ml_home && game.opening_ml_home !== game.ml_home && (
              <span> → <span style={{ color: "#f59e0b", fontWeight: 600 }}>{parseInt(game.ml_home) > 0 ? `+${game.ml_home}` : game.ml_home}</span> <span style={{ fontSize: 10, color: "#4a5568" }}>📡live</span></span>
            )}
          </div>}
          {edge.ou_lean && <div style={{ fontSize: 11, color: "#a855f7" }}>O/U Lean: <strong>{edge.ou_lean}</strong></div>}
          {(away?.pace > 0 || home?.pace > 0) && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Pace: <span style={{ color: "#e2e8f0" }}>{away.team} {away.pace}</span>
              <span style={{ color: "#4a5568" }}> vs </span>
              <span style={{ color: "#e2e8f0" }}>{home.team} {home.pace}</span>
              {away.pace && home.pace && (
                <span style={{ color: "#a855f7", marginLeft: 6 }}>
                  {Math.abs(away.pace - home.pace) >= 3
                    ? (away.pace > home.pace
                        ? `⚡ ${away.team} pushes pace`
                        : `⚡ ${home.team} pushes pace`)
                    : "· similar pace"}
                </span>
              )}
            </div>
          )}
          {win_prob && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Win Prob: <span style={{ color: "#e2e8f0" }}>{away.team} {win_prob.away}% / {home.team} {win_prob.home}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Team columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
            <NBATeamColumn t={away} />
            <NBATeamColumn t={home} />
          </div>

          {/* Moneyline comparison */}
          {(game.ml_away || game.ml_home) && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexDirection: "column" }}>
              {game.odds_updated_at && (game.opening_ml_home !== game.ml_home || game.opening_ml_away !== game.ml_away) && (
                <div style={{ fontSize: 10, color: "#4a5568", textAlign: "right" }}>
                  📡 live as of {new Date(game.odds_updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { team: away.team, ml: game.ml_away, openMl: game.opening_ml_away },
                  { team: home.team, ml: game.ml_home, openMl: game.opening_ml_home }
                ].map(({ team, ml, openMl }) => {
                  if (!ml) return null;
                  const n = parseInt(ml);
                  const implied = n > 0 ? (100 / (n + 100) * 100).toFixed(0) : (Math.abs(n) / (Math.abs(n) + 100) * 100).toFixed(0);
                  const isLean = edge.lean === team;
                  const hasMovement = openMl && openMl !== ml;
                  const openN = openMl ? parseInt(openMl) : null;
                  return (
                    <div key={team} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: isLean ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isLean ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{team} ML{isLean ? " ← lean" : ""}</div>
                      {hasMovement ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, color: "#4a5568", textDecoration: "line-through" }}>{openN > 0 ? `+${openN}` : openN}</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>{n > 0 ? `+${n}` : n}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 15, fontWeight: 700, color: n > 0 ? "#22c55e" : "#e2e8f0" }}>{n > 0 ? `+${n}` : n}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#4a5568" }}>Impl: {implied}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Line movement chart */}
          <LineMovementChart
            matchup={matchup}
            date={slateDate}
            awayTeam={away.team}
            homeTeam={home.team}
            otjLean={edge.lean}
          />

          {/* Plain English Value Box */}
          {edge.lean && (() => {
            // Always use OPENING odds for value calculation — live odds are mid-game noise
            const openLeanMl = edge.lean === away.team ? (game.opening_ml_away || game.ml_away) : (game.opening_ml_home || game.ml_home);
            const liveLeanMl = edge.lean === away.team ? game.ml_away : game.ml_home;
            if (!openLeanMl) return null;

            const openN = parseInt(openLeanMl);
            const liveN = liveLeanMl ? parseInt(liveLeanMl) : null;

            // Don't show on heavy favorites — model can't reliably challenge -280+
            if (Math.abs(openN) > 280 && openN < 0) return null;

            const absScore = Math.abs(edge.score || 0);
            // Require meaningful edge score
            if (absScore < 8) return null;

            const vegasImplied = openN > 0
              ? Math.round(100 / (openN + 100) * 100)
              : Math.round(Math.abs(openN) / (Math.abs(openN) + 100) * 100);

            const otjImplied = absScore >= 14 ? 62 : absScore >= 10 ? 56 : 52;
            const edgeGap = otjImplied - vegasImplied;
            const isUnderdog = openN > 0;

            // Only show green box when OTJ confirms the lean with 5%+ gap
            if (edgeGap < 5) return null;

            const tenTimes = Math.round(otjImplied / 10);
            const vegasTimes = Math.round(vegasImplied / 10);

            // Detect significant live line movement (2x or more)
            const liveImplied = liveN ? (liveN > 0
              ? Math.round(100 / (liveN + 100) * 100)
              : Math.round(Math.abs(liveN) / (Math.abs(liveN) + 100) * 100)) : null;
            const bigMovement = liveImplied && Math.abs(liveImplied - vegasImplied) >= 15;
            const liveTimestamp = game.odds_updated_at
              ? new Date(game.odds_updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;

            return (
              <div style={{ marginTop: 10, padding: "12px 14px", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8, borderLeft: "3px solid #22c55e" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    🎯 Value Spot — {edge.lean} {openN > 0 ? `+${openN}` : openN}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a5568" }}>at tip-off</div>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
                  Vegas priced <strong style={{ color: "#f1f5f9" }}>{edge.lean}</strong> at a <strong style={{ color: "#f1f5f9" }}>{vegasImplied}% chance</strong> to win.
                  Our model says <strong style={{ color: "#22c55e" }}>{otjImplied}%</strong> — a <strong style={{ color: "#22c55e" }}>+{edgeGap}% edge</strong>.
                </div>
                <div style={{ fontSize: 11, color: "#4a5568", marginTop: 6, lineHeight: 1.6, fontStyle: "italic" }}>
                  What that means: if this game played out 10 times, Vegas was paying you like {edge.lean} wins {vegasTimes} times — we think they win {tenTimes} times. {isUnderdog ? "You're getting underdog odds on a team we think wins more than Vegas says." : "The favorite is even stronger than the price suggests."}
                </div>
                {bigMovement && liveN && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(251,191,36,0.06)", borderRadius: 6, border: "1px solid rgba(251,191,36,0.15)" }}>
                    <span style={{ fontSize: 11, color: "#fbbf24" }}>
                      ⚠️ Line has moved — {edge.lean} now {liveN > 0 ? `+${liveN}` : liveN} ({liveImplied}% implied){liveTimestamp ? ` as of ${liveTimestamp}` : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Edge signals */}
          {edge.signals?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Edge Signals</div>
              <NBAEdgeSignals signals={edge.signals} ouLean={edge.ou_lean} />
            </div>
          )}

          {/* Injury context box */}
          {(() => {
            const allInjuries = [
              ...(away.injuries || []).filter(p => p.status === "Out" || p.status === "Doubtful").map(p => ({ ...p, team: away.team })),
              ...(home.injuries || []).filter(p => p.status === "Out" || p.status === "Doubtful").map(p => ({ ...p, team: home.team })),
            ];
            if (!allInjuries.length) return null;
            const fresh = allInjuries.filter(p => p.tenure === "fresh" || p.priced_in === false);
            const longTerm = allInjuries.filter(p => p.priced_in === true && p.tenure !== "fresh");
            return (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>🏥 Injury Report</div>
                {fresh.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>🚨 Fresh Scratches — may not be priced in</div>
                    {fresh.map((p, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                        <span style={{ color: "#ef4444", fontWeight: 600 }}>{p.name}</span>
                        <span style={{ color: "#4a5568" }}> · {p.team} · {p.description || p.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {longTerm.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, marginBottom: 3 }}>Already priced in by Vegas</div>
                    {longTerm.map((p, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#4a5568", marginBottom: 2 }}>
                        {p.name} · {p.team}
                        {p.tenure_label && <span style={{ fontStyle: "italic" }}> · {p.tenure_label}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Claude narrative */}
          {narrativeSummary && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, borderLeft: `3px solid ${cc}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4a5568", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>📰 Analysis</div>
              <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{narrativeSummary}</p>
              {narrativeKeyAngle && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#f1f5f9", fontWeight: 600 }}>🔑 {narrativeKeyAngle}</div>
              )}
            </div>
          )}

          {/* Contrarian flag */}
          {narrativeContrarian && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(168,85,247,0.06)", borderRadius: 8, borderLeft: "3px solid #a855f7" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a855f7", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚡ Contrarian Flag</div>
              <p style={{ fontSize: 12, color: "#c4b5fd", lineHeight: 1.7, margin: 0 }}>{narrativeContrarian}</p>
            </div>
          )}

          {/* O/U lean */}
          {narrativeOuLean && !edge.ou_lean && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#a855f7" }}>
              O/U Lean: <strong>{narrativeOuLean}</strong>
            </div>
          )}

          {/* OTJ Pick */}
          {otjSpreadRule && (() => {
            const strengthColor = otjSpreadRule.strength === "strong"
              ? "#f59e0b"
              : otjSpreadRule.strength === "moderate"
              ? "#94a3b8"
              : "#4a5568";
            return (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6, borderLeft: `2px solid ${strengthColor}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: strengthColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  📐 OTJ Spread Gut Check
                </span>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0", fontStyle: "italic", lineHeight: 1.6 }}>
                  {otjSpreadRule.label}
                </p>
              </div>
            );
          })()}

          {otjMatchupNote && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(99,102,241,0.04)", borderRadius: 6, borderLeft: "2px solid #6366f1" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🎯 OTJ Matchup Note
              </span>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0", fontStyle: "italic", lineHeight: 1.6 }}>
                {otjMatchupNote.label}
              </p>
            </div>
          )}

          {otjPick && (
            <div style={{ marginTop: 14, padding: "14px 16px", background: "linear-gradient(135deg, rgba(251,191,36,0.07), rgba(239,68,68,0.05))", borderRadius: 10, border: "1px solid rgba(251,191,36,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.08em" }}>⭐ OTJ Pick</span>
                <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 4, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", fontWeight: 600 }}>TONIGHT</span>
              </div>
              <p style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 600, lineHeight: 1.6, margin: "0 0 8px" }}>{otjPick}</p>
              <div style={{ fontSize: 10, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8 }}>
                💡 <span style={{ color: "#6b7280" }}>Consider both sides — see Market State above for full spread analysis.</span>
              </div>
            </div>
          )}

          {/* ── Betting Panel ── */}
          <BettingPanel
            game={game}
            user={user}
            profile={profile}
            userPicks={userPicks}
            onPickPlaced={handlePickPlaced}
            onCancelPick={handleCancelPick}
          />

          {/* Bet logger */}
          <div style={{ marginTop: 10 }}>
            {!existingBet && (
              <button
                onClick={() => onLogBet?.(matchup, edge.lean, edge.confidence, null)}
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer", background: `${cc}18`, border: `1px solid ${cc}40`, color: cc, fontFamily: "inherit" }}
              >
                📝 Log {edge.lean}
              </button>
            )}
            {existingBet && !existingBet.result && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onLogBet?.(matchup, existingBet.pick, existingBet.confidence, "W")}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "inherit", fontWeight: 600 }}>✓ Hit</button>
                <button onClick={() => onLogBet?.(matchup, existingBet.pick, existingBet.confidence, "L")}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 600 }}>✗ Miss</button>
                <span style={{ fontSize: 11, color: "#4a5568", alignSelf: "center" }}>→ {existingBet.pick}</span>
              </div>
            )}
            {existingBet?.result && (
              <div style={{ fontSize: 11, color: existingBet.result === "W" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                {existingBet.result === "W" ? "✓ HIT" : "✗ MISS"} — {existingBet.pick}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
