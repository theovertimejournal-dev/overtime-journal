// RecordWidget — compact record bar shown at top of dashboard
// Shows yesterday, this week, this month
// Data comes from slate prop (from useSlate) for now
// When Python pipeline is live, this pulls from a dedicated records table

export function RecordWidget({ slate }) {
  // For now we use mock static records — Python pipeline will update these
  const records = {
    yesterday: slate?.yesterday_record || "—",
    weekly: "8-4",
    monthly: "11-2",
    streak: "W3",
    streakColor: "#22c55e",
  };

  const stats = [
    { label: "YESTERDAY", value: records.yesterday, color: records.yesterday?.startsWith("0") ? "#ef4444" : "#22c55e" },
    { label: "THIS WEEK", value: records.weekly, color: "#f59e0b" },
    { label: "THIS MONTH", value: records.monthly, color: "#22c55e" },
    { label: "STREAK", value: records.streak, color: records.streakColor },
  ];

  return (
    <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 14,
      alignItems: "center",
    }}>
      {/* Label */}
      <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>
        OTJ Record
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />

      {/* Stats */}
      {stats.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {s.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>
            {s.value}
          </div>
          {i < stats.length - 1 && (
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.05)", marginLeft: 6 }} />
          )}
        </div>
      ))}

      {/* Link to full record */}
      <div style={{ flex: 1 }} />
      <a href="/record" style={{
        fontSize: 10, color: "#374151", textDecoration: "none",
        padding: "3px 8px", borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.05)",
        transition: "color 0.15s"
      }}
        onMouseEnter={e => e.target.style.color = "#6b7280"}
        onMouseLeave={e => e.target.style.color = "#374151"}
      >
        Full history →
      </a>
    </div>
  );
}
