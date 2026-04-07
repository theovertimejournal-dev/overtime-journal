import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Client } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { AvatarMini } from '../components/common/AvatarSystem';

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL || 'wss://overtime-journal-server.up.railway.app';
const FONT = "'JetBrains Mono','SF Mono',monospace";

// ─── Card rendering ───────────────────────────────────────────────────────────
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS  = { s: '#1e1b4b', h: '#dc2626', d: '#dc2626', c: '#1e1b4b' };
const SUIT_BG      = { s: '#e0e7ff', h: '#fff0f0', d: '#fff0f0', c: '#e0e7ff' };

function parseCard(card) {
  if (!card || card === '??' || card === 'XX') return null;
  const val  = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  return { val, suit };
}

function PlayingCard({ card, hidden = false, small = false }) {
  const size = small ? { w: 32, h: 46, font: 11, suitFont: 16 }
                     : { w: 48, h: 68, font: 13, suitFont: 24 };

  if (hidden || !card) {
    return (
      <div style={{
        width: size.w, height: size.h, borderRadius: 6,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
        border: '1px solid rgba(99,102,241,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}>
        <span style={{ fontSize: size.suitFont - 4, opacity: 0.4 }}>🂠</span>
      </div>
    );
  }

  const parsed = parseCard(card);
  if (!parsed) return null;
  const { val, suit } = parsed;
  const color = SUIT_COLORS[suit] || '#111';
  const bg    = SUIT_BG[suit]    || '#fff';

  return (
    <div style={{
      width: size.w, height: size.h, borderRadius: 6,
      background: bg,
      border: '1px solid rgba(0,0,0,0.15)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', flexShrink: 0,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      userSelect: 'none',
    }}>
      {/* Top-left pip */}
      <div style={{ position: 'absolute', top: 3, left: 5, fontSize: size.font - 1, fontWeight: 800, color, lineHeight: 1, fontFamily: FONT }}>
        {val}<br />
        <span style={{ fontSize: size.font - 2 }}>{SUIT_SYMBOLS[suit]}</span>
      </div>
      {/* Center suit */}
      <span style={{ fontSize: size.suitFont, color }}>{SUIT_SYMBOLS[suit]}</span>
      {/* Bottom-right pip (rotated) */}
      <div style={{ position: 'absolute', bottom: 3, right: 5, fontSize: size.font - 1, fontWeight: 800, color, lineHeight: 1, fontFamily: FONT, transform: 'rotate(180deg)', textAlign: 'left' }}>
        {val}<br />
        <span style={{ fontSize: size.font - 2 }}>{SUIT_SYMBOLS[suit]}</span>
      </div>
    </div>
  );
}

// ─── Chip stack visual ────────────────────────────────────────────────────────
function ChipStack({ amount }) {
  if (!amount || amount <= 0) return null;
  const count = Math.min(Math.ceil(amount / 100), 6);
  const chipColors = ['#ef4444','#fbbf24','#22c55e','#3b82f6','#a855f7','#f97316'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          width: 28, height: 7, borderRadius: 3,
          background: chipColors[i % chipColors.length],
          border: '1px solid rgba(0,0,0,0.3)',
          marginBottom: -3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
      ))}
      <div style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', marginTop: 6, fontFamily: FONT }}>
        ${amount.toLocaleString()}
      </div>
    </div>
  );
}

// ─── Seat positions (oval table layout) ──────────────────────────────────────
const SEAT_POSITIONS = [
  { top: '72%', left: '18%' },  // 0 — bottom-left
  { top: '85%', left: '40%' },  // 1 — bottom-center-left
  { top: '85%', left: '60%' },  // 2 — bottom-center-right
  { top: '72%', left: '82%' },  // 3 — bottom-right
  { top: '28%', left: '82%' },  // 4 — top-right
  { top: '15%', left: '60%' },  // 5 — top-center-right
  { top: '15%', left: '40%' },  // 6 — top-center-left
  { top: '28%', left: '18%' },  // 7 — top-left
];

function SeatSpot({ seatIndex, seat, isYou, myTurn, gamePhase, onSit }) {
  const pos = SEAT_POSITIONS[seatIndex];
  const isEmpty = !seat || !seat.username;

  const statusColor = seat?.status === 'folded' ? '#374151'
    : myTurn ? '#fbbf24'
    : seat?.status === 'all_in' ? '#a855f7'
    : '#6b7280';

  return (
    <div style={{
      position: 'absolute',
      top: pos.top, left: pos.left,
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      zIndex: 5,
    }}>
      {/* Bet chip overlay */}
      {seat?.currentBet > 0 && (
        <div style={{ position: 'absolute', top: '-36px', left: '50%', transform: 'translateX(-50%)', zIndex: 6 }}>
          <ChipStack amount={seat.currentBet} />
        </div>
      )}

      {/* Dealer button */}
      {seat?.isDealer && (
        <div style={{
          position: 'absolute', top: -10, right: -10, zIndex: 7,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fbbf24', color: '#000',
          fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid #000', fontFamily: FONT,
        }}>D</div>
      )}

      {isEmpty ? (
        <div
          onClick={() => onSit(seatIndex)}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(255,255,255,0.03)',
            border: '2px dashed rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
            fontSize: 10, color: '#374151', fontFamily: FONT,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        >
          SIT
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {/* Avatar */}
          <div style={{
            position: 'relative',
            border: `2px solid ${myTurn ? '#fbbf24' : isYou ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '50%',
            boxShadow: myTurn ? '0 0 12px rgba(251,191,36,0.5)' : 'none',
            transition: 'all 0.3s',
          }}>
            <AvatarMini config={seat.avatar?.config || seat.avatarConfig} size={44} />
          </div>

          {/* Name + stack */}
          <div style={{
            background: 'rgba(8,8,15,0.85)', backdropFilter: 'blur(8px)',
            borderRadius: 6, padding: '3px 7px',
            border: `1px solid ${statusColor}33`,
            textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: isYou ? '#ef4444' : '#f1f5f9', fontFamily: FONT }}>
              {seat.username?.length > 10 ? seat.username.slice(0, 9) + '…' : seat.username}
            </div>
            <div style={{ fontSize: 9, color: statusColor, fontFamily: FONT }}>
              {seat.status === 'folded' ? 'FOLDED'
               : seat.status === 'all_in' ? 'ALL IN'
               : `$${(seat.chips || 0).toLocaleString()}`}
            </div>
          </div>

          {/* Hole cards (face-down for others, face-up for you) */}
          {seat.holeCards?.length > 0 && gamePhase !== 'waiting' && (
            <div style={{ display: 'flex', gap: 3 }}>
              {seat.holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} hidden={!isYou && c === '??' || (!isYou)} small />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Betting controls ─────────────────────────────────────────────────────────
function BettingControls({ gameState, mySeat, onAction }) {
  const [raiseAmount, setRaiseAmount] = useState(0);
  const bigBlind    = gameState?.blinds?.[1] || 10;
  const callAmount  = (gameState?.currentBet || 0) - (mySeat?.currentBet || 0);
  const canCheck    = callAmount <= 0;
  const canRaise    = (mySeat?.chips || 0) > callAmount;
  const minRaise    = (gameState?.currentBet || 0) + bigBlind;
  const maxRaise    = mySeat?.chips || 0;

  useEffect(() => {
    setRaiseAmount(Math.min(minRaise, maxRaise));
  }, [minRaise, maxRaise]);

  const btnStyle = (color, bg = 'rgba(255,255,255,0.04)') => ({
    flex: 1, padding: '12px 8px', borderRadius: 8, cursor: 'pointer',
    background: bg, border: `1px solid ${color}44`,
    color, fontSize: 11, fontWeight: 700, fontFamily: FONT,
    letterSpacing: '0.08em', transition: 'all 0.15s',
  });

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(8,8,15,0.97)', backdropFilter: 'blur(16px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 16px 24px', zIndex: 30,
    }}>
      {canRaise && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0, fontFamily: FONT }}>RAISE</span>
          <input
            type="range" min={minRaise} max={maxRaise} step={bigBlind}
            value={raiseAmount}
            onChange={e => setRaiseAmount(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#fbbf24', height: 4 }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', minWidth: 65, textAlign: 'right', fontFamily: FONT }}>
            ${raiseAmount.toLocaleString()}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAction('fold')} style={btnStyle('#6b7280')}>FOLD</button>
        {canCheck
          ? <button onClick={() => onAction('check')} style={btnStyle('#22c55e', 'rgba(34,197,94,0.08)')}>CHECK</button>
          : <button onClick={() => onAction('call', callAmount)} style={btnStyle('#3b82f6', 'rgba(59,130,246,0.08)')}>
              CALL ${callAmount.toLocaleString()}
            </button>
        }
        {canRaise && (
          <button onClick={() => onAction('raise', raiseAmount)} style={btnStyle('#fbbf24', 'rgba(251,191,36,0.08)')}>
            RAISE
          </button>
        )}
        <button
          onClick={() => onAction('allin', mySeat?.chips)}
          style={btnStyle('#a855f7', 'rgba(168,85,247,0.08)')}
        >
          ALL IN
        </button>
      </div>
    </div>
  );
}

// ─── Chat panel — desktop: right sidebar, mobile: bottom drawer ───────────────
function ChatPanel({ messages, onSend, currentUsername, isMobile }) {
  const [input, setInput]       = useState('');
  const [expanded, setExpanded] = useState(false); // mobile only
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function submit() {
    const msg = input.trim();
    if (!msg) return;
    onSend(msg);
    setInput('');
  }

  const lastMsg = messages[messages.length - 1];

  // ── Mobile: collapsed tab + expandable drawer ──
  if (isMobile) {
    return (
      <>
        {/* Collapsed tab — always visible, shows last message */}
        {!expanded && (
          <div
            onClick={() => setExpanded(true)}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 28,
              background: 'rgba(8,8,15,0.95)', borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 9, color: '#374151', fontFamily: FONT, letterSpacing: '0.1em', flexShrink: 0 }}>💬 CHAT</span>
            <span style={{ flex: 1, fontSize: 10, color: '#6b7280', fontFamily: FONT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {lastMsg
                ? lastMsg.type === 'system'
                  ? `— ${lastMsg.message}`
                  : `${lastMsg.username}: ${lastMsg.message}`
                : 'No messages yet'}
            </span>
            <span style={{ fontSize: 10, color: '#374151' }}>▲</span>
          </div>
        )}

        {/* Expanded drawer */}
        {expanded && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
            height: '45vh', background: 'rgba(8,8,15,0.98)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 9, color: '#374151', fontFamily: FONT, letterSpacing: '0.12em' }}>TABLE CHAT</span>
              <button onClick={() => setExpanded(false)} style={{
                background: 'none', border: 'none', color: '#6b7280', fontSize: 14, cursor: 'pointer', padding: 0,
              }}>▼</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ fontSize: 11, lineHeight: 1.5 }}>
                  {m.type === 'system' ? (
                    <span style={{ color: '#fbbf24', fontStyle: 'italic', fontFamily: FONT }}>— {m.message}</span>
                  ) : (
                    <>
                      <span style={{ color: m.username === currentUsername ? '#ef4444' : '#6366f1', fontWeight: 700, fontFamily: FONT }}>{m.username}: </span>
                      <span style={{ color: '#94a3b8' }}>{m.message}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="Say something..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f1f5f9', fontSize: 12, fontFamily: FONT, outline: 'none',
                }}
              />
              <button onClick={submit} style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: 12, fontFamily: FONT,
              }}>▶</button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Desktop: right sidebar ──
  return (
    <div style={{
      position: 'fixed', right: 0, top: 52, bottom: 0,
      width: 220, background: 'rgba(8,8,15,0.92)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', zIndex: 20,
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 9, color: '#374151', fontFamily: FONT, letterSpacing: '0.12em' }}>
        TABLE CHAT
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.5 }}>
            {m.type === 'system' ? (
              <span style={{ color: '#fbbf24', fontStyle: 'italic', fontFamily: FONT }}>— {m.message}</span>
            ) : (
              <>
                <span style={{ color: m.username === currentUsername ? '#ef4444' : '#6366f1', fontWeight: 700, fontFamily: FONT }}>{m.username}: </span>
                <span style={{ color: '#94a3b8' }}>{m.message}</span>
              </>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Say something..."
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#f1f5f9', fontSize: 10, fontFamily: FONT, outline: 'none',
          }}
        />
        <button onClick={submit} style={{
          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', fontSize: 10, fontFamily: FONT,
        }}>▶</button>
      </div>
    </div>
  );
}

// ─── Main PokerTable component ────────────────────────────────────────────────
export default function PokerTable({ user: userProp, profile: profileProp }) {
  const { roomId } = useParams();
  const location   = useLocation();
  const navigate   = useNavigate();

  const [user, setUser]           = useState(userProp || null);
  const [profile, setProfile]     = useState(profileProp || null);
  const [room, setRoom]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [myHoleCards, setMyHoleCards] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected]  = useState(false);
  const [status, setStatus]        = useState({ type: 'info', msg: 'Connecting...' });
  const [mySeatIndex, setMySeatIndex] = useState(null);
  const [showBuyIn, setShowBuyIn]  = useState(false);
  const [buyInSeat, setBuyInSeat]  = useState(null);
  const [buyInAmount, setBuyInAmount] = useState(500);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const roomRef = useRef(null);
  const tableState = location.state?.tableState || {};

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Auth + profile (only if not passed as props) ──
  useEffect(() => {
    if (userProp && profileProp) return; // already have them from App
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/'); return; }
      setUser(session.user);
      supabase.from('profiles').select('*').eq('user_id', session.user.id).single()
        .then(({ data }) => setProfile(data));
    });
  }, []);

  // ── Sync props if parent updates them ──
  useEffect(() => { if (userProp) setUser(userProp); }, [userProp]);
  useEffect(() => { if (profileProp) setProfile(profileProp); }, [profileProp]);

  // ── Connect to Colyseus ──
  useEffect(() => {
    if (!roomId || !profile) return;
    let mounted = true;

    async function connect() {
      try {
        const client = new Client(COLYSEUS_URL);
        const r = await client.joinById(roomId, {
          userId: profile.user_id,
          username: profile.username,
          avatar: { config: profile.avatar_config },
        });

        if (!mounted) { r.leave(); return; }

        roomRef.current = r;
        setRoom(r);
        setConnected(true);
        setStatus({ type: 'success', msg: 'Connected to table' });

        // ── Game state ──
        r.onMessage('game_state', (state) => {
          if (!mounted) return;
          setGameState(state);

          // Find my seat — server may use userId or user_id
          const myId = profile.user_id || profile.id;
          const idx = state.seats?.findIndex(s => s && (s.userId === myId || s.user_id === myId));
          if (idx !== undefined && idx !== -1) setMySeatIndex(idx);

          // Hide status after game starts
          if (state.phase !== 'waiting') setStatus(null);
        });

        // ── Hole cards (private to this player) ──
        r.onMessage('hole_cards', ({ cards }) => {
          if (mounted) setMyHoleCards(cards || []);
        });

        // ── System chat messages ──
        r.onMessage('player_joined', ({ username }) => {
          if (mounted) pushSystemMsg(`${username} joined the table`);
        });
        r.onMessage('player_left', ({ username }) => {
          if (mounted) pushSystemMsg(`${username} left the table`);
        });
        r.onMessage('new_hand', ({ handNumber }) => {
          if (mounted) {
            setMyHoleCards([]);
            pushSystemMsg(`Hand #${handNumber} starting`);
          }
        });
        r.onMessage('winner', ({ username, amount, handName }) => {
          if (mounted) pushSystemMsg(`${username} wins $${amount?.toLocaleString()}${handName ? ` — ${handName}` : ''} 🏆`);
        });
        r.onMessage('player_busted', ({ username }) => {
          if (mounted) pushSystemMsg(`${username} is out of chips`);
        });

        // ── Chat ──
        r.onMessage('chat', ({ username, message }) => {
          if (!mounted) return;
          setChatMessages(prev => [...prev.slice(-99), { username, message, type: 'chat', timestamp: Date.now() }]);
        });

        // ── Table info (tier, blinds) ──
        r.onMessage('table_info', (info) => {
          if (!mounted) return;
          // blinds can come as array [sb, bb] or object {sb, bb} depending on server version
          const sb = Array.isArray(info.blinds) ? info.blinds[0] : info.blinds?.sb ?? info.smallBlind ?? '?';
          const bb = Array.isArray(info.blinds) ? info.blinds[1] : info.blinds?.bb ?? info.bigBlind ?? '?';
          setStatus({ type: 'info', msg: `${info.tier?.toUpperCase() || 'TABLE'} — Blinds $${sb}/$${bb}` });
        });

        // ── Silence unhandled messages ──
        ['player_action', 'community_cards', 'flop', 'turn', 'river', 'chips_added'].forEach(t => r.onMessage(t, () => {}));

        // ── Disconnect handling ──
        r.onLeave((code) => {
          if (!mounted) return;
          setConnected(false);
          if (code === 1000) {
            navigate('/poker');
          } else {
            setIsReconnecting(true);
            setStatus({ type: 'error', msg: 'Disconnected — reconnecting...' });
            setTimeout(() => mounted && connect(), 3000);
          }
        });

      } catch (err) {
        if (!mounted) return;
        console.error('[PokerTable] connect error:', err);
        setStatus({ type: 'error', msg: `Failed to join table: ${err.message}` });
        setTimeout(() => navigate('/poker'), 3000);
      }
    }

    connect();
    return () => {
      mounted = false;
      roomRef.current?.leave();
    };
  }, [roomId, profile]);

  function pushSystemMsg(message) {
    setChatMessages(prev => [...prev.slice(-99), {
      username: 'OTJ', message, type: 'system', timestamp: Date.now(),
    }]);
  }

  // ── Sit down flow ──
  function handleSeatClick(seatIndex) {
    if (!connected || mySeatIndex !== null) return;
    const tierConfig = tableState.tier;
    const defaultBuyIn = tableState.buyIn || 500;
    setBuyInSeat(seatIndex);
    setBuyInAmount(defaultBuyIn);
    setShowBuyIn(true);
  }

  function confirmSitDown() {
    if (!roomRef.current) return;
    roomRef.current.send('sit_down', { seatIndex: buyInSeat, buyIn: buyInAmount });
    setShowBuyIn(false);
    setMySeatIndex(buyInSeat); // optimistic
  }

  // ── Actions ──
  function handleAction(action, amount) {
    if (!roomRef.current) return;
    roomRef.current.send('player_action', { action, amount: amount || 0 });
  }

  function handleChat(message) {
    if (!roomRef.current) return;
    roomRef.current.send('chat', { message });
    setChatMessages(prev => [...prev.slice(-99), {
      username: profile?.username || 'You', message, type: 'chat', timestamp: Date.now(),
    }]);
  }

  function leaveTable() {
    roomRef.current?.leave(true);
    navigate('/poker');
  }

  // ── Derived state ──
  const seats = gameState?.seats || Array(8).fill(null);
  const communityCards = gameState?.communityCards || [];
  const pot = gameState?.pot || 0;
  const phase = gameState?.phase || 'waiting';
  // Server may send currentTurnSeat (index) or currentTurnUserId — handle both
  const currentTurnSeat = gameState?.currentTurnSeat ?? gameState?.currentSeat ?? gameState?.activePlayer ?? gameState?.currentPlayer;
  const currentTurnUserId = gameState?.currentTurnUserId
    ?? (currentTurnSeat != null ? seats[currentTurnSeat]?.userId : null);
  const mySeat = mySeatIndex !== null ? seats[mySeatIndex] : null;
  const isMyTurn = profile != null && (
    currentTurnUserId === profile.user_id ||
    currentTurnUserId === profile.id ||
    (currentTurnSeat != null && currentTurnSeat === mySeatIndex)
  );

  // Inject hole cards into my seat for display
  const displaySeats = seats.map((s, i) => {
    if (i === mySeatIndex && myHoleCards.length > 0) {
      return { ...s, holeCards: myHoleCards };
    }
    return s;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', fontFamily: FONT, overflow: 'hidden' }}>

      {/* ── Header bar ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 25,
        background: 'rgba(8,8,15,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <button onClick={leaveTable} style={{
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 10, fontFamily: FONT,
        }}>← LEAVE</button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.1em' }}>
            🃏 OVERTIME JOURNAL POKER
          </span>
        </div>

        {pot > 0 && (
          <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>
            POT: ${pot.toLocaleString()}
          </div>
        )}
        {phase !== 'waiting' && (
          <div style={{
            padding: '3px 8px', borderRadius: 4,
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            fontSize: 9, color: '#818cf8', letterSpacing: '0.1em',
          }}>
            {phase.toUpperCase()}
          </div>
        )}
      </div>

      {/* ── Status banner ── */}
      {status && (
        <div style={{
          position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 24,
          background: status.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
          border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
          padding: '6px 16px', borderRadius: 8, fontSize: 10,
          color: status.type === 'error' ? '#ef4444' : '#818cf8', fontFamily: FONT,
          whiteSpace: 'nowrap',
        }}>
          {isReconnecting && '⟳ '}{status.msg}
        </div>
      )}

      {/* ── Poker table felt ── */}
      <div style={{
        position: 'relative',
        margin: '70px auto 0',
        width: isMobile ? '100%' : 'calc(100% - 220px)',
        maxWidth: isMobile ? '100%' : 820,
        height: isMobile ? 'calc(100vh - 140px)' : 'calc(100vh - 190px)',
        minHeight: 400,
      }}>
        {/* Felt oval */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '70%', height: '55%',
          background: 'radial-gradient(ellipse at center, #064e3b 0%, #022c22 60%, #011a15 100%)',
          borderRadius: '50%',
          border: '6px solid #78350f',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5), 0 0 60px rgba(0,0,0,0.8)',
        }}>
          {/* Rail */}
          <div style={{
            position: 'absolute', inset: -14,
            borderRadius: '50%',
            border: '8px solid #92400e',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }} />

          {/* Community cards */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', gap: 6, alignItems: 'center',
          }}>
            {communityCards.length > 0
              ? communityCards.map((c, i) => <PlayingCard key={i} card={c} />)
              : phase === 'waiting'
                ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.12em' }}>WAITING FOR PLAYERS</div>
                : null
            }
          </div>

          {/* Pot display on felt */}
          {pot > 0 && (
            <div style={{
              position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, fontWeight: 700, color: '#fbbf24', fontFamily: FONT,
            }}>
              POT ${pot.toLocaleString()}
            </div>
          )}
        </div>

        {/* Seat spots */}
        {displaySeats.map((seat, i) => (
          <SeatSpot
            key={i}
            seatIndex={i}
            seat={seat}
            isYou={profile != null && (seat?.userId === profile.user_id || seat?.userId === profile.id || seat?.user_id === profile.user_id)}
            myTurn={isMyTurn && seat?.userId === profile?.user_id}
            gamePhase={phase}
            onSit={handleSeatClick}
          />
        ))}
      </div>

      {/* ── DEBUG overlay (remove after confirmed working) ── */}
      {gameState && (
        <div style={{
          position: 'fixed', top: 60, left: 8, zIndex: 99,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #333',
          borderRadius: 6, padding: '6px 10px', fontSize: 9,
          fontFamily: FONT, color: '#6b7280', maxWidth: 220,
          pointerEvents: 'none',
        }}>
          <div style={{ color: '#fbbf24', marginBottom: 2 }}>DEBUG (remove when working)</div>
          <div>phase: <span style={{ color: '#f1f5f9' }}>{gameState.phase}</span></div>
          <div>mySeatIdx: <span style={{ color: '#f1f5f9' }}>{mySeatIndex ?? 'null'}</span></div>
          <div>currentTurnSeat: <span style={{ color: '#f1f5f9' }}>{String(currentTurnSeat)}</span></div>
          <div>currentTurnUserId: <span style={{ color: '#f1f5f9' }}>{String(currentTurnUserId)?.slice(0,12)}</span></div>
          <div>myId: <span style={{ color: '#f1f5f9' }}>{String(profile?.user_id || profile?.id)?.slice(0,12)}</span></div>
          <div>isMyTurn: <span style={{ color: isMyTurn ? '#22c55e' : '#ef4444' }}>{String(isMyTurn)}</span></div>
          <div>gameState keys: <span style={{ color: '#818cf8' }}>{Object.keys(gameState).join(', ')}</span></div>
        </div>
      )}

      {/* ── My turn glow pulse ── */}
      {isMyTurn && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
          boxShadow: 'inset 0 0 60px rgba(251,191,36,0.12)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      )}

      {/* ── Betting controls (only on my turn) ── */}
      {isMyTurn && mySeat && phase !== 'waiting' && (
        <BettingControls gameState={gameState} mySeat={mySeat} onAction={handleAction} />
      )}

      {/* ── Chat ── */}
      <ChatPanel messages={chatMessages} onSend={handleChat} currentUsername={profile?.username} isMobile={isMobile} />

      {/* ── Buy-in modal ── */}
      {showBuyIn && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: 24, width: 280, fontFamily: FONT,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Sit Down — Seat {buyInSeat + 1}</div>
            <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 16 }}>Choose your buy-in amount</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <input
                type="range"
                min={tableState.minBuy || 100}
                max={Math.min(tableState.maxBuy || 2000, profile?.bankroll || 10000)}
                step={50}
                value={buyInAmount}
                onChange={e => setBuyInAmount(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#ef4444' }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', minWidth: 65, textAlign: 'right' }}>
                ${buyInAmount.toLocaleString()}
              </span>
            </div>

            <div style={{ fontSize: 9, color: '#4a5568', marginBottom: 16 }}>
              Your bankroll: ${(profile?.bankroll || 0).toLocaleString()}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowBuyIn(false)} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#6b7280', fontSize: 11, fontFamily: FONT,
              }}>CANCEL</button>
              <button onClick={confirmSitDown} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: 11, fontWeight: 700, fontFamily: FONT,
              }}>SIT DOWN</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
