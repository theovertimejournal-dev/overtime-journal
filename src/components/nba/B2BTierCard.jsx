// B2BTierCard — works for NBA now, NHL later (just pass different tiers/tags)
// NHL equivalent: GoalieFatigueCard with goalie B2B data

export function B2BTierCard({ tiers, tags, lesson }) {
  return (
    <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
      {lesson && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>
            📉 LAST NIGHT'S LESSON
          </div>
          <div style={{ fontSize: 11, color: "#fca5a5", lineHeight: 1.7, marginBottom: 12 }}>
            {lesson}
          </div>
        </>
      )}

      {/* Tier definitions */}
      {tiers && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 12 }}>
          {tiers.map((t, i) => (
            <div key={i} style={{
              background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 14px",
              borderLeft: `3px solid ${t.color}`
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.color, marginBottom: 3 }}>{t.tier}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>{t.desc}</div>
              <div style={{ fontSize: 10, color: "#6b7280", fontStyle: "italic" }}>{t.example}</div>
            </div>
          ))}
        </div>
      )}

      {/* B2B quick tags */}
      {tags && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {tags.map((b, i) => (
            <div key={i} style={{
              fontSize: 10, padding: "3px 10px", borderRadius: 5,
              background: `${b.color}10`, border: `1px solid ${b.color}25`,
              color: b.color, fontWeight: 600
            }}>
              {b.tier} {b.team} {b.note}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#4a5568", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6 }}>
        💡 <span style={{ color: "#94a3b8" }}>
          The ~2-3 point penalty is a <strong>team total</strong> margin drop. Tier 1 can push to 4-5 pts. Tier 3 is often under 2 pts.
        </span>
      </div>
    </div>
  );
}

// ─── Spread Mismatch Detector ─────────────────────────────────────────────────
export function SpreadMismatchCard({ mismatches }) {
  if (!mismatches?.length) return null;
  return (
    <div style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>
        💰 B2B SPREAD MISMATCH — Where Fatigue Isn't Priced In
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 10, lineHeight: 1.6 }}>
        When a B2B team is <span style={{ color: "#f59e0b", fontWeight: 600 }}>still favored</span>, the spread may not fully account for fatigue. Best value = Tier 1/2 team favored by a thin spread.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mismatches.map((m, i) => (
          <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${m.verdictColor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{m.matchup}</span>
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontWeight: 600 }}>
                {m.b2b_team} B2B {m.tier}
              </span>
              {m.value !== "NONE" && (
                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${m.verdictColor}15`, color: m.verdictColor, fontWeight: 600 }}>
                  {m.value} VALUE
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 4, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 9, color: "#4a5568" }}>POSTED</div><div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{m.spread}</div></div>
              <div><div style={{ fontSize: 9, color: "#4a5568" }}>FATIGUE TAX</div><div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>{m.penalty}</div></div>
              <div><div style={{ fontSize: 9, color: "#4a5568" }}>ADJUSTED</div><div style={{ fontSize: 12, fontWeight: 700, color: "#a855f7" }}>{m.adjusted}</div></div>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{m.verdict}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
