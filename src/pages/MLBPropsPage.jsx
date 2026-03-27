/**
 * MLBPropsPage.jsx
 * ================
 * MLB HR Props analyzer — park factor + weather + handedness + pitcher HR rate.
 *
 * HOW TO WIRE UP (morning):
 * 1. Add route in App.jsx:
 *    <Route path="/mlb-props" element={<MLBPropsPage user={user} profile={profile} onShowLogin={() => setShowWelcome(true)} />} />
 *
 * 2. Add nav tab in SportTabs (after MLB tab):
 *    <NavLink to="/mlb-props" style={({ isActive }) => tabStyle(isActive)}>💣<span className="nav-tab-label"> HR Props</span></NavLink>
 *
 * 3. Create useMLBPropsSlate hook (see bottom of this file for shape)
 *    Then replace MOCK_PROPS with:
 *      const { propsSlate, loading } = useMLBPropsSlate(today);
 *      const data = propsSlate || { date: today, props: [] };
 *
 * 4. Run SQL migration to create mlb_props_slates table (see PRD)
 */

import { useState } from 'react';

// ── Mock data — replace with useMLBPropsSlate() once table exists ─────────────
const MOCK_PROPS = {
  date: (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  })(),
  props: [
    {
      player: "Shohei Ohtani", team: "LAD", pos: "DH",
      game: "ARI @ LAD", matchup: "ARI @ LAD", opp_team: "ARI",
      opp_pitcher: "Zac Gallen", pitcher_hand: "R", pitcher_hr9: 1.42,
      batter_hand: "L", venue: "Dodger Stadium", park_factor: 96,
      stat: "Home Runs", line: 0.5, over_odds: -130, under_odds: 105,
      season_hr: 14, season_pa: 102, season_hr_rate: 0.137,
      last15_hr: 5, last15_pa: 58, last15_hr_rate: 0.086,
      weather: { dome: false, wind_speed_mph: 11, wind_direction: "out_to_cf", temp_f: 76, condition: "clear" },
      score: 82, lean: "OVER", confidence: "HIGH",
      narrative: "Ohtani's running hot with 5 HRs in his last 15 games, and Gallen's been giving up the long ball at a 1.42 HR/9 clip. Wind blowing out at 11mph seals it.",
      signals: [
        { text: "🔥 Running HOT: 5 HRs in last 58 PA (pace 1.6x season rate)", tag: "OVER" },
        { text: "Pitcher HR/9 = 1.42 — above-average HR rate allowed", tag: "OVER" },
        { text: "LHB vs RHP — favorable platoon split for power", tag: "OVER" },
        { text: "🌬️ Wind 11mph blowing out to CF — HR-friendly conditions", tag: "OVER" },
        { text: "Park factor 96 — slight pitcher advantage, but Ohtani pulls everything", tag: "NEUTRAL" },
      ]
    },
    {
      player: "Aaron Judge", team: "NYY", pos: "RF",
      game: "NYY @ BOS", matchup: "NYY @ BOS", opp_team: "BOS",
      opp_pitcher: "Brayan Bello", pitcher_hand: "R", pitcher_hr9: 1.65,
      batter_hand: "R", venue: "Fenway Park", park_factor: 105,
      stat: "Home Runs", line: 0.5, over_odds: -145, under_odds: 120,
      season_hr: 11, season_pa: 78, season_hr_rate: 0.141,
      last15_hr: 4, last15_pa: 52, last15_hr_rate: 0.077,
      weather: { dome: false, wind_speed_mph: 8, wind_direction: "out_to_cf", temp_f: 62, condition: "clear" },
      score: 76, lean: "OVER", confidence: "HIGH",
      narrative: "Judge is mashing at 1.41/PA this year, Bello's been giving up 1.65 HR/9, and Fenway's a hitter park. Wind's blowing out — this checks every box.",
      signals: [
        { text: "Elite HR rate: 11 HRs in 78 PA (14.1% per PA)", tag: "OVER" },
        { text: "Pitcher HR/9 = 1.65 — gives up HRs at well above-average rate", tag: "OVER" },
        { text: "Park factor 105 — hitter-friendly venue", tag: "OVER" },
        { text: "🌬️ Wind 8mph blowing out — HR-friendly conditions", tag: "OVER" },
        { text: "RHB vs RHP — same-hand matchup, slight disadvantage", tag: "NEUTRAL" },
      ]
    },
    {
      player: "Geraldo Perdomo", team: "AZ", pos: "SS",
      game: "ARI @ LAD", matchup: "ARI @ LAD", opp_team: "LAD",
      opp_pitcher: "Yoshinobu Yamamoto", pitcher_hand: "R", pitcher_hr9: 0.72,
      batter_hand: "S", venue: "Dodger Stadium", park_factor: 96,
      stat: "Home Runs", line: 0.5, over_odds: 185, under_odds: -230,
      season_hr: 2, season_pa: 94, season_hr_rate: 0.021,
      last15_hr: 1, last15_pa: 45, last15_hr_rate: 0.022,
      weather: { dome: false, wind_speed_mph: 11, wind_direction: "out_to_cf", temp_f: 76, condition: "clear" },
      score: 28, lean: "UNDER", confidence: "LOW",
      narrative: null,
      signals: [
        { text: "Below avg HR rate: 2 HRs in 94 PA (2.1%) — not a HR threat", tag: "CAUTION" },
        { text: "Yamamoto HR/9 = 0.72 — elite at suppressing HRs", tag: "WARN" },
        { text: "Switch hitter — always gets favorable platoon split", tag: "OVER" },
        { text: "🌬️ Wind 11mph blowing out — minor HR boost", tag: "OVER" },
        { text: "Park factor 96 — pitcher-friendly venue, suppresses HRs", tag: "CAUTION" },
      ]
    },
    {
      player: "Kyle Tucker", team: "LAD", pos: "RF",
      game: "ARI @ LAD", matchup: "ARI @ LAD", opp_team: "ARI",
      opp_pitcher: "Zac Gallen", pitcher_hand: "R", pitcher_hr9: 1.42,
      batter_hand: "L", venue: "Dodger Stadium", park_factor: 96,
      stat: "Home Runs", line: 0.5, over_odds: 120, under_odds: -145,
      season_hr: 6, season_pa: 87, season_hr_rate: 0.069,
      last15_hr: 1, last15_pa: 48, last15_hr_rate: 0.021,
      weather: { dome: false, wind_speed_mph: 11, wind_direction: "out_to_cf", temp_f: 76, condition: "clear" },
      score: 52, lean: "OVER", confidence: "MODERATE",
      narrative: null,
      signals: [
        { text: "🥶 Running COLD: 1 HR in last 48 PA (well below season pace)", tag: "CAUTION" },
        { text: "Pitcher HR/9 = 1.42 — above-average HR rate allowed", tag: "OVER" },
        { text: "LHB vs RHP — favorable platoon split for power", tag: "OVER" },
        { text: "🌬️ Wind 11mph blowing out to CF — HR-friendly conditions", tag: "OVER" },
        { text: "Park factor 96 — pitcher-friendly, but LHB pull to RF", tag: "NEUTRAL" },
      ]
    },
  ]
};
// ── End mock data ─────────────────────────────────────────────────────────────

const TAG_COLORS  = { OVER: "#22c55e", UNDER: "#ef4444", NEUTRAL: "#6b7280", CAUTION: "#f59e0b", WARN: "#f59e0b" };
const CONF_COLORS = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#6b7280" };

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({ text, color }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 7px", borderRadius: 3, whiteSpace: "nowrap",
      background: `${color}18`, color, fontWeight: 600,
    }}>{text}</span>
  );
}

function WeatherBadge({ weather }) {
  if (!weather) return null;
  if (weather.dome) return <Pill text="🏟 DOME" color="#6b7280" />;

  const dir = weather.wind_direction;
  const spd = weather.wind_speed_mph;
  const color = dir === "out_to_cf" && spd >= 8 ? "#22c55e"
              : dir === "in_from_cf" ? "#ef4444"
              : "#6b7280";
  const icon = dir === "out_to_cf" ? "🌬️ OUT" : dir === "in_from_cf" ? "💨 IN" : "〰️";
  return <Pill text={`${icon} ${spd}mph · ${weather.temp_f}°F`} color={color} />;
}

function ParkBadge({ factor, team }) {
  if (!factor) return null;
  const color = factor >= 105 ? "#f59e0b" : factor <= 95 ? "#22c55e" : "#6b7280";
  const label = factor >= 105 ? "🔥 HITTER" : factor <= 95 ? "🧊 PITCHER" : "⚾ NEUTRAL";
  return <Pill text={`PF ${factor} ${label}`} color={color} />;
}

function HandBadge({ batterHand, pitcherHand }) {
  if (!batterHand || !pitcherHand) return null;
  const favorable = batterHand === "S" || batterHand !== pitcherHand;
  const label = batterHand === "S" ? "SWITCH ✓"
              : favorable ? `${batterHand}HB vs ${pitcherHand}HP ✓`
              : `${batterHand}HB vs ${pitcherHand}HP ⚠`;
  return <Pill text={label} color={favorable ? "#22c55e" : "#6b7280"} />;
}

// ── HR Parlay Builder ─────────────────────────────────────────────────────────

function toDecimal(american) {
  if (!american) return 1.87;
  const n = parseInt(american);
  if (isNaN(n)) return 1.87;
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

function toAmerican(decimal) {
  if (!decimal || decimal <= 1) return null;
  const n = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
  return n > 0 ? `+${n}` : `${n}`;
}

function HRParlayBuilder({ props, user, onShowLogin }) {
  const [selected, setSelected] = useState([]);
  const eligible = props.filter(p => p.confidence !== "LOW" && p.lean === "OVER");

  function toggle(player) {
    setSelected(prev =>
      prev.includes(player)
        ? prev.filter(p => p !== player)
        : prev.length < 4 ? [...prev, player] : prev
    );
  }

  const selectedProps = eligible.filter(p => selected.includes(p.player));
  const combinedDecimal = selectedProps.reduce((acc, p) => acc * toDecimal(p.over_odds), 1);
  const combinedAmerican = toAmerican(combinedDecimal);
  const hasRealOdds = selectedProps.some(p => p.over_odds !== -115);

  if (eligible.length < 2) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(251,191,36,0.04))",
      border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 12, padding: "16px 18px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            💣 HR Parlay Builder
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
            Select 2–4 batters · Park + weather + pitcher all factored in
          </div>
        </div>
        {selected.length >= 2 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Combined odds</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>
              {hasRealOdds ? combinedAmerican : "~" + combinedAmerican}
            </div>
            {!hasRealOdds && <div style={{ fontSize: 9, color: "#374151" }}>Estimated (no live lines)</div>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {eligible.map((p, i) => {
          const isSelected = selected.includes(p.player);
          const confColor = CONF_COLORS[p.confidence];
          return (
            <div
              key={i}
              onClick={() => {
                if (!user) { onShowLogin(); return; }
                toggle(p.player);
              }}
              style={{
                padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                background: isSelected ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isSelected ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 12, width: 18, height: 18, borderRadius: "50%", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                  background: isSelected ? "#ef4444" : "rgba(255,255,255,0.06)",
                  color: isSelected ? "#fff" : "#4a5568", fontWeight: 700,
                }}>
                  {isSelected ? "✓" : "+"}
                </span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{p.player}</span>
                  <span style={{ fontSize: 11, color: "#4a5568", marginLeft: 6 }}>{p.team} · vs {p.opp_pitcher}</span>
                </div>
                <WeatherBadge weather={p.weather} />
                <ParkBadge factor={p.park_factor} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {p.over_odds && p.over_odds !== -115 && (
                  <span style={{ fontSize: 12, color: p.over_odds > 0 ? "#22c55e" : "#6b7280", fontWeight: 600 }}>
                    {p.over_odds > 0 ? `+${p.over_odds}` : p.over_odds}
                  </span>
                )}
                <Pill text={`${p.score}/100`} color={confColor} />
              </div>
            </div>
          );
        })}
      </div>

      {selected.length >= 2 && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, marginBottom: 4 }}>
            {selectedProps.length}-leg HR parlay: {selectedProps.map(p => p.player.split(" ").pop()).join(" + ")}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {selectedProps.map(p => `${p.player} HR vs ${p.opp_pitcher} (${p.park_factor} PF)`).join(" · ")}
          </div>
          <div style={{ fontSize: 10, color: "#374151", marginTop: 6 }}>
            ⚠ Always check official lineups before placing · Gamble responsibly · 1-800-GAMBLER
          </div>
        </div>
      )}

      {!user && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#4a5568", textAlign: "center" }}>
          🔒 Sign in to build parlays
        </div>
      )}
    </div>
  );
}

// ── Prop Card ─────────────────────────────────────────────────────────────────

function PropCard({ prop, isExpanded, onToggle, locked, onLockClick }) {
  const leanColor  = prop.lean === "OVER" ? "#22c55e" : "#ef4444";
  const confColor  = CONF_COLORS[prop.confidence];
  const diff15     = prop.last15_hr_rate - prop.season_hr_rate;
  const hasPace    = prop.last15_pa > 0;

  return (
    <div style={{
      background: "rgba(255,255,255,0.015)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12, overflow: "hidden",
      borderLeft: `3px solid ${confColor}`,
      opacity: locked ? 0.65 : 1,
    }}>
      {/* Header */}
      <div
        onClick={locked ? onLockClick : onToggle}
        style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{prop.player}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{prop.team} · {prop.pos}</span>
          </div>
          <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>
            {prop.game} · vs {prop.opp_pitcher} ({prop.pitcher_hand}HP) · {prop.venue}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            <WeatherBadge weather={prop.weather} />
            <ParkBadge factor={prop.park_factor} />
            <HandBadge batterHand={prop.batter_hand} pitcherHand={prop.pitcher_hand} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>HR O/U</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{prop.line}</div>
          </div>
          {locked ? (
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 700 }}>
              🔒 Sign in
            </span>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: leanColor }}>{prop.lean}</div>
              <div style={{ fontSize: 10, color: confColor }}>{prop.confidence}</div>
            </div>
          )}
          <div style={{ fontSize: 11, color: "#4a5568" }}>{isExpanded ? "▲" : "▼"}</div>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && !locked && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>

          {/* Narrative */}
          {prop.narrative && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#60a5fa", marginBottom: 4, textTransform: "uppercase" }}>OTJ Take</div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7, fontStyle: "italic" }}>{prop.narrative}</div>
            </div>
          )}

          {/* Stats grid */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              ["Line",       prop.line,              "#e2e8f0",  ""],
              ["Season HR",  prop.season_hr,          "#e2e8f0",  `${prop.season_pa} PA`],
              ["HR Rate",    `${(prop.season_hr_rate * 100).toFixed(1)}%`,
                              prop.season_hr_rate >= 0.07 ? "#22c55e" : prop.season_hr_rate <= 0.025 ? "#ef4444" : "#e2e8f0", "per PA"],
              ["L15 HRs",    prop.last15_hr,
                              hasPace ? (diff15 > 0.02 ? "#22c55e" : diff15 < -0.02 ? "#ef4444" : "#e2e8f0") : "#6b7280",
                              hasPace ? `${prop.last15_pa} PA` : "—"],
            ].map(([label, val, color, sub], i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color }}>{val}</div>
                {sub && <div style={{ fontSize: 10, color: "#4a5568" }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Pitcher stat */}
          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11 }}>
            <span style={{ color: "#6b7280" }}>Pitcher: <strong style={{ color: "#e2e8f0" }}>{prop.opp_pitcher}</strong></span>
            <span style={{ color: "#6b7280" }}>HR/9: <strong style={{ color: prop.pitcher_hr9 >= 1.4 ? "#22c55e" : prop.pitcher_hr9 <= 0.7 ? "#ef4444" : "#e2e8f0" }}>{prop.pitcher_hr9}</strong></span>
            <span style={{ color: "#6b7280" }}>Hand: <strong style={{ color: "#e2e8f0" }}>{prop.pitcher_hand}HP</strong></span>
          </div>

          {/* Odds row */}
          {(prop.over_odds || prop.under_odds) && (
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <div style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
                OVER {prop.line} {prop.over_odds > 0 ? `+${prop.over_odds}` : prop.over_odds}
              </div>
              <div style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
                UNDER {prop.line} {prop.under_odds > 0 ? `+${prop.under_odds}` : prop.under_odds}
              </div>
            </div>
          )}

          {/* Signals */}
          <div style={{ marginTop: 10 }}>
            {prop.signals.map((sig, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 3, minWidth: 56, textAlign: "center", flexShrink: 0,
                  background: `${TAG_COLORS[sig.tag] || "#6b7280"}15`,
                  color: TAG_COLORS[sig.tag] || "#6b7280", fontWeight: 600,
                }}>{sig.tag}</span>
                <span style={{ fontSize: 12, color: sig.tag === "WARN" || sig.tag === "CAUTION" ? "#f59e0b" : "#94a3b8" }}>
                  {sig.text}
                </span>
              </div>
            ))}
          </div>

          {/* Score bar */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a5568", marginBottom: 3 }}>
              <span>OTJ Score</span>
              <span style={{ color: CONF_COLORS[prop.confidence], fontWeight: 700 }}>{prop.score}/100 · {prop.confidence}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.4s ease",
                width: `${prop.score}%`,
                background: prop.score >= 70 ? "#ef4444" : prop.score >= 50 ? "#f59e0b" : "#6b7280",
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MLBPropsPage({ user, profile, onShowLogin }) {
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  })();

  // TODO: Replace with real hook once mlb_props_slates table exists:
  // const { propsSlate, loading } = useMLBPropsSlate(today);
  // const data = propsSlate || { date: today, props: [] };
  const data    = MOCK_PROPS;
  const loading = false;

  const [expanded,   setExpanded]   = useState({ 0: true });
  const [confFilter, setConfFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  const showLogin = onShowLogin || (() => {});
  const toggle    = i => setExpanded(p => ({ ...p, [i]: !p[i] }));

  let filtered = [...data.props];
  if (confFilter !== "all") filtered = filtered.filter(p => p.confidence === confFilter);
  if (teamFilter !== "all") filtered = filtered.filter(p => p.team === teamFilter);
  filtered.sort((a, b) => b.score - a.score);

  const highConf = filtered.filter(p => p.confidence === "HIGH");
  const teams    = [...new Set(data.props.map(p => p.team))].sort();

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#4a5568", fontSize: 13 }}>
      Loading HR props...
    </div>
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 24 }}>💣</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
            MLB HR Props
          </h1>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "#ef444418", color: "#ef4444", fontWeight: 600 }}>v1.0</span>
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>
          Park Factor · Wind Direction · Pitcher HR/9 · Batter Hand · Recent HR Pace
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill text={`📅 ${data.date} · ${data.props.length} batters scored`} color="#6b7280" />
          {!user && <Pill text={`🔒 1 free · ${data.props.length - 1} locked`} color="#ef4444" />}
          {user && (
            <>
              <select value={confFilter} onChange={e => setConfFilter(e.target.value)}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}>
                <option value="all">All Confidence</option>
                <option value="HIGH">HIGH Only</option>
                <option value="MODERATE">MODERATE+</option>
              </select>
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}>
                <option value="all">All Teams</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {/* High confidence banner */}
      {user && highConf.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6, textTransform: "uppercase" }}>🔥 Top HR Spots Tonight</div>
          {highConf.map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: "#fca5a5", marginBottom: 3 }}>
              <strong>{p.player}</strong> <span style={{ color: "#22c55e" }}>OVER {p.line} HRs</span>
              <span style={{ color: "#6b7280", marginLeft: 8 }}>vs {p.opp_pitcher} · {p.venue}</span>
              <span style={{ color: "#6b7280", marginLeft: 8 }}>Score: {p.score}/100</span>
            </div>
          ))}
        </div>
      )}

      {/* HR Parlay Builder */}
      <HRParlayBuilder props={filtered} user={user} onShowLogin={showLogin} />

      {/* Props list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Free prop */}
        {filtered.slice(0, 1).map((p, i) => (
          <PropCard key={i} prop={p} isExpanded={!!expanded[i]} onToggle={() => toggle(i)} locked={false} onLockClick={showLogin} />
        ))}

        {/* Logged in — rest */}
        {user && filtered.slice(1).map((p, i) => (
          <PropCard key={i+1} prop={p} isExpanded={!!expanded[i+1]} onToggle={() => toggle(i+1)} locked={false} onLockClick={showLogin} />
        ))}

        {/* Logged out — lock banner */}
        {!user && filtered.length > 1 && (
          <div onClick={showLogin} style={{
            cursor: "pointer", padding: "18px 20px", borderRadius: 12,
            background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
                🔒 {filtered.length - 1} more HR props locked tonight
              </div>
              <div style={{ fontSize: 11, color: "#4a5568", marginTop: 3 }}>
                Sign in free to unlock all picks, scores, park + weather analysis
              </div>
            </div>
            <span style={{ fontSize: 12, padding: "6px 16px", borderRadius: 6, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontWeight: 700 }}>
              Sign in →
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> 0–100 confidence. Higher = stronger HR edge.{" "}
        <strong style={{ color: "#4a5568" }}>PF:</strong> Park Factor — above 105 = hitter park, below 95 = pitcher park.{" "}
        <strong style={{ color: "#4a5568" }}>HR/9:</strong> Pitcher's home runs allowed per 9 innings this season.
        <br />
        <span style={{ color: "#ef4444", fontWeight: 600 }}>⚠ DISCLAIMER:</span> All analysis is for informational and entertainment purposes only.
        Always check final lineups and injury reports before betting. Gamble responsibly.{" "}
        <strong style={{ color: "#4a5568" }}>1-800-GAMBLER</strong>
      </div>
    </div>
  );
}

/*
 * ══════════════════════════════════════════════════════════════════
 * useMLBPropsSlate hook — create this file once Supabase table exists
 * Path: src/hooks/useMLBPropsSlate.js
 * ══════════════════════════════════════════════════════════════════
 *
 * import { useState, useEffect } from 'react';
 * import { supabase } from '../lib/supabase';
 *
 * export function useMLBPropsSlate(date) {
 *   const [propsSlate, setPropsSlate] = useState(null);
 *   const [loading, setLoading]       = useState(true);
 *
 *   useEffect(() => {
 *     if (!date) return;
 *     setLoading(true);
 *     supabase
 *       .from('mlb_props_slates')
 *       .select('*')
 *       .eq('date', date)
 *       .single()
 *       .then(({ data, error }) => {
 *         if (data) setPropsSlate(data);
 *         setLoading(false);
 *       });
 *   }, [date]);
 *
 *   return { propsSlate, loading };
 * }
 */
