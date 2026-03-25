import { useState, useEffect } from "react";
import { Client } from "colyseus.js";
import { client } from "../lib/colyseusClient";

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL;

// ─── Colyseus client (already initialized in your app) ───────────────────────;

// import { client } from "../lib/colyseusClient";
// For now we mock it so the component renders standalone in dev without a server.

// ─── Mock data (remove when wired to real Colyseus) ───────────────────────────


// ─── Tier config ──────────────────────────────────────────────────────────────
const TIERS = {
  rookie: {
    label: "Rookie",
    blinds: "5 / 10",
    min: 200,
    max: 1000,
    color: "#4ade80",
    badge: "🟢",
  },
  regular: {
    label: "Regular",
    blinds: "25 / 50",
    min: 1000,
    max: 5000,
    color: "#60a5fa",
    badge: "🔵",
  },
  highroller: {
    label: "High Roller",
    blinds: "100 / 200",
    min: 5000,
    max: 10000,
    color: "#f59e0b",
    badge: "🟡",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function seatColor(clients, max) {
  const pct = clients / max;
  if (pct >= 0.83) return "#ef4444"; // 5-6 players — almost full
  if (pct >= 0.5) return "#f59e0b"; // 3-4
  return "#4ade80"; // 1-2 — easy to join
}

function tierBadgeStyle(tier) {
  const t = TIERS[tier] || TIERS.rookie;
  return { color: t.color, borderColor: t.color + "55", background: t.color + "18" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveTableRow({ room, onJoin, onSpectate }) {
  const { tableName, tier, blinds, spectators } = room.metadata;
  const seats = room.clients;
  const max = room.maxClients;
  const open = max - seats;
  const t = TIERS[tier] || TIERS.rookie;

  return (
    <div style={styles.tableRow}>
      {/* left: name + meta */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.tableName}>{tableName}</span>
          <span style={{ ...styles.tierBadge, ...tierBadgeStyle(tier) }}>
            {t.label}
          </span>
        </div>
        <div style={styles.tableMeta}>
          Blinds {blinds} &nbsp;·&nbsp;
          <span style={{ color: seatColor(seats, max) }}>
            {seats}/{max} players
          </span>
          {spectators > 0 && (
            <>&nbsp;·&nbsp; {spectators} watching</>
          )}
        </div>
      </div>

      {/* seat pips */}
      <div style={styles.seatPips}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.pip,
              background: i < seats ? seatColor(seats, max) : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {open > 0 ? (
          <button style={styles.btnJoin} onClick={() => onJoin(room.roomId)}>
            Join →
          </button>
        ) : (
          <button style={styles.btnSpectate} onClick={() => onSpectate(room.roomId)}>
            Watch
          </button>
        )}
      </div>
    </div>
  );
}

function TierCard({ tier, selected, onClick }) {
  const t = TIERS[tier];
  return (
    <button
      style={{
        ...styles.tierCard,
        borderColor: selected ? t.color : "rgba(255,255,255,0.12)",
        background: selected ? t.color + "22" : "rgba(255,255,255,0.04)",
      }}
      onClick={onClick}
    >
      <span style={{ fontSize: 22 }}>{t.badge}</span>
      <span style={{ ...styles.tierCardLabel, color: selected ? t.color : "#cbd5e1" }}>
        {t.label}
      </span>
      <span style={styles.tierCardBlinds}>{t.blinds}</span>
      <span style={styles.tierCardRange}>
        {t.min.toLocaleString()} – {t.max.toLocaleString()} Bucks
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PokerLobby({ userBucks = 12450, onEnterTable }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState("regular");
  const [view, setView] = useState("lobby"); // lobby | create
  const [tableName, setTableName] = useState("");
  const [status, setStatus] = useState(null); // { type: "info"|"error", msg }

  // Fetch live rooms every 8 seconds
  useEffect(() => {
    let cancelled = false;
    async function fetchRooms() {
      try {
        const r = await client.getAvailableRooms("poker");
        if (!cancelled) setRooms(r);
      } catch {
        // silently ignore — show stale data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRooms();
    const id = setInterval(fetchRooms, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleQuickPlay() {
    setStatus({ type: "info", msg: "Finding you a seat…" });
    try {
      const joinClient = new Client(COLYSEUS_URL);
      const room = await joinClient.joinOrCreate("poker", {
        tier: selectedTier,
        userId: user?.id,
        username: profile?.username,
        avatar: { config: profile?.avatar_config },
      });
      setStatus(null);
      onEnterTable?.(room, {
        tier: selectedTier,
        buyIn: TIERS[selectedTier].min,
        userId: user?.id,
        username: profile?.username,
        avatarConfig: profile?.avatar_config,
      });
    } catch (e) {
      console.error("QuickPlay error:", e);
      setStatus({ type: "error", msg: e?.message || "Couldn't find a table. Try again." });
    }
  }

  async function handleJoin(roomId) {
    setStatus({ type: "info", msg: "Joining…" });
    try {
      const joinClient = new Client(COLYSEUS_URL);
      const roomTier = rooms.find(r => r.roomId === roomId)?.metadata?.tier || selectedTier;
      const room = await joinClient.joinById(roomId, {
        userId: user?.id,
        username: profile?.username,
        avatar: { config: profile?.avatar_config },
      });
      setStatus(null);
      onEnterTable?.(room, {
        tier: roomTier,
        buyIn: TIERS[roomTier]?.min || TIERS[selectedTier].min,
        userId: user?.id,
        username: profile?.username,
        avatarConfig: profile?.avatar_config,
      });
    } catch (e) {
      console.error("Join error:", e);
      setStatus({ type: "error", msg: e?.message || "Seat taken — try another table." });
    }
  }

  function handleSpectate(roomId) {
    onEnterTable?.({ roomId, spectating: true });
  }

  async function handleCreate() {
    const name = tableName.trim() || "My Table";
    setStatus({ type: "info", msg: "Creating room…" });
    try {
      const joinClient = new Client(COLYSEUS_URL);
      const room = await joinClient.create("poker", {
        tier: selectedTier,
        tableName: name,
        userId: user?.id,
        username: profile?.username,
        avatar: { config: profile?.avatar_config },
      });
      setStatus(null);
      onEnterTable?.(room, {
        tier: selectedTier,
        buyIn: TIERS[selectedTier].min,
        userId: user?.id,
        username: profile?.username,
        avatarConfig: profile?.avatar_config,
      });
    } catch (e) {
      console.error("Create error:", e);
      setStatus({ type: "error", msg: e?.message || "Couldn't create room." });
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const openRooms = rooms.filter((r) => r.clients < r.maxClients);
  const totalPlaying = rooms.reduce((s, r) => s + r.clients, 0);
  const tierRooms = openRooms.filter((r) => r.metadata?.tier === selectedTier);

  // Social proof headline
  let headline = "";
  if (loading) headline = "Finding tables…";
  else if (openRooms.length === 0) headline = "Be first — start a table, 1 more player needed";
  else if (tierRooms.length > 0)
    headline = `${tierRooms.length} open ${TIERS[selectedTier].label} table${tierRooms.length > 1 ? "s" : ""} right now — jump in`;
  else headline = `${openRooms.length} table${openRooms.length > 1 ? "s" : ""} running — pick a tier`;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🃏 OTJ Poker</h1>
          {totalPlaying > 0 && (
            <p style={styles.subtitle}>{totalPlaying} players at the tables</p>
          )}
        </div>
        <div style={styles.bucks}>
          <span style={styles.bucksLabel}>Your Bucks</span>
          <span style={styles.bucksValue}>{userBucks.toLocaleString()}</span>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div
          style={{
            ...styles.statusBar,
            borderColor: status.type === "error" ? "#ef4444" : "#60a5fa",
            color: status.type === "error" ? "#ef4444" : "#60a5fa",
          }}
        >
          {status.type === "info" && (
            <span style={styles.spinner} />
          )}
          {status.msg}
        </div>
      )}

      {/* Tier selector */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>Choose tier</p>
        <div style={styles.tierRow}>
          {Object.keys(TIERS).map((tier) => (
            <TierCard
              key={tier}
              tier={tier}
              selected={selectedTier === tier}
              onClick={() => setSelectedTier(tier)}
            />
          ))}
        </div>
      </div>

      {/* ── LIVE TABLES (the main fix) ────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionLabel}>
            <span style={styles.liveDot} /> Live tables
          </p>
          <span style={styles.headlineText}>{headline}</span>
        </div>

        {loading ? (
          <div style={styles.emptyState}>Scanning tables…</div>
        ) : openRooms.length === 0 ? (
          <div style={styles.emptyState}>No open tables yet — start one below</div>
        ) : (
          <div style={styles.tableList}>
            {openRooms.map((room) => (
              <LiveTableRow
                key={room.roomId}
                room={room}
                onJoin={handleJoin}
                onSpectate={handleSpectate}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── PRIMARY CTA: Quick Play ───────────────────────────────────────── */}
      <div style={styles.section}>
        <button style={styles.btnQuickPlay} onClick={handleQuickPlay}>
          ⚡ Quick Play
          <span style={styles.quickPlaySub}>
            Auto-join best open {TIERS[selectedTier].label} seat
          </span>
        </button>
      </div>

      {/* ── SECONDARY: Create / Join by code (collapsed) ─────────────────── */}
      <div style={styles.section}>
        <div style={styles.secondaryRow}>
          {/* Create private room */}
          {view === "create" ? (
            <div style={styles.createPanel}>
              <p style={styles.sectionLabel}>Private room name</p>
              <div style={styles.createInputRow}>
                <input
                  style={styles.input}
                  placeholder="e.g. Juan's Shark Tank"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  maxLength={32}
                />
                <button style={styles.btnCreate} onClick={handleCreate}>
                  Create
                </button>
                <button
                  style={styles.btnCancel}
                  onClick={() => setView("lobby")}
                >
                  ✕
                </button>
              </div>
              <p style={styles.createHint}>
                Tier: {TIERS[selectedTier].label} · Blinds {TIERS[selectedTier].blinds}
              </p>
            </div>
          ) : (
            <button
              style={styles.btnSecondary}
              onClick={() => setView("create")}
            >
              + Create private room
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    background: "#0d1117",
    minHeight: "100vh",
    color: "#e2e8f0",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    padding: "24px 20px 60px",
    maxWidth: 680,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    color: "#f1f5f9",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  bucks: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.2)",
    borderRadius: 10,
    padding: "8px 14px",
  },
  bucksLabel: { fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: 1 },
  bucksValue: { fontSize: 20, fontWeight: 700, color: "#fbbf24", marginTop: 2 },

  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
  },
  spinner: {
    width: 12,
    height: 12,
    border: "2px solid rgba(96,165,250,0.3)",
    borderTopColor: "#60a5fa",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.8s linear infinite",
  },

  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    margin: "0 0 10px",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headlineText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
  },
  liveDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 6px #4ade80",
  },

  tierRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  tierCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "14px 10px",
    borderRadius: 12,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tierCardLabel: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 2,
  },
  tierCardBlinds: {
    fontSize: 11,
    color: "#64748b",
  },
  tierCardRange: {
    fontSize: 10,
    color: "#475569",
    textAlign: "center",
    marginTop: 2,
  },

  tableList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "12px 16px",
    transition: "border-color 0.15s",
  },
  tableName: {
    fontWeight: 600,
    fontSize: 15,
    color: "#f1f5f9",
  },
  tableMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
  },
  tierBadge: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    border: "1px solid",
    borderRadius: 4,
    padding: "1px 6px",
  },
  seatPips: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },
  pip: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    transition: "background 0.2s",
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  btnQuickPlay: {
    width: "100%",
    padding: "18px 24px",
    background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    border: "none",
    borderRadius: 14,
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    letterSpacing: "-0.3px",
    boxShadow: "0 4px 24px rgba(22,163,74,0.35)",
    transition: "transform 0.1s, box-shadow 0.1s",
  },
  quickPlaySub: {
    fontSize: 13,
    fontWeight: 400,
    color: "rgba(255,255,255,0.7)",
  },

  btnJoin: {
    background: "rgba(96,165,250,0.15)",
    border: "1px solid rgba(96,165,250,0.35)",
    borderRadius: 8,
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s",
  },
  btnSpectate: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#64748b",
    fontSize: 13,
    fontWeight: 500,
    padding: "7px 14px",
    cursor: "pointer",
  },

  secondaryRow: {
    display: "flex",
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 500,
    padding: "13px 20px",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.15s, color 0.15s",
  },

  createPanel: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "16px",
  },
  createInputRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#f1f5f9",
    fontSize: 14,
    padding: "10px 12px",
    outline: "none",
  },
  btnCreate: {
    background: "#16a34a",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 18px",
    cursor: "pointer",
  },
  btnCancel: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#64748b",
    fontSize: 13,
    padding: "10px 12px",
    cursor: "pointer",
  },
  createHint: {
    fontSize: 11,
    color: "#475569",
    margin: "8px 0 0",
  },

  emptyState: {
    textAlign: "center",
    color: "#475569",
    fontSize: 13,
    padding: "24px 0",
    border: "1px dashed rgba(255,255,255,0.08)",
    borderRadius: 10,
  },
};
