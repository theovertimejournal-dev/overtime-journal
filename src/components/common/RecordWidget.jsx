import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// RecordWidget — pulls live records from Supabase
// Data is updated each morning by resolve_picks.py
export function RecordWidget({ slate }) {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    async function fetchRecords() {
      // Try yesterday_results table first (most accurate)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yDate = yesterday.toLocaleDateString('en-CA'); // YYYY-MM-DD local

      const { data } = await supabase
        .from('yesterday_results')
        .select('*')
        .eq('sport', 'nba')
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setRecords({
          yesterday: data.record || '—',
          weekly:    data.weekly_record || '—',
          monthly:   data.monthly_record || '—',
          streak:    data.streak || '—',
          cumulative: data.cumulative_record || '—',
        });
        return;
      }

      // Fallback: use slate data
      if (slate) {
        setRecords({
          yesterday:  slate.yesterday_record || '—',
          weekly:     '—',
          monthly:    slate.cumulative_record || '—',
          streak:     '—',
          cumulative: slate.cumulative_record || '—',
        });
      }
    }

    fetchRecords();
  }, [slate?.date]);

  const display = records || {
    yesterday: slate?.yesterday_record || '—',
    weekly:    '—',
    monthly:   slate?.cumulative_record || '—',
    streak:    '—',
  };

  const streakColor = display.streak?.startsWith('W') ? '#22c55e' : display.streak?.startsWith('L') ? '#ef4444' : '#6b7280';
  const yesterdayColor = display.yesterday === '—' ? '#4a5568'
    : parseInt(display.yesterday?.split('-')[0]) > parseInt(display.yesterday?.split('-')[1])
      ? '#22c55e' : '#ef4444';

  const stats = [
    { label: "YESTERDAY", value: display.yesterday, color: yesterdayColor },
    { label: "THIS WEEK",  value: display.weekly,    color: "#f59e0b" },
    { label: "THIS MONTH", value: display.monthly,   color: "#22c55e" },
    { label: "STREAK",     value: display.streak,    color: streakColor },
  ];

  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "12px 16px", marginBottom: 14,
      alignItems: "center",
    }}>
      <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>
        OTJ Record
      </div>
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />
      {stats.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
          {i < stats.length - 1 && (
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.05)", marginLeft: 6 }} />
          )}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <a href="/record" style={{
        fontSize: 10, color: "#374151", textDecoration: "none",
        padding: "3px 8px", borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.05)", transition: "color 0.15s"
      }}
        onMouseEnter={e => e.target.style.color = "#6b7280"}
        onMouseLeave={e => e.target.style.color = "#374151"}
      >
        Full history →
      </a>
    </div>
  );
}
