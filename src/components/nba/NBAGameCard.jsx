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
    supabase
      .from('odds_history')
      .select('logged_at, ml_home, ml_away, spread_home, is_open')
      .eq('game_id', matchup)
      .eq('date', date)
      .order('logged_at', { ascending: true })
      .then(({ data }) => {
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

function PickButtons({ game, user, userPick, onPick, onChangePick }) {
  const locked = isGameLocked(game.game_time);
  const { away, home } = game;

  if (!user) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Sign in to log your pick
    </div>
  );

  if (locked && !userPick) return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
      🔒 Picks locked — game started
    </div>
  );

  if (userPick) {
    const won  = userPick.result === 'W';
    const lost = userPick.result === 'L';
    const pending = !userPick.result;
    const canChange = pending && !locked;
    return (
      <div style={{ marginTop: 14, padding: "12px 14px", background: pending ? "rgba(59,130,246,0.06)" : won ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", borderRadius: 8, border: `1px solid ${pending ? "rgba(59,130,246,0.2)" : won ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your Pick</div>
          {canChange && (
            <span onClick={() => onChangePick()} style={{ fontSize: 10, color: "#f59e0b", cursor: "pointer", fontWeight: 600 }}>
              ✏ Change
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: pending ? "#60a5fa" : won ? "#22c55e" : "#ef4444" }}>
          {pending ? `⏳ ${userPick.picked_team}` : won ? `✅ ${userPick.picked_team} — HIT` : `❌ ${userPick.picked_team} — MISS`}
        </div>
        {canChange && <div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>Locks 5 min before tip-off</div>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, color: "#4a5568", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>🎯 Lock Your Pick</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[away.team, home.team].map(team => (
          <button
            key={team}
            onClick={() => onPick(team)}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => { e.target.style.background = "rgba(239,68,68,0.12)"; e.target.style.borderColor = "rgba(239,68,68,0.4)"; e.target.style.color = "#ef4444"; }}
            onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.03)"; e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.color = "#e2e8f0"; }}
          >
            {team}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NBAGameCard({ game, isExpanded, onToggle, betLog, onLogBet, user }) {
  const [userPick, setUserPick] = useState(null);
  const [pickLoading, setPickLoading] = useState(false);

  if (!game || !game.away || !game.home || !game.edge) return null;

  const { away, home, edge, spread, total, win_prob, matchup, venue, game_time, narrative } = game;
  const cc = CONFIDENCE_COLORS[edge.confidence] || "#6b7280";

  const narrativeSummary    = narrative?.summary        || game.narrative_summary    || null;
  const narrativeKeyAngle   = narrative?.key_angle      || game.narrative_key_angle  || null;
  const narrativeContrarian = narrative?.contrarian_flag|| game.narrative_contrarian || null;
  const narrativeOuLean     = narrative?.ou_lean        || game.narrative_ou_lean    || null;
  const otjPick             = narrative?.otj_pick       || game.narrative_otj_pick   || null;
  const otjSpreadRule       = edge?.otj_spread_rule || null;

  const gameId = game.id || game.game_id || matchup;
  const slateDate = game.date || (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  // Load existing pick for this user+game
  useEffect(() => {
    if (!user || !gameId) return;
    supabase
      .from('game_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('game_id', String(gameId))
      .single()
      .then(({ data }) => { if (data) setUserPick(data); });
  }, [user, gameId]);

  async function handlePick(team) {
    if (!user || pickLoading || isGameLocked(game_time)) return;
    setPickLoading(true);
    if (userPick) {
      // Update existing pick
      const { data, error } = await supabase.from('game_picks')
        .update({ picked_team: team })
        .eq('id', userPick.id)
        .select().single();
      if (!error && data) setUserPick(data);
    } else {
      // Insert new pick
      const { data, error } = await supabase.from('game_picks').insert({
        user_id:     user.id,
        game_id:     String(gameId),
        slate_date:  slateDate,
        matchup,
        picked_team: team,
        game_time:   game_time || null,
      }).select().single();
      if (!error && data) setUserPick(data);
    }
    setPickLoading(false);
  }

  function handleChangePick() {
    // Temporarily clear userPick from display to show buttons again
    setUserPick(null);
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
            {userPick && (
              <Pill
                text={userPick.result === 'W' ? `✅ ${userPick.picked_team}` : userPick.result === 'L' ? `❌ ${userPick.picked_team}` : `⏳ ${userPick.picked_team}`}
                color={userPick.result === 'W' ? "#22c55e" : userPick.result === 'L' ? "#ef4444" : "#60a5fa"}
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

          {/* Pick buttons */}
          <PickButtons game={game} user={user} userPick={userPick} onPick={handlePick} onChangePick={handleChangePick} />

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
