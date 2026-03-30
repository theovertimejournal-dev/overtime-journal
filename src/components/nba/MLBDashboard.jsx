import { useState, useEffect } from 'react';
import { useSlate } from '../../hooks/useSlate';
import DateNav from '../common/DateNav';
import { Pill } from '../common/Pill';
import { LoginModal } from '../common/LoginModal';

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
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
          <span>{FATIGUE_ICON[r.fatigue] || "⚪"}</span>
          <span style={{ color: "#e2e8f0", flex: 1 }}>{r.name}<span style={{ color: "#4a5568" }}> ({r.hand})</span></span>
          <span style={{ color: "#6b7280" }}>{r.pitches_last_3d}p/3d</span>
          <span style={{ color: r.days_rest === 0 ? "#ef4444" : "#6b7280" }}>{r.days_rest}d rst</span>
          {/* ERA: use display_era from backend (already handles fallback logic) */}
          {r.display_era != null ? (
            <span style={{ color: r.display_era > 4.5 ? "#ef4444" : r.display_era < 3.0 ? "#22c55e" : "#94a3b8" }}>
              {fmt(r.display_era)} ERA
              {r.display_era_source === "2025" && (
                <span style={{ fontSize: 9, color: "#4a5568", marginLeft: 2 }}>'25</span>
              )}
            </span>
          ) : (r.prior_era ?? (PRIOR_BULLPEN_ERA[team] || {}).era) != null ? (
            <span style={{ color: "#4a5568" }} title="2025 season ERA">
              {fmt(r.prior_era ?? (PRIOR_BULLPEN_ERA[team] || {}).era)}{" "}
              <span style={{ fontSize: 9, color: "#374151" }}>'25</span>
            </span>
          ) : (
            <span style={{ color: "#374151" }}>— ERA</span>
          )}
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
  const realFeel = analysis.real_feel || {};
  const weather = analysis.weather || {};

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
              {game.status && (
                <span style={{ fontSize: 9, color: "#4a5568" }}>{game.status}</span>
              )}
            </div>
            {game.venue && (
              <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{game.venue}</div>
            )}
          </div>

          {/* Starters line — most important context */}
          {(analysis.away_starter?.name || game.away_starter) && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                {analysis.away_starter?.name || game.away_starter}
              </span>
              <span style={{ color: "#374151", margin: "0 6px" }}>vs</span>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                {analysis.home_starter?.name || game.home_starter}
              </span>
            </div>
          )}

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

              {/* Starting Pitchers */}
              {(analysis.away_starter?.name || analysis.home_starter?.name) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
                    Starting Pitchers
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { sp: analysis.away_starter, team: game.away_team, tto: analysis.away_tto },
                      { sp: analysis.home_starter, team: game.home_team, tto: analysis.home_tto },
                    ].map(({ sp, team, tto }, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 4 }}>{team}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
                          {sp?.name || "TBD"}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <br />
          <strong style={{ color: "#4a5568" }}>Real Feel:</strong> 0-100 HR conditions (park + wind + temp). &nbsp;
          <span style={{ color: "#ef4444" }}>70+ ELITE</span> · <span style={{ color: "#f59e0b" }}>50-69 WARM</span> · 35-49 NEUTRAL · <span style={{ color: "#60a5fa" }}>&lt;35 COLD</span>
          <br />⚠ One factor among many. Always check line value. Gamble responsibly.
        </div>
      )}
    </div>
  );
}
