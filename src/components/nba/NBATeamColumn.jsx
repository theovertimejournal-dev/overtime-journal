import { Pill } from '../common/Pill';

export function NBATeamColumn({ t }) {
  const nc = t.net_rating >= 5 ? "#22c55e" : t.net_rating >= 0 ? "#f59e0b" : "#ef4444";
  const bc = t.bench_net >= 3 ? "#22c55e" : t.bench_net >= 0 ? "#f59e0b" : "#ef4444";
  const cc = t.close_pct >= .55 ? "#22c55e" : t.close_pct < .4 ? "#ef4444" : "#f59e0b";

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
        {t.team} <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>{t.record}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          ["Net Rtg", t.net_rating, nc, `O:${t.off_rating} D:${t.def_rating}`],
          ["Bench Net", t.bench_net, bc, `${t.bench_ppg} PPG`],
          ["Close", t.close_record, cc, `${(t.close_pct * 100).toFixed(0)}%`],
          ["3PT%", `${t.three_pct}%`, "#e2e8f0", `L10: ${t.last10_three}%`]
        ].map(([label, val, color, sub], i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>
              {typeof val === "number" ? (val > 0 ? "+" : "") + val : val}
            </div>
            <div style={{ fontSize: 10, color: "#4a5568" }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {t.b2b && <Pill text="B2B ⚠" color="#ef4444" />}
        {t.rest_days >= 2 && <Pill text={`${t.rest_days}d rest`} color="#22c55e" />}
        <span style={{ fontSize: 11, color: "#4a5568" }}>{t.last5} ({t.streak})</span>
      </div>
      {t.key_out?.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {t.key_out.map((p, i) => (
            <div key={i} style={{ fontSize: 10, color: "#ef4444", marginBottom: 2 }}>🚑 {p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
