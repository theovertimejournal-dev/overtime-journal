import { useState } from "react";

const PROPS_DATA = {
  date: "2026-03-05",
  games_count: 9,
  props: [
    // CHI @ PHX — Bulls B2B
    { player: "Devin Booker", team: "PHX", pos: "G", game: "CHI @ PHX", stat: "Points", line: 27.5,
      season_avg: 27.8, last5_avg: 29.5, last10_avg: 28.2, minutes_avg: 36.0,
      matchup_rating: "Favorable", opp_pos_rank: 22, opp_team: "CHI",
      pace_factor: "Pace Up", b2b: false, opp_b2b: true,
      lean: "OVER", confidence: "HIGH", score: 82,
      signals: [
        { text: "CHI on B2B — defensive intensity drops, especially on the road", tag: "OVER" },
        { text: "CHI 22nd in pts allowed to SGs — weak guard defense", tag: "OVER" },
        { text: "L5 avg 29.5, trending above line", tag: "OVER" },
        { text: "At home in PHX where Booker is elite", tag: "OVER" },
      ]
    },
    { player: "Victor Wembanyama", team: "SAS", pos: "C", game: "DET @ SAS", stat: "Blocks", line: 3.5,
      season_avg: 3.8, last5_avg: 4.2, last10_avg: 3.9, minutes_avg: 34.5,
      matchup_rating: "Favorable", opp_pos_rank: 18, opp_team: "DET",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "HIGH", score: 80,
      signals: [
        { text: "Season avg 3.8 blocks comfortably above 3.5 line", tag: "OVER" },
        { text: "L5 avg 4.2 — on a shot-blocking tear", tag: "OVER" },
        { text: "DET drives to rim aggressively — feeds Wemby's block rate", tag: "OVER" },
        { text: "Home game, marquee matchup vs #1 seed — Wemby will be locked in", tag: "OVER" },
      ]
    },
    { player: "Nikola Jokic", team: "DEN", pos: "C", game: "LAL @ DEN", stat: "Points + Rebounds", line: 38.5,
      season_avg: 39.2, last5_avg: 41.0, last10_avg: 39.8, minutes_avg: 37.5,
      matchup_rating: "Favorable", opp_pos_rank: 20, opp_team: "LAL",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "HIGH", score: 78,
      signals: [
        { text: "LAL missing Luka (out) + LeBron (questionable) — depleted frontcourt", tag: "OVER" },
        { text: "Season avg 39.2 P+R already above line, L5 at 41.0", tag: "OVER" },
        { text: "Home at altitude — Jokic dominates at Ball Arena", tag: "OVER" },
        { text: "Jokic feasts against undermanned opponents", tag: "OVER" },
      ]
    },
    { player: "Alperen Sengun", team: "HOU", pos: "C", game: "GSW @ HOU", stat: "Blocks", line: 1.5,
      season_avg: 1.3, last5_avg: 1.6, last10_avg: 1.4, minutes_avg: 32.0,
      matchup_rating: "Favorable", opp_pos_rank: 21, opp_team: "GSW",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 68,
      signals: [
        { text: "Dimers model gives 11.8% edge on this prop at +181 odds", tag: "OVER" },
        { text: "GSW drives inside frequently — block opportunities", tag: "OVER" },
        { text: "If Curry sits, GSW plays more through paint = more block chances", tag: "OVER" },
        { text: "Season avg 1.3 is below line — needs a good game to clear", tag: "CAUTION" },
      ]
    },
    { player: "Daniel Gafford", team: "DAL", pos: "C", game: "DAL @ ORL", stat: "Blocks", line: 1.5,
      season_avg: 1.8, last5_avg: 2.0, last10_avg: 1.9, minutes_avg: 26.5,
      matchup_rating: "Favorable", opp_pos_rank: 19, opp_team: "ORL",
      pace_factor: "Neutral", b2b: true, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 66,
      signals: [
        { text: "Dimers model top pick — 12.5% edge at +178 odds", tag: "OVER" },
        { text: "Season avg 1.8 well above 1.5 line", tag: "OVER" },
        { text: "ORL attacks the rim — feeds block opportunities", tag: "OVER" },
        { text: "DAL on B2B — Gafford's minutes could be limited", tag: "CAUTION" },
      ]
    },
    { player: "Kevin Durant", team: "HOU", pos: "F", game: "GSW @ HOU", stat: "Points", line: 28.5,
      season_avg: 28.0, last5_avg: 30.2, last10_avg: 28.8, minutes_avg: 36.0,
      matchup_rating: "Favorable", opp_pos_rank: 24, opp_team: "GSW",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 70,
      signals: [
        { text: "Former GSW star — always brings extra motivation vs Warriors", tag: "OVER" },
        { text: "GSW 24th in pts allowed to SFs — weak wing defense", tag: "OVER" },
        { text: "Curry questionable — if out, GSW defense loses structure", tag: "OVER" },
        { text: "L5 avg 30.2, trending above line", tag: "OVER" },
      ]
    },
    { player: "Cade Cunningham", team: "DET", pos: "G", game: "DET @ SAS", stat: "Assists", line: 9.5,
      season_avg: 9.8, last5_avg: 10.5, last10_avg: 10.0, minutes_avg: 36.8,
      matchup_rating: "Neutral", opp_pos_rank: 14, opp_team: "SAS",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 64,
      signals: [
        { text: "Season avg 9.8 above the 9.5 line — consistent playmaker", tag: "OVER" },
        { text: "L5 avg 10.5 — in a groove distributing", tag: "OVER" },
        { text: "Big stage game vs Wemby's Spurs — Cade will facilitate", tag: "OVER" },
        { text: "SAS 14th in assists allowed — neutral, not a slam dunk", tag: "NEUTRAL" },
      ]
    },
    { player: "Giannis Antetokounmpo", team: "MIL", pos: "F", game: "ATL @ MIL", stat: "Points", line: 24.5,
      season_avg: 30.5, last5_avg: 19.0, last10_avg: 22.5, minutes_avg: 25.0,
      matchup_rating: "Favorable", opp_pos_rank: 22, opp_team: "ATL",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "UNDER", confidence: "MODERATE", score: 65,
      signals: [
        { text: "Just returned from injury — scored 19 in 25 min in return", tag: "UNDER" },
        { text: "Minutes limit expected (25-30 min) as MIL eases him back", tag: "UNDER" },
        { text: "L5 avg only 19.0 on restricted minutes", tag: "UNDER" },
        { text: "Season avg 30.5 but irrelevant — he's not at full load yet", tag: "UNDER" },
      ]
    },
    { player: "Anthony Edwards", team: "MIN", pos: "G", game: "TOR @ MIN", stat: "Points", line: 26.5,
      season_avg: 27.5, last5_avg: 28.8, last10_avg: 27.2, minutes_avg: 36.2,
      matchup_rating: "Favorable", opp_pos_rank: 23, opp_team: "TOR",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 63,
      signals: [
        { text: "TOR 23rd in pts allowed to SGs", tag: "OVER" },
        { text: "Home game, L5 avg 28.8 trending above line", tag: "OVER" },
        { text: "Wolves are rolling — Ant plays aggressive when confident", tag: "OVER" },
        { text: "Line is close to season avg — thin edge", tag: "CAUTION" },
      ]
    },
    { player: "Andrew Wiggins", team: "GSW", pos: "F", game: "GSW @ HOU", stat: "Points", line: 17.5,
      season_avg: 17.2, last5_avg: 19.5, last10_avg: 18.0, minutes_avg: 33.5,
      matchup_rating: "Neutral", opp_pos_rank: 15, opp_team: "HOU",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 62,
      signals: [
        { text: "If Curry sits, Wiggins usage jumps significantly", tag: "OVER" },
        { text: "L5 avg 19.5 — stepping up without full roster", tag: "OVER" },
        { text: "Dimers model flagged Wiggins as top-10 edge tonight", tag: "OVER" },
        { text: "Only valuable if Curry is OUT — check pregame", tag: "CAUTION" },
      ]
    },
    { player: "Austin Reaves", team: "LAL", pos: "G", game: "LAL @ DEN", stat: "Points", line: 22.5,
      season_avg: 21.8, last5_avg: 24.5, last10_avg: 22.8, minutes_avg: 35.5,
      matchup_rating: "Neutral", opp_pos_rank: 13, opp_team: "DEN",
      pace_factor: "Neutral", b2b: false, opp_b2b: false,
      lean: "OVER", confidence: "MODERATE", score: 64,
      signals: [
        { text: "With Luka OUT, Reaves becomes LAL's primary scorer", tag: "OVER" },
        { text: "If LeBron also sits, Reaves usage skyrockets", tag: "OVER" },
        { text: "L5 avg 24.5 — already elevated with Luka missing time", tag: "OVER" },
        { text: "DEN defense is solid at home (13th) — tough environment", tag: "CAUTION" },
      ]
    },
  ]
};

const TAG_COLORS = { OVER: "#22c55e", UNDER: "#ef4444", NEUTRAL: "#6b7280", CAUTION: "#f59e0b" };
const CONF_COLORS = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#6b7280" };

function Pill({ text, color }) { return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: `${color}15`, color, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>; }

function PropCard({ prop, isExpanded, onToggle, betLog, onLogBet }) {
  const leanColor = prop.lean === "OVER" ? "#22c55e" : "#ef4444";
  const confColor = CONF_COLORS[prop.confidence];
  const matchId = `${prop.player}-${prop.stat}`;
  const eb = betLog.find(b => b.matchup === matchId);
  const diff5 = prop.last5_avg - prop.line;
  const diffSzn = prop.season_avg - prop.line;

  return <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: confColor }}>
    <div onClick={onToggle} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{prop.player}</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{prop.team} · {prop.pos}</span>
          {eb && <Pill text={eb.result === "W" ? "✓ HIT" : eb.result === "L" ? "✗ MISS" : "LOGGED"} color={eb.result === "W" ? "#22c55e" : eb.result === "L" ? "#ef4444" : "#6b7280"} />}
        </div>
        <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>{prop.game} · vs {prop.opp_team}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {prop.opp_b2b && <Pill text={`${prop.opp_team} B2B`} color="#ef4444" />}
          {prop.b2b && <Pill text={`${prop.team} B2B`} color="#ef4444" />}
          {prop.pace_factor === "Pace Up" && <Pill text="PACE UP" color="#a855f7" />}
          <Pill text={`#${prop.opp_pos_rank} DEF`} color={prop.opp_pos_rank >= 20 ? "#22c55e" : prop.opp_pos_rank <= 10 ? "#ef4444" : "#6b7280"} />
        </div>
        <div style={{ textAlign: "right", minWidth: 70 }}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{prop.stat}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{prop.line}</div>
        </div>
        <div style={{ textAlign: "right", minWidth: 55 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: leanColor }}>{prop.lean}</div>
          <div style={{ fontSize: 10, color: confColor }}>{prop.confidence}</div>
        </div>
        <div style={{ color: "#4a5568", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", fontSize: 12 }}>▾</div>
      </div>
    </div>
    {isExpanded && <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
      {!eb && <div style={{ marginTop: 10 }}>
        <button onClick={() => onLogBet(matchId, `${prop.player} ${prop.lean} ${prop.line} ${prop.stat}`, prop.confidence, null)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer", background: `${leanColor}18`, border: `1px solid ${leanColor}40`, color: leanColor, fontFamily: "inherit" }}>📝 Log {prop.lean} {prop.line}</button>
      </div>}
      {eb && !eb.result && <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button onClick={() => onLogBet(matchId, eb.pick, eb.confidence, "W")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "inherit", fontWeight: 600 }}>✓ Hit</button>
        <button onClick={() => onLogBet(matchId, eb.pick, eb.confidence, "L")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 600 }}>✗ Miss</button>
      </div>}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[["Line", prop.line, "#e2e8f0", ""], ["Season", prop.season_avg, diffSzn > 0.5 ? "#22c55e" : diffSzn < -0.5 ? "#ef4444" : "#e2e8f0", `${diffSzn > 0 ? "+" : ""}${diffSzn.toFixed(1)}`], ["Last 10", prop.last10_avg, "#e2e8f0", ""], ["Last 5", prop.last5_avg, diff5 > 1 ? "#22c55e" : diff5 < -1 ? "#ef4444" : "#e2e8f0", `${diff5 > 0 ? "+" : ""}${diff5.toFixed(1)}`]].map(([l, v, c, s], i) =>
          <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
            {s && <div style={{ fontSize: 10, color: c }}>{s} vs line</div>}
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>Avg Min: {prop.minutes_avg} · Opp {prop.pos} DEF Rank: #{prop.opp_pos_rank} · Score: {prop.score}/100</div>
      <div style={{ marginTop: 10 }}>
        {prop.signals.map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${TAG_COLORS[s.tag] || "#6b7280"}15`, color: TAG_COLORS[s.tag] || "#6b7280", fontWeight: 600, minWidth: 55, textAlign: "center" }}>{s.tag}</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{s.text}</span>
        </div>)}
      </div>
    </div>}
  </div>;
}

function BT({ betLog }) {
  if (!betLog.length) return null;
  const w = betLog.filter(b => b.result === "W").length, l = betLog.filter(b => b.result === "L").length, p = betLog.filter(b => !b.result).length;
  const tot = w + l, pct = tot > 0 ? ((w / tot) * 100).toFixed(1) : "—";
  return <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>🎯 Props Tracker</div>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div><div style={{ fontSize: 10, color: "#4a5568" }}>RECORD</div><div style={{ fontSize: 20, fontWeight: 700 }}><span style={{ color: "#22c55e" }}>{w}</span>-<span style={{ color: "#ef4444" }}>{l}</span>{p > 0 && <span style={{ color: "#4a5568", fontSize: 13 }}> ({p}p)</span>}</div></div>
      <div><div style={{ fontSize: 10, color: "#4a5568" }}>HIT %</div><div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct) >= 55 ? "#22c55e" : parseFloat(pct) >= 50 ? "#f59e0b" : "#ef4444" }}>{pct}%</div></div>
    </div>
    {betLog.length > 0 && <div style={{ fontSize: 11, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6, marginTop: 8 }}>{betLog.slice(-5).reverse().map((b, i) => <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}><span style={{ color: b.result === "W" ? "#22c55e" : b.result === "L" ? "#ef4444" : "#6b7280", fontWeight: 600 }}>{b.result === "W" ? "✓" : b.result === "L" ? "✗" : "○"}</span><span style={{ color: "#94a3b8" }}>{b.pick}</span></div>)}</div>}
  </div>;
}

export default function App() {
  const [data] = useState(PROPS_DATA);
  const [expanded, setExpanded] = useState({ 0: true, 2: true });
  const [filter, setFilter] = useState("all");
  const [confFilter, setConfFilter] = useState("all");
  const [betLog, setBetLog] = useState([]);
  const toggle = i => setExpanded(p => ({ ...p, [i]: !p[i] }));
  const logBet = (matchup, pick, confidence, result) => {
    setBetLog(prev => { const ex = prev.findIndex(b => b.matchup === matchup); if (ex >= 0) { const u = [...prev]; u[ex] = { ...u[ex], result }; return u; } return [...prev, { matchup, pick, confidence, result }]; });
  };
  let filtered = data.props;
  if (filter !== "all") filtered = filtered.filter(p => p.lean === filter);
  if (confFilter !== "all") filtered = filtered.filter(p => p.confidence === confFilter || (confFilter === "MODERATE" && p.confidence === "HIGH"));
  filtered = filtered.sort((a, b) => b.score - a.score);
  const highConf = data.props.filter(p => p.confidence === "HIGH");

  return <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>🎯</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>Player Props Edge</h1>
          <Pill text="v1.1" color="#ef4444" />
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>Pace Matchup · Positional DEF · Recent Form · B2B Fatigue · Usage Boost · Injury Impact</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill text={`📅 ${data.date} · ${data.props.length} props`} color="#6b7280" />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}>
            <option value="all">All Leans</option><option value="OVER">Overs Only</option><option value="UNDER">Unders Only</option>
          </select>
          <select value={confFilter} onChange={e => setConfFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}>
            <option value="all">All Confidence</option><option value="HIGH">HIGH Only</option><option value="MODERATE">MODERATE+</option>
          </select>
        </div>
      </div>
      <BT betLog={betLog} />
      {highConf.length > 0 && <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6, textTransform: "uppercase" }}>🔥 Top Picks Tonight</div>
        {highConf.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#fca5a5", marginBottom: 3 }}>
          <strong>{p.player}</strong> <span style={{ color: p.lean === "OVER" ? "#22c55e" : "#ef4444" }}>{p.lean} {p.line} {p.stat}</span>
          <span style={{ color: "#6b7280", marginLeft: 8 }}>{p.game}</span>
          {p.opp_b2b && <span style={{ color: "#f59e0b", marginLeft: 6 }}>· Opp B2B</span>}
        </div>)}
      </div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{filtered.map((p, i) => <PropCard key={i} prop={p} isExpanded={expanded[i]} onToggle={() => toggle(i)} betLog={betLog} onLogBet={logBet} />)}</div>
      <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> 0-100 confidence. <strong style={{ color: "#4a5568" }}>Opp DEF Rank:</strong> Higher # = worse defense at that position. <strong style={{ color: "#4a5568" }}>CAUTION:</strong> Risk factors that could sink the pick.
        <br/>⚠ Always check final injury reports and starting lineups. Gamble responsibly.
      </div>
    </div>
  </div>;
}
