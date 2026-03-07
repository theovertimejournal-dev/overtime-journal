import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ── Mock data — replace with Supabase fetch when pick system is live ──────────
// Each day can have multiple sport entries
const MOCK_RECORD_DATA = {
  "2026-03-06": { w: 5, l: 2, record: "5-2", units: 2.8, sport: "NBA", note: "PHX upset by CHI · GSW upset HOU", highlight: "NOP +9.5 cash" },
  "2026-03-05": { w: 6, l: 1, record: "6-1", units: 4.9, sport: "NBA", note: "LAL B2B fatigue played out perfectly", highlight: "LAL B2B fade hit" },
  "2026-03-04": { w: 4, l: 3, record: "4-3", units: 0.7, sport: "NBA", note: "Tough night — two close game losses", highlight: null },
  "2026-03-03": { w: 6, l: 2, record: "6-2", units: 3.8, sport: "NBA", note: "Bench edge theory validated — 3 of 4 bench picks hit", highlight: "BOS bench edge" },
  "2026-03-02": { w: 5, l: 2, record: "5-2", units: 2.8, sport: "NBA", note: "Solid B2B plays", highlight: null },
  "2026-03-01": { w: 3, l: 4, record: "3-4", units: -1.4, sport: "NBA", note: "Rough start to March — variance night", highlight: null },
  "2026-02-28": { w: 7, l: 1, record: "7-1", units: 6.1, sport: "NBA", note: "Best night of the month", highlight: "7-1 night 🔥" },
  "2026-02-27": { w: 5, l: 3, record: "5-3", units: 1.7, sport: "NBA", note: null, highlight: null },
  "2026-02-26": { w: 4, l: 2, record: "4-2", units: 1.8, sport: "NBA", note: null, highlight: null },
  "2026-02-25": { w: 6, l: 2, record: "6-2", units: 3.8, sport: "NBA", note: null, highlight: null },
  "2026-02-24": { w: 5, l: 1, record: "5-1", units: 3.9, sport: "NBA", note: null, highlight: null },
  "2026-02-23": { w: 3, l: 3, record: "3-3", units: -0.3, sport: "NBA", note: null, highlight: null },
  "2026-02-22": { w: 4, l: 3, record: "4-3", units: 0.7, sport: "NBA", note: null, highlight: null },
  "2026-02-21": { w: 6, l: 1, record: "6-1", units: 4.9, sport: "NBA", note: null, highlight: null },
  "2026-02-20": { w: 5, l: 2, record: "5-2", units: 2.8, sport: "NBA", note: null, highlight: null },
};

const SPORTS = [
  { key: "ALL", label: "All Sports", emoji: "📊" },
  { key: "NBA", label: "NBA", emoji: "🏀" },
  { key: "NHL", label: "NHL", emoji: "🏒" },
  { key: "MLB", label: "MLB", emoji: "⚾" },
  { key: "NFL", label: "NFL", emoji: "🏈" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDayColor(data) {
  if (!data) return null;
  if (data.units >= 4)  return { bg: "rgba(34,197,94,0.18)",  border: "rgba(34,197,94,0.35)",  text: "#22c55e" };
  if (data.units >= 1)  return { bg: "rgba(34,197,94,0.07)",  border: "rgba(34,197,94,0.18)",  text: "#86efac" };
  if (data.units >= -1) return { bg: "rgba(107,114,128,0.07)", border: "rgba(107,114,128,0.18)", text: "#6b7280" };
  return                       { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.2)",   text: "#fca5a5" };
}

function buildEquityCurve(filteredData) {
  const sorted = Object.entries(filteredData).sort(([a], [b]) => a.localeCompare(b));
  let running = 0;
  return sorted.map(([date, d]) => {
    running += d.units;
    return {
      date: date.slice(5),   // "MM-DD"
      units: parseFloat(running.toFixed(2)),
      daily: d.units,
    };
  });
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#0f111a", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "10px 14px", fontSize: 11, fontFamily: "inherit"
    }}>
      <div style={{ color: "#6b7280", marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: d.units >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 15 }}>
        {d.units >= 0 ? "+" : ""}{d.units}u cumulative
      </div>
      <div style={{ color: d.daily >= 0 ? "#86efac" : "#fca5a5", marginTop: 2 }}>
        {d.daily >= 0 ? "+" : ""}{d.daily}u today
      </div>
    </div>
  );
}

// ── Calendar Month ────────────────────────────────────────────────────────────
function CalendarMonth({ year, month, data, onSelectDay, selectedDay }) {
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = data[dateStr];
    const colors = getDayColor(dayData);
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedDay;
    const isFuture = dateStr > today;

    cells.push(
      <div key={d} onClick={() => dayData && onSelectDay(dateStr)} style={{
        aspectRatio: "1",
        borderRadius: 7,
        border: isSelected
          ? "1px solid #f59e0b"
          : `1px solid ${colors?.border || "rgba(255,255,255,0.04)"}`,
        background: isSelected
          ? "rgba(245,158,11,0.12)"
          : (colors?.bg || "rgba(255,255,255,0.01)"),
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        cursor: dayData ? "pointer" : "default",
        opacity: isFuture ? 0.15 : 1,
        position: "relative",
        transition: "all 0.12s ease",
      }}>
        <div style={{ fontSize: 10, color: isToday ? "#f59e0b" : "#4a5568", fontWeight: isToday ? 700 : 400 }}>
          {d}
        </div>
        {dayData && (
          <div style={{ fontSize: 9, fontWeight: 700, color: colors?.text, lineHeight: 1 }}>
            {dayData.record}
          </div>
        )}
        {isToday && (
          <div style={{ position: "absolute", top: 3, right: 3, width: 4, height: 4, borderRadius: "50%", background: "#f59e0b" }} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 10, textAlign: "center", letterSpacing: "0.05em" }}>
        {MONTH_NAMES[month].toUpperCase()} {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ fontSize: 8, color: "#1f2937", textAlign: "center", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, accent }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${accent || "rgba(255,255,255,0.06)"}`,
      borderRadius: 10, padding: "14px 16px",
      position: "relative", overflow: "hidden",
    }}>
      {accent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: accent, opacity: 0.6,
        }} />
      )}
      <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || "#e2e8f0", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Sport Filter Tab ──────────────────────────────────────────────────────────
function SportTab({ sport, active, onClick, hasData }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 700,
      padding: "6px 14px", borderRadius: 6,
      border: active ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.06)",
      background: active ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.02)",
      color: active ? "#ef4444" : hasData ? "#6b7280" : "#1f2937",
      cursor: hasData ? "pointer" : "default",
      fontFamily: "inherit",
      transition: "all 0.12s",
      letterSpacing: "0.04em",
    }}>
      {sport.emoji} {sport.key}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Record() {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState("2026-03-06");
  const [activeSport, setActiveSport] = useState("ALL");

  // Filter data by sport
  const filteredData = useMemo(() => {
    if (activeSport === "ALL") return MOCK_RECORD_DATA;
    return Object.fromEntries(
      Object.entries(MOCK_RECORD_DATA).filter(([, d]) => d.sport === activeSport)
    );
  }, [activeSport]);

  // Aggregates
  const allDays = Object.values(filteredData);
  const totalW = allDays.reduce((s, d) => s + d.w, 0);
  const totalL = allDays.reduce((s, d) => s + d.l, 0);
  const totalUnits = allDays.reduce((s, d) => s + d.units, 0);
  const winPct = totalW + totalL > 0 ? ((totalW / (totalW + totalL)) * 100).toFixed(1) : "—";

  // This month
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}`;
  const monthDays = Object.entries(filteredData).filter(([d]) => d.startsWith(thisMonth));
  const monthW = monthDays.reduce((s, [,d]) => s + d.w, 0);
  const monthL = monthDays.reduce((s, [,d]) => s + d.l, 0);
  const monthUnits = monthDays.reduce((s, [,d]) => s + d.units, 0);

  // Equity curve
  const equityCurve = useMemo(() => buildEquityCurve(filteredData), [filteredData]);

  // ROI (simplified: units / total bets * 100)
  const totalBets = totalW + totalL;
  const roi = totalBets > 0 ? ((totalUnits / totalBets) * 100).toFixed(1) : "—";

  // Best streak (longest W streak)
  const selectedData = filteredData[selectedDay] || MOCK_RECORD_DATA[selectedDay];

  // Sports that have data
  const sportsWithData = new Set(Object.values(MOCK_RECORD_DATA).map(d => d.sport));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
    }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 16px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>📊</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
              OTJ Record
            </h1>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              padding: "3px 8px", borderRadius: 4,
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
              color: "#22c55e", textTransform: "uppercase"
            }}>Live</div>
          </div>
          <p style={{ fontSize: 11, color: "#374151", margin: 0 }}>
            Daily results · Click any day to see the breakdown · All picks logged before tip-off
          </p>
        </div>

        {/* ── Sport Filter ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
          {SPORTS.map(s => (
            <SportTab
              key={s.key}
              sport={s}
              active={activeSport === s.key}
              onClick={() => s.key === "ALL" || sportsWithData.has(s.key) ? setActiveSport(s.key) : null}
              hasData={s.key === "ALL" || sportsWithData.has(s.key)}
            />
          ))}
          {activeSport !== "ALL" && !sportsWithData.has(activeSport) && (
            <span style={{ fontSize: 10, color: "#374151", alignSelf: "center", marginLeft: 4 }}>
              No data yet — coming soon
            </span>
          )}
        </div>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 24 }}>
          <StatCard
            label="All Time W-L"
            value={totalW + totalL > 0 ? `${totalW}-${totalL}` : "—"}
            color="#22c55e"
            accent="rgba(34,197,94,0.3)"
          />
          <StatCard
            label="Win %"
            value={winPct !== "—" ? `${winPct}%` : "—"}
            color={parseFloat(winPct) >= 55 ? "#22c55e" : "#f59e0b"}
            sub={parseFloat(winPct) >= 55 ? "Above breakeven" : ""}
          />
          <StatCard
            label="Total Units"
            value={totalBets > 0 ? `${totalUnits >= 0 ? "+" : ""}${totalUnits.toFixed(1)}u` : "—"}
            color={totalUnits >= 0 ? "#22c55e" : "#ef4444"}
            accent={totalUnits >= 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}
          />
          <StatCard
            label="ROI"
            value={roi !== "—" ? `${roi}%` : "—"}
            color={parseFloat(roi) >= 5 ? "#22c55e" : "#f59e0b"}
            sub="per unit wagered"
          />
          <StatCard
            label={`${today.toLocaleString('default', { month: 'long' })}`}
            value={monthW + monthL > 0 ? `${monthW}-${monthL}` : "—"}
            color="#f59e0b"
            sub={monthW + monthL > 0 ? `${monthUnits >= 0 ? "+" : ""}${monthUnits.toFixed(1)}u` : ""}
          />
        </div>

        {/* ── Equity Curve + Calendar split ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

          {/* Equity curve chart */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "18px 16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
                  Equity Curve
                </div>
                <div style={{ fontSize: 11, color: "#4a5568" }}>
                  Cumulative units over time
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: totalUnits >= 0 ? "#22c55e" : "#ef4444" }}>
                {totalUnits >= 0 ? "+" : ""}{totalUnits.toFixed(1)}u
              </div>
            </div>

            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={equityCurve} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#374151", fontFamily: "inherit" }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.floor(equityCurve.length / 5)}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#374151", fontFamily: "inherit" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}u`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="units"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#22c55e", stroke: "#08080f", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontSize: 11 }}>
                No data for this sport yet
              </div>
            )}

            {/* Mini legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {[
                { color: "#22c55e", label: "4+ units" },
                { color: "#86efac", label: "1-4 units" },
                { color: "#6b7280", label: "Even / -1u" },
                { color: "#fca5a5", label: "Down 1u+" },
              ].map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, opacity: 0.7 }} />
                  <span style={{ fontSize: 9, color: "#374151" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Day detail panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedData ? (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "18px",
                flex: 1,
              }}>
                <div style={{ fontSize: 10, color: "#4a5568", marginBottom: 4, letterSpacing: "0.06em" }}>
                  {selectedDay}
                  {selectedData.sport && (
                    <span style={{ marginLeft: 8, color: "#374151" }}>· {selectedData.sport}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 700,
                  color: selectedData.units >= 0 ? "#22c55e" : "#ef4444",
                  marginBottom: 16, letterSpacing: "-0.03em"
                }}>
                  {selectedData.record}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "WIN %", value: `${((selectedData.w / (selectedData.w + selectedData.l)) * 100).toFixed(0)}%` },
                    { label: "UNITS", value: `${selectedData.units >= 0 ? "+" : ""}${selectedData.units.toFixed(1)}u`, color: selectedData.units >= 0 ? "#22c55e" : "#ef4444" },
                    { label: "ROI", value: `${(selectedData.units / (selectedData.w + selectedData.l) * 100).toFixed(0)}%` },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8, padding: "10px 12px"
                    }}>
                      <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: s.color || "#e2e8f0" }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {selectedData.note && (
                  <div style={{
                    fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 10,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.02)",
                    borderLeft: "2px solid rgba(255,255,255,0.08)",
                    borderRadius: "0 6px 6px 0"
                  }}>
                    {selectedData.note}
                  </div>
                )}

                {selectedData.highlight && (
                  <div style={{
                    fontSize: 11, color: "#f59e0b", fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 6
                  }}>
                    <span>⭐</span> {selectedData.highlight}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,0.01)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: 12, padding: "40px 20px",
                textAlign: "center", color: "#374151", fontSize: 12, flex: 1,
              }}>
                Click any day on the calendar
              </div>
            )}

            {/* Monthly summary card */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                {today.toLocaleString('default', { month: 'long', year: 'numeric' })} · {activeSport}
              </div>
              {monthW + monthL > 0 ? (
                <div style={{ display: "flex", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 3 }}>RECORD</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{monthW}-{monthL}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 3 }}>UNITS</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: monthUnits >= 0 ? "#22c55e" : "#ef4444" }}>
                      {monthUnits >= 0 ? "+" : ""}{monthUnits.toFixed(1)}u
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 3 }}>WIN %</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>
                      {((monthW / (monthW + monthL)) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#374151" }}>No {activeSport} picks this month yet</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Calendars ── */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12, padding: "20px",
          display: "flex", flexDirection: "column", gap: 28,
        }}>
          <CalendarMonth year={2026} month={2} data={filteredData} onSelectDay={setSelectedDay} selectedDay={selectedDay} />
          <CalendarMonth year={2026} month={1} data={filteredData} onSelectDay={setSelectedDay} selectedDay={selectedDay} />
        </div>

        <div style={{ marginTop: 28, fontSize: 10, color: "#1f2937", textAlign: "center", lineHeight: 2 }}>
          ⚠ All analysis is for informational and entertainment purposes only. Not betting advice. Gamble responsibly. 1-800-GAMBLER.
        </div>
      </div>
    </div>
  );
}
