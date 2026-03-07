import { useState, useEffect } from 'react';
import { useSlate } from '../../hooks/useSlate';
import { supabase } from '../../lib/supabase';
import { Pill } from '../common/Pill';
import { NBAGameCard } from './NBAGameCard';
import { B2BTierCard, SpreadMismatchCard } from './B2BTierCard';
import { LoginModal } from '../common/LoginModal';
import { RecordWidget } from '../common/RecordWidget';

function getFreeGame(games) {
  if (!games?.length) return null;
  const eligible = games.filter(g => g.edge?.confidence === "HIGH" || g.edge?.confidence === "MODERATE");
  if (!eligible.length) return games[0];
  const today = new Date().toISOString().split('T')[0];
  const seed = today.split('-').reduce((s, n) => s + parseInt(n), 0);
  return eligible[seed % eligible.length];
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

export default function NBADashboard() {
  const today = new Date().toISOString().split('T')[0];
  const { slate, loading, source } = useSlate('nba', today);

  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [sortBy, setSortBy] = useState("score");
  const [betLog, setBetLog] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) setShowModal(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const sorted = [...(slate?.games || [])].map(g => ({
    ...g,
    edge: g.edge || g.edge_data || {},
    away: g.away || g.away_data || {},
    home: g.home || g.home_data || {},
  })).sort((a, b) => sortBy === "score" ? Math.abs(b.edge?.score || 0) - Math.abs(a.edge?.score || 0) : 0);

  const highConf = sorted.filter(g => g.edge?.confidence === "HIGH");
  const freeGame = getFreeGame(sorted);

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

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 13, color: "#4a5568" }}>Loading tonight's slate...</div>
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
          <span style={{ fontSize: 26 }}>🏀</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>NBA Bench Edge Analyzer</h1>
          <Pill text="v1.2" color="#ef4444" />
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>Bench Net Rating · B2B Fatigue · Close Games · 3PT Variance · Injuries · Bet Tracking</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill text={`📅 ${slate?.date}`} color="#6b7280" />
          <Pill text={`${slate?.games_count} games tonight`} color="#6b7280" />
          {!user && <Pill text={`1 free pick · ${(slate?.games_count || 1) - 1} locked 🔒`} color="#f59e0b" />}
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
          {highConf.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4, textTransform: "uppercase" }}>🔥 High Confidence Tonight</div>
              {highConf.map((g, i) => (
                <div key={i} style={{ fontSize: 13, color: "#fca5a5", marginBottom: 3 }}>
                  {g.matchup} → <strong>{g.edge?.lean}</strong> (score: {g.edge?.score})
                  {g.edge?.ou_lean && <span style={{ marginLeft: 8, color: "#a855f7" }}>· {g.edge?.ou_lean}</span>}
                  {g.away?.b2b && <span style={{ marginLeft: 6, color: "#f59e0b" }}>· {g.away?.team} B2B</span>}
                  {g.home?.b2b && <span style={{ marginLeft: 6, color: "#f59e0b" }}>· {g.home?.team} B2B</span>}
                </div>
              ))}
            </div>
          )}
          {(slate?.b2b_tiers || slate?.b2b_tags) && <B2BTierCard tiers={slate.b2b_tiers} tags={slate.b2b_tags} lesson={slate.b2b_lesson} />}
          {slate?.spread_mismatches && <SpreadMismatchCard mismatches={slate.spread_mismatches} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map((g, i) => (
              <NBAGameCard key={i} game={g} isExpanded={expanded[i]} onToggle={() => toggle(i, false)} betLog={betLog} onLogBet={logBet} />
            ))}
          </div>
        </>
      )}

      {!user && (
        <>
          {freeGame && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🎁 FREE PICK OF THE DAY</span>
                <span style={{ fontSize: 10, color: "#4a5568", fontWeight: 400 }}>Full breakdown · Changes daily</span>
              </div>
              <NBAGameCard game={freeGame} isExpanded={true} onToggle={() => {}} betLog={[]} onLogBet={() => setShowModal(true)} />
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

      <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> Positive = lean strength. <strong style={{ color: "#4a5568" }}>Bench Net:</strong> Pts per 100 poss when bench is on. <strong style={{ color: "#4a5568" }}>Close:</strong> Games decided by ≤3 pts.
        <br />⚠ For informational purposes only. Gamble responsibly. 1-800-GAMBLER.
      </div>
    </div>
  );
}
