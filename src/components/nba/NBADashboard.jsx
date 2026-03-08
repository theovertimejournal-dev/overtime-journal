import { useState, useEffect } from 'react';
import { useSlate } from '../../hooks/useSlate';
import { usePropsSlate } from '../../hooks/usePropsSlate';
import { Pill } from '../common/Pill';
import { NBAGameCard } from './NBAGameCard';
import { B2BTierCard, SpreadMismatchCard } from './B2BTierCard';
import { LoginModal } from '../common/LoginModal';
import { RecordWidget } from '../common/RecordWidget';

// ── Parlay Builder ────────────────────────────────────────────────────────────

// Convert American odds to decimal
function toDecimal(ml) {
  if (!ml) return null;
  const n = parseInt(ml);
  if (isNaN(n)) return null;
  return n > 0 ? (n / 100) + 1 : (100 / Math.abs(n)) + 1;
}

// Convert American odds to implied probability (0–1)
function impliedProb(ml) {
  if (!ml) return null;
  const n = parseInt(ml);
  if (isNaN(n)) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

// Convert decimal odds back to American for display
function toAmerican(dec) {
  if (!dec || dec <= 1) return null;
  const n = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return n > 0 ? `+${n}` : `${n}`;
}

// EV score = edge_score adjusted by how much our model disagrees with the market
// Higher = more value vs the line
function calcEV(game, isHome) {
  const edgeScore = game.edge?.score || 0;
  const ml = isHome ? game.ml_home : game.ml_away;
  if (!ml) return edgeScore;
  const mktProb = impliedProb(ml);
  // Model confidence proxy: normalize edge_score to 0.5–0.85 range
  const modelProb = 0.5 + (edgeScore / 100) * 0.35;
  const edge = modelProb - mktProb;
  // EV = edge_score × (1 + market_disagreement_bonus)
  return edgeScore * (1 + Math.max(0, edge) * 2);
}

// Pick the best spread leg, ML leg, and prop leg
function buildParlay(games, props) {
  const MIN_SCORE = 7;
  const qualified = (games || []).filter(g => (g.edge?.score || 0) >= MIN_SCORE && g.edge?.lean);

  if (!qualified.length) return null;

  // ── Spread leg: highest EV game, take the spread ──
  const spreadCandidates = qualified.map(g => {
    const isHome = g.edge.lean === g.home?.team;
    const ev = calcEV(g, isHome);
    const ml = isHome ? g.ml_home : g.ml_away;
    const spread = isHome ? g.spread_home : g.spread_away;
    const spreadStr = spread != null ? `${g.edge.lean} ${parseFloat(spread) > 0 ? '+' : ''}${parseFloat(spread).toFixed(1)}` : g.edge.lean;
    return { game: g, ev, ml, spread: spreadStr, isHome, type: 'spread', label: spreadStr, matchup: g.matchup };
  }).sort((a, b) => b.ev - a.ev);

  const spreadLeg = spreadCandidates[0] || null;

  // ── ML leg: best value moneyline — prefer underdog our model likes ──
  const mlCandidates = qualified
    .filter(g => g !== spreadLeg?.game) // different game from spread leg if possible
    .map(g => {
      const isHome = g.edge.lean === g.home?.team;
      const ml = isHome ? g.ml_home : g.ml_away;
      if (!ml) return null;
      const n = parseInt(ml);
      if (isNaN(n)) return null;
      const ev = calcEV(g, isHome);
      // Bonus for underdogs we like (positive ML = underdog)
      const underdogBonus = n > 0 ? n / 100 : 0;
      return { game: g, ev: ev + underdogBonus * 3, ml, mlDisplay: n > 0 ? `+${n}` : `${n}`, isHome, type: 'ml', label: `${g.edge.lean} ML ${n > 0 ? '+' : ''}${n}`, matchup: g.matchup };
    })
    .filter(Boolean)
    .sort((a, b) => b.ev - a.ev);

  // Fall back to same game if only 1 qualifies
  const mlLeg = mlCandidates[0] || (spreadLeg ? {
    ...spreadLeg,
    type: 'ml',
    label: spreadLeg.ml ? `${spreadLeg.game.edge.lean} ML` : null,
  } : null);

  // ── Prop leg: highest scored prop ──
  const propLeg = props?.length
    ? { type: 'prop', prop: props[0], label: `${props[0].player} ${props[0].lean} ${props[0].line} ${props[0].stat}`, matchup: props[0].matchup }
    : null;

  // ── Calculate combined odds ──
  const legs = [spreadLeg, mlLeg, propLeg].filter(Boolean);
  if (legs.length < 2) return null;

  // Spread/ML legs use their ML odds as proxy; prop legs assume ~-115 (standard)
  const decimalOdds = legs.map(leg => {
    if (leg.type === 'prop') return toDecimal(-115);
    return toDecimal(leg.ml) || 1.87; // fallback ~-115
  });

  const combinedDecimal = decimalOdds.reduce((acc, d) => acc * d, 1);
  const combinedAmerican = toAmerican(combinedDecimal);

  return { legs, combinedDecimal, combinedAmerican, legCount: legs.length };
}

// Date-seeded RNG — same result for all visitors on a given day, resets tomorrow
function getDailyTier(dateStr) {
  // Simple hash from date string → 0-99
  const hash = dateStr.split('-').reduce((acc, n, i) => acc + parseInt(n) * (i + 7) * 13, 0);
  const roll = hash % 100;
  if (roll < 5)  return "SHARP";   // 5% chance
  if (roll < 30) return "LEAN";    // 25% chance
  return "INFO";                    // 70% chance
}

function getFreeGame(games, dateStr) {
  if (!games?.length) return { game: null, tier: "INFO" };
  const tier = getDailyTier(dateStr);

  // Try to find a game matching today's tier, cascade down if none exist
  const tiers = tier === "SHARP" ? ["SHARP","LEAN","INFO"]
              : tier === "LEAN"  ? ["LEAN","INFO"]
              :                    ["INFO","LEAN"];

  for (const t of tiers) {
    const matches = games.filter(g => g.edge?.confidence === t);
    if (matches.length) {
      const seed = dateStr.split('-').reduce((s, n) => s + parseInt(n), 0);
      return { game: matches[seed % matches.length], tier: t };
    }
  }
  return { game: games[0], tier: games[0]?.edge?.confidence || "INFO" };
}

function BettingLog({ betLog }) {
  if (!betLog.length) return null;
  const w = betLog.filter(b => b.result === "W").length;
  const l = betLog.filter(b => b.result === "L").length;
  const p = betLog.filter(b => !b.result).length;
  const tot = w + l;
  const pct = tot > 0 ? ((w / tot) * 100).toFixed(1) : "—";
  const units = w * 1 - l * 1.1;
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>🏀 Betting Log</div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 10, color: "#4a5568" }}>RECORD</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}><span style={{ color: "#22c55e" }}>{w}</span>-<span style={{ color: "#ef4444" }}>{l}</span>{p > 0 && <span style={{ color: "#4a5568", fontSize: 13 }}> ({p}p)</span>}</div></div>
        <div><div style={{ fontSize: 10, color: "#4a5568" }}>WIN %</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct) >= 55 ? "#22c55e" : parseFloat(pct) >= 50 ? "#f59e0b" : "#ef4444" }}>{pct}%</div></div>
        <div><div style={{ fontSize: 10, color: "#4a5568" }}>UNITS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: units >= 0 ? "#22c55e" : "#ef4444" }}>{units >= 0 ? "+" : ""}{units.toFixed(1)}u</div></div>
      </div>
      {betLog.length > 0 && (
        <div style={{ fontSize: 11, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6, marginTop: 8 }}>
          {betLog.slice(-5).reverse().map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              <span style={{ color: b.result === "W" ? "#22c55e" : b.result === "L" ? "#ef4444" : "#6b7280", fontWeight: 600 }}>{b.result === "W" ? "✓" : b.result === "L" ? "✗" : "○"}</span>
              <span style={{ color: "#94a3b8" }}>{b.matchup}</span>
              <span style={{ color: "#60a5fa" }}>→ {b.pick}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NBADashboard({ user, profile }) {
  // Use local date — toISOString() returns UTC which breaks in AZ evening hours
  const today = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const { slate, loading, source } = useSlate('nba', today);
  const { propsSlate } = usePropsSlate(today);
  const topProps = [...(propsSlate?.props || [])].sort((a, b) => (b.score || 0) - (a.score || 0));

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [sortBy, setSortBy] = useState("score");
  const [betLog, setBetLog] = useState([]);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // Close login modal when user signs in via App.jsx auth
  useEffect(() => {
    if (user) setShowModal(false);
  }, [user]);

  // Safety net — if useSlate hangs (Supabase RLS blocking anon reads),
  // stop spinner after 5s and render locked state instead of infinite loading
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoadTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

 const sorted = [...(slate?.games || [])].sort((a, b) => sortBy === "score" ? Math.abs(b.edge?.score || 0) - Math.abs(a.edge?.score || 0) : 0);

  const sharpConf = sorted.filter(g => g.edge?.confidence === "SHARP");
  const parlay = buildParlay(sorted, topProps);
  const { game: freeGame, tier: freeTier } = getFreeGame(sorted, today);

  useEffect(() => {
    if (!user && freeGame) {
      const idx = sorted.findIndex(g => g.matchup === freeGame.matchup);
      setExpanded({ [idx]: true });
    }
  }, [user, sorted.length]);

  const toggle = (i, isFree) => {
    if (!user && !isFree) { setShowModal(true); return; }
    setExpanded(p => ({ ...p, [i]: !p[i] }));
  };

  const logBet = (matchup, pick, confidence, result) => {
    if (!user) { setShowModal(true); return; }
    setBetLog(prev => {
      const ex = prev.findIndex(b => b.matchup === matchup);
      if (ex >= 0) { const u = [...prev]; u[ex] = { ...u[ex], result }; return u; }
      return [...prev, { matchup, pick, confidence, result }];
    });
  };

  if (loading && !loadTimedOut) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, color: "#4a5568" }}>Loading tonight's slate...</div>
      <div style={{ fontSize: 10, color: "#374151" }}>Connecting to pipeline</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>

      {showModal && <LoginModal onClose={() => setShowModal(false)} />}

      {source === 'mock' && (
        <div style={{ fontSize: 10, color: "#4a5568", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 10px", marginBottom: 12, display: "inline-block" }}>
          ⚙ Mock data — Python pipeline not yet connected
        </div>
      )}

      <RecordWidget slate={slate} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize: 26,
            display: "inline-block",
            animation: "spinBall 3s linear infinite",
          }}>🏀</span>
          <style>{`@keyframes spinBall { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>NBA Bench Edge Analyzer</h1>
          <Pill text="v1.2" color="#ef4444" />
          <span
            onClick={() => window.location.href = '/arcade'}
            title="🕹 Play NBA Jam"
            style={{ fontSize: 16, cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
          >🕹</span>
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>Bench Net Rating · B2B Fatigue · Close Games · 3PT Variance · Injuries · Bet Tracking</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill text={`📅 ${slate?.date}`} color="#6b7280" />
          <Pill text={`${slate?.games_count} games tonight`} color="#6b7280" />
          {!user && <Pill text={`Today: ${freeTier} free · ${(slate?.games_count || 1) - 1} locked 🔒`} color={freeTier === "SHARP" ? "#ef4444" : freeTier === "LEAN" ? "#f59e0b" : "#6b7280"} />}
          <Pill text={`🔥 ${slate?.cumulative_record} ${slate?.cumulative_note}`} color="#22c55e" />
          {user && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}>
              <option value="score">Sort: Edge Score</option>
              <option value="time">Sort: Game Time</option>
            </select>
          )}
        </div>
      </div>

      {slate?.headline && (
        <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>🚨 HEADLINE: {slate.headline}</div>
        </div>
      )}

      {slate?.yesterday_results?.length > 0 && (
        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>
            ✅ LAST NIGHT: {slate.yesterday_record} (CUMULATIVE: {slate.cumulative_record})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {slate.yesterday_results.map((r, i) => (
              <div key={i} style={{
                fontSize: 10, padding: "4px 10px", borderRadius: 6,
                background: r.result === "W" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${r.result === "W" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                color: r.result === "W" ? "#86efac" : "#fca5a5"
              }}>
                {r.result === "W" ? "✓" : "✗"} {r.game} → {r.lean || "NO LEAN"} ({r.score})
              </div>
            ))}
          </div>
        </div>
      )}

      {user && (
        <>
          <BettingLog betLog={betLog} />
          {parlay && (
            <div style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 12, padding: "16px 18px", marginBottom: 16,
              boxShadow: "0 0 24px rgba(239,68,68,0.07)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🔥</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      OTJ'S PARLAY TONIGHT
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                      {parlay.legCount}-leg mixed · EV-weighted · parlay at your own risk 😈
                    </div>
                  </div>
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", textAlign: "center" }}>Est. Odds</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444", textAlign: "center" }}>{parlay.combinedAmerican || "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {parlay.legs.map((leg, i) => {
                  const typeColor = leg.type === 'spread' ? "#f59e0b" : leg.type === 'ml' ? "#22c55e" : "#a855f7";
                  const typeLabel = leg.type === 'spread' ? "SPREAD" : leg.type === 'ml' ? "ML" : "PROP";
                  const typeEmoji = leg.type === 'spread' ? "📊" : leg.type === 'ml' ? "💰" : "🎯";
                  const mlVal = leg.ml ? parseInt(leg.ml) : null;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${typeColor}18`, color: typeColor, fontWeight: 700, letterSpacing: "0.05em" }}>
                          {typeEmoji} {typeLabel}
                        </span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{leg.label}</div>
                          <div style={{ fontSize: 10, color: "#4a5568" }}>{leg.matchup}</div>
                        </div>
                      </div>
                      {leg.type !== 'prop' && mlVal && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: mlVal > 0 ? "#22c55e" : "#6b7280" }}>
                          {mlVal > 0 ? `+${mlVal}` : mlVal}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#4a5568", borderTop: "1px solid rgba(239,68,68,0.1)", paddingTop: 8 }}>
                💡 EV-weighted picks · spread odds used as ML proxy for estimate · verify lines at your sportsbook
              </div>
            </div>
          )}
          {(slate?.b2b_tiers || slate?.b2b_tags) && <B2BTierCard tiers={slate.b2b_tiers} tags={slate.b2b_tags} lesson={slate.b2b_lesson} />}
          {slate?.spread_mismatches && <SpreadMismatchCard mismatches={slate.spread_mismatches} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map((g, i) => (
              <NBAGameCard key={i} game={g} isExpanded={expanded[i]} onToggle={() => toggle(i, false)} betLog={betLog} onLogBet={logBet} user={user} />
            ))}
          </div>
        </>
      )}

      {!user && (
        <>
          {freeGame && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: freeTier === "SHARP" ? "#ef4444" : freeTier === "LEAN" ? "#f59e0b" : "#6b7280" }}>
                  {freeTier === "SHARP" ? "🔥" : freeTier === "LEAN" ? "⚡" : "🎁"} TODAY'S FREE PICK —{" "}
                  <span style={{ color: freeTier === "SHARP" ? "#ef4444" : freeTier === "LEAN" ? "#f59e0b" : "#6b7280" }}>
                    {freeTier}
                  </span>
                </span>
                <span style={{ fontSize: 10, color: "#4a5568", fontWeight: 400 }}>
                  {freeTier === "SHARP" ? "🎉 Lucky day — full SHARP analysis unlocked free" :
                   freeTier === "LEAN"  ? "Not bad — LEAN pick free today. Come back for SHARP." :
                                          "INFO pick today. Sign up to see the good stuff."}
                </span>
              </div>
              <NBAGameCard game={freeGame} isExpanded={true} onToggle={() => {}} betLog={[]} onLogBet={() => setShowModal(true)} user={user} />
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 8 }}>
              🔒 {sorted.length - 1} more games —{" "}
              <span onClick={() => setShowModal(true)} style={{ color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
                sign in free to unlock
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.filter(g => g.matchup !== freeGame?.matchup).map((g, i) => (
                <div key={i} onClick={() => setShowModal(true)}
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 18px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{g.matchup}</span>
                      <Pill text={g.game_time} color="#6b7280" />
                      {(g.away?.b2b || g.home?.b2b) && <Pill text={`${g.away?.b2b ? g.away?.team : g.home?.team} B2B`} color="#f59e0b" />}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{g.spread}</span>
                      <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 4, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 600 }}>
                        🔒 Sign in to view
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20, padding: "20px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>Unlock all {sorted.length} games tonight</div>
            <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 16 }}>Free account · No credit card · Just Google sign in</div>
            <button onClick={() => setShowModal(true)} style={{ fontSize: 13, padding: "10px 28px", borderRadius: 8, cursor: "pointer", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 700 }}>
              Create Free Account →
            </button>
          </div>
        </>
      )}

      <div style={{ marginTop: 28, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 2 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> Positive = lean strength (HOME favored). &nbsp;
        <strong style={{ color: "#4a5568" }}>SHARP:</strong> Score ≥14. &nbsp;
        <strong style={{ color: "#4a5568" }}>LEAN:</strong> Score 8–13. &nbsp;
        <strong style={{ color: "#4a5568" }}>INFO:</strong> Score &lt;8. &nbsp;
        <strong style={{ color: "#4a5568" }}>Close:</strong> Games decided by ≤5 pts L10.
        <br />
        <span style={{ color: "#ef4444", fontWeight: 600 }}>⚠ DISCLAIMER:</span>
        {" "}All analysis on OTJ is for <strong style={{ color: "#4a5568" }}>informational and entertainment purposes only</strong>. Nothing here constitutes financial, betting, or investment advice. Past performance does not guarantee future results. Always gamble responsibly and within your means. If you or someone you know has a gambling problem, call <strong style={{ color: "#4a5568" }}>1-800-GAMBLER</strong>.
      </div>
    </div>
  );
}
