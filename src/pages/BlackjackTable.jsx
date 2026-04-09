/**
 * BlackjackTable.jsx — OTJ Blackjack
 * Luxury dark casino aesthetic — deep green felt, gold rail
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Client } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { AvatarMini } from '../components/common/AvatarSystem';

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL || 'wss://overtime-journal-server.up.railway.app';
const FONT = "'JetBrains Mono','SF Mono',monospace";
const GOLD = '#c9a84c';
const SESSION_KEY = 'otj_bj_session';

// ── Card ──────────────────────────────────────────────────────────────────────

const SUIT_SYM   = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLOR = { h: '#dc2626', d: '#dc2626', c: '#1e1b4b', s: '#1e1b4b' };
const SUIT_BG    = { h: '#fff5f5', d: '#fff5f5', c: '#f0f0ff', s: '#f0f0ff' };

function Card({ card, small = false, highlight = false }) {
  const w = small ? 38 : 52;
  const h = small ? 54 : 74;

  if (!card || card === '??') {
    return (
      <div style={{
        width: w, height: h, borderRadius: 6, flexShrink: 0,
        background: 'linear-gradient(135deg, #1a1060 0%, #2d1b8e 50%, #1a1060 100%)',
        border: '1px solid rgba(99,102,241,0.4)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: small ? 14 : 20, opacity: 0.3 }}>🂠</span>
      </div>
    );
  }

  const val   = card.slice(0, -1);
  const suit  = card.slice(-1);
  const color = SUIT_COLOR[suit] || '#111';
  const bg    = SUIT_BG[suit]    || '#fff';
  const fs    = small ? 10 : 12;

  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      background: bg,
      border: `2px solid ${highlight ? GOLD : 'rgba(0,0,0,0.12)'}`,
      boxShadow: highlight ? `0 0 14px ${GOLD}88, 0 3px 10px rgba(0,0,0,0.4)` : '0 3px 10px rgba(0,0,0,0.4)',
      position: 'relative', userSelect: 'none',
    }}>
      <div style={{ position: 'absolute', top: 2, left: 4, fontSize: fs, fontWeight: 800, color, lineHeight: 1.1, fontFamily: FONT }}>
        {val}<br /><span style={{ fontSize: fs - 1 }}>{SUIT_SYM[suit]}</span>
      </div>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: small ? 18 : 28, color }}>
        {SUIT_SYM[suit]}
      </div>
      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: fs, fontWeight: 800, color, lineHeight: 1.1, fontFamily: FONT, transform: 'rotate(180deg)', textAlign: 'left' }}>
        {val}<br /><span style={{ fontSize: fs - 1 }}>{SUIT_SYM[suit]}</span>
      </div>
    </div>
  );
}

// ── Hand total calc ───────────────────────────────────────────────────────────

function calcTotal(cards) {
  if (!cards?.length) return 0;
  let total = 0, aces = 0;
  for (const c of cards) {
    if (!c || c === '??') continue;
    const r = c[0];
    if (['T','J','Q','K'].includes(r)) total += 10;
    else if (r === 'A') { total += 11; aces++; }
    else total += parseInt(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// ── Hand display ──────────────────────────────────────────────────────────────

function Hand({ hand, isActive, small = false }) {
  if (!hand?.cards) return null;
  const total = calcTotal(hand.cards);
  const bust  = total > 21;
  const bj    = hand.cards.length === 2 && total === 21;

  const outcomeColors = { win: '#22c55e', blackjack: GOLD, push: '#94a3b8', lose: '#ef4444', bust: '#ef4444' };
  const oc = outcomeColors[hand.status];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: small ? 3 : 4 }}>
        {hand.cards.map((c, i) => <Card key={i} card={c} small={small} highlight={isActive} />)}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT, color: bust ? '#ef4444' : isActive ? GOLD : '#94a3b8' }}>
        {bust ? `BUST (${total})` : bj ? '🂡 BJ' : total}
        {hand.doubled && <span style={{ fontSize: 9, color: '#a855f7', marginLeft: 3 }}> 2x</span>}
      </div>
      {hand.status && hand.status !== 'active' && (
        <div style={{
          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
          background: `${oc}22`, border: `1px solid ${oc}44`, color: oc,
          fontFamily: FONT, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {hand.status === 'blackjack' ? 'BLACKJACK 🂡' : hand.status.toUpperCase()}
          {hand.payout > 0 && ` +$${hand.payout.toLocaleString()}`}
        </div>
      )}
    </div>
  );
}

// ── Seat positions (arc along bottom) ────────────────────────────────────────

const SEAT_POSITIONS = [
  { bottom: '7%', left: '8%'  },
  { bottom: '7%', left: '27%' },
  { bottom: '7%', left: '50%' },
  { bottom: '7%', left: '73%' },
  { bottom: '7%', left: '92%' },
];

// ── Chip selector ─────────────────────────────────────────────────────────────

function BetControls({ config, myChips, currentBet, onAddChip, onClear, onDeal, betLocked }) {
  const denominations = [
    { val: config.minBet,      color: '#3b82f6' },
    { val: config.minBet * 2,  color: '#22c55e' },
    { val: config.minBet * 5,  color: '#f59e0b' },
    { val: config.minBet * 10, color: '#ef4444' },
    { val: config.maxBet,      color: '#a855f7' },
  ].filter((c, i, arr) => arr.findIndex(x => x.val === c.val) === i);

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${GOLD}33`, padding: '10px 16px 22px',
    }}>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#374151', fontFamily: FONT, marginBottom: 6, letterSpacing: '0.12em' }}>
        PLACE YOUR BET · {config.minBet.toLocaleString()}–{config.maxBet.toLocaleString()} BUCKS
      </div>

      <div style={{ textAlign: 'center', marginBottom: 8, minHeight: 28 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: currentBet > 0 ? GOLD : '#374151', fontFamily: FONT }}>
          {currentBet > 0 ? `$${currentBet.toLocaleString()}` : '—'}
        </span>
        {currentBet > 0 && !betLocked && (
          <button onClick={onClear} style={{
            marginLeft: 10, fontSize: 9, color: '#6b7280',
            background: 'transparent', border: '1px solid #374151',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: FONT,
          }}>✕ CLEAR</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        {denominations.map(chip => (
          <button
            key={chip.val}
            disabled={betLocked || currentBet + chip.val > config.maxBet || chip.val > myChips}
            onClick={() => onAddChip(chip.val)}
            style={{
              width: 54, height: 54, borderRadius: '50%', cursor: 'pointer',
              background: `radial-gradient(circle at 35% 30%, ${chip.color}ee, ${chip.color}77)`,
              border: `3px solid ${chip.color}`,
              boxShadow: `0 4px 14px ${chip.color}44, inset 0 1px 0 rgba(255,255,255,0.2)`,
              color: '#fff', fontSize: 9, fontWeight: 800, fontFamily: FONT,
              opacity: betLocked ? 0.3 : 1,
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onMouseEnter={e => { if (!betLocked) { e.currentTarget.style.transform = 'scale(1.14) translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 20px ${chip.color}66, inset 0 1px 0 rgba(255,255,255,0.2)`; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 4px 14px ${chip.color}44, inset 0 1px 0 rgba(255,255,255,0.2)`; }}
          >
            ${chip.val >= 1000 ? (chip.val/1000)+'K' : chip.val}
          </button>
        ))}
      </div>

      {currentBet >= config.minBet && !betLocked && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={onDeal} style={{
            padding: '11px 40px', borderRadius: 8, cursor: 'pointer',
            background: `linear-gradient(135deg, ${GOLD}, #a07828)`,
            border: 'none', color: '#000',
            fontSize: 12, fontWeight: 900, fontFamily: FONT, letterSpacing: '0.08em',
            boxShadow: `0 4px 20px ${GOLD}55`,
            transition: 'transform 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            DEAL CARDS →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Action controls ───────────────────────────────────────────────────────────

function ActionControls({ onHit, onStand, onDouble, onSplit, canDouble, canSplit, timeLeft }) {
  function btn(label, onClick, color, icon) {
    return (
      <button onClick={onClick} style={{
        flex: 1, padding: '13px 6px', borderRadius: 8, cursor: 'pointer',
        background: `${color}18`, border: `1px solid ${color}44`,
        color, fontSize: 11, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.06em',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}30`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}18`}
      >{icon} {label}</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${GOLD}33`, padding: '10px 16px 22px',
    }}>
      {timeLeft != null && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontFamily: FONT, fontWeight: 700, color: timeLeft <= 5 ? '#ef4444' : GOLD }}>
            {timeLeft <= 5 ? '⚠️ ' : '⏱ '}YOUR TURN — {timeLeft}s
          </span>
          <div style={{ width: 200, height: 2, background: '#1a1a2e', borderRadius: 1, margin: '4px auto 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: timeLeft <= 5 ? '#ef4444' : GOLD, width: `${(timeLeft / 30) * 100}%`, transition: 'width 1s linear, background 0.3s', borderRadius: 1 }} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {btn('HIT',    onHit,    '#22c55e', '👆')}
        {btn('STAND',  onStand,  '#ef4444', '✋')}
        {canDouble && btn('DOUBLE', onDouble, '#f59e0b', '2×')}
        {canSplit  && btn('SPLIT',  onSplit,  '#a855f7', '✂️')}
      </div>
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function ChatPanel({ messages, onSend, myUsername }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function send() {
    const m = input.trim();
    if (!m) return;
    onSend(m);
    setInput('');
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 52, bottom: 90, width: 210,
      background: 'rgba(3,6,10,0.94)', borderLeft: `1px solid ${GOLD}22`,
      display: 'flex', flexDirection: 'column', zIndex: 20,
    }}>
      <div style={{ padding: '7px 10px', borderBottom: `1px solid ${GOLD}15`, fontSize: 9, color: '#374151', fontFamily: FONT, letterSpacing: '0.12em' }}>
        TABLE CHAT
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.5 }}>
            {m.type === 'system'
              ? <span style={{ color: GOLD, fontStyle: 'italic', fontFamily: FONT }}>— {m.message}</span>
              : <><span style={{ color: m.username === myUsername ? '#ef4444' : '#818cf8', fontWeight: 700, fontFamily: FONT }}>{m.username}: </span>
                 <span style={{ color: '#94a3b8' }}>{m.message}</span></>
            }
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${GOLD}15`, display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Say something..."
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${GOLD}22`, color: '#f1f5f9', fontSize: 10, fontFamily: FONT, outline: 'none' }}
        />
        <button onClick={send} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: `${GOLD}18`, border: `1px solid ${GOLD}33`, color: GOLD, fontSize: 10 }}>▶</button>
      </div>
    </div>
  );
}

// ── Payout banner ─────────────────────────────────────────────────────────────

function PayoutBanner({ results, myUsername }) {
  if (!results) return null;
  const mine = results.find(r => r.username === myUsername);
  if (!mine) return null;
  const net = mine.chipChange;
  const bj  = mine.hands?.some(h => h.outcome === 'blackjack');
  const win = net > 0;
  const color = win ? (bj ? GOLD : '#22c55e') : net === 0 ? '#94a3b8' : '#ef4444';

  return (
    <div style={{
      position: 'fixed', top: '28%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 100, textAlign: 'center', pointerEvents: 'none',
      animation: 'bannerPop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {bj && <div style={{ fontSize: 52, marginBottom: 4 }}>🂡</div>}
      <div style={{ fontSize: bj ? 30 : 24, fontWeight: 900, fontFamily: FONT, color, textShadow: `0 0 30px ${color}`, letterSpacing: '0.04em' }}>
        {bj ? 'BLACKJACK!' : win ? 'WIN!' : net === 0 ? 'PUSH' : 'BUST'}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: FONT, marginTop: 4 }}>
        {net > 0 ? '+' : ''}{net?.toLocaleString()} Bucks
      </div>
    </div>
  );
}

// ── House bank pill ───────────────────────────────────────────────────────────

function HouseBankPill() {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    supabase.from('house_bank').select('balance').eq('id', 1).maybeSingle()
      .then(({ data }) => data && setBalance(data.balance));
  }, []);
  if (balance == null) return null;
  return (
    <div style={{ padding: '3px 10px', borderRadius: 20, background: `${GOLD}15`, border: `1px solid ${GOLD}33`, fontSize: 9, fontFamily: FONT, color: GOLD }}>
      🏦 ${Math.round(balance / 10000).toLocaleString()}
    </div>
  );
}

// ── Emoji projectile ──────────────────────────────────────────────────────────

function EmojiProjectile({ emoji, fromSeat, toSeat, tableRef, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !tableRef.current) return;
    const tr = tableRef.current.getBoundingClientRect();
    const W = tr.width, H = tr.height;

    function center(idx) {
      const pos = SEAT_POSITIONS[idx];
      return {
        x: tr.left + W * (parseFloat(pos.left) / 100),
        y: tr.top  + H * (1 - parseFloat(pos.bottom) / 100),
      };
    }
    const dealerCenter = { x: tr.left + W * 0.5, y: tr.top + H * 0.12 };
    const from = fromSeat === -1 ? dealerCenter : center(fromSeat);
    const to   = toSeat   === -1 ? dealerCenter : center(toSeat);
    const midX = (from.x + to.x) / 2;
    const midY = Math.min(from.y, to.y) - 80;

    ref.current.animate([
      { left: from.x+'px', top: from.y+'px', fontSize: '26px', opacity: 1,  transform: 'rotate(0deg) scale(1)'   },
      { left: midX+'px',   top: midY+'px',   fontSize: '34px', opacity: 1,  transform: 'rotate(180deg) scale(1.3)' },
      { left: to.x+'px',   top: to.y+'px',   fontSize: '44px', opacity: 0,  transform: 'rotate(360deg) scale(0.3)' },
    ], { duration: 850, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'forwards' }).onfinish = onDone;
  }, []);

  return (
    <div ref={ref} style={{ position: 'fixed', pointerEvents: 'none', zIndex: 200, left: 0, top: 0, fontSize: 26, userSelect: 'none', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
      {emoji}
    </div>
  );
}


// ── Dealer Character ─────────────────────────────────────────────────────────

const DEALER_MOODS = {
  idle:      { face: '🎩', label: 'Place your bets...' },
  dealing:   { face: '🤵', label: 'Dealing...' },
  waiting:   { face: '🧐', label: 'Your move.' },
  bust:      { face: '😏', label: 'Bust! Better luck next time.' },
  blackjack: { face: '😤', label: 'Blackjack! Lucky hand.' },
  win:       { face: '😬', label: 'You got me this time.' },
  lose:      { face: '😈', label: 'House wins again!' },
  push:      { face: '😐', label: "We'll call it a tie." },
  dealer_bust: { face: '😤', label: 'Dealer busts! Pay the table.' },
};

function DealerCharacter({ mood = 'idle', isDealing }) {
  const m = DEALER_MOODS[mood] || DEALER_MOODS.idle;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      transition: 'all 0.4s ease',
    }}>
      {/* Caricature dealer face */}
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, #2a1810, #1a0f0a)`,
        border: `3px solid ${GOLD}`,
        boxShadow: `0 0 20px ${GOLD}44, inset 0 -4px 8px rgba(0,0,0,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
        animation: isDealing ? 'dealerDeal 0.4s ease-in-out infinite alternate' : 'none',
        transition: 'all 0.3s',
        position: 'relative',
      }}>
        {m.face}
        {/* bow tie */}
        <div style={{
          position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 12,
        }}>🎀</div>
      </div>
      {/* Speech bubble */}
      <div style={{
        background: 'rgba(0,0,0,0.7)', border: `1px solid ${GOLD}33`,
        borderRadius: 8, padding: '3px 10px',
        fontSize: 8, color: `${GOLD}cc`, fontFamily: FONT,
        letterSpacing: '0.06em', textAlign: 'center',
        maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: 0.9,
      }}>
        {m.label}
      </div>
    </div>
  );
}

// ── Card Projectile (thrown from dealer to seat) ───────────────────────────

function CardProjectile({ id, toSeat, faceDown = true, tableRef, onDone, delay = 0 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !tableRef.current) return;
    const timer = setTimeout(() => {
      if (!ref.current || !tableRef.current) return;
      const tr = tableRef.current.getBoundingClientRect();
      const W = tr.width, H = tr.height;

      // Dealer position — top center
      const from = { x: tr.left + W * 0.5, y: tr.top + H * 0.08 };

      // Target seat
      const pos = SEAT_POSITIONS[toSeat];
      const to = {
        x: tr.left + W * (parseFloat(pos.left) / 100),
        y: tr.top  + H * (1 - parseFloat(pos.bottom) / 100) - 30,
      };

      const midX = from.x + (to.x - from.x) * 0.4 + (Math.random() - 0.5) * 60;
      const midY = Math.min(from.y, to.y) - 80;

      ref.current.animate([
        { left: from.x+'px', top: from.y+'px', opacity: 1, transform: 'rotate(0deg) scale(0.7)' },
        { left: midX+'px',   top: midY+'px',   opacity: 1, transform: `rotate(${-180 + Math.random()*60}deg) scale(1.1)` },
        { left: to.x+'px',   top: to.y+'px',   opacity: 1, transform: `rotate(${-360 + Math.random()*30 - 15}deg) scale(1)` },
      ], {
        duration: 550,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards',
      }).onfinish = onDone;
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} style={{
      position: 'fixed', pointerEvents: 'none', zIndex: 150,
      left: 0, top: 0,
      width: 28, height: 40, borderRadius: 4,
      background: faceDown
        ? 'linear-gradient(135deg, #1a1060 0%, #2d1b8e 50%, #1a1060 100%)'
        : '#fff5f5',
      border: faceDown ? '1px solid rgba(99,102,241,0.6)' : `1px solid ${GOLD}`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, color: faceDown ? 'rgba(255,255,255,0.2)' : '#dc2626',
    }}>
      {faceDown ? '🂠' : '🃏'}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function BlackjackTable() {
  const { roomId } = useParams();
  const location   = useLocation();
  const navigate   = useNavigate();

  const stateFromNav = location.state || {};
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; } })();
  const params = stateFromNav.tier ? stateFromNav : saved;
  const { tier, buyIn, userId, username, avatarConfig } = params;

  const [gameState, setGameState]       = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [error, setError]               = useState(null);
  const [betTimer, setBetTimer]         = useState(null);
  const [turnTimer, setTurnTimer]       = useState(null);
  const [currentBet, setCurrentBet]     = useState(0);
  const [betLocked, setBetLocked]       = useState(false);
  const [payoutResults, setPayoutResults] = useState(null);
  const [emojiTarget, setEmojiTarget]   = useState(null);
  const [projectiles, setProjectiles]   = useState([]);
  const [sitModal, setSitModal]         = useState(null); // { seatIndex }
  const [sitBuyIn, setSitBuyIn]         = useState(0);
  const [dealerMood, setDealerMood]     = useState('idle');
  const [isDealing, setIsDealing]       = useState(false);
  const [cardProjectiles, setCardProjectiles] = useState([]);
  const cardProjectileId = useRef(0);
  const projectileId = useRef(0);
  const tableRef     = useRef(null);
  const roomRef      = useRef(null);

  useEffect(() => {
    if (tier && buyIn && userId)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ tier, buyIn, userId, username, avatarConfig }));
  }, [tier]);

  useEffect(() => {
    if (!tier || !buyIn || !userId) { navigate('/blackjack'); return; }
    const client = new Client(COLYSEUS_URL);
    let mounted = true;

    let retries = 0;
    const MAX_RETRIES = 3;

    async function connect() {
      try {
        const joinOpts = { userId, username, avatar: { config: avatarConfig }, buyIn };
        let room;

        if (roomId) {
          room = await client.joinById(roomId, joinOpts);
        } else {
          try {
            const rooms = await client.getAvailableRooms('blackjack');
            const open  = rooms.find(r => r.metadata?.tier === tier && r.clients < 5);
            room = open ? await client.joinById(open.roomId, joinOpts)
                        : await client.create('blackjack', { ...joinOpts, tier });
          } catch {
            room = await client.create('blackjack', { ...joinOpts, tier });
          }
        }

        if (!mounted) { room.leave(); return; }
        roomRef.current = room;

        room.onMessage('game_state', state => {
          if (!mounted) return;
          setGameState(state);
          if (state.phase === 'betting') { setBetLocked(false); setPayoutResults(null); }
        });

        room.onMessage('bet_timer',       ({ timeLeft }) => mounted && setBetTimer(timeLeft));
        room.onMessage('turn_change',     ({ timeLeft }) => mounted && setTurnTimer(timeLeft));
        room.onMessage('turn_timer',      ({ timeLeft }) => mounted && setTurnTimer(timeLeft));
        room.onMessage('new_round',       ()             => mounted && (setCurrentBet(0), setBetLocked(false), setTurnTimer(null), setBetTimer(20), setPayoutResults(null), setDealerMood('idle'), setCardProjectiles([])));
        // payout_results handled above with dealer mood
        room.onMessage('chat_message',    msg => mounted && setChatMessages(p => [...p.slice(-99), msg]));
        room.onMessage('emoji_reaction',  ({ fromSeat, toSeat, emoji }) => {
          if (!mounted) return;
          const pid = ++projectileId.current;
          setProjectiles(p => [...p, { id: pid, emoji, fromSeat, toSeat }]);
        });

        room.onMessage('deal_complete', ({ handNumber }) => {
          if (!mounted) return;
          setIsDealing(true);
          setDealerMood('dealing');
          // Throw cards to each seated player — 2 rounds, staggered
          const seatedIndices = [];
          // We don't know seats yet from this message, throw to all 5 positions
          // game_state will follow immediately and render real cards
          for (let round = 0; round < 2; round++) {
            for (let seat = 0; seat < 5; seat++) {
              const pid = ++cardProjectileId.current;
              const delay = (round * 5 + seat) * 120;
              setCardProjectiles(prev => [...prev, { id: pid, toSeat: seat, delay, faceDown: true }]);
            }
          }
          // Also deal 2 to dealer
          setTimeout(() => {
            setIsDealing(false);
            setDealerMood('waiting');
          }, 1800);
        });

        room.onMessage('dealer_blackjack', () => {
          if (mounted) setDealerMood('blackjack');
        });
        room.onMessage('dealer_hit', () => {
          if (mounted) setIsDealing(true);
          setTimeout(() => { if (mounted) setIsDealing(false); }, 600);
        });
        room.onMessage('player_bust', () => {
          if (mounted) setDealerMood('bust');
          setTimeout(() => { if (mounted) setDealerMood('waiting'); }, 2500);
        });

        room.onMessage('payout_results', ({ results }) => {
          if (!mounted) return;
          setPayoutResults(results);
          // Set dealer mood based on overall result
          const allBust = results.every(r => r.hands?.every(h => h.outcome === 'bust' || h.outcome === 'lose'));
          const anyWin  = results.some(r => r.chipChange > 0);
          const anyBJ   = results.some(r => r.hands?.some(h => h.outcome === 'blackjack'));
          if (anyBJ) setDealerMood('blackjack');
          else if (allBust) setDealerMood('lose');
          else if (anyWin) setDealerMood('win');
          else setDealerMood('lose');
          setTimeout(() => { if (mounted) { setPayoutResults(null); setDealerMood('idle'); } }, 3500);
        });

        room.onMessage('dealer_reveal', () => {
          if (mounted) { setIsDealing(true); setDealerMood('dealing'); }
        });
        ['player_doubled','player_split','dealer_blackjack'].forEach(t => room.onMessage(t, () => {}));
        room.onMessage('error', ({ message }) => { if (mounted) { setError(message); setTimeout(() => setError(null), 3000); } });

        room.onLeave(code => {
          if (!mounted) return;
          if (code !== 1000) {
            retries++;
            if (retries <= MAX_RETRIES) {
              setError(`Disconnected — reconnecting (${retries}/${MAX_RETRIES})...`);
              setTimeout(() => mounted && connect(), 3000);
            } else {
              setError('Could not connect to table. Please try again.');
              setTimeout(() => navigate('/blackjack'), 3000);
            }
          }
          else navigate('/blackjack');
        });

      } catch (err) {
        if (!mounted) return;
        retries++;
        if (retries <= MAX_RETRIES) {
          setError(`Failed to connect — retrying (${retries}/${MAX_RETRIES})...`);
          setTimeout(() => mounted && connect(), 3000);
        } else {
          setError(`Could not reach table: ${err.message}`);
          setTimeout(() => navigate('/blackjack'), 3000);
        }
      }
    }

    connect();
    return () => { mounted = false; roomRef.current?.leave(); };
  }, [roomId, tier]);

  function send(action, data = {}) { roomRef.current?.send(action, data); }

  // Derived
  const { phase, seats, mySeat, currentSeat, dealerCards, dealerTotal, config } = gameState || {};
  const me         = mySeat != null ? seats?.[mySeat] : null;
  const myHand     = me?.hands?.[me?.activeHand];
  const isMyTurn   = phase === 'player_turn' && currentSeat === mySeat;
  const isBetting  = phase === 'betting';

  function cardRank(c) { return ['T','J','Q','K'].includes(c[0]) ? 10 : c[0] === 'A' ? 11 : parseInt(c[0]); }
  const myCanDouble = isMyTurn && myHand?.cards.length === 2 && (me?.chips || 0) >= myHand.bet;
  const myCanSplit  = isMyTurn && myHand?.cards.length === 2 && myHand.cards.length === 2 && cardRank(myHand.cards[0]) === cardRank(myHand.cards[1]);

  function handleSeatClick(seatIndex) {
    if (mySeat != null) return; // already seated
    if (phase !== 'betting' && phase !== undefined) return; // mid-hand
    const minBuyIn = config?.minBet ? config.minBet * 5 : 500;
    setSitBuyIn(buyIn || minBuyIn);
    setSitModal({ seatIndex });
  }

  function confirmSitDown() {
    if (!sitModal) return;
    send('sit_down', { seatIndex: sitModal.seatIndex, buyIn: sitBuyIn });
    setSitModal(null);
  }

  const EMOJIS = ['🥧','💸','😡','😂','👏','💀','🔥','🥶'];

  if (!gameState) return (
    <div style={{ minHeight: '100vh', background: '#03060a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center', color: GOLD }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🎰</div>
        <div style={{ fontSize: 12, letterSpacing: '0.2em' }}>CONNECTING...</div>
        {error && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 8 }}>{error}</div>}
        <div style={{ marginTop: 16, fontSize: 9, color: '#374151', fontFamily: FONT, lineHeight: 1.8 }}>
          <div>tier: <span style={{ color: tier ? '#22c55e' : '#ef4444' }}>{tier || 'MISSING'}</span></div>
          <div>buyIn: <span style={{ color: buyIn ? '#22c55e' : '#ef4444' }}>{buyIn || 'MISSING'}</span></div>
          <div>userId: <span style={{ color: userId ? '#22c55e' : '#ef4444' }}>{userId ? userId.slice(0,8)+'...' : 'MISSING'}</span></div>
          <div>roomId: <span style={{ color: '#94a3b8' }}>{roomId || 'none'}</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#03060a', fontFamily: FONT, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 25,
        background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${GOLD}22`,
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
      }}>
        <button onClick={() => { roomRef.current?.leave(true); navigate('/blackjack'); }} style={{
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 10, fontFamily: FONT,
        }}>← LEAVE</button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.1em' }}>🎰 OTJ BLACKJACK</span>
          <span style={{ fontSize: 9, color: '#374151', marginLeft: 8 }}>{config?.label}</span>
        </div>

        <HouseBankPill />
        {me && <div style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>${me.chips?.toLocaleString()}</div>}
      </div>

      {/* Error */}
      {error && (
        <div style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'rgba(239,68,68,0.9)', color: '#fff', padding: '6px 20px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Payout */}
      <PayoutBanner results={payoutResults} myUsername={username} />

      {/* Table felt */}
      <div ref={tableRef} style={{
        position: 'relative', width: '100%', maxWidth: 920,
        height: 'calc(100vh - 150px)',
        margin: '60px auto 0',
        background: 'radial-gradient(ellipse at 50% 35%, #0e4425 0%, #082b18 55%, #030f08 100%)',
        borderTop: '8px solid #7c4a1e', borderBottom: '8px solid #7c4a1e',
        overflow: 'hidden',
      }}>

        {/* Felt weave */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '8px 8px', pointerEvents: 'none' }} />

        {/* Watermark */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, fontWeight: 900, color: 'rgba(201,168,76,0.05)', letterSpacing: '0.35em', fontFamily: FONT, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          ★ OVERTIME JOURNAL CASINO ★
        </div>

        {/* BJ payout arc text */}
        <div style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 9, color: `${GOLD}40`, fontFamily: FONT, letterSpacing: '0.2em' }}>BLACKJACK PAYS 3 TO 2</div>
          <div style={{ fontSize: 8, color: `${GOLD}25`, fontFamily: FONT, letterSpacing: '0.15em', marginTop: 2 }}>DEALER MUST STAND ON 17 AND DRAW TO 16</div>
        </div>

        {/* Dealer zone */}
        <div style={{ position: 'absolute', top: '3%', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <DealerCharacter mood={dealerMood} isDealing={isDealing} />
          {(dealerCards || []).length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
              {dealerCards.map((c, i) => <Card key={i} card={c} />)}
            </div>
          )}
          {dealerTotal > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: dealerTotal > 21 ? '#ef4444' : GOLD, fontFamily: FONT }}>
              {dealerTotal > 21 ? `BUST (${dealerTotal})` : dealerTotal}
            </div>
          )}
        </div>

        {/* Bet timer */}
        {isBetting && betTimer != null && (
          <div style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: `${GOLD}88`, fontFamily: FONT, marginBottom: 5, letterSpacing: '0.12em' }}>
              {betTimer > 0 ? `BETTING OPEN — ${betTimer}s` : 'DEALING...'}
            </div>
            <div style={{ width: 150, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: betTimer <= 5 ? '#ef4444' : GOLD, width: `${(betTimer / 20) * 100}%`, transition: 'width 1s linear, background 0.3s' }} />
            </div>
          </div>
        )}

        {/* Phase label */}
        {phase && phase !== 'betting' && (
          <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: `${GOLD}55`, letterSpacing: '0.2em', fontFamily: FONT }}>
            {phase === 'player_turn' ? '— YOUR TURN —' : phase === 'dealer_turn' ? '— DEALER PLAYS —' : phase === 'payout' ? '— RESULTS —' : ''}
          </div>
        )}

        {/* My hand (large, centered above seats) */}
        {me?.hands?.length > 0 && (
          <div style={{ position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, zIndex: 4 }}>
            {me.hands.map((hand, hi) => (
              <Hand key={hi} hand={hand} isActive={isMyTurn && hi === me.activeHand} />
            ))}
          </div>
        )}

        {/* Player seats */}
        {seats?.map((seat, i) => {
          const pos    = SEAT_POSITIONS[i];
          const isMe   = i === mySeat;
          const myTurn = i === currentSeat && phase === 'player_turn';
          return (
            <div key={i}
              onClick={() => seat && !isMe && setEmojiTarget(i)}
              style={{
                position: 'absolute', bottom: pos.bottom, left: pos.left,
                transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                cursor: seat && !isMe ? 'pointer' : 'default', zIndex: myTurn ? 6 : 3,
              }}
            >
              {!seat ? (
                <div
                  onClick={() => handleSeatClick(i)}
                  style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.015)', border: `2px dashed ${GOLD}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: mySeat == null ? GOLD : '#374151', fontFamily: FONT, cursor: mySeat == null ? 'pointer' : 'default', transition: 'all 0.2s' }}
                  onMouseEnter={e => { if (mySeat == null) e.currentTarget.style.background = `${GOLD}15`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                >SIT</div>
              ) : (
                <>
                  {/* Small hands for other players */}
                  {!isMe && seat.hands?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                      {seat.hands.map((hand, hi) => <Hand key={hi} hand={hand} isActive={myTurn && hi === seat.activeHand} small />)}
                    </div>
                  )}
                  {seat.bet > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: `${GOLD}12`, border: `1px solid ${GOLD}28`, padding: '1px 6px', borderRadius: 8, fontFamily: FONT, marginBottom: 2 }}>
                      BET ${seat.bet.toLocaleString()}
                    </div>
                  )}
                  <div style={{ border: `2px solid ${myTurn ? GOLD : isMe ? '#ef4444' : 'rgba(255,255,255,0.07)'}`, borderRadius: '50%', boxShadow: myTurn ? `0 0 16px ${GOLD}55` : 'none', transition: 'all 0.3s' }}>
                    <AvatarMini config={seat.avatar?.config} size={40} />
                  </div>
                  <div style={{ background: 'rgba(3,6,10,0.88)', borderRadius: 5, padding: '2px 7px', textAlign: 'center', minWidth: 68, border: `1px solid ${GOLD}18` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: isMe ? '#ef4444' : '#f1f5f9', fontFamily: FONT }}>{seat.username?.slice(0,10)}{isMe ? ' (you)' : ''}</div>
                    <div style={{ fontSize: 9, color: GOLD, fontFamily: FONT }}>${seat.chips?.toLocaleString()}</div>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Card projectiles — thrown from dealer on deal */}
        {cardProjectiles.map(p => (
          <CardProjectile
            key={p.id}
            id={p.id}
            toSeat={p.toSeat}
            faceDown={p.faceDown}
            delay={p.delay}
            tableRef={tableRef}
            onDone={() => setCardProjectiles(prev => prev.filter(x => x.id !== p.id))}
          />
        ))}

        {/* Emoji projectiles */}
        {projectiles.map(p => (
          <EmojiProjectile key={p.id} emoji={p.emoji} fromSeat={p.fromSeat} toSeat={p.toSeat} tableRef={tableRef}
            onDone={() => setProjectiles(prev => prev.filter(x => x.id !== p.id))} />
        ))}
      </div>

      {/* Emoji tray */}
      {emojiTarget != null && (
        <>
          <div onClick={() => setEmojiTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
          <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 195, background: 'rgba(3,6,10,0.97)', border: `1px solid ${GOLD}33`, borderRadius: 16, padding: '10px 14px', display: 'flex', gap: 6, alignItems: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>
            <span style={{ fontSize: 9, color: '#4a5568', fontFamily: FONT, marginRight: 4 }}>THROW AT {seats?.[emojiTarget]?.username?.toUpperCase()}</span>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { send('emoji_reaction', { toSeat: emojiTarget, emoji: e }); setEmojiTarget(null); }}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${GOLD}22`, background: `${GOLD}08`, cursor: 'pointer', fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                onMouseEnter={e2 => { e2.currentTarget.style.background = `${GOLD}22`; e2.currentTarget.style.transform = 'scale(1.2)'; }}
                onMouseLeave={e2 => { e2.currentTarget.style.background = `${GOLD}08`; e2.currentTarget.style.transform = 'scale(1)'; }}
              >{e}</button>
            ))}
          </div>
        </>
      )}

      <ChatPanel messages={chatMessages} onSend={m => send('chat', { message: m })} myUsername={username} />

      {isBetting && me && config && !betLocked && (
        <BetControls config={config} myChips={me.chips} currentBet={currentBet}
          onAddChip={v => setCurrentBet(p => Math.min(p + v, config.maxBet))}
          onClear={() => setCurrentBet(0)}
          onDeal={() => { if (currentBet >= config.minBet) { send('place_bet', { amount: currentBet }); setBetLocked(true); } }}
          betLocked={betLocked}
        />
      )}

      {isMyTurn && (
        <ActionControls
          onHit    ={() => send('hit')}
          onStand  ={() => send('stand')}
          onDouble ={() => send('double_down', { betAmount: myHand?.bet })}
          onSplit  ={() => send('split')}
          canDouble={myCanDouble}
          canSplit ={myCanSplit}
          timeLeft ={turnTimer}
        />
      )}

      {/* Sit down modal */}
      {sitModal && config && (
        <>
          <div onClick={() => setSitModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 201, background: '#0a0e14', border: `1px solid ${GOLD}44`,
            borderRadius: 14, padding: 24, width: 290, fontFamily: FONT,
            boxShadow: `0 20px 60px rgba(0,0,0,0.8)`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
              Sit Down — Seat {(sitModal.seatIndex + 1)}
            </div>
            <div style={{ fontSize: 9, color: '#4a5568', marginBottom: 16 }}>
              Min {(config.minBet * 5).toLocaleString()} · Max bet ${config.maxBet.toLocaleString()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input type="range"
                min={config.minBet * 5}
                max={Math.min(config.minBet * 50, 100000)}
                step={config.minBet}
                value={sitBuyIn}
                onChange={e => setSitBuyIn(Number(e.target.value))}
                style={{ flex: 1, accentColor: GOLD }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, minWidth: 70, textAlign: 'right' }}>
                ${sitBuyIn.toLocaleString()}
              </span>
            </div>

            <div style={{ fontSize: 9, color: '#374151', marginBottom: 18 }}>
              Table: {config.label} · Blinds ${config.minBet}–${config.maxBet}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSitModal(null)} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#6b7280', fontSize: 11, fontFamily: FONT,
              }}>CANCEL</button>
              <button onClick={confirmSitDown} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                background: `linear-gradient(135deg, ${GOLD}, #a07828)`,
                border: 'none', color: '#000', fontSize: 11, fontWeight: 900, fontFamily: FONT,
              }}>SIT DOWN</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes bannerPop { from { opacity:0; transform:translate(-50%,-50%) scale(0.7); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes dealerDeal { from { transform: rotate(-8deg) scale(1.05); } to { transform: rotate(8deg) scale(0.95); } }
      `}</style>
    </div>
  );
}
