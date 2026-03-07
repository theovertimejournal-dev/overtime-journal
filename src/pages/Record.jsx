import { useState } from 'react';

// Mock data — Python pipeline will populate this from daily_slates results
// Format: { "YYYY-MM-DD": { w, l, record, note, games[] } }
const MOCK_RECORD_DATA = {
  "2026-03-06": { w: 5, l: 2, record: "5-2", units: 2.8, note: "PHX upset by CHI (close game regression) · GSW upset HOU", highlight: "NOP +9.5 cash" },
  "2026-03-05": { w: 6, l: 1, record: "6-1", units: 4.9, note: "LAL B2B fatigue played out perfectly", highlight: "LAL B2B fade hit" },
  "2026-03-04": { w: 4, l: 3, record: "4-3", units: 0.7, note: "Tough night — two close game losses", highlight: null },
  "2026-03-03": { w: 6, l: 2, record: "6-2", units: 3.8, note: "Bench edge theory validated — 3 of 4 bench picks hit", highlight: "BOS bench edge" },
  "2026-03-02": { w: 5, l: 2, record: "5-2", units: 2.8, note: "Solid B2B plays", highlight: null },
  "2026-03-01": { w: 3, l: 4, record: "3-4", units: -1.4, note: "Rough start to March — variance night", highlight: null },
  "2026-02-28": { w: 7, l: 1, record: "7-1", units: 6.1, note: "Best night of the month", highlight: "7-1 night 🔥" },
  "2026-02-27": { w: 5, l: 3, record: "5-3", units: 1.7, note: null, highlight: null },
  "2026-02-26": { w: 4, l: 2, record: "4-2", units: 1.8, note: null, highlight: null },
  "2026-02-25": { w: 6, l: 2, record: "6-2", units: 3.8, note: null, highlight: null },
  "2026-02-24": { w: 5, l: 1, record: "5-1", units: 3.9, note: null, highlight: null },
  "2026-02-23": { w: 3, l: 3, record: "3-3", units: -0.3, note: null, highlight: null },
  "2026-02-22": { w: 4, l: 3, record: "4-3", units: 0.7, note: null, highlight: null },
  "2026-02-21": { w: 6, l: 1, record: "6-1", units: 4.9, note: null, highlight: null },
  "2026-02-20": { w: 5, l: 2, record: "5-2", units: 2.8, note: null, highlight: null },
};

function getDayColor(data) {
  if (!data) return null;
  if (data.units >= 4) return { bg: "rgba(34,197,94,0.2)", border: "rgba(34,197,94,0.4)", text: "#22c55e" };
  if (data.units >= 1) return { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", text: "#86efac" };
  if (data.units >= -1) return { bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)", text: "#6b7280" };
  return { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", text: "#fca5a5" };
}

function CalendarMonth({ year, month, data, onSelectDay, selectedDay }) {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = data[dateStr];
    const colors = getDayColor(dayData);
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedDay;
    const isFuture = dateStr > today;

    cells.push(
      <div
        key={d}
        onClick={() => dayData && onSelectDay(dateStr)}
        style={{
          aspectRatio: "1",
          borderRadius: 8,
          border: isSelected ? "1px solid #f59e0b" : `1px solid ${colors?.border || "rgba(255,255,255,0.04)"}`,
          background: isSelected ? "rgba(245,158,11,0.1)" : (colors?.bg || "rgba(255,255,255,0.01)"),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: dayData ? "pointer" : "default",
          opacity: isFuture ? 0.2 : 1,
          position: "relative",
          transition: "all 0.1s ease",
        }}
      >
        <div style={{ fontSize: 10, color: isToday ? "#f59e0b" : "#4a5568", fontWeight: isToday ? 700 : 400 }}>
          {d}
        </div>
        {dayData && (
          <div style={{ fontSize: 9, fontWeight: 700, color: colors?.text }}>
            {dayData.record}
          </div>
        )}
        {isToday && (
          <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: "#f59e0b" }} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 12, textAlign: "center" }}>
        {monthNames[month]} {year}
      </div>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ fontSize: 9, color: "#374151", textAlign: "center", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells}
      </div>
    </div>
  );
}

export default function Record() {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState("2026-03-06");

  // Calculate totals from mock data
  const allDays = Object.values(MOCK_RECORD_DATA);
  const totalW = allDays.reduce((s, d) => s + d.w, 0);
  const totalL = allDays.reduce((s, d) => s + d.l, 0);
  const totalUnits = allDays.reduce((s, d) => s + d.units, 0);
  const winPct = ((totalW / (totalW + totalL)) * 100).toFixed(1);

  // Monthly breakdown
  const marchDays = Object.entries(MOCK_RECORD_DATA).filter(([d]) => d.startsWith("2026-03"));
  const marchW = marchDays.reduce((s, [,d]) => s + d.w, 0);
  const marchL = marchDays.reduce((s, [,d]) => s + d.l, 0);
  const marchUnits = marchDays.reduce((s, [,d]) => s + d.units, 0);

  const selectedData = MOCK_RECORD_DATA[selectedDay];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono','SF Mono',monospace",
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 16px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
              OTJ Record
            </h1>
          </div>
          <p style={{ fontSize: 11, color: "#4a5568", margin: 0 }}>
            Daily results · Click any day to see the full breakdown
          </p>
        </div>

        {/* Overall stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28 }}>
          {[
            { label: "ALL TIME W-L", value: `${totalW}-${totalL}`, color: "#22c55e" },
            { label: "WIN %", value: `${winPct}%`, color: parseFloat(winPct) >= 55 ? "#22c55e" : "#f59e0b" },
            { label: "TOTAL UNITS", value: `+${totalUnits.toFixed(1)}u`, color: "#22c55e" },
            { label: "MARCH", value: `${marchW}-${marchL}`, color: "#f59e0b" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10, padding: "14px 16px"
            }}>
              <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { color: "#22c55e", label: "4+ units" },
            { color: "#86efac", label: "1-4 units" },
            { color: "#6b7280", label: "Even / -1u" },
            { color: "#fca5a5", label: "Down 1u+" },
          ].map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, opacity: 0.6 }} />
              <span style={{ fontSize: 10, color: "#4a5568" }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Calendar + Detail layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Calendars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <CalendarMonth
              year={2026} month={2}
              data={MOCK_RECORD_DATA}
              onSelectDay={setSelectedDay}
              selectedDay={selectedDay}
            />
            <CalendarMonth
              year={2026} month={1}
              data={MOCK_RECORD_DATA}
              onSelectDay={setSelectedDay}
              selectedDay={selectedDay}
            />
          </div>

          {/* Day detail panel */}
          <div>
            {selectedData ? (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "20px"
              }}>
                <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 4 }}>
                  {selectedDay}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: selectedData.units >= 0 ? "#22c55e" : "#ef4444", marginBottom: 16 }}>
                  {selectedData.record}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "WIN %", value: `${((selectedData.w / (selectedData.w + selectedData.l)) * 100).toFixed(0)}%` },
                    { label: "UNITS", value: `${selectedData.units >= 0 ? "+" : ""}${selectedData.units.toFixed(1)}u` },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8, padding: "10px 12px"
                    }}>
                      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {selectedData.note && (
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                    {selectedData.note}
                  </div>
                )}

                {selectedData.highlight && (
                  <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                    ⭐ {selectedData.highlight}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,0.01)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: 12, padding: "40px 20px",
                textAlign: "center", color: "#374151", fontSize: 12
              }}>
                Click any day to see the breakdown
              </div>
            )}

            {/* Monthly summary */}
            <div style={{ marginTop: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase" }}>
                March 2026
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 4 }}>RECORD</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{marchW}-{marchL}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 4 }}>UNITS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: marchUnits >= 0 ? "#22c55e" : "#ef4444" }}>
                    {marchUnits >= 0 ? "+" : ""}{marchUnits.toFixed(1)}u
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 4 }}>WIN %</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>
                    {((marchW / (marchW + marchL)) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32, fontSize: 10, color: "#1f2937", textAlign: "center" }}>
          ⚠ For informational purposes only. Gamble responsibly. 1-800-GAMBLER.
        </div>
      </div>
    </div>
  );
}
