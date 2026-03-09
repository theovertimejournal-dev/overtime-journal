import { useNavigate } from "react-router-dom";

const PIXEL_FONT = "'Courier New', monospace";

const GAMES = [
  {
    id: "nba_jam",
    emoji: "🏀",
    title: "OTJ JAM",
    subtitle: "NBA 2v2 Arcade",
    description: "Halfcourt hoops. On fire bonuses. BOOMSHAKALAKA.",
    status: "live",
    path: "/arcade/nba",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.3)",
  },
  {
    id: "hr_derby",
    emoji: "⚾",
    title: "HR DERBY",
    subtitle: "MLB Power Swing",
    description: "Time your swing. Launch it deep. Distance tracker.",
    status: "soon",
    path: null,
    color: "#22c55e",
    glow: "rgba(34,197,94,0.3)",
  },
  {
    id: "hockey_shootout",
    emoji: "🏒",
    title: "SHOOTOUT",
    subtitle: "NHL 1v1 Penalty",
    description: "Pick your corner. Beat the goalie. Best of 5.",
    status: "soon",
    path: null,
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.3)",
  },
  {
    id: "football",
    emoji: "🏈",
    title: "DRIVE TIME",
    subtitle: "NFL Passing Game",
    description: "Read the coverage. Lead your receiver. Score.",
    status: "soon",
    path: null,
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.3)",
  },
];

export default function ArcadePage({ user, profile }) {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      backgroundImage: `
        radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.012) 40px, rgba(255,255,255,0.012) 41px),
        repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.012) 40px, rgba(255,255,255,0.012) 41px)
      `,
      fontFamily: PIXEL_FONT,
      padding: "32px 16px 48px",
    }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 11, color: "#4c1d95", marginBottom: 8, letterSpacing: "0.2em" }}>
          OTJ ARCADE
        </div>
        <h1 style={{
          fontSize: 36, fontWeight: 700, margin: "0 0 8px",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 12px rgba(251,191,36,0.4))",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          🕹 GAME SELECT
        </h1>
        <p style={{ fontSize: 11, color: "#4a5568", margin: 0 }}>
          {profile?.username ? `Welcome, @${profile.username}` : "Choose your game"}
        </p>
      </div>

      {/* Game grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 20,
        maxWidth: 900,
        margin: "0 auto",
      }}>
        {GAMES.map((game) => (
          <div
            key={game.id}
            onClick={() => game.status === "live" && navigate(game.path)}
            style={{
              background: "linear-gradient(160deg, #12091f 0%, #0d0d1a 100%)",
              border: `2px solid ${game.status === "live" ? game.color : "#1e1040"}`,
              borderRadius: 16,
              padding: "28px 24px",
              cursor: game.status === "live" ? "pointer" : "default",
              position: "relative",
              overflow: "hidden",
              transition: "all 0.2s ease",
              boxShadow: game.status === "live"
                ? `0 0 20px ${game.glow}, inset 0 0 20px rgba(0,0,0,0.3)`
                : "inset 0 0 20px rgba(0,0,0,0.3)",
              opacity: game.status === "live" ? 1 : 0.6,
            }}
            onMouseEnter={e => {
              if (game.status !== "live") return;
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = `0 8px 30px ${game.glow}, inset 0 0 20px rgba(0,0,0,0.3)`;
            }}
            onMouseLeave={e => {
              if (game.status !== "live") return;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = `0 0 20px ${game.glow}, inset 0 0 20px rgba(0,0,0,0.3)`;
            }}
          >
            {/* Corner glow */}
            <div style={{
              position: "absolute", top: 0, right: 0,
              width: 80, height: 80,
              background: `radial-gradient(circle at top right, ${game.glow}, transparent 70%)`,
            }} />

            {/* Emoji */}
            <div style={{
              fontSize: 44, marginBottom: 12,
              filter: game.status === "live" ? `drop-shadow(0 0 8px ${game.color})` : "none",
            }}>
              {game.emoji}
            </div>

            {/* Title */}
            <div style={{
              fontSize: 20, fontWeight: 700, color: game.status === "live" ? game.color : "#374151",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2,
            }}>
              {game.title}
            </div>

            {/* Subtitle */}
            <div style={{ fontSize: 10, color: "#4a5568", marginBottom: 10, letterSpacing: "0.1em" }}>
              {game.subtitle}
            </div>

            {/* Description */}
            <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, marginBottom: 16 }}>
              {game.description}
            </div>

            {/* Status badge */}
            {game.status === "live" ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: `${game.color}20`, border: `1px solid ${game.color}40`,
                borderRadius: 6, padding: "4px 12px",
                fontSize: 10, color: game.color, fontWeight: 700, letterSpacing: "0.1em",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: game.color, display: "inline-block", boxShadow: `0 0 6px ${game.color}` }} />
                PLAY NOW
              </div>
            ) : (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#0d0d1a", border: "1px solid #1e1040",
                borderRadius: 6, padding: "4px 12px",
                fontSize: 10, color: "#374151", letterSpacing: "0.1em",
              }}>
                🔒 COMING SOON
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom flavor text */}
      <div style={{ textAlign: "center", marginTop: 48, fontSize: 10, color: "#1e1040", letterSpacing: "0.15em" }}>
        ★ MORE GAMES DROPPING SOON ★
      </div>
    </div>
  );
}
