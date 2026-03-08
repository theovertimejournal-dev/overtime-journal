import { useState } from "react";

const NBA_DATA = {
  date: "2026-03-05",
  yesterday_record: "6-0",
  yesterday_results: [
    { game: "OKC @ NYK", lean: "OKC", result: "W", score: "103-100" },
    { game: "CHA @ BOS", lean: "CHA", result: "W", score: "118-89" },
    { game: "UTA @ PHI", lean: "PHI", result: "W", score: "106-102" },
    { game: "POR @ MEM", lean: "POR", result: "W", score: "122-114" },
    { game: "ATL @ MIL", lean: "ATL", result: "W", score: "131-113" },
    { game: "IND @ LAC", lean: "LAC", result: "W", score: "130-107" },
  ],
  games_count: 9,
  games: [
    {
      matchup: "DAL @ ORL", venue: "Kia Center", game_time: "7:00 PM ET", status: "Tonight",
      away: { team: "DAL", name: "Mavericks", record: "21-41", win_pct: .344, net_rating: -4.8, off_rating: 112.5, def_rating: 117.3, bench_net: -2.5, bench_ppg: 34.0, pace: 99.2, three_pct: 35.2, last10_three: 33.8, close_record: "7-13", close_pct: .350, b2b: true, rest_days: 0, last5: "L-L-L-L-W", streak: "L1", key_out: ["Cooper Flagg (leg - questionable)"], run_diff: "-298" },
      home: { team: "ORL", name: "Magic", record: "32-29", win_pct: .525, net_rating: 2.2, off_rating: 112.8, def_rating: 110.6, bench_net: 1.5, bench_ppg: 36.5, pace: 97.8, three_pct: 35.0, last10_three: 36.2, close_record: "10-8", close_pct: .556, b2b: false, rest_days: 1, last5: "W-L-W-W-L", streak: "W1", key_out: ["Jalen Suggs (back - questionable)"], run_diff: "+134" },
      spread: "ORL -8.5", total: "212.0", win_prob: { away: 22.7, home: 77.3 },
      edge: { lean: "ORL", confidence: "MODERATE", score: 22.5, signals: [
        { type: "B2B_FATIGUE", detail: "DAL on B2B (lost to CHA last night 90-117)", favors: "ORL", strength: "STRONG", impact: 8.0 },
        { type: "NET_RATING_GAP", detail: "ORL +2.2 vs DAL -4.8 — 7 point gap", favors: "ORL", strength: "MODERATE", impact: 5.0 },
        { type: "BENCH_EDGE", detail: "ORL bench +1.5 vs DAL -2.5", favors: "ORL", strength: "MODERATE", impact: 4.0 },
        { type: "CLOSE_GAMES", detail: "DAL 7-13 in close games — can't close", favors: "ORL", strength: "MODERATE", impact: 3.5 },
      ], ou_lean: "UNDER" }
    },
    {
      matchup: "UTA @ WAS", venue: "Capital One Arena", game_time: "7:00 PM ET", status: "Tonight",
      away: { team: "UTA", name: "Jazz", record: "18-44", win_pct: .290, net_rating: -8.2, off_rating: 108.5, def_rating: 116.7, bench_net: -4.5, bench_ppg: 32.8, pace: 100.8, three_pct: 35.2, last10_three: 33.8, close_record: "6-12", close_pct: .333, b2b: true, rest_days: 0, last5: "L-L-L-W-L", streak: "L1", key_out: [], run_diff: "-510" },
      home: { team: "WAS", name: "Wizards", record: "16-45", win_pct: .262, net_rating: -9.5, off_rating: 109.2, def_rating: 118.7, bench_net: -5.8, bench_ppg: 30.5, pace: 101.5, three_pct: 33.5, last10_three: 32.0, close_record: "5-14", close_pct: .263, b2b: false, rest_days: 1, last5: "L-L-W-L-L", streak: "L1", key_out: [], run_diff: "-568" },
      spread: "WAS -1.5", total: "232.0", win_prob: { away: 42.1, home: 57.9 },
      edge: { lean: null, confidence: "LOW", score: 2.0, signals: [
        { type: "B2B_FATIGUE", detail: "UTA on B2B (lost to PHI last night) — but WAS is terrible too", favors: "WAS", strength: "MODERATE", impact: 5.0 },
        { type: "TANK_BOWL", detail: "Both teams bottom 3 in NBA — high variance, low edge", favors: "N/A", strength: "MODERATE", impact: 0 },
      ], ou_lean: null }
    },
    {
      matchup: "BKN @ MIA", venue: "Kaseya Center", game_time: "7:30 PM ET", status: "Tonight",
      away: { team: "BKN", name: "Nets", record: "15-47", win_pct: .242, net_rating: -10.2, off_rating: 106.8, def_rating: 117.0, bench_net: -6.0, bench_ppg: 29.5, pace: 99.5, three_pct: 33.8, last10_three: 32.5, close_record: "4-16", close_pct: .200, b2b: false, rest_days: 1, last5: "L-L-L-L-L", streak: "L5", key_out: [], run_diff: "-620" },
      home: { team: "MIA", name: "Heat", record: "34-29", win_pct: .540, net_rating: 2.5, off_rating: 114.5, def_rating: 112.0, bench_net: 2.2, bench_ppg: 38.0, pace: 97.5, three_pct: 36.5, last10_three: 37.2, close_record: "11-8", close_pct: .579, b2b: false, rest_days: 1, last5: "W-W-L-W-W", streak: "W2", key_out: [], run_diff: "+155" },
      spread: "MIA -11.5", total: "210.5", win_prob: { away: 12.8, home: 87.2 },
      edge: { lean: "MIA", confidence: "LOW", score: 14.0, signals: [
        { type: "NET_RATING_GAP", detail: "MIA +2.5 vs BKN -10.2 — massive gap", favors: "MIA", strength: "STRONG", impact: 7.0 },
        { type: "BENCH_EDGE", detail: "MIA bench +2.2 vs BKN -6.0 — 8.2 point swing", favors: "MIA", strength: "STRONG", impact: 6.0 },
        { type: "SPREAD_WARNING", detail: "MIA -11.5 is huge — likely already priced in", favors: "BKN", strength: "MODERATE", impact: -4.0 },
      ], ou_lean: "UNDER" }
    },
    {
      matchup: "GSW @ HOU", venue: "Toyota Center", game_time: "7:30 PM ET", status: "Tonight",
      away: { team: "GSW", name: "Warriors", record: "31-30", win_pct: .508, net_rating: 0.5, off_rating: 115.2, def_rating: 114.7, bench_net: -1.2, bench_ppg: 35.5, pace: 100.2, three_pct: 36.8, last10_three: 35.0, close_record: "10-10", close_pct: .500, b2b: false, rest_days: 1, last5: "L-L-W-L-W", streak: "W1", key_out: ["Steph Curry (knee - questionable)"], run_diff: "+30" },
      home: { team: "HOU", name: "Rockets", record: "38-23", win_pct: .623, net_rating: 5.8, off_rating: 116.5, def_rating: 110.7, bench_net: 3.5, bench_ppg: 40.2, pace: 99.0, three_pct: 37.5, last10_three: 38.2, close_record: "12-6", close_pct: .667, b2b: false, rest_days: 1, last5: "W-L-W-W-W", streak: "W1", key_out: [], run_diff: "+345" },
      spread: "HOU -7.5", total: "218.0", win_prob: { away: 23.5, home: 76.5 },
      edge: { lean: "HOU", confidence: "MODERATE", score: 24.0, signals: [
        { type: "NET_RATING_GAP", detail: "HOU +5.8 vs GSW +0.5 — clear tier gap", favors: "HOU", strength: "MODERATE", impact: 5.5 },
        { type: "BENCH_EDGE", detail: "HOU bench +3.5 vs GSW -1.2 — Rockets bench is elite", favors: "HOU", strength: "STRONG", impact: 6.5 },
        { type: "INJURY", detail: "Curry knee questionable — if out, GSW has no offense", favors: "HOU", strength: "STRONG", impact: 7.0 },
        { type: "CLOSE_GAMES", detail: "HOU 12-6 in close games — they close", favors: "HOU", strength: "MODERATE", impact: 3.0 },
      ], ou_lean: null }
    },
    {
      matchup: "DET @ SAS", venue: "Frost Bank Center", game_time: "8:00 PM ET", status: "Tonight",
      away: { team: "DET", name: "Pistons", record: "45-16", win_pct: .738, net_rating: 8.5, off_rating: 117.8, def_rating: 109.3, bench_net: 4.2, bench_ppg: 41.5, pace: 100.5, three_pct: 37.0, last10_three: 36.5, close_record: "14-5", close_pct: .737, b2b: false, rest_days: 1, last5: "W-W-L-W-W", streak: "W1", key_out: [], run_diff: "+520" },
      home: { team: "SAS", name: "Spurs", record: "44-18", win_pct: .710, net_rating: 9.2, off_rating: 118.9, def_rating: 109.7, bench_net: 3.8, bench_ppg: 40.8, pace: 98.5, three_pct: 38.0, last10_three: 37.5, close_record: "13-4", close_pct: .765, b2b: false, rest_days: 1, last5: "W-W-W-W-L", streak: "L1", key_out: [], run_diff: "+590" },
      spread: "SAS -4.5", total: "224.0", win_prob: { away: 40.7, home: 59.3 },
      edge: { lean: null, confidence: "LOW", score: 3.5, signals: [
        { type: "ELITE_MATCHUP", detail: "Top 2 teams in the league — both elite net ratings, benches, close game records", favors: "N/A", strength: "MODERATE", impact: 0 },
        { type: "HOME_COURT", detail: "SAS slight home edge + Wembanyama factor", favors: "SAS", strength: "MODERATE", impact: 3.5 },
      ], ou_lean: null }
    },
    {
      matchup: "TOR @ MIN", venue: "Target Center", game_time: "8:00 PM ET", status: "Tonight",
      away: { team: "TOR", name: "Raptors", record: "35-27", win_pct: .565, net_rating: 2.0, off_rating: 114.8, def_rating: 112.8, bench_net: 0.8, bench_ppg: 37.0, pace: 99.8, three_pct: 36.2, last10_three: 37.0, close_record: "11-9", close_pct: .550, b2b: false, rest_days: 1, last5: "L-W-W-L-W", streak: "W1", key_out: [], run_diff: "+124" },
      home: { team: "MIN", name: "Timberwolves", record: "39-23", win_pct: .629, net_rating: 6.2, off_rating: 116.0, def_rating: 109.8, bench_net: 2.5, bench_ppg: 38.5, pace: 98.5, three_pct: 36.0, last10_three: 37.5, close_record: "12-7", close_pct: .632, b2b: false, rest_days: 1, last5: "W-W-W-W-L", streak: "L1", key_out: [], run_diff: "+395" },
      spread: "MIN -5.5", total: "215.5", win_prob: { away: 31.5, home: 68.5 },
      edge: { lean: "MIN", confidence: "MODERATE", score: 18.0, signals: [
        { type: "NET_RATING_GAP", detail: "MIN +6.2 vs TOR +2.0 — solid gap", favors: "MIN", strength: "MODERATE", impact: 5.0 },
        { type: "BENCH_EDGE", detail: "MIN bench +2.5 vs TOR +0.8", favors: "MIN", strength: "MODERATE", impact: 3.0 },
        { type: "CLOSE_GAMES", detail: "MIN 12-7 (.632) — reliable closer at home", favors: "MIN", strength: "MODERATE", impact: 3.5 },
        { type: "HOME_COURT", detail: "Target Center is tough — MIN strong at home", favors: "MIN", strength: "MODERATE", impact: 3.5 },
      ], ou_lean: "UNDER" }
    },
    {
      matchup: "CHI @ PHX", venue: "Footprint Center", game_time: "9:00 PM ET", status: "Tonight",
      away: { team: "CHI", name: "Bulls", record: "25-38", win_pct: .397, net_rating: -3.5, off_rating: 112.0, def_rating: 115.5, bench_net: -2.8, bench_ppg: 33.5, pace: 99.0, three_pct: 34.5, last10_three: 33.0, close_record: "8-12", close_pct: .400, b2b: true, rest_days: 0, last5: "L-L-L-W-L", streak: "L1", key_out: [], run_diff: "-190" },
      home: { team: "PHX", name: "Suns", record: "36-26", win_pct: .581, net_rating: 4.0, off_rating: 117.5, def_rating: 113.5, bench_net: 1.5, bench_ppg: 37.0, pace: 100.5, three_pct: 37.8, last10_three: 38.5, close_record: "10-9", close_pct: .526, b2b: false, rest_days: 1, last5: "W-W-L-W-W", streak: "W1", key_out: [], run_diff: "+248" },
      spread: "PHX -9.5", total: "222.0", win_prob: { away: 18.1, home: 81.9 },
      edge: { lean: "PHX", confidence: "HIGH", score: 32.0, signals: [
        { type: "B2B_FATIGUE", detail: "CHI on B2B (lost to OKC last night 108-116)", favors: "PHX", strength: "STRONG", impact: 8.0 },
        { type: "NET_RATING_GAP", detail: "PHX +4.0 vs CHI -3.5 — 7.5 point gap", favors: "PHX", strength: "MODERATE", impact: 5.5 },
        { type: "BENCH_EDGE", detail: "PHX bench +1.5 vs CHI -2.8 — 4.3 swing", favors: "PHX", strength: "MODERATE", impact: 4.5 },
        { type: "3PT_COLD", detail: "CHI shooting 33.0% from 3 L10 (season 34.5%) — cold", favors: "PHX", strength: "MODERATE", impact: 3.0 },
        { type: "HOME_ADVANTAGE", detail: "Your backyard Juan — PHX at Footprint Center", favors: "PHX", strength: "MODERATE", impact: 3.0 },
      ], ou_lean: null }
    },
    {
      matchup: "NOP @ SAC", venue: "Golden 1 Center", game_time: "10:00 PM ET", status: "Tonight",
      away: { team: "NOP", name: "Pelicans", record: "19-44", win_pct: .302, net_rating: -7.0, off_rating: 110.5, def_rating: 117.5, bench_net: -3.5, bench_ppg: 33.0, pace: 101.2, three_pct: 34.0, last10_three: 33.5, close_record: "6-13", close_pct: .316, b2b: false, rest_days: 1, last5: "L-L-L-L-W", streak: "W1", key_out: [], run_diff: "-440" },
      home: { team: "SAC", name: "Kings", record: "14-49", win_pct: .222, net_rating: -11.5, off_rating: 108.0, def_rating: 119.5, bench_net: -6.2, bench_ppg: 28.5, pace: 100.5, three_pct: 33.0, last10_three: 31.5, close_record: "3-16", close_pct: .158, b2b: false, rest_days: 1, last5: "L-L-L-L-L", streak: "L8", key_out: ["De'Aaron Fox (traded)", "De'Andre Hunter (eye surgery - out)"], run_diff: "-720" },
      spread: "NOP -3.5", total: "225.0", win_prob: { away: 66.9, home: 33.1 },
      edge: { lean: "NOP", confidence: "MODERATE", score: 20.0, signals: [
        { type: "NET_RATING_GAP", detail: "NOP -7.0 vs SAC -11.5 — SAC is worst in NBA", favors: "NOP", strength: "MODERATE", impact: 5.0 },
        { type: "BENCH_EDGE", detail: "NOP bench -3.5 vs SAC -6.2 — both bad but SAC worse", favors: "NOP", strength: "MODERATE", impact: 4.0 },
        { type: "CLOSE_GAMES", detail: "SAC 3-16 in close games (.158) — historically bad", favors: "NOP", strength: "STRONG", impact: 6.0 },
        { type: "LOSING_STREAK", detail: "SAC on 8-game losing streak, roster gutted post-trade", favors: "NOP", strength: "STRONG", impact: 5.0 },
      ], ou_lean: "OVER" }
    },
    {
      matchup: "LAL @ DEN", venue: "Ball Arena", game_time: "10:00 PM ET", status: "Tonight",
      away: { team: "LAL", name: "Lakers", record: "37-25", win_pct: .597, net_rating: 3.5, off_rating: 116.8, def_rating: 113.3, bench_net: 0.5, bench_ppg: 36.0, pace: 99.5, three_pct: 36.0, last10_three: 37.2, close_record: "11-8", close_pct: .579, b2b: false, rest_days: 1, last5: "W-W-W-L-W", streak: "W1", key_out: ["Luka Doncic (leg - out)", "LeBron James (load mgmt - questionable)"], run_diff: "+218" },
      home: { team: "DEN", name: "Nuggets", record: "38-25", win_pct: .603, net_rating: 5.5, off_rating: 118.2, def_rating: 112.7, bench_net: 1.8, bench_ppg: 37.5, pace: 98.8, three_pct: 37.0, last10_three: 36.5, close_record: "12-7", close_pct: .632, b2b: false, rest_days: 1, last5: "W-L-W-W-L", streak: "L1", key_out: ["Peyton Watson (hamstring - out)"], run_diff: "+342" },
      spread: "DEN -5.5", total: "228.5", win_prob: { away: 35.6, home: 64.4 },
      edge: { lean: "DEN", confidence: "HIGH", score: 30.0, signals: [
        { type: "INJURY", detail: "LAL without Luka (out) + LeBron questionable — missing 2 best players", favors: "DEN", strength: "STRONG", impact: 10.0 },
        { type: "NET_RATING_GAP", detail: "DEN +5.5 vs LAL +3.5, but gap widens massively without Luka/LeBron", favors: "DEN", strength: "STRONG", impact: 6.0 },
        { type: "HOME_COURT", detail: "Mile high altitude advantage — DEN dominant at home", favors: "DEN", strength: "MODERATE", impact: 4.0 },
        { type: "JOKIC_FACTOR", detail: "Jokic at home with depleted opponent = stat feast", favors: "DEN", strength: "STRONG", impact: 5.0 },
        { type: "BENCH_EDGE", detail: "DEN bench +1.8 vs LAL +0.5 — wider with LAL missing stars", favors: "DEN", strength: "MODERATE", impact: 3.0 },
      ], ou_lean: "UNDER" }
    },
  ]
};

const FC = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#6b7280" };
const SC = { "Tonight": "#60a5fa" };
function Pill({ text, color }) { return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: `${color}15`, color, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>; }
function Bar({ score, max = 100 }) { const c = score >= 50 ? "#ef4444" : score >= 25 ? "#f59e0b" : "#22c55e"; return <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 80, height: 8, background: "#1e1e2e", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(Math.abs(score),max)/max*100}%`, height: "100%", background: c, borderRadius: 4 }}/></div></div>; }

function TeamCol({ t }) {
  const nc = t.net_rating >= 5 ? "#22c55e" : t.net_rating >= 0 ? "#f59e0b" : "#ef4444";
  const bc = t.bench_net >= 3 ? "#22c55e" : t.bench_net >= 0 ? "#f59e0b" : "#ef4444";
  return <div>
    <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{t.team} <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>{t.record}</span></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {[["Net Rtg", t.net_rating, nc, `O:${t.off_rating} D:${t.def_rating}`], ["Bench Net", t.bench_net, bc, `${t.bench_ppg} PPG`],
        ["Close", t.close_record, t.close_pct>=.55?"#22c55e":t.close_pct<.4?"#ef4444":"#f59e0b", `${(t.close_pct*100).toFixed(0)}%`],
        ["3PT%", `${t.three_pct}%`, "#e2e8f0", `L10: ${t.last10_three}%`]
      ].map(([l,v,c,s],i)=><div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{l}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{typeof v==="number"?(v>0?"+":"")+v:v}</div>
        <div style={{ fontSize: 10, color: "#4a5568" }}>{s}</div>
      </div>)}
    </div>
    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {t.b2b && <Pill text="B2B ⚠" color="#ef4444"/>}
      {t.rest_days>=2 && <Pill text={`${t.rest_days}d rest`} color="#22c55e"/>}
      <span style={{ fontSize: 11, color: "#4a5568" }}>{t.last5} ({t.streak})</span>
    </div>
    {t.key_out.length>0 && <div style={{ marginTop: 6 }}>{t.key_out.map((p,i)=><div key={i} style={{ fontSize: 11, color: "#ef4444" }}>🚑 {p}</div>)}</div>}
  </div>;
}

function GC({ game, isExpanded, onToggle, betLog, onLogBet }) {
  const e = game.edge; const lc = FC[e.confidence]||"#6b7280";
  const eb = betLog.find(b=>b.matchup===game.matchup);
  return <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: lc }}>
    <div onClick={onToggle} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{game.matchup}</span>
          <Pill text={game.status} color="#60a5fa"/>
          {game.spread && <span style={{ fontSize: 11, color: "#6b7280" }}>{game.spread} | O/U {game.total}</span>}
          {eb && <Pill text={eb.result==="W"?"✓ WIN":eb.result==="L"?"✗ LOSS":"LOGGED"} color={eb.result==="W"?"#22c55e":eb.result==="L"?"#ef4444":"#6b7280"}/>}
        </div>
        <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>{game.venue} · {game.game_time}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {game.away.b2b && <Pill text={`${game.away.team} B2B`} color="#ef4444"/>}
          {game.home.b2b && <Pill text={`${game.home.team} B2B`} color="#ef4444"/>}
          {e.ou_lean && <Pill text={e.ou_lean} color="#a855f7"/>}
        </div>
        {e.lean && <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 700, color: lc }}>{e.lean}</div><div style={{ fontSize: 10, color: "#4a5568" }}>{e.confidence}</div></div>}
        <div style={{ color: "#4a5568", transform: isExpanded?"rotate(180deg)":"rotate(0)", transition: "transform 0.2s", fontSize: 12 }}>▾</div>
      </div>
    </div>
    {isExpanded && <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
      {e.lean && !eb && <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={()=>onLogBet(game.matchup,e.lean,e.confidence,null)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontFamily: "inherit" }}>📝 Log {e.lean}</button>
      </div>}
      {eb && !eb.result && <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
        <button onClick={()=>onLogBet(game.matchup,eb.pick,eb.confidence,"W")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "inherit", fontWeight: 600 }}>✓ W</button>
        <button onClick={()=>onLogBet(game.matchup,eb.pick,eb.confidence,"L")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 600 }}>✗ L</button>
      </div>}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <TeamCol t={game.away}/><TeamCol t={game.home}/>
      </div>
      {e.signals.length>0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Edge Signals</div>
        {e.signals.map((s,i)=><div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          <span style={{ fontSize: 13 }}>{s.strength==="STRONG"?"🔥":"📌"}</span>
          <div><div style={{ fontSize: 12, color: "#cbd5e1" }}>{s.detail}</div><div style={{ fontSize: 10, color: "#4a5568", marginTop: 1 }}>→ <span style={{ color: "#60a5fa" }}>{s.favors}</span></div></div>
        </div>)}
      </div>}
    </div>}
  </div>;
}

function BT({ betLog }) {
  if (!betLog.length) return null;
  const w=betLog.filter(b=>b.result==="W").length,l=betLog.filter(b=>b.result==="L").length,p=betLog.filter(b=>!b.result).length;
  const tot=w+l,pct=tot>0?((w/tot)*100).toFixed(1):"—",units=w*1-l*1.1;
  return <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>🏀 Betting Log</div>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div><div style={{ fontSize: 10, color: "#4a5568" }}>RECORD</div><div style={{ fontSize: 20, fontWeight: 700 }}><span style={{color:"#22c55e"}}>{w}</span>-<span style={{color:"#ef4444"}}>{l}</span>{p>0&&<span style={{color:"#4a5568",fontSize:13}}> ({p}p)</span>}</div></div>
      <div><div style={{ fontSize: 10, color: "#4a5568" }}>WIN %</div><div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct)>=55?"#22c55e":parseFloat(pct)>=50?"#f59e0b":"#ef4444" }}>{pct}%</div></div>
      <div><div style={{ fontSize: 10, color: "#4a5568" }}>UNITS</div><div style={{ fontSize: 20, fontWeight: 700, color: units>=0?"#22c55e":"#ef4444" }}>{units>=0?"+":""}{units.toFixed(1)}u</div></div>
    </div>
    {betLog.length>0&&<div style={{ fontSize: 11, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6, marginTop: 8 }}>{betLog.slice(-5).reverse().map((b,i)=><div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}><span style={{ color: b.result==="W"?"#22c55e":b.result==="L"?"#ef4444":"#6b7280", fontWeight: 600 }}>{b.result==="W"?"✓":b.result==="L"?"✗":"○"}</span><span style={{ color: "#94a3b8" }}>{b.matchup}</span><span style={{ color: "#60a5fa" }}>→ {b.pick}</span></div>)}</div>}
  </div>;
}

export default function App() {
  const [data] = useState(NBA_DATA);
  const [expanded, setExpanded] = useState({ 6: true, 8: true });
  const [sortBy, setSortBy] = useState("score");
  const [betLog, setBetLog] = useState([]);
  const toggle = i => setExpanded(p => ({ ...p, [i]: !p[i] }));
  const logBet = (matchup, pick, confidence, result) => {
    setBetLog(prev => { const ex = prev.findIndex(b => b.matchup === matchup); if (ex >= 0) { const u = [...prev]; u[ex] = { ...u[ex], result }; return u; } return [...prev, { matchup, pick, confidence, result }]; });
  };
  const sorted = [...(data?.games||[])].sort((a,b) => sortBy==="score"?Math.abs(b.edge.score)-Math.abs(a.edge.score):0);
  const high = sorted.filter(g => g.edge.confidence === "HIGH");

  return <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>🏀</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>NBA Bench Edge Analyzer</h1>
          <Pill text="v1.1" color="#ef4444"/>
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 12px" }}>Bench Net Rating · B2B Fatigue · Close Games · 3PT Variance · Injuries · Bet Tracking</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill text={`📅 ${data.date} · ${data.games_count} games`} color="#6b7280"/>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}><option value="score">Sort: Edge Score</option><option value="time">Sort: Game Time</option></select>
        </div>
      </div>

      {/* Yesterday's Results Banner */}
      <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 8 }}>✅ YESTERDAY: {data.yesterday_record} — PERFECT NIGHT</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.yesterday_results.map((r,i) => (
            <div key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", color: "#86efac" }}>
              ✓ {r.game} → {r.lean} ({r.score})
            </div>
          ))}
        </div>
      </div>

      <BT betLog={betLog}/>

      {high.length > 0 && <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4, textTransform: "uppercase" }}>🔥 High Confidence Tonight</div>
        {high.map((g,i)=><div key={i} style={{ fontSize: 13, color: "#fca5a5" }}>{g.matchup} → <strong>{g.edge.lean}</strong> ({g.edge.score}){g.edge.ou_lean&&<span style={{ marginLeft: 8, color: "#a855f7" }}>· {g.edge.ou_lean}</span>}{g.away.b2b&&<span style={{ marginLeft: 6, color: "#f59e0b" }}>· {g.away.team} B2B</span>}{g.away.key_out?.length>0&&<span style={{ marginLeft: 6, color: "#ef4444" }}>· 🚑</span>}</div>)}
      </div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sorted.map((g,i)=><GC key={i} game={g} isExpanded={expanded[i]} onToggle={()=>toggle(i)} betLog={betLog} onLogBet={logBet}/>)}</div>

      <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> Positive = home edge. <strong style={{ color: "#4a5568" }}>Bench Net:</strong> Pts per 100 poss when bench is on. <strong style={{ color: "#4a5568" }}>Close:</strong> Games decided by ≤3 pts.
        <br/>⚠ Always check final injury reports and lineups. One factor among many. Gamble responsibly.
      </div>
    </div>
  </div>;
}
