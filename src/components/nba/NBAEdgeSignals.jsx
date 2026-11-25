// NBAEdgeSignals — isolated so it can be paywalled in Phase 2
// Wrap this in <PaywallGate tier="pro"> when subscriptions go live

const SIGNAL_COLORS = {
  STRONG: "#22c55e",
  MODERATE: "#f59e0b",
  WEAK: "#6b7280",
  CAUTION: "#ef4444",
};

// Named edge tags get a colored chip so the rule is clear at a glance.
// Green = play it, red = fade/skip, amber = tread carefully.
const LABEL_COLORS = {
  "PAPER TIGER": "#ef4444",
  "BACKDOOR RISK": "#f59e0b",
  "DEFENSE-BACKED": "#22c55e",
  "CHALK TRAP": "#ef4444",
  "HOME DOG VALUE": "#22c55e",
};

// Drop a leading "LABEL — " from the detail so it isn't shown twice next to the chip.
function stripLabel(detail, label) {
  if (!label || !detail) return detail;
  const prefix = `${label} — `;
  return detail.startsWith(prefix) ? detail.slice(prefix.length) : detail;
}

export function NBAEdgeSignals({ signals, ouLean }) {
  return (
    <div style={{ marginTop: 12 }}>
      {signals.map((s, i) => {
        const isPositive = s.impact > 0;
        const impactColor = isPositive ? "#22c55e" : "#ef4444";
        const labelColor = s.label ? (LABEL_COLORS[s.label] || "#6b7280") : null;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "5px 0",
            borderBottom: "1px solid rgba(255,255,255,0.03)"
          }}>
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 3,
              background: `${SIGNAL_COLORS[s.strength] || "#6b7280"}15`,
              color: SIGNAL_COLORS[s.strength] || "#6b7280",
              fontWeight: 700, minWidth: 54, textAlign: "center", marginTop: 1, flexShrink: 0
            }}>
              {s.strength}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8", flex: 1, lineHeight: 1.5 }}>
              {labelColor && (
                <span style={{
                  display: "inline-block", fontSize: 9, fontWeight: 800,
                  letterSpacing: 0.3, padding: "2px 6px", borderRadius: 3,
                  marginRight: 6, verticalAlign: "baseline",
                  background: `${labelColor}1f`, color: labelColor,
                  border: `1px solid ${labelColor}55`,
                }}>
                  {s.label}
                </span>
              )}
              {stripLabel(s.detail, s.label)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: impactColor, flexShrink: 0 }}>
              {s.impact > 0 ? "+" : ""}{s.impact}
            </span>
          </div>
        );
      })}
      {ouLean && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#a855f7", fontWeight: 600 }}>
          O/U Lean: {ouLean}
        </div>
      )}
    </div>
  );
}
