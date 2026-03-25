/**
 * PokerTable.jsx — OTJ Poker Table (v2 — Fully Debugged)
 * 
 * Fixes applied:
 *  1. CRITICAL: Removed frontend cashout — server is single source of truth for chip returns
 *  2. sessionStorage persistence — survives page refresh
 *  3. Improved room joining — finds existing rooms by tier, room code lookup works
 *  4. Turn timer visual display
 *  5. Raise slider edge cases (can't raise if chips < minRaise)
 *  6. Showdown result display
 *  7. Proper cleanup on unmount (no double-leave)
 *  8. BettingControls useEffect at top level (React hooks rule)
 *  9. Error auto-dismiss doesn't stack
 *  10. Removed supabase import — no more frontend bankroll writes
 */
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Client } from 'colyseus.js';
import { AvatarMini } from '../components/common/AvatarSystem';

const FONT = "'JetBrains Mono','SF Mono',monospace";
const COLYSEUS_URL = 'wss://overtime-journal-production.up.railway.app';
const SESSION_KEY = 'otj_poker_session';

// ─── Card Rendering ──────────────────────────────────────────────────────────

const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#f1f5f9' };
const VALUE_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

function Card({ card, faceDown = false, small = false }) {
  const w = small ? 36 : 52;
  const h = small ? 50 : 72;

  if (faceDown || !card) {
    return (
      <div style={{
        width: w, height: h, borderRadius: 6,
        background: 'linear-gradient(135deg, #c41e3a 0%, #8b1425 100%)',
        border: '2px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: small ? 10 : 14, color: 'rgba(255,255,255,0.3)', fontWeight: 700,
      }}>
        OTJ
      </div>
    );
  }

  const val = VALUE_DISPLAY[card[0]] || card[0];
  const suit = card[1];
  const suitSym = SUIT_SYMBOLS[suit];
  const color = SUIT_COLORS[suit];

  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: '#f8f8f8', border: '1px solid rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontWeight: 700, color,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: small ? 12 : 16, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: small ? 10 : 14, lineHeight: 1, marginTop: 1 }}>{suitSym}</div>
    </div>
  );
}

// ─── Seat Positions (6-max oval layout) ──────────────────────────────────────

const SEAT_POSITIONS = [
  { top: '75%', left: '50%' },
  { top: '60%', left: '10%' },
  { top: '20%', left: '10%' },
  { top: '5%',  left: '50%' },
  { top: '20%', left: '90%' },
  { top: '60%', left: '90%' },
];

// ─── Seat Component ──────────────────────────────────────────────────────────

function Seat({ seat, seatIndex, isCurrentTurn, isDealer, mySeat, phase, onSitDown, turnTimeLeft }) {
  const isEmpty = !seat;
  const isMe = seatIndex === mySeat;
  const pos = SEAT_POSITIONS[seatIndex];

  if (isEmpty) {
    return (
      <div
        onClick={() => onSitDown && onSitDown(seatIndex)}
        style={{
          position: 'absolute', top: pos.top, left: pos.left,
          transform: 'translate(-50%, -50%)',
          width: 70, height: 70, borderRadius: '50%',
          background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: onSitDown ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 10, color: '#374151' }}>SIT</span>
      </div>
    );
  }

  const statusColors = {
    active: 'rgba(34,197,94,0.15)',
    allin: 'rgba(239,68,68,0.15)',
    folded: 'rgba(255,255,255,0.02)',
    disconnected: 'rgba(251,191,36,0.1)',
    sitting_out: 'rgba(255,255,255,0.02)',
  };

  return (
    <div style={{
      position: 'absolute', top: pos.top, left: pos.left,
      transform: 'translate(-50%, -50%)',
      textAlign: 'center', zIndex: isCurrentTurn ? 5 : 2,
    }}>
      {isCurrentTurn && (
        <>
          <div style={{
            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
            width: 72, height: 72, borderRadius: '50%',
            border: `3px solid ${turnTimeLeft != null && turnTimeLeft <= 5 ? '#ef4444' : '#fbbf24'}`,
            boxShadow: `0 0 16px ${turnTimeLeft != null && turnTimeLeft <= 5 ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.4)'}`,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          {turnTimeLeft != null && (
            <div style={{
              position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, fontWeight: 700,
              color: turnTimeLeft <= 5 ? '#ef4444' : '#fbbf24',
              background: 'rgba(0,0,0,0.8)', padding: '1px 6px', borderRadius: 4,
            }}>
              {turnTimeLeft}s
            </div>
          )}
        </>
      )}

      <div style={{
        position: 'relative',
        opacity: seat.status === 'folded' ? 0.35 : 1,
        transition: 'opacity 0.3s ease',
      }}>
        <AvatarMini config={seat.avatar?.config || {}} size={60} style={{
          border: `2px solid ${isMe ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
          background: statusColors[seat.status] || 'transparent',
        }} />
        {isDealer && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fbbf24', border: '2px solid #0f0f1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#000',
          }}>D</div>
        )}
      </div>

      <div style={{
        fontSize: 9, fontWeight: 600, marginTop: 4,
        color: isMe ? '#ef4444' : seat.status === 'folded' ? '#374151' : '#f1f5f9',
        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {seat.username}{isMe ? ' (you)' : ''}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', marginTop: 1 }}>
        ${seat.chips?.toLocaleString()}
      </div>

      {seat.lastAction && (
        <div style={{
          fontSize: 8, fontWeight: 700, color: '#0f0f1a', marginTop: 2,
          padding: '2px 6px', borderRadius: 4, display: 'inline-block',
          background: seat.lastAction === 'fold' ? '#6b7280'
            : seat.lastAction === 'all_in' ? '#ef4444'
            : seat.lastAction === 'raise' ? '#fbbf24'
            : '#22c55e',
          textTransform: 'uppercase',
        }}>
          {seat.lastAction === 'all_in' ? 'ALL IN' : seat.lastAction}
        </div>
      )}

      {seat.holeCards && seat.holeCards.length === 2 && (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
          <Card card={seat.holeCards[0]} small />
          <Card card={seat.holeCards[1]} small />
        </div>
      )}
      {(!seat.holeCards || seat.holeCards.length === 0) && seat.status === 'active' && phase !== 'waiting' && (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
          <Card faceDown small />
          <Card faceDown small />
        </div>
      )}

      {seat.currentBet > 0 && (
        <div style={{
          position: 'absolute',
          top: seatIndex <= 2 ? '110%' : '-20%',
          left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, fontWeight: 700, color: '#fbbf24',
          background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: 10,
          border: '1px solid rgba(251,191,36,0.3)',
          whiteSpace: 'nowrap',
        }}>
          ${seat.currentBet.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ─── Betting Controls ────────────────────────────────────────────────────────

function BettingControls({ gameState, onAction }) {
  const [raiseAmount, setRaiseAmount] = useState(0);
  const { seats, mySeat, currentTurn, phase, minRaise } = gameState;
  const isMyTurn = mySeat !== null && mySeat !== undefined && currentTurn === mySeat;
  const myPlayer = mySeat != null ? seats[mySeat] : null;

  const highestBet = Math.max(0, ...seats.filter(Boolean).map(s => s.currentBet || 0));
  const toCall = myPlayer ? highestBet - (myPlayer.currentBet || 0) : 0;
  const canCheck = toCall === 0;
  const myChips = myPlayer?.chips || 0;
  const myCurrentBet = myPlayer?.currentBet || 0;
  const minRaiseTotal = highestBet + (minRaise || 0);
  const maxRaise = myChips + myCurrentBet;
  const canRaise = maxRaise >= minRaiseTotal;

  useEffect(() => {
    if (isMyTurn && canRaise) {
      setRaiseAmount(Math.min(minRaiseTotal, maxRaise));
    }
  }, [isMyTurn, minRaiseTotal, maxRaise, canRaise]);

  if (!isMyTurn || !myPlayer || phase === 'waiting' || phase === 'showdown') return null;

  const btnStyle = (bg, disabled = false) => ({
    padding: '12px 16px', borderRadius: 8, border: 'none',
    background: bg, color: '#fff', fontSize: 12, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT, opacity: disabled ? 0.4 : 1,
    flex: 1, textTransform: 'uppercase',
  });

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(8,8,15,0.95)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 16px 20px', zIndex: 20,
    }}>
      {canRaise && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>RAISE</span>
          <input
            type="range"
            min={minRaiseTotal}
            max={maxRaise}
            step={gameState.blinds?.[1] || 10}
            value={raiseAmount}
            onChange={e => setRaiseAmount(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#fbbf24' }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', minWidth: 60, textAlign: 'right' }}>
            ${raiseAmount.toLocaleString()}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAction('fold')} style={btnStyle('#6b7280')}>FOLD</button>
        {canCheck ? (
          <button onClick={() => onAction('check')} style={btnStyle('#22c55e')}>CHECK</button>
        ) : (
          <button onClick={() => onAction('call')} style={btnStyle('#3b82f6')}>
            CALL ${Math.min(toCall, myChips).toLocaleString()}
          </button>
        )}
        {canRaise && (
          <button onClick={() => onAction('raise', raiseAmount)} style={btnStyle('#fbbf24')}>
            RAISE ${raiseAmount.toLocaleString()}
          </button>
        )}
        <button onClick={() => onAction('all_in')} style={btnStyle('#ef4444')}>ALL IN</button>
      </div>
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────

function ChatPanel({ messages, onSend }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  function send() {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: 10, maxHeight: 160, display: 'flex', flexDirection: 'column',
    }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 8, fontSize: 10, lineHeight: 1.6 }}>
        {messages.length === 0 && <div style={{ color: '#374151', textAlign: 'center', padding: 8 }}>No messages yet</div>}
        {messages.map((m, i) => (
          <div key={i}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{m.username}: </span>
            <span style={{ color: '#94a3b8' }}>{m.message}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type..."
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#f1f5f9', fontSize: 10, fontFamily: FONT, outline: 'none',
          }}
        />
        <button onClick={send} style={{
          padding: '6px 12px', borderRadius: 6, border: 'none',
          background: '#c41e3a', color: '#fff', fontSize: 10, fontWeight: 600,
          cursor: 'pointer', fontFamily: FONT,
        }}>SEND</button>
      </div>
    </div>
  );
}

// ─── Showdown Banner ─────────────────────────────────────────────────────────

function ShowdownBanner({ results }) {
  if (!results || results.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 30, background: 'rgba(0,0,0,0.92)', border: '2px solid #fbbf24',
      borderRadius: 16, padding: '24px 32px', textAlign: 'center',
      boxShadow: '0 0 40px rgba(251,191,36,0.3)',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 12 }}>🏆 SHOWDOWN</div>
      {results.map((r, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>
            {r.username} wins ${r.chipsWon?.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.handName}</div>
          {r.holeCards && (
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
              {r.holeCards.map((c, j) => <Card key={j} card={c} small />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Poker Table ────────────────────────────────────────────────────────

export default function PokerTable() {
  const location = useLocation();
  const navigate = useNavigate();
  const { roomId: roomIdFromUrl } = useParams();

  // FIX #2: Read from location.state, fall back to sessionStorage for refresh survival
  const stateFromNav = location.state || {};
  const savedSession = (() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; }
  })();
  const params = stateFromNav.tier ? stateFromNav : savedSession;
  const { tier, buyIn, userId, username, avatarConfig, roomCode } = params;

  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(null);
  const [showdownResults, setShowdownResults] = useState(null);
  const roomRef = useRef(null);
  const leaveCalledRef = useRef(false);
  const errorTimerRef = useRef(null);

  // Persist session params
  useEffect(() => {
    if (tier && buyIn && userId) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ tier, buyIn, userId, username, avatarConfig, roomCode }));
    }
  }, [tier, buyIn, userId]);

  // Connect to Colyseus
  useEffect(() => {
    if (!tier || !buyIn || !userId) {
      navigate('/poker');
      return;
    }

    const client = new Client(COLYSEUS_URL);
    let mounted = true;

    async function connect() {
      try {
        let room;
        const joinOptions = { userId, username, avatar: { config: avatarConfig }, buyIn };

        if (roomIdFromUrl) {
          // Came from lobby — join the exact room that was created
          room = await client.joinById(roomIdFromUrl, joinOptions);
        } else if (roomCode) {
          try {
            const rooms = await client.getAvailableRooms('poker');
            const target = rooms.find(r => r.metadata?.roomCode === roomCode);
            if (target) {
              room = await client.joinById(target.roomId, joinOptions);
            } else {
              if (mounted) setError(`Room ${roomCode} not found`);
              return;
            }
          } catch {
            if (mounted) setError(`Room ${roomCode} not found`);
            return;
          }
        } else {
          try {
            const rooms = await client.getAvailableRooms('poker');
            const openRoom = rooms.find(r => r.metadata?.tier === tier && r.clients < 6);
            if (openRoom) {
              room = await client.joinById(openRoom.roomId, joinOptions);
            } else {
              room = await client.create('poker', { ...joinOptions, tier });
            }
          } catch {
            room = await client.create('poker', { ...joinOptions, tier });
          }
        }

        if (!mounted) { room.leave(); return; }
        roomRef.current = room;
        setConnected(true);

        let hasAutoSat = false;
        room.onMessage('game_state', (state) => {
          if (!mounted) return;
          setGameState(state);
          if (!hasAutoSat && (state.mySeat === null || state.mySeat === undefined)) {
            const emptySeat = state.seats.findIndex(s => s === null);
            if (emptySeat !== -1) {
              room.send('sit_down', { seatIndex: emptySeat, buyIn });
              hasAutoSat = true;
            }
          }
        });

        room.onMessage('chat_message', (msg) => { if (mounted) setChatMessages(prev => [...prev.slice(-49), msg]); });
        room.onMessage('turn_change', ({ timeLimit }) => { if (mounted) setTurnTimeLeft(timeLimit); });
        room.onMessage('timer_warning', ({ secondsLeft }) => { if (mounted) setTurnTimeLeft(secondsLeft); });

        room.onMessage('error', ({ message }) => {
          if (!mounted) return;
          setError(message);
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => { if (mounted) setError(null); }, 3000);
        });

        room.onMessage('showdown', (data) => {
          if (!mounted) return;
          setShowdownResults(data.results);
          setTimeout(() => { if (mounted) setShowdownResults(null); }, 5000);
        });

        room.onMessage('pot_awarded', (data) => {
          if (!mounted) return;
          setShowdownResults([{ username: data.username, chipsWon: data.amount, handName: 'Everyone folded' }]);
          setTimeout(() => { if (mounted) setShowdownResults(null); }, 3000);
        });

        ['table_info', 'player_joined', 'player_left', 'new_hand', 'hole_cards',
         'player_action', 'community_cards', 'flop', 'turn', 'river',
         'chips_added', 'player_busted'].forEach(type => { room.onMessage(type, () => {}); });

        room.onLeave((code) => {
          if (!mounted) return;
          setConnected(false);
          roomRef.current = null;
          if (code !== 1000 && !leaveCalledRef.current) setError('Disconnected from server');
        });

      } catch (err) {
        console.error('Colyseus connection error:', err);
        if (mounted) setError('Failed to connect to poker server');
      }
    }

    connect();
    return () => {
      mounted = false;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (roomRef.current) { try { roomRef.current.leave(); } catch {} roomRef.current = null; }
    };
  }, []);

  function sendAction(action, amount) {
    if (!roomRef.current) return;
    if (action === 'raise') roomRef.current.send('raise', { amount });
    else roomRef.current.send(action);
  }

  function sendChat(message) {
    if (!roomRef.current) return;
    roomRef.current.send('chat', { message });
  }

  // FIX #1: Server-only cashout. Frontend just disconnects and navigates.
  function handleLeaveTable() {
    leaveCalledRef.current = true;
    if (roomRef.current) { try { roomRef.current.leave(true); } catch {} roomRef.current = null; }
    sessionStorage.removeItem(SESSION_KEY);
    navigate('/poker');
  }

  if (!connected && !error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🃏</div>
          <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: '0.15em' }}>CONNECTING TO TABLE...</div>
        </div>
      </div>
    );
  }

  if (error && !gameState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 16 }}>{error}</div>
          <button onClick={() => navigate('/poker')} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #ef4444',
            background: 'transparent', color: '#ef4444', fontSize: 11,
            cursor: 'pointer', fontFamily: FONT,
          }}>BACK TO LOBBY</button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: '0.15em' }}>LOADING TABLE...</div>
      </div>
    );
  }

  const { seats, pot, communityCards, phase, currentTurn, mySeat, blinds, handNumber, roomCode: code } = gameState;

  return (
    <div style={{ minHeight: '100vh', fontFamily: FONT, background: '#08080f', paddingBottom: 80 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>🃏 {gameState.tableName || 'OTJ Poker'}</div>
          <div style={{ fontSize: 9, color: '#4a5568' }}>
            {gameState.tier?.toUpperCase()} · Blinds: ${blinds?.[0]}/${blinds?.[1]} · Hand #{handNumber} · Code: {code}
          </div>
        </div>
        <button onClick={handleLeaveTable} style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.08)', color: '#ef4444',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
        }}>LEAVE TABLE</button>
      </div>

      {error && gameState && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          padding: '8px 20px', borderRadius: 8,
          background: 'rgba(239,68,68,0.9)', color: '#fff',
          fontSize: 11, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>{error}</div>
      )}

      <ShowdownBanner results={showdownResults} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 700, margin: '20px auto',
        height: 420, borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(34,87,60,0.3) 0%, rgba(15,15,26,0.8) 70%)',
        border: '3px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', zIndex: 3,
        }}>
          {pot > 0 && (
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.3)' }}>
              💰 ${pot.toLocaleString()}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2, textTransform: 'uppercase' }}>
            {phase === 'waiting' ? 'Waiting for players...' : phase}
          </div>
        </div>

        {communityCards && communityCards.length > 0 && (
          <div style={{
            position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', gap: 4, zIndex: 3,
          }}>
            {communityCards.map((card, i) => <Card key={i} card={card} />)}
          </div>
        )}

        {seats.map((seat, i) => (
          <Seat
            key={i} seat={seat} seatIndex={i}
            isCurrentTurn={currentTurn === i}
            isDealer={seat?.isDealer}
            mySeat={mySeat} phase={phase}
            turnTimeLeft={currentTurn === i ? turnTimeLeft : null}
            onSitDown={mySeat == null ? (idx) => { roomRef.current?.send('sit_down', { seatIndex: idx, buyIn }); } : null}
          />
        ))}
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px' }}>
        <ChatPanel messages={chatMessages} onSend={sendChat} />
      </div>

      {gameState && <BettingControls gameState={gameState} onAction={sendAction} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.6; transform: translateX(-50%) scale(1.05); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
