import { Pill } from '../common/Pill';
import { NBATeamColumn } from './NBATeamColumn';
import { NBAEdgeSignals } from './NBAEdgeSignals';

const CONFIDENCE_COLORS = { SHARP: "#ef4444", LEAN: "#f59e0b", INFO: "#6b7280" };

function formatGameTime(raw) {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', hour12: true
    }) + ' ET';
  } catch {
    return raw;
  }
}


export function NBAGameCard({ game, isExpanded, onToggle, betLog, onLogBet }) {
  // Null guard — if game data isn't fully normalized yet, render nothing
  if (!game || !game.away || !game.home || !game.edge) return null;

  const { away, home, edge, spread, total, win_prob, matchup, venue, game_time } = game;
  const cc = CONFIDENCE_COLORS[edge.confidence] || "#6b7280";

  const existingBet = betLog?.find(b => b.matchup === matchup);

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      overflow: "hidden"
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{ padding: "14px 18px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{matchup}</span>
            <Pill text={formatGameTime(game_time)} color="#6b7280" />
            {(away?.b2b || home?.b2b) && (
              <Pill text={`${away?.b2b ? away.team : home.team} B2B`} color="#f59e0b" />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4a5568" }}>LEAN</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cc }}>{edge.lean}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4a5568" }}>CONF</div>
              <Pill text={edge.confidence} color={cc} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4a5568" }}>SCORE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{edge.score}</div>
            </div>
            <span style={{ fontSize: 14, color: "#4a5568" }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Line info */}
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Spread: <span style={{ color: "#e2e8f0" }}>{spread}</span></div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Total: <span style={{ color: "#e2e8f0" }}>O/U {total}</span></div>
          {edge.ou_lean && <div style={{ fontSize: 11, color: "#a855f7" }}>O/U Lean: <strong>{edge.ou_lean}</strong></div>}
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

          {/* Edge signals */}
          {edge.signals?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>
                Edge Signals
              </div>
              <NBAEdgeSignals signals={edge.signals} ouLean={edge.ou_lean} />
            </div>
          )}

          {/* Bet logger */}
          <div style={{ marginTop: 14 }}>
            {!existingBet && (
              <button
                onClick={() => onLogBet?.(matchup, edge.lean, edge.confidence, null)}
                style={{
                  fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                  background: `${cc}18`, border: `1px solid ${cc}40`, color: cc,
                  fontFamily: "inherit"
                }}
              >
                📝 Log {edge.lean}
              </button>
            )}
            {existingBet && !existingBet.result && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onLogBet?.(matchup, existingBet.pick, existingBet.confidence, "W")}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "inherit", fontWeight: 600 }}>
                  ✓ Hit
                </button>
                <button onClick={() => onLogBet?.(matchup, existingBet.pick, existingBet.confidence, "L")}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 600 }}>
                  ✗ Miss
                </button>
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
