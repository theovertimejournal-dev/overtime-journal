import { useState, useEffect } from 'react';
import { useSlate } from '../../hooks/useSlate';
import DateNav from '../common/DateNav';
import { Pill } from '../common/Pill';
import { LoginModal } from '../common/LoginModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONF_COLOR = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#6b7280" };
const FATIGUE_COLOR = { HIGH: "#ef4444", MODERATE: "#f59e0b", FRESH: "#22c55e" };
const FATIGUE_ICON  = { HIGH: "🔴", MODERATE: "🟡", FRESH: "🟢" };

function fmt(val, dec = 2) {
  if (val == null) return "—";
  return parseFloat(val).toFixed(dec);
}

function StatBox({ label, value, highlight }) {
  return (
    <div style={{
      background: highlight ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${highlight ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center"
    }}>
      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? "#ef4444" : "#e2e8f0" }}>{value ?? "—"}</div>
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
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
          <span>{FATIGUE_ICON[r.fatigue] || "⚪"}</span>
          <span style={{ color: "#e2e8f0", flex: 1 }}>{r.name}<span style={{ color: "#4a5568" }}> ({r.hand})</span></span>
          <span style={{ color: "#6b7280" }}>{r.pitches_last_3d}p/3d</span>
          <span style={{ color: r.days_rest === 0 ? "#ef4444" : "#6b7280" }}>{r.days_rest}d rst</span>
          <span style={{ color: r.era_7d > 4.5 ? "#ef4444" : "#94a3b8" }}>{fmt(r.era_7d)} ERA</span>
        </div>
      ))}
    </div>
  );
}

// ── MLB Game Card ─────────────────────────────────────────────────────────────

function MLBGameCard({ game, isExpanded, onToggle, isFree, user }) {
  const analysis = game.analysis || {};
  const ab = analysis.away_bullpen || {};
  const hb = analysis.home_bullpen || {};
  const apyth = analysis.away_pythagorean || {};
  const hpyth = analysis.home_pythagorean || {};
  const park = analysis.park_factor || {};

  const lean = game.lean;
  const conf = game.confidence || "LOW";
  const signals = game.signals || [];
  const confColor = CONF_COLOR[conf] || "#6b7280";

  const hasOdds = game.ml_home != null || game.ml_away != null;
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>

          {/* Left: matchup + venue */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                {game.away_team} <span style={{ color: "#374151" }}>@</span> {game.home_team}
              </span>
              {park.factor && (
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${parkColor}15`, color: parkColor, fontWeight: 600 }}>
                  PF {park.factor}
                </span>
              )}
              {game.status && (
                <span style={{ fontSize: 9, color: "#4a5568" }}>{game.status}</span>
              )}
            </div>
            {game.venue && (
              <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{game.venue}</div>
            )}
          </div>

          {/* Right: lean + odds */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {hasOdds && (
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {game.away_team} {awayML} / {game.home_team} {homeML}
              </div>
            )}
            {game.total && (
              <div style={{ fontSize: 11, color: "#6b7280" }}>O/U {game.total}</div>
            )}
            {lean ? (
              <div style={{
                padding: "5px 12px", borderRadius: 6,
                background: `${confColor}15`, border: `1px solid ${confColor}30`
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: confColor }}>{lean}</span>
                <span style={{ fontSize: 9, color: confColor, opacity: 0.7, marginLeft: 4 }}>{conf}</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: "#374151" }}>No lean</span>
            )}
            <span style={{ fontSize: 12, color: "#374151" }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
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

              {/* Bullpen comparison */}
              {(ab.team || hb.team) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>Bullpen Comparison (7d)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[ab, hb].map((bp, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{bp.team || (i === 0 ? game.away_team : game.home_team)}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <StatBox label="ERA" value={fmt(bp.bullpen_era)} highlight={bp.bullpen_era >= 4.5} />
                          <StatBox label="WHIP" value={fmt(bp.bullpen_whip)} highlight={bp.bullpen_whip >= 1.4} />
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 11 }}>
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

              {/* Park factor note */}
              {park.factor && (
                <div style={{ marginTop: 10, fontSize: 10, color: parkColor }}>
                  ⚾ {game.home_team} — {parkLabel.replace(/_/g, " ")} (PF {park.factor})
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MLBDashboard({ user }) {
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

  const games = slate?.games || [];
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
          />
        ))}
      </div>

      {/* Footer */}
      {games.length > 0 && (
        <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
          <strong style={{ color: "#4a5568" }}>Fatigue:</strong> 0 = fresh, 100 = gassed. &nbsp;
          <strong style={{ color: "#4a5568" }}>Luck:</strong> negative = due for regression UP. &nbsp;
          <strong style={{ color: "#4a5568" }}>Park Factor:</strong> 100 = neutral, &gt;105 = hitter friendly.
          <br />⚠ One factor among many. Always check line value. Gamble responsibly.
        </div>
      )}
    </div>
  );
}
