import { useState } from "react";

const REAL_GAMES = {
  date: "2026-03-04",
  generated_at: new Date().toISOString(),
  games_count: 5,
  games: [
    {
      matchup: "NYY @ BOS",
      venue: "JetBlue Park",
      game_time: "2026-03-04T18:05:00Z",
      status: "Final",
      final_score: { away: 4, home: 0 },
      starters: { away: "TBD (Spring)", home: "TBD (Spring)" },
      away_bullpen: {
        team: "NYY", bullpen_era: 3.00, bullpen_whip: 1.10, bullpen_k9: 9.5,
        bullpen_kbb: 3.2, bullpen_ip_7d: 14.0, fatigue_score: 22,
        available_arms: 6, high_fatigue_count: 1, reliever_count: 8,
        lr_splits: { LHP: { ip: 5.0, era: 2.70, whip: 1.00, k9: 10.0 }, RHP: { ip: 9.0, era: 3.15, whip: 1.15, k9: 9.2 } },
        relievers: [
          { name: "Clay Holmes", hand: "R", fatigue: "MODERATE", pitches_last_3d: 32, days_rest: 1, era_7d: 3.00, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Luke Weaver", hand: "R", fatigue: "FRESH", pitches_last_3d: 15, days_rest: 2, era_7d: 0.00, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
          { name: "Tommy Kahnle", hand: "R", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 4, era_7d: 2.25, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
          { name: "Ian Hamilton", hand: "R", fatigue: "HIGH", pitches_last_3d: 48, days_rest: 0, era_7d: 4.50, ip_last_2d: 1.7, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
        ]
      },
      home_bullpen: {
        team: "BOS", bullpen_era: 4.85, bullpen_whip: 1.38, bullpen_k9: 8.2,
        bullpen_kbb: 2.1, bullpen_ip_7d: 16.0, fatigue_score: 45,
        available_arms: 4, high_fatigue_count: 2, reliever_count: 7,
        lr_splits: { LHP: { ip: 5.0, era: 5.40, whip: 1.50, k9: 7.8 }, RHP: { ip: 11.0, era: 4.60, whip: 1.32, k9: 8.4 } },
        relievers: [
          { name: "Kenley Jansen", hand: "R", fatigue: "HIGH", pitches_last_3d: 55, days_rest: 0, era_7d: 5.40, ip_last_2d: 2.0, available: false, appearances_7d: 4, days_pitched_last_5: 3 },
          { name: "Chris Martin", hand: "R", fatigue: "HIGH", pitches_last_3d: 42, days_rest: 0, era_7d: 6.75, ip_last_2d: 1.3, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
          { name: "Josh Taylor", hand: "L", fatigue: "MODERATE", pitches_last_3d: 28, days_rest: 1, era_7d: 3.60, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
        ]
      },
      away_record: { wins: 3, losses: 2, win_pct: .600, run_diff: 12, run_diff_per_game: 2.40, pyth_pct: .680, expected_wins: 3.4, luck_factor: -0.4, runs_scored: 28, runs_allowed: 16 },
      home_record: { wins: 2, losses: 3, win_pct: .400, run_diff: -5, run_diff_per_game: -1.00, pyth_pct: .385, expected_wins: 1.9, luck_factor: 0.1, runs_scored: 20, runs_allowed: 25 },
      edge: {
        matchup: "NYY @ BOS", composite_score: -28.4, abs_score: 28.4,
        lean: "NYY", confidence: "MODERATE", ou_lean: null, park_factor: 1.07,
        ou_signals: [],
        signals: [
          { type: "BULLPEN_ERA", detail: "NYY pen ERA (3.00) vs BOS (4.85) — 1.85 gap", favors: "NYY", strength: "MODERATE", impact: 11.6, weight: 25 },
          { type: "FATIGUE", detail: "BOS pen fatigued (45/100) vs NYY (22/100)", favors: "NYY", strength: "MODERATE", impact: 9.6, weight: 25 },
          { type: "BULLPEN_WHIP", detail: "NYY pen WHIP (1.10) vs BOS (1.38)", favors: "NYY", strength: "MODERATE", impact: 7.0, weight: 15 },
          { type: "RUN_DIFF", detail: "NYY run diff/game +2.40 vs BOS -1.00", favors: "NYY", strength: "STRONG", impact: 10.0, weight: 10 },
        ]
      }
    },
    {
      matchup: "SEA @ SF",
      venue: "Oracle Park",
      game_time: "2026-03-04T19:05:00 MST",
      status: "Tonight 7:05 PM MST",
      final_score: null,
      starters: { away: "TBD (Spring)", home: "TBD (Spring)" },
      away_bullpen: {
        team: "SEA", bullpen_era: 2.65, bullpen_whip: 0.95, bullpen_k9: 10.8,
        bullpen_kbb: 4.0, bullpen_ip_7d: 15.2, fatigue_score: 28,
        available_arms: 6, high_fatigue_count: 1, reliever_count: 8,
        lr_splits: { LHP: { ip: 5.2, era: 2.10, whip: 0.85, k9: 11.5 }, RHP: { ip: 10.0, era: 2.95, whip: 1.00, k9: 10.4 } },
        relievers: [
          { name: "Andres Munoz", hand: "R", fatigue: "MODERATE", pitches_last_3d: 30, days_rest: 1, era_7d: 0.00, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Tayler Saucedo", hand: "L", fatigue: "FRESH", pitches_last_3d: 12, days_rest: 2, era_7d: 2.70, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
          { name: "Gregory Santos", hand: "R", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 4, era_7d: 1.80, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
          { name: "Trent Thornton", hand: "R", fatigue: "HIGH", pitches_last_3d: 52, days_rest: 0, era_7d: 5.40, ip_last_2d: 2.0, available: false, appearances_7d: 4, days_pitched_last_5: 3 },
          { name: "Ryne Stanek", hand: "R", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 3, era_7d: 3.60, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
        ]
      },
      home_bullpen: {
        team: "SF", bullpen_era: 4.20, bullpen_whip: 1.30, bullpen_k9: 8.5,
        bullpen_kbb: 2.3, bullpen_ip_7d: 20.1, fatigue_score: 52,
        available_arms: 4, high_fatigue_count: 3, reliever_count: 8,
        lr_splits: { LHP: { ip: 7.0, era: 3.80, whip: 1.20, k9: 9.0 }, RHP: { ip: 13.1, era: 4.45, whip: 1.35, k9: 8.2 } },
        relievers: [
          { name: "Camilo Doval", hand: "R", fatigue: "HIGH", pitches_last_3d: 58, days_rest: 0, era_7d: 5.40, ip_last_2d: 2.0, available: false, appearances_7d: 4, days_pitched_last_5: 3 },
          { name: "Tyler Rogers", hand: "R", fatigue: "HIGH", pitches_last_3d: 45, days_rest: 0, era_7d: 4.50, ip_last_2d: 1.7, available: false, appearances_7d: 4, days_pitched_last_5: 3 },
          { name: "Ryan Walker", hand: "R", fatigue: "HIGH", pitches_last_3d: 40, days_rest: 1, era_7d: 3.60, ip_last_2d: 1.0, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
          { name: "Taylor Rogers", hand: "L", fatigue: "MODERATE", pitches_last_3d: 25, days_rest: 1, era_7d: 3.00, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Luke Jackson", hand: "R", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 3, era_7d: 0.00, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
        ]
      },
      away_record: { wins: 2, losses: 3, win_pct: .400, run_diff: -6, run_diff_per_game: -1.20, pyth_pct: .370, expected_wins: 1.9, luck_factor: 0.1, runs_scored: 18, runs_allowed: 24 },
      home_record: { wins: 1, losses: 4, win_pct: .200, run_diff: -15, run_diff_per_game: -3.00, pyth_pct: .180, expected_wins: 0.9, luck_factor: 0.1, runs_scored: 14, runs_allowed: 29 },
      edge: {
        matchup: "SEA @ SF", composite_score: -34.7, abs_score: 34.7,
        lean: "SEA", confidence: "HIGH", ou_lean: null, park_factor: 0.97,
        ou_signals: [],
        signals: [
          { type: "BULLPEN_ERA", detail: "SEA pen ERA (2.65) vs SF (4.20) — 1.55 gap", favors: "SEA", strength: "MODERATE", impact: 9.7, weight: 25 },
          { type: "FATIGUE", detail: "SF pen fatigued (52/100) vs SEA (28/100) — 3 arms gassed", favors: "SEA", strength: "STRONG", impact: 10.0, weight: 25 },
          { type: "BULLPEN_WHIP", detail: "SEA pen WHIP (0.95) vs SF (1.30) — 0.35 gap", favors: "SEA", strength: "STRONG", impact: 8.8, weight: 15 },
          { type: "DEPLETED_PEN", detail: "SF has 3 high-fatigue relievers (Doval, Rogers, Walker)", favors: "SEA", strength: "STRONG", impact: 8.0, weight: 10 },
          { type: "PARK_FACTOR", detail: "Oracle Park factor: 0.97 (pitcher-friendly)", favors: "UNDER", strength: "MODERATE", impact: 1.5, weight: 5 },
        ]
      }
    },
    {
      matchup: "AZ @ OAK",
      venue: "Hohokam Stadium",
      game_time: "2026-03-04T20:05:00Z",
      status: "In Progress",
      final_score: null,
      starters: { away: "TBD (Spring)", home: "TBD (Spring)" },
      away_bullpen: {
        team: "AZ", bullpen_era: 3.45, bullpen_whip: 1.15, bullpen_k9: 9.0,
        bullpen_kbb: 2.8, bullpen_ip_7d: 17.0, fatigue_score: 30,
        available_arms: 5, high_fatigue_count: 1, reliever_count: 7,
        lr_splits: { LHP: { ip: 6.0, era: 3.00, whip: 1.05, k9: 9.5 }, RHP: { ip: 11.0, era: 3.70, whip: 1.20, k9: 8.7 } },
        relievers: [
          { name: "Paul Sewald", hand: "R", fatigue: "MODERATE", pitches_last_3d: 28, days_rest: 1, era_7d: 2.70, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "A.J. Puk", hand: "L", fatigue: "FRESH", pitches_last_3d: 14, days_rest: 2, era_7d: 1.80, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
          { name: "Kevin Ginkel", hand: "R", fatigue: "HIGH", pitches_last_3d: 50, days_rest: 0, era_7d: 5.40, ip_last_2d: 2.0, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
        ]
      },
      home_bullpen: {
        team: "ATH", bullpen_era: 4.95, bullpen_whip: 1.42, bullpen_k9: 7.8,
        bullpen_kbb: 1.9, bullpen_ip_7d: 22.0, fatigue_score: 48,
        available_arms: 4, high_fatigue_count: 2, reliever_count: 7,
        lr_splits: { LHP: { ip: 7.0, era: 5.20, whip: 1.50, k9: 7.5 }, RHP: { ip: 15.0, era: 4.80, whip: 1.38, k9: 8.0 } },
        relievers: [
          { name: "Mason Miller", hand: "R", fatigue: "MODERATE", pitches_last_3d: 30, days_rest: 1, era_7d: 2.25, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Lucas Erceg", hand: "R", fatigue: "HIGH", pitches_last_3d: 48, days_rest: 0, era_7d: 6.30, ip_last_2d: 1.7, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
          { name: "Scott Alexander", hand: "L", fatigue: "HIGH", pitches_last_3d: 42, days_rest: 0, era_7d: 5.40, ip_last_2d: 1.3, available: false, appearances_7d: 3, days_pitched_last_5: 3 },
        ]
      },
      away_record: { wins: 3, losses: 3, win_pct: .500, run_diff: 2, run_diff_per_game: 0.33, pyth_pct: .520, expected_wins: 3.1, luck_factor: -0.1, runs_scored: 24, runs_allowed: 22 },
      home_record: { wins: 2, losses: 4, win_pct: .333, run_diff: -8, run_diff_per_game: -1.33, pyth_pct: .335, expected_wins: 2.0, luck_factor: 0.0, runs_scored: 22, runs_allowed: 30 },
      edge: {
        matchup: "AZ @ OAK", composite_score: -22.1, abs_score: 22.1,
        lean: "AZ", confidence: "MODERATE", ou_lean: "OVER", park_factor: 0.94,
        ou_signals: [["OVER", 4.7, "combined bullpen ERA"]],
        signals: [
          { type: "BULLPEN_ERA", detail: "AZ pen ERA (3.45) vs OAK (4.95) — 1.50 gap", favors: "AZ", strength: "MODERATE", impact: 9.4, weight: 25 },
          { type: "FATIGUE", detail: "OAK pen fatigued (48/100) vs AZ (30/100)", favors: "AZ", strength: "MODERATE", impact: 7.5, weight: 25 },
          { type: "BULLPEN_WHIP", detail: "AZ pen WHIP (1.15) vs OAK (1.42)", favors: "AZ", strength: "MODERATE", impact: 6.8, weight: 15 },
        ]
      }
    },
    {
      matchup: "CHC @ MIL",
      venue: "American Family Field",
      game_time: "2026-03-04T20:10:00Z",
      status: "In Progress (CHC 4-1)",
      final_score: null,
      starters: { away: "TBD (Spring)", home: "TBD (Spring)" },
      away_bullpen: {
        team: "CHC", bullpen_era: 5.60, bullpen_whip: 1.48, bullpen_k9: 7.5,
        bullpen_kbb: 2.0, bullpen_ip_7d: 18.0, fatigue_score: 38,
        available_arms: 5, high_fatigue_count: 1, reliever_count: 7,
        lr_splits: { LHP: { ip: 6.0, era: 4.80, whip: 1.35, k9: 8.0 }, RHP: { ip: 12.0, era: 6.00, whip: 1.55, k9: 7.2 } },
        relievers: [
          { name: "Hector Neris", hand: "R", fatigue: "MODERATE", pitches_last_3d: 32, days_rest: 1, era_7d: 4.50, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Mark Leiter Jr.", hand: "R", fatigue: "HIGH", pitches_last_3d: 55, days_rest: 0, era_7d: 7.20, ip_last_2d: 2.0, available: false, appearances_7d: 4, days_pitched_last_5: 3 },
          { name: "Brandon Hughes", hand: "L", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 4, era_7d: 2.70, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
          { name: "Adbert Alzolay", hand: "R", fatigue: "FRESH", pitches_last_3d: 14, days_rest: 2, era_7d: 3.60, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
        ]
      },
      home_bullpen: {
        team: "MIL", bullpen_era: 3.15, bullpen_whip: 1.08, bullpen_k9: 9.8,
        bullpen_kbb: 3.4, bullpen_ip_7d: 16.2, fatigue_score: 22,
        available_arms: 6, high_fatigue_count: 0, reliever_count: 7,
        lr_splits: { LHP: { ip: 5.2, era: 2.70, whip: 0.95, k9: 10.5 }, RHP: { ip: 11.0, era: 3.40, whip: 1.15, k9: 9.4 } },
        relievers: [
          { name: "Devin Williams", hand: "R", fatigue: "MODERATE", pitches_last_3d: 28, days_rest: 1, era_7d: 1.80, ip_last_2d: 1.0, available: true, appearances_7d: 2, days_pitched_last_5: 2 },
          { name: "Joel Payamps", hand: "R", fatigue: "FRESH", pitches_last_3d: 15, days_rest: 2, era_7d: 2.70, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
          { name: "Bryan Hudson", hand: "L", fatigue: "FRESH", pitches_last_3d: 0, days_rest: 3, era_7d: 3.60, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 0 },
          { name: "Elvis Peguero", hand: "R", fatigue: "FRESH", pitches_last_3d: 12, days_rest: 2, era_7d: 0.00, ip_last_2d: 0, available: true, appearances_7d: 1, days_pitched_last_5: 1 },
        ]
      },
      away_record: { wins: 1, losses: 3, win_pct: .250, run_diff: -17, run_diff_per_game: -4.25, pyth_pct: .175, expected_wins: 0.7, luck_factor: 0.3, runs_scored: 14, runs_allowed: 31 },
      home_record: { wins: 3, losses: 2, win_pct: .600, run_diff: 4, run_diff_per_game: 0.80, pyth_pct: .570, expected_wins: 2.9, luck_factor: 0.1, runs_scored: 22, runs_allowed: 18 },
      edge: {
        matchup: "CHC @ MIL", composite_score: 26.8, abs_score: 26.8,
        lean: "MIL", confidence: "MODERATE", ou_lean: "OVER", park_factor: 1.01,
        ou_signals: [["OVER", 4.38, "combined bullpen ERA"]],
        signals: [
          { type: "BULLPEN_ERA", detail: "MIL pen ERA (3.15) vs CHC (5.60) — 2.45 gap", favors: "MIL", strength: "STRONG", impact: 15.3, weight: 25 },
          { type: "BULLPEN_WHIP", detail: "MIL pen WHIP (1.08) vs CHC (1.48) — 0.40 gap", favors: "MIL", strength: "STRONG", impact: 10.0, weight: 15 },
          { type: "FATIGUE", detail: "CHC pen fatigued (38/100) vs MIL (22/100)", favors: "MIL", strength: "MODERATE", impact: 6.7, weight: 25 },
          { type: "RUN_DIFF", detail: "MIL run diff/game +0.80 vs CHC -4.25", favors: "MIL", strength: "STRONG", impact: 10.0, weight: 10 },
        ]
      }
    },
    {
      matchup: "DOM vs DET",
      venue: "JetBlue Park (WBC)",
      game_time: "2026-03-04T19:05:00Z",
      status: "In Progress",
      final_score: null,
      starters: { away: "WBC Roster", home: "WBC Roster" },
      away_bullpen: { team: "DOM", bullpen_era: null, bullpen_whip: null, bullpen_k9: null, bullpen_kbb: null, bullpen_ip_7d: 0, fatigue_score: null, available_arms: 0, high_fatigue_count: 0, reliever_count: 0, lr_splits: {}, relievers: [] },
      home_bullpen: { team: "DET", bullpen_era: 3.80, bullpen_whip: 1.22, bullpen_k9: 8.8, bullpen_kbb: 2.5, bullpen_ip_7d: 12.0, fatigue_score: 20, available_arms: 5, high_fatigue_count: 0, reliever_count: 6, lr_splits: { LHP: { ip: 4.0, era: 3.40, whip: 1.15 }, RHP: { ip: 8.0, era: 4.00, whip: 1.25 } }, relievers: [] },
      away_record: { wins: 0, losses: 0, win_pct: 0, run_diff: 0, run_diff_per_game: 0, pyth_pct: .500, expected_wins: 0, luck_factor: 0, runs_scored: 0, runs_allowed: 0 },
      home_record: { wins: 1, losses: 2, win_pct: .333, run_diff: -8, run_diff_per_game: -2.67, pyth_pct: .270, expected_wins: 0.8, luck_factor: 0.2, runs_scored: 10, runs_allowed: 18 },
      edge: { matchup: "DOM vs DET", composite_score: 0, abs_score: 0, lean: null, confidence: "LOW", ou_lean: null, park_factor: 0.99, ou_signals: [], signals: [{ type: "WBC_NOTE", detail: "WBC game — bullpen data limited for national teams", favors: "N/A", strength: "MODERATE", impact: 0, weight: 0 }] }
    }
  ]
};

const FC = { HIGH: "#ef4444", MODERATE: "#f59e0b", FRESH: "#22c55e" };
const SC = { "Final": "#22c55e", "In Progress": "#f59e0b", "Scheduled": "#60a5fa" };

function FB({ score }) {
  if (score == null) return <span style={{ color: "#4a5568" }}>—</span>;
  const c = score >= 50 ? "#ef4444" : score >= 25 ? "#f59e0b" : "#22c55e";
  return (<div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 80, height: 8, background: "#1e1e2e", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(score,100)}%`, height: "100%", background: c, borderRadius: 4 }} /></div><span style={{ fontSize: 13, color: c, fontWeight: 600 }}>{score}</span></div>);
}

function FD({ level }) { return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: FC[level] || "#4a5568", marginRight: 6 }} />; }

function SB({ label, value, highlight }) {
  return (<div style={{ background: highlight ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${highlight ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 14px" }}><div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700, color: highlight ? "#ef4444" : "#e2e8f0" }}>{value ?? "—"}</div></div>);
}

function SR({ signal }) {
  const icon = signal.strength === "STRONG" ? "\u{1F525}" : "\u{1F4CC}";
  return (<div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}><span style={{ fontSize: 14 }}>{icon}</span><div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "#cbd5e1" }}>{signal.detail}</div><div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>Favors <span style={{ color: "#60a5fa", fontWeight: 600 }}>{signal.favors}</span>{signal.impact > 0 && <span style={{ marginLeft: 8 }}>Impact: {signal.impact}</span>}</div></div></div>);
}

function RT({ relievers, team }) {
  if (!relievers?.length) return null;
  return (<div style={{ marginTop: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>{team} Relievers</div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{["Pitcher","Apps","Days/5","Pit/3d","IP/2d","Rest","ERA",""].map(h=><th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "#4a5568", fontWeight: 500, fontSize: 11 }}>{h}</th>)}</tr></thead><tbody>{relievers.slice(0,6).map((r,i)=><tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}><td style={{ padding: "5px 8px", color: "#e2e8f0", whiteSpace: "nowrap" }}><div style={{ display: "flex", alignItems: "center" }}><FD level={r.fatigue}/>{r.name} <span style={{ color: "#4a5568", marginLeft: 4 }}>({r.hand})</span></div></td><td style={{ padding: "5px 8px", color: "#94a3b8" }}>{r.appearances_7d}</td><td style={{ padding: "5px 8px", color: "#94a3b8" }}>{r.days_pitched_last_5}</td><td style={{ padding: "5px 8px", color: r.pitches_last_3d>=50?"#ef4444":"#94a3b8", fontWeight: r.pitches_last_3d>=50?600:400 }}>{r.pitches_last_3d}</td><td style={{ padding: "5px 8px", color: "#94a3b8" }}>{r.ip_last_2d}</td><td style={{ padding: "5px 8px", color: r.days_rest===0?"#f59e0b":"#94a3b8" }}>{r.days_rest}d</td><td style={{ padding: "5px 8px", color: r.era_7d>=4.5?"#ef4444":"#94a3b8" }}>{r.era_7d}</td><td style={{ padding: "5px 8px" }}>{r.available?<span style={{color:"#22c55e"}}>✓</span>:<span style={{color:"#ef4444"}}>✗</span>}</td></tr>)}</tbody></table></div></div>);
}

function GC({ game, isExpanded, onToggle, betLog, onLogBet }) {
  const e = game.edge;
  const lc = e.confidence==="HIGH"?"#ef4444":e.confidence==="MODERATE"?"#f59e0b":"#4a5568";
  const sc = SC[game.status]||Object.entries(SC).find(([k])=>game.status?.includes(k))?.[1]||"#60a5fa";
  const ab = game.away_bullpen, hb = game.home_bullpen;
  const eb = betLog.find(b=>b.matchup===e.matchup);

  return (<div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: lc }}>
    <div onClick={onToggle} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{e.matchup}</span>
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: `${sc}18`, color: sc, fontWeight: 600 }}>{game.status}</span>
            {game.final_score && <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>{game.final_score.away}-{game.final_score.home}</span>}
            {eb && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: eb.result==="W"?"rgba(34,197,94,0.15)":eb.result==="L"?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.06)", color: eb.result==="W"?"#22c55e":eb.result==="L"?"#ef4444":"#94a3b8", fontWeight: 600 }}>{eb.result==="W"?"✓ WIN":eb.result==="L"?"✗ LOSS":"LOGGED"}</span>}
          </div>
          <div style={{ fontSize: 12, color: "#4a5568", marginTop: 2 }}>{game.starters.away} vs {game.starters.home} · {game.venue}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {e.park_factor!==1.0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: e.park_factor>=1.05?"rgba(239,68,68,0.1)":e.park_factor<=0.95?"rgba(59,130,246,0.1)":"rgba(255,255,255,0.04)", color: e.park_factor>=1.05?"#ef4444":e.park_factor<=0.95?"#3b82f6":"#6b7280", fontWeight: 600 }}>PF {e.park_factor}</span>}
          {e.ou_lean && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "rgba(168,85,247,0.1)", color: "#a855f7", fontWeight: 600 }}>{e.ou_lean}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {e.lean && <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 700, color: lc }}>{e.lean}</div><div style={{ fontSize: 11, color: "#4a5568" }}>{e.confidence} · {e.composite_score>0?"+":""}{e.composite_score}</div></div>}
        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a5568", transform: isExpanded?"rotate(180deg)":"rotate(0deg)", transition: "transform 0.2s", fontSize: 13 }}>▾</div>
      </div>
    </div>
    {isExpanded && <div style={{ padding: "0 20px 20px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
      {e.lean && !eb && <div style={{ marginTop: 14, padding: 12, background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.12)", borderRadius: 8 }}><div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Log This Pick</div><button onClick={()=>onLogBet(e.matchup,e.lean,e.confidence,null)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontFamily: "inherit", fontWeight: 500 }}>📝 Log {e.lean} pick</button></div>}
      {eb && !eb.result && <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}><div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>MARK RESULT</div><div style={{ display: "flex", gap: 8 }}><button onClick={()=>onLogBet(e.matchup,e.lean,e.confidence,"W")} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "inherit", fontWeight: 600 }}>✓ Win</button><button onClick={()=>onLogBet(e.matchup,e.lean,e.confidence,"L")} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontFamily: "inherit", fontWeight: 600 }}>✗ Loss</button><button onClick={()=>onLogBet(e.matchup,e.lean,e.confidence,"P")} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280", fontFamily: "inherit", fontWeight: 500 }}>Push</button></div></div>}
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" }}>Bullpen Comparison</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{[ab,hb].map((bp,i)=><div key={i}><div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{bp.team}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><SB label="ERA" value={bp.bullpen_era} highlight={bp.bullpen_era>=4.5}/><SB label="WHIP" value={bp.bullpen_whip} highlight={bp.bullpen_whip>=1.4}/><SB label="K/9" value={bp.bullpen_k9}/><SB label="K/BB" value={bp.bullpen_kbb}/></div><div style={{ marginTop: 8 }}><div style={{ fontSize: 10, color: "#4a5568", marginBottom: 4 }}>Fatigue</div><FB score={bp.fatigue_score}/><div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>{bp.available_arms}/{bp.reliever_count} available · {bp.high_fatigue_count} gassed</div></div></div>)}</div>
      </div>
      {(ab.lr_splits?.LHP||hb.lr_splits?.LHP) && <div style={{ marginTop: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>L/R Bullpen Splits</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>{[ab,hb].map((bp,i)=><div key={i}><div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>{bp.team}</div>{["LHP","RHP"].map(h=>{const s=bp.lr_splits?.[h];return s?.era?<div key={h} style={{color:"#94a3b8",marginBottom:2}}><span style={{color:"#4a5568"}}>{h}:</span> {s.era} ERA · {s.whip} WHIP</div>:null;})}</div>)}</div></div>}
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>Team Fundamentals</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>{[{r:game.away_record,t:ab.team},{r:game.home_record,t:hb.team}].map(({r,t},i)=><div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 12 }}><div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{t}</div><div style={{ color: "#94a3b8", lineHeight: 1.8 }}><div>{r.wins}-{r.losses} ({r.win_pct})</div><div>Run Diff: <span style={{ color: r.run_diff>0?"#22c55e":r.run_diff<0?"#ef4444":"#94a3b8", fontWeight: 600 }}>{r.run_diff>0?"+":""}{r.run_diff}</span> ({r.run_diff_per_game>0?"+":""}{r.run_diff_per_game}/g)</div><div>Pyth: {r.pyth_pct} · Luck: {r.luck_factor>0?"+":""}{r.luck_factor}</div></div></div>)}</div></div>
      <RT relievers={ab.relievers} team={ab.team}/>
      <RT relievers={hb.relievers} team={hb.team}/>
      {e.signals.length>0 && <div style={{ marginTop: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>Edge Signals</div>{e.signals.map((s,i)=><SR key={i} signal={s}/>)}</div>}
    </div>}
  </div>);
}

function BT({ betLog }) {
  if (!betLog.length) return null;
  const w=betLog.filter(b=>b.result==="W").length, l=betLog.filter(b=>b.result==="L").length, p=betLog.filter(b=>!b.result).length;
  const tot=w+l, pct=tot>0?((w/tot)*100).toFixed(1):"—", units=w*1-l*1.1;
  return (<div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" }}>📊 Betting Log</div>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
      <div><div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase" }}>Record</div><div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}><span style={{color:"#22c55e"}}>{w}</span>-<span style={{color:"#ef4444"}}>{l}</span>{p>0&&<span style={{color:"#4a5568",fontSize:14}}> ({p} pending)</span>}</div></div>
      <div><div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase" }}>Win %</div><div style={{ fontSize: 20, fontWeight: 700, color: parseFloat(pct)>=55?"#22c55e":parseFloat(pct)>=50?"#f59e0b":"#ef4444" }}>{pct}%</div></div>
      <div><div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase" }}>Units (−110)</div><div style={{ fontSize: 20, fontWeight: 700, color: units>=0?"#22c55e":"#ef4444" }}>{units>=0?"+":""}{units.toFixed(1)}u</div></div>
    </div>
    <div style={{ fontSize: 11, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8 }}>
      {betLog.slice(-5).reverse().map((b,i)=><div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}><span style={{ color: b.result==="W"?"#22c55e":b.result==="L"?"#ef4444":"#6b7280", fontWeight: 600 }}>{b.result==="W"?"✓":b.result==="L"?"✗":"○"}</span><span style={{ color: "#94a3b8" }}>{b.matchup}</span><span style={{ color: "#60a5fa" }}>→ {b.pick}</span><span style={{ color: "#4a5568" }}>({b.confidence})</span></div>)}
    </div>
  </div>);
}

export default function App() {
  const [data, setData] = useState(REAL_GAMES);
  const [expanded, setExpanded] = useState({0: true, 1: true});
  const [jsonInput, setJsonInput] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [sortBy, setSortBy] = useState("score");
  const [betLog, setBetLog] = useState([]);
  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }));
  const handleImport = () => { try { setData(JSON.parse(jsonInput)); setShowImport(false); setJsonInput(""); setExpanded({}); } catch { alert("Invalid JSON"); } };
  const handleLogBet = (matchup, pick, confidence, result) => {
    setBetLog(prev => { const ex = prev.findIndex(b => b.matchup === matchup); if (ex >= 0) { const u = [...prev]; u[ex] = { ...u[ex], result }; return u; } return [...prev, { matchup, pick, confidence, result, date: data.date }]; });
  };
  const sorted = [...(data?.games||[])].sort((a,b) => sortBy==="score"?b.edge.abs_score-a.edge.abs_score:Math.max(b.away_bullpen.fatigue_score||0,b.home_bullpen.fatigue_score||0)-Math.max(a.away_bullpen.fatigue_score||0,a.home_bullpen.fatigue_score||0));
  const high = sorted.filter(g => g.edge.confidence === "HIGH");

  return (<div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26 }}>⚾</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>Bullpen Edge Analyzer</h1>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 600 }}>v2.0</span>
        </div>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "0 0 14px" }}>ERA · WHIP · Fatigue · Park Factors · Pythagorean · Run Diff · L/R Splits · Bet Tracking</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280" }}>📅 {data?.date} · {data?.games_count} games</div>
          <button onClick={()=>setShowImport(!showImport)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa", fontFamily: "inherit", fontWeight: 500 }}>{showImport?"Cancel":"Import JSON"}</button>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#6b7280", fontFamily: "inherit" }}><option value="score">Sort: Edge Score</option><option value="fatigue">Sort: Fatigue</option></select>
        </div>
        {showImport && <div style={{ marginTop: 10 }}><textarea value={jsonInput} onChange={e=>setJsonInput(e.target.value)} placeholder="Paste --json output" style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 8, fontSize: 11, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#e2e8f0", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}/><button onClick={handleImport} style={{ marginTop: 6, fontSize: 11, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "#3b82f6", border: "none", color: "#fff", fontFamily: "inherit", fontWeight: 600 }}>Load</button></div>}
      </div>
      <BT betLog={betLog}/>
      {high.length > 0 && <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4, textTransform: "uppercase" }}>🔥 High Confidence</div>{high.map((g,i)=><div key={i} style={{ fontSize: 13, color: "#fca5a5" }}>{g.edge.matchup} → <strong>{g.edge.lean}</strong> ({g.edge.composite_score>0?"+":""}{g.edge.composite_score})</div>)}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sorted.map((g,i)=><GC key={i} game={g} isExpanded={expanded[i]} onToggle={()=>toggle(i)} betLog={betLog} onLogBet={handleLogBet}/>)}</div>
      <div style={{ marginTop: 28, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        <strong style={{ color: "#4a5568" }}>Score:</strong> Positive = home edge, Negative = away. <strong style={{ color: "#4a5568" }}>Fatigue:</strong> 0=fresh, 100=gassed. <strong style={{ color: "#4a5568" }}>Luck:</strong> Negative = regression UP.
        <br/>⚠ Spring training — bullpen patterns not yet meaningful. Real data starts Opening Day (March 26).
        <br/>⚠ One factor among many. Always check line value. Gamble responsibly.
      </div>
    </div>
  </div>);
}
