export function Pill({ text, color }) {
  return (
    <span style={{
      fontSize: 10,
      padding: "2px 7px",
      borderRadius: 3,
      background: `${color}15`,
      color,
      fontWeight: 600,
      whiteSpace: "nowrap"
    }}>
      {text}
    </span>
  );
}
