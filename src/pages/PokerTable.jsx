/**
 * PokerTable.jsx — OTJ Poker Table
 * 
 * Connects to Colyseus PokerRoom, renders 6-max table with:
 * - DiceBear avatars at each seat
 * - Animated card dealing
 * - Pot display + side pots
 * - Betting controls (fold/check/call/raise/all-in)
 * - Turn timer
 * - Chat
 * - Cashout → bankroll on leave
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { AvatarMini } from '../components/common/AvatarSystem';

const FONT = "'JetBrains Mono','SF Mono',monospace";

// Railway Colyseus server URL
const COLYSEUS_URL = 'wss://overtime-journal-production.up.railway.app';

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
  { top: '75%', left: '50%' },   // 0: bottom center (player's preferred seat)
  { top: '60%', left: '10%' },   // 1: bottom left
  { top: '20%', left: '10%' },   // 2: top left
  { top: '5%',  left: '50%' },   // 3: top center
  { top: '20%', left: '90%' },   // 4: top right
  { top: '60%', left: '90%' },   // 5: bottom right
];

// ─── Seat Component ──────────────────────────────────────────────────────────

function Seat({ seat, seatIndex, isCurrentTurn, isDealer, mySeat, phase, onSitDown }) {
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
          transition: 'all 0.2s ease',
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
      {/* Turn indicator ring */}
      {isCurrentTurn && (
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 72, height: 72, borderRadius: '50%',
          border: '3px solid #fbbf24',
          boxShadow: '0 0 16px rgba(251,191,36,0.4)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      )}

      {/* Avatar */}
      <div style={{
        position: 'relative',
        opacity: seat.status === 'folded' ? 0.35 : 1,
        transition: 'opacity 0.3s ease',
      }}>
        <AvatarMini config={seat.avatar?.config || {}} size={60} style={{
          border: `2px solid ${isMe ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
          background: statusColors[seat.status] || 'transparent',
        }} />

        {/* Dealer button */}
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

      {/* Username */}
      <div style={{
        fontSize: 9, fontWeight: 600, marginTop: 4,
        color: isMe ? '#ef4444' : seat.status === 'folded' ? '#374151' : '#f1f5f9',
        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {seat.username}{isMe ? ' (you)' : ''}
      </div>

      {/* Chips */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', marginTop: 1 }}>
        ${seat.chips?.toLocaleString()}
      </div>

      {/* Last action badge */}
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

      {/* Hole cards (only shown for player's own seat or at showdown) */}
      {seat.holeCards && seat.holeCards.length === 2 && (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
          <Card card={seat.holeCards[0]} small />
          <Card card={seat.holeCards[1]} small />
        </div>
      )}
      {/* Face-down cards for other players in an active hand */}
      {(!seat.holeCards || seat.holeCards.length === 0) && seat.status === 'active' && phase !== 'waiting' && (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
          <Card faceDown small />
          <Card faceDown small />
        </div>
      )}

      {/* Current bet chip */}
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

  const { seats, mySeat, currentTurn, phase, minRaise, pot } = gameState;
  const isMyTurn = mySeat !== null && mySeat !== undefined && currentTurn === mySeat;
  const myPlayer = mySeat != null ? seats[mySeat] : null;

  if (!isMyTurn || !myPlayer || phase === 'waiting' || phase === 'showdown') return null;

  const highestBet = Math.max(...seats.filter(Boolean).map(s => s.currentBet || 0));
  const toCall = highestBet - (myPlayer.currentBet || 0);
  const canCheck = toCall === 0;
  const minRaiseTotal = highestBet + minRaise;

  // Initialize raise amount
  useEffect(() => {
    setRaiseAmount(Math.min(minRaiseTotal, (myPlayer.chips || 0) + (myPlayer.currentBet || 0)));
  }, [minRaiseTotal, myPlayer?.chips, isMyTurn]);

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
      {/* Raise slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>RAISE</span>
        <input
          type="range"
          min={minRaiseTotal}
          max={(myPlayer.chips || 0) + (myPlayer.currentBet || 0)}
          step={gameState.blinds?.[1] || 10}
          value={raiseAmount}
          onChange={e => setRaiseAmount(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#fbbf24' }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', minWidth: 60, textAlign: 'right' }}>
          ${raiseAmount.toLocaleString()}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAction('fold')} style={btnStyle('#6b7280')}>
          FOLD
        </button>
        {canCheck ? (
          <button onClick={() => onAction('check')} style={btnStyle('#22c55e')}>
            CHECK
          </button>
        ) : (
          <button onClick={() => onAction('call')} style={btnStyle('#3b82f6')}>
            CALL ${toCall.toLocaleString()}
          </button>
        )}
        <button
          onClick={() => onAction('raise', raiseAmount)}
          disabled={raiseAmount > (myPlayer.chips || 0) + (myPlayer.currentBet || 0)}
          style={btnStyle('#fbbf24', raiseAmount > (myPlayer.chips || 0) + (myPlayer.currentBet || 0))}
        >
          RAISE
        </button>
        <button onClick={() => onAction('all_in')} style={btnStyle('#ef4444')}>
          ALL IN
        </button>
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

// ─── Main Poker Table ────────────────────────────────────────────────────────

export default function PokerTable() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tier, buyIn, userId, username, avatarConfig, roomCode } = location.state || {};

  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [turnTimer, setTurnTimer] = useState(null);
  const roomRef = useRef(null);

  // Connect to Colyseus on mount
  useEffect(() => {
    if (!tier || !buyIn || !userId) {
      navigate('/poker');
      return;
    }

    const client = new Client(COLYSEUS_URL);

    async function connect() {
      try {
        let room;
        if (roomCode) {
          // Join by room code
          const rooms = await client.getAvailableRooms('poker');
          const target = rooms.find(r => r.metadata?.roomCode === roomCode);
          if (target) {
            room = await client.joinById(target.roomId, {
              userId, username, avatar: { config: avatarConfig }, buyIn,
            });
          } else {
            setError(`Room ${roomCode} not found`);
            return;
          }
        } else {
          // Join or create
          room = await client.joinOrCreate('poker', {
            tier, userId, username,
            avatar: { config: avatarConfig },
            buyIn,
          });
        }

        roomRef.current = room;
        setConnected(true);

        // Listen for game state updates
        room.onMessage('game_state', (state) => {
          setGameState(state);
        });

        room.onMessage('chat_message', (msg) => {
          setChatMessages(prev => [...prev.slice(-49), msg]);
        });

        room.onMessage('turn_change', ({ seat, timeLimit }) => {
          setTurnTimer(timeLimit);
        });

        room.onMessage('timer_warning', ({ secondsLeft }) => {
          setTurnTimer(secondsLeft);
        });

        room.onMessage('error', ({ message }) => {
          setError(message);
          setTimeout(() => setError(null), 3000);
        });

        room.onMessage('pot_awarded', (data) => {
          // Could add animations here
        });

        room.onMessage('showdown', (data) => {
          // Could add showdown animations here
        });

        room.onLeave((code) => {
          setConnected(false);
          if (code !== 1000) {
            setError('Disconnected from server');
          }
        });

        // Auto sit down at first available seat
        room.onMessage('game_state', function initialSit(state) {
          if (state.mySeat === null || state.mySeat === undefined) {
            const emptySeat = state.seats.findIndex(s => s === null);
            if (emptySeat !== -1) {
              room.send('sit_down', { seatIndex: emptySeat, buyIn });
            }
          }
          room.removeListener && room.onMessage('game_state', () => {}); // one-time
        });

      } catch (err) {
        console.error('Colyseus connection error:', err);
        setError('Failed to connect to poker server');
      }
    }

    connect();

    return () => {
      if (roomRef.current) {
        handleLeaveTable();
      }
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  function sendAction(action, amount) {
    if (!roomRef.current) return;
    if (action === 'raise') {
      roomRef.current.send('raise', { amount });
    } else {
      roomRef.current.send(action);
    }
  }

  function sendChat(message) {
    if (!roomRef.current) return;
    roomRef.current.send('chat', { message });
  }

  async function handleLeaveTable() {
    const room = roomRef.current;
    if (!room) return;

    // Get current chip count before leaving
    const myChips = gameState?.seats?.[gameState?.mySeat]?.chips || 0;

    try {
      room.leave();
    } catch {}

    // Return chips to bankroll
    if (myChips > 0 && userId) {
      try {
        // Add chips back to bankroll
        const { data: profile } = await supabase
          .from('profiles')
          .select('bankroll')
          .eq('user_id', userId)
          .single();

        if (profile) {
          const newBankroll = (profile.bankroll || 0) + myChips;
          await supabase
            .from('profiles')
            .update({ bankroll: newBankroll })
            .eq('user_id', userId);

          // Log to bucks_ledger
          const net = myChips - buyIn;
          await supabase.from('bucks_ledger').insert({
            user_id: userId,
            type: 'poker_cashout',
            amount: myChips,
            balance_after: newBankroll,
            note: `Poker cashout${net >= 0 ? ` (+$${net.toLocaleString()} profit)` : ` (-$${Math.abs(net).toLocaleString()} loss)`}`,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Cashout error:', err);
      }
    }

    navigate('/poker');
  }

  // ── Loading / Error States ─────────────────────────────────────────────────

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

  if (!gameState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: '0.15em' }}>LOADING TABLE...</div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const { seats, pot, communityCards, phase, currentTurn, dealerSeat, mySeat, blinds, handNumber, roomCode: code } = gameState;

  return (
    <div style={{ minHeight: '100vh', fontFamily: FONT, background: '#08080f', paddingBottom: 80 }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
            🃏 {gameState.tableName || 'OTJ Poker'}
          </div>
          <div style={{ fontSize: 9, color: '#4a5568' }}>
            {gameState.tier?.toUpperCase()} · Blinds: ${blinds?.[0]}/${blinds?.[1]} · Hand #{handNumber} · Code: {code}
          </div>
        </div>
        <button onClick={handleLeaveTable} style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.08)', color: '#ef4444',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
        }}>
          LEAVE TABLE
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          padding: '8px 20px', borderRadius: 8,
          background: 'rgba(239,68,68,0.9)', color: '#fff',
          fontSize: 11, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {error}
        </div>
      )}

      {/* Table area */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 700, margin: '20px auto',
        height: 420, borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(34,87,60,0.3) 0%, rgba(15,15,26,0.8) 70%)',
        border: '3px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)',
      }}>
        {/* Pot display */}
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', zIndex: 3,
        }}>
          {pot > 0 && (
            <div style={{
              fontSize: 18, fontWeight: 800, color: '#fbbf24',
              textShadow: '0 0 10px rgba(251,191,36,0.3)',
            }}>
              💰 ${pot.toLocaleString()}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2, textTransform: 'uppercase' }}>
            {phase === 'waiting' ? 'Waiting for players...' : phase}
          </div>
        </div>

        {/* Community cards */}
        {communityCards && communityCards.length > 0 && (
          <div style={{
            position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', gap: 4, zIndex: 3,
          }}>
            {communityCards.map((card, i) => <Card key={i} card={card} />)}
          </div>
        )}

        {/* Seats */}
        {seats.map((seat, i) => (
          <Seat
            key={i}
            seat={seat}
            seatIndex={i}
            isCurrentTurn={currentTurn === i}
            isDealer={seat?.isDealer}
            mySeat={mySeat}
            phase={phase}
            onSitDown={mySeat == null ? (seatIdx) => {
              roomRef.current?.send('sit_down', { seatIndex: seatIdx, buyIn });
            } : null}
          />
        ))}
      </div>

      {/* Chat */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px' }}>
        <ChatPanel messages={chatMessages} onSend={sendChat} />
      </div>

      {/* Betting controls — only shown when it's your turn */}
      {gameState && (
        <BettingControls gameState={gameState} onAction={sendAction} />
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.6; transform: translateX(-50%) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
