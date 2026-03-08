import { useState } from 'react';

function getLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid DST issues
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatLabel(dateStr) {
  const today = getLocalDate();
  const yesterday = offsetDate(today, -1);
  const tomorrow = offsetDate(today, 1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DateNav({ selectedDate, onDateChange }) {
  const today = getLocalDate();
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const btnStyle = (disabled) => ({
    background: 'none',
    border: 'none',
    color: disabled ? '#2d3748' : '#6b7280',
    fontSize: 18,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '4px 10px',
    borderRadius: 6,
    lineHeight: 1,
    transition: 'color 0.15s',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '8px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(255,255,255,0.01)',
      fontFamily: "'JetBrains Mono','SF Mono',monospace",
    }}>
      {/* Back arrow */}
      <button
        style={btnStyle(false)}
        onClick={() => onDateChange(offsetDate(selectedDate, -1))}
        title="Previous day"
      >←</button>

      {/* Date label */}
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: isToday ? '#ef4444' : '#e2e8f0',
        minWidth: 90,
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}>
        {formatLabel(selectedDate)}
        {!isToday && (
          <span style={{ fontSize: 10, color: '#4a5568', marginLeft: 6 }}>
            {selectedDate}
          </span>
        )}
      </div>

      {/* Forward arrow — disabled on today and future */}
      <button
        style={btnStyle(isToday || isFuture)}
        onClick={() => !isToday && !isFuture && onDateChange(offsetDate(selectedDate, 1))}
        title={isToday ? "Can't go to future" : "Next day"}
      >→</button>

      {/* Jump to today — only show when not on today */}
      {!isToday && (
        <button
          onClick={() => onDateChange(today)}
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            marginLeft: 4,
            letterSpacing: '0.04em',
          }}
        >TODAY</button>
      )}
    </div>
  );
}
