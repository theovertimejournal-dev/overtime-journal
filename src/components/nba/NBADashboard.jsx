import { useState } from 'react';
import { useSlate } from '../../hooks/useSlate';
import { Pill } from '../common/Pill';
import { NBAGameCard } from './NBAGameCard';
import { B2BTierCard, SpreadMismatchCard } from './B2BTierCard';

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
        <div>
          <div style={{ fontSize: 10, color: "#4a5568" }}>RECORD</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            <span style={{ color: "#22c55e" }}>{w}</span>-<span style={{ color: "#ef4444" }}>{l}</span>
            {p > 0 && <span style={{ color: "#4a5568", fontSize: 13 }}> ({p}p)</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#4a5568" }}>WIN %</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct) >= 55 ? "#22c55e" : parseFloat(pct) >= 50 ? "#f59e0b" : "#ef4444" }}>
            {pct}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#4a5568" }}>UNITS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: units >= 0 ? "#22c55e" : "#ef4444" }}>
            {units >= 0 ? "+" : ""}{units.toFixed(1)}u
          </div>
        </div>
      </div>
      {betLog.length > 0 && (
        <div style={{ fontSize: 11, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6, marginTop: 8 }}>
          {betLog.slice(-5).reverse().map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              <span style={{ color: b.result === "W" ? "#22c55e" : b.result === "L" ? "#ef4444" : "#6b7280", fontWeight: 600 }}>
                {b.result === "W" ? "✓" : b.result === "L" ? "✗" : "○"}
              </span>
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
  const { slate, loading, error, source } = useSlate('nba', today);

  const [expanded, setExpanded] = useState({ 0: true, 3: true });
  const [sortBy, setSortBy] = useState("score");
  const [betLog, setBetLog] = useState([]);

  const toggle = i => setExpanded(p => ({ ...p, [i]: !p[i] }));

  const logBet = (matchup, pick, confidence, result) => {
    setBetLog(prev => {
      const ex = prev.findIndex(b => b.matchup === matchup);
      if (ex >= 0) {
        const u = [...prev];
        u[ex] = { ...u[ex], result };
        return u;
      }
      return [...prev, { matchup, pick, confidence, result }];
    });
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "#4a5568" }}>Loading tonight's slate...</div>
      </div>
    );
  }

  if (error && !slate) {
    return (
      <div style={{ padding: 24, color: "#ef4444", fontSize: 13 }}>
        Failed to load slate. {error}
      </div>
    );
  }

  const games = slate?.games || [];
  const sorted = [...games].sort((a, b) =>
    sortBy === "score" ? Math.abs(b.edge.score) - Math.abs(a.edge.score) : 0
  );
  const highConf = sorted.filter(g => g.edge.confidence === "HIGH");

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>

      {/* Dev indicator when using mock data */}
      {source === 'mock' && (
        <div style={{ fontSize: 10, color: "#4a5568", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 10px", marginBottom: 12, display: "inline-block" }}>
          ⚙ Mock data — Python pipeline not yet connected
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>🏀</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
            NBA Bench Edge Analyzer
          </h1>
          <Pill text="v1.2" color="#ef4444" />
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>
          Bench Net Rating · B2B Fatigue · Close Games · 3PT Variance · Injuries · Bet Tracking
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill text={`📅 ${slate?.date} · ${slate?.games_count} games`} color="#6b7280" />
          <Pill text={`🔥 ${slate?.cumulative_record} ${slate?.cumulative_note}`} color="#22c55e" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}
          >
            <option value="score">Sort: Edge Score</option>
            <option value="time">Sort: Game Time</option>
          </select>
        </div>
      </div>

      {/* Headline alert */}
      {slate?.headline && (
        <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
            🚨 HEADLINE: {slate.headline}
          </div>
        </div>
      )}

      {/* Yesterday's results */}
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

      {/* Betting log */}
      <BettingLog betLog={betLog} />

      {/* High confidence summary */}
      {highConf.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4, textTransform: "uppercase" }}>
            🔥 High Confidence Tonight
          </div>
          {highConf.map((g, i) => (
            <div key={i} style={{ fontSize: 13, color: "#fca5a5", marginBottom: 3 }}>
              {g.matchup} → <strong>{g.edge.lean}</strong> (score: {g.edge.score})
              {g.edge.ou_lean && <span style={{ marginLeft: 8, color: "#a855f7" }}>· {g.edge.ou_lean}</span>}
              {g.away.b2b && <span style={{ marginLeft: 6, color: "#f59e0b" }}>· {g.away.team} B2B</span>}
              {g.home.b2b && <span style={{ marginLeft: 6, color: "#f59e0b" }}>· {g.home.team} B2B</span>}
              {(g.away.key_out?.length > 0 || g.home.key_out?.length > 0) && (
                <span style={{ marginLeft: 6, color: "#ef4444" }}>· 🚑</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* B2B Tier Card */}
      {(slate?.b2b_tiers || slate?.b2b_tags) && (
        <B2BTierCard
          tiers={slate.b2b_tiers}
          tags={slate.b2b_tags}
          lesson={slate.b2b_lesson}
        />
      )}

      {/* Spread Mismatch Detector */}
      {slate?.spread_mismatches && (
        <SpreadMismatchCard mismatches={slate.spread_mismatches} />
      )}

      {/* Game cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((g, i) => (
          <NBAGameCard
            key={i}
            game={g}
            isExpanded={expanded[i]}
            onToggle={() => toggle(i)}
            betLog={betLog}
            onLogBet={logBet}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> Positive = lean strength.{" "}
        <strong style={{ color: "#4a5568" }}>Bench Net:</strong> Pts per 100 poss when bench is on.{" "}
        <strong style={{ color: "#4a5568" }}>Close:</strong> Games decided by ≤3 pts.
        <br />⚠ Always check final injury reports and lineups. One factor among many. Gamble responsibly.
      </div>
    </div>
  );
}
