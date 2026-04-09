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

function calcHandTotal(cards) {
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
  { bottom: '8%', left: '8%'  },
  { bottom: '8%', left: '27%' },
  { bottom: '8%', left: '50%' },
  { bottom: '8%', left: '73%' },
  { bottom: '8%', left: '92%' },
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
      flexShrink: 0,
      background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${GOLD}33`,
      padding: '10px 16px 16px',
      paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 72px))',
    }}>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#374151', fontFamily: FONT, marginBottom: 6, letterSpacing: '0.12em' }}>
        PLACE YOUR BET · {config.minBet.toLocaleString()}–{config.maxBet.toLocaleString()} OTJ BUCKS
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
      flexShrink: 0,
      background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${GOLD}33`,
      padding: '10px 16px 16px',
      paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 72px))',
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

function ChatPanel({ messages, onSend, myUsername }) {
  const [input, setInput]   = useState('');
  const [open, setOpen]     = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const isMobile  = useIsMobile();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (isMobile && !open && messages.length > 0) {
      setUnread(u => u + 1);
    }
  }, [messages]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  function sendMsg() {
    const m = input.trim();
    if (!m) return;
    onSend(m);
    setInput('');
  }

  // Mobile: floating toggle button + slide-up drawer
  if (isMobile) {
    return (
      <>
        {/* Toggle button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            position: 'fixed', bottom: open ? 'calc(230px + env(safe-area-inset-bottom, 0px))' : 'calc(8px + env(safe-area-inset-bottom, 0px))', right: 12, zIndex: 40,
            width: 42, height: 42, borderRadius: '50%',
            background: `rgba(3,6,10,0.95)`, border: `1px solid ${GOLD}44`,
            color: GOLD, fontSize: 16, cursor: 'pointer',
            boxShadow: `0 4px 16px rgba(0,0,0,0.5)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'bottom 0.3s ease',
          }}
        >
          {open ? '✕' : '💬'}
          {!open && unread > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              background: '#ef4444', color: '#fff',
              fontSize: 8, fontWeight: 700, fontFamily: FONT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{unread > 9 ? '9+' : unread}</div>
          )}
        </button>

        {/* Slide-up drawer */}
        {open && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 210,
            background: 'rgba(3,6,10,0.97)', borderTop: `1px solid ${GOLD}22`,
            zIndex: 39, display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(16px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            <div style={{ padding: '6px 12px', borderBottom: `1px solid ${GOLD}15`, fontSize: 9, color: '#374151', fontFamily: FONT, letterSpacing: '0.12em' }}>
              TABLE CHAT
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.slice(-20).map((m, i) => (
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
            <div style={{ padding: '6px 12px', borderTop: `1px solid ${GOLD}15`, display: 'flex', gap: 6 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()}
                placeholder="Say something..."
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${GOLD}22`, color: '#f1f5f9', fontSize: 10, fontFamily: FONT, outline: 'none' }}
              />
              <button onClick={sendMsg} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: `${GOLD}18`, border: `1px solid ${GOLD}33`, color: GOLD, fontSize: 10 }}>▶</button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: side panel
  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 210,
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
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()}
          placeholder="Say something..."
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${GOLD}22`, color: '#f1f5f9', fontSize: 10, fontFamily: FONT, outline: 'none' }}
        />
        <button onClick={sendMsg} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: `${GOLD}18`, border: `1px solid ${GOLD}33`, color: GOLD, fontSize: 10 }}>▶</button>
      </div>
    </div>
  );
}

// ── Payout banner ─────────────────────────────────────────────────────────────

function PayoutBanner({ results, myUsername }) {
  if (!results) return null;
  const mine = results.find(r => r.username === myUsername);
  if (!mine) return null;
  const net  = mine.chipChange;
  const bj   = mine.hands?.some(h => h.outcome === 'blackjack');
  const win  = net > 0;
  const push = net === 0;
  const bust = !win && !push;

  if (push) {
    return (
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 150, textAlign: 'center', pointerEvents: 'none',
        animation: 'bannerPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, fontFamily: FONT, color: '#94a3b8', letterSpacing: '0.1em' }}>PUSH</div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: FONT }}>Bet returned</div>
      </div>
    );
  }

  if (bust) {
    return (
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 150, textAlign: 'center', pointerEvents: 'none',
        animation: 'bannerPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: FONT, color: '#ef4444', textShadow: '0 0 20px #ef444488', letterSpacing: '0.08em' }}>
          {mine.hands?.some(h => h.outcome === 'bust') ? 'BUST' : 'DEALER WINS'}
        </div>
        <div style={{ fontSize: 14, color: '#ef4444', fontFamily: FONT, marginTop: 4 }}>
          {net.toLocaleString()} OTJ
        </div>
      </div>
    );
  }

  // WIN or BLACKJACK — full drama
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      {/* Background flash */}
      <div style={{
        position: 'absolute', inset: 0,
        background: bj
          ? `radial-gradient(ellipse at center, ${GOLD}33 0%, transparent 70%)`
          : 'radial-gradient(ellipse at center, rgba(34,197,94,0.2) 0%, transparent 70%)',
        animation: 'flashIn 0.4s ease-out',
      }} />

      {/* Confetti particles */}
      {bj && Array.from({ length: 16 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          width: 8, height: 8,
          background: [GOLD, '#ef4444', '#22c55e', '#3b82f6', '#a855f7'][i % 5],
          borderRadius: Math.random() > 0.5 ? '50%' : '0',
          animation: `confetti${i % 4} ${0.6 + Math.random() * 0.8}s ease-out forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Main content */}
      <div style={{
        textAlign: 'center',
        animation: 'winPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        position: 'relative',
      }}>
        {/* Card emoji for blackjack */}
        {bj && (
          <div style={{
            fontSize: 80, marginBottom: 8,
            animation: 'cardFlip 0.6s ease-out',
            filter: `drop-shadow(0 0 20px ${GOLD})`,
          }}>🂡</div>
        )}

        {/* Main label */}
        <div style={{
          fontSize: bj ? 56 : 48,
          fontWeight: 900,
          fontFamily: FONT,
          color: bj ? GOLD : '#22c55e',
          textShadow: bj
            ? `0 0 40px ${GOLD}, 0 0 80px ${GOLD}88`
            : '0 0 40px rgba(34,197,94,0.8)',
          letterSpacing: bj ? '-0.02em' : '0.04em',
          lineHeight: 1,
          marginBottom: 12,
        }}>
          {bj ? 'BLACKJACK!' : 'WIN!'}
        </div>

        {/* Amount */}
        <div style={{
          display: 'inline-block',
          padding: '8px 24px',
          borderRadius: 40,
          background: bj ? `linear-gradient(135deg, ${GOLD}33, ${GOLD}11)` : 'rgba(34,197,94,0.15)',
          border: `2px solid ${bj ? GOLD : '#22c55e'}`,
          fontSize: 28,
          fontWeight: 800,
          color: bj ? GOLD : '#22c55e',
          fontFamily: FONT,
          boxShadow: bj ? `0 0 30px ${GOLD}44` : '0 0 30px rgba(34,197,94,0.3)',
          animation: 'slideUp 0.4s 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          +{net.toLocaleString()} OTJ
        </div>

        {bj && (
          <div style={{
            marginTop: 10, fontSize: 11, color: `${GOLD}88`,
            fontFamily: FONT, letterSpacing: '0.2em',
            animation: 'slideUp 0.4s 0.4s ease both',
          }}>
            PAYS 3 TO 2
          </div>
        )}
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
      🏦 {Math.round(balance / 10000).toLocaleString()} OTJ
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

// ── SVG Caricature Dealer ─────────────────────────────────────────────────────

const DEALER_MOODS = {
  idle:        { label: 'Place your bets...',        eyebrowL: 0,   eyebrowR: 0,   mouthCurve: 0,    eyeSquint: 0,   sweat: false, pupils: 'center' },
  dealing:     { label: 'Good luck...',              eyebrowL: -4,  eyebrowR: -4,  mouthCurve: 2,    eyeSquint: 1,   sweat: false, pupils: 'down'   },
  waiting:     { label: 'Your move.',                eyebrowL: 2,   eyebrowR: -5,  mouthCurve: -2,   eyeSquint: 2,   sweat: false, pupils: 'side'   },
  bust:        { label: 'Bust! Too bad.',            eyebrowL: -6,  eyebrowR: -6,  mouthCurve: 18,   eyeSquint: 0,   sweat: false, pupils: 'up'     },
  blackjack:   { label: 'Blackjack?! Unreal.',       eyebrowL: 10,  eyebrowR: 10,  mouthCurve: -14,  eyeSquint: 3,   sweat: true,  pupils: 'wide'   },
  win:         { label: 'You got lucky.',            eyebrowL: 4,   eyebrowR: 4,   mouthCurve: -8,   eyeSquint: 1,   sweat: true,  pupils: 'down'   },
  lose:        { label: 'House wins. Always.',       eyebrowL: -8,  eyebrowR: -8,  mouthCurve: 20,   eyeSquint: 0,   sweat: false, pupils: 'center' },
  push:        { label: "We'll call it even.",       eyebrowL: 0,   eyebrowR: 2,   mouthCurve: 0,    eyeSquint: 1,   sweat: false, pupils: 'side'   },
  dealer_bust: { label: 'Dealer busts! Pay up.',     eyebrowL: 12,  eyebrowR: 12,  mouthCurve: -18,  eyeSquint: 4,   sweat: true,  pupils: 'wide'   },
};

// ── Dealer Zoom Reaction ──────────────────────────────────────────────────────
// Zooms the dealer face in for specific big moments, then retreats

const ZOOM_REACTIONS = {
  bust: {
    eyebrowL: -6, eyebrowR: -6, mouthCurve: 20, eyeSquint: 0, pupils: 'up', sweat: false,
    scale: 5, bg: 'rgba(239,68,68,0.2)', label: 'HAHA!', labelColor: '#ef4444',
    duration: 3200,
  },
  player_21: {
    eyebrowL: 10, eyebrowR: 10, mouthCurve: -14, eyeSquint: 3, pupils: 'wide', sweat: true,
    scale: 3.5, bg: `rgba(201,168,76,0.15)`, label: '...21', labelColor: GOLD,
    duration: 2600,
  },
  blackjack: {
    eyebrowL: 14, eyebrowR: 14, mouthCurve: -20, eyeSquint: 5, pupils: 'wide', sweat: true,
    scale: 6, bg: `rgba(201,168,76,0.3)`, label: 'BLACKJACK!?', labelColor: GOLD,
    duration: 4000,
  },
  dealer_bust: {
    eyebrowL: 14, eyebrowR: 14, mouthCurve: -22, eyeSquint: 5, pupils: 'wide', sweat: true,
    scale: 5, bg: 'rgba(239,68,68,0.25)', label: 'DEALER BUSTS!', labelColor: '#ef4444',
    duration: 3500,
  },
  dealer_21: {
    eyebrowL: -10, eyebrowR: -10, mouthCurve: 22, eyeSquint: 0, pupils: 'center', sweat: false,
    scale: 4, bg: 'rgba(239,68,68,0.2)', label: '21. NICE TRY.', labelColor: '#ef4444',
    duration: 3000,
  },
};

function DealerZoom({ reaction, onDone }) {
  const [animPhase, setAnimPhase] = useState('in'); // in | hold | out
  const [lookDir, setLookDir]     = useState(0);    // -4=left, 0=center, 4=right
  const r = ZOOM_REACTIONS[reaction];

  useEffect(() => {
    if (!r) return;
    const t1 = setTimeout(() => setAnimPhase('hold'), 350);
    const t2 = setTimeout(() => setAnimPhase('out'),  r.duration - 300);
    const t3 = setTimeout(() => onDone?.(),           r.duration);

    // Side-to-side nervous look — starts 400ms after appearing
    const lookSeq = [-5, 5, -4, 4, -3, 0];
    let li = 0;
    const lookInterval = setInterval(() => {
      setLookDir(lookSeq[li % lookSeq.length]);
      li++;
    }, 300);
    const stopLook = setTimeout(() => clearInterval(lookInterval), r.duration - 400);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearInterval(lookInterval); clearTimeout(stopLook);
    };
  }, [reaction]);

  if (!r) return null;

  const scale   = animPhase === 'hold' ? r.scale : animPhase === 'out' ? 0.2 : 0.2;
  const opacity = animPhase === 'out'  ? 0 : animPhase === 'hold' ? 1 : 0;

  const po = { center:{x:0,y:0}, up:{x:0,y:-3}, down:{x:0,y:2}, side:{x:3,y:0}, wide:{x:0,y:0} }[r.pupils] || {x:0,y:0};
  const ps = r.pupils === 'wide' ? 6 : 4;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 160, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* BG tint */}
      <div style={{
        position: 'absolute', inset: 0, background: r.bg,
        opacity: animPhase === 'hold' ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} />

      {/* Hands gripping bottom edge over UI — slide up from below */}
      {animPhase === 'hold' && ['bust','blackjack','dealer_bust'].includes(reaction) && (
        <>
          {/* Left hand — grips bottom-left, fingers pointing up */}
          <svg viewBox="0 0 80 120" style={{
            position: 'fixed', bottom: -10, left: '8%',
            width: 80, height: 120, zIndex: 200, overflow: 'visible',
            animation: 'handSlideUp 0.4s 0.1s cubic-bezier(0.34,1.4,0.64,1) both',
            filter: 'drop-shadow(0 -8px 20px rgba(0,0,0,0.9))',
            transform: 'scaleX(-1)',
          }}>
            {/* Palm */}
            <ellipse cx="40" cy="85" rx="28" ry="30" fill="#d4956b"/>
            <rect x="12" y="60" width="56" height="40" rx="8" fill="#d4956b"/>
            {/* Fingers */}
            <rect x="14" y="20" width="14" height="50" rx="7" fill="#d4956b"/>
            <rect x="30" y="10" width="14" height="55" rx="7" fill="#d4956b"/>
            <rect x="46" y="14" width="14" height="52" rx="7" fill="#d4956b"/>
            <rect x="60" y="22" width="12" height="46" rx="6" fill="#d4956b"/>
            {/* Thumb */}
            <ellipse cx="8" cy="75" rx="8" ry="18" fill="#d4956b" transform="rotate(20,8,75)"/>
            {/* Knuckle lines */}
            <line x1="14" y1="55" x2="28" y2="55" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <line x1="30" y1="52" x2="44" y2="52" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <line x1="46" y1="53" x2="60" y2="53" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            {/* Cuff */}
            <rect x="10" y="90" width="60" height="28" rx="4" fill="#1a1a2e"/>
            <rect x="10" y="90" width="60" height="8" rx="2" fill={GOLD} opacity="0.8"/>
          </svg>

          {/* Right hand */}
          <svg viewBox="0 0 80 120" style={{
            position: 'fixed', bottom: -10, right: '8%',
            width: 80, height: 120, zIndex: 200, overflow: 'visible',
            animation: 'handSlideUp 0.4s 0.2s cubic-bezier(0.34,1.4,0.64,1) both',
            filter: 'drop-shadow(0 -8px 20px rgba(0,0,0,0.9))',
          }}>
            <ellipse cx="40" cy="85" rx="28" ry="30" fill="#d4956b"/>
            <rect x="12" y="60" width="56" height="40" rx="8" fill="#d4956b"/>
            <rect x="14" y="20" width="14" height="50" rx="7" fill="#d4956b"/>
            <rect x="30" y="10" width="14" height="55" rx="7" fill="#d4956b"/>
            <rect x="46" y="14" width="14" height="52" rx="7" fill="#d4956b"/>
            <rect x="60" y="22" width="12" height="46" rx="6" fill="#d4956b"/>
            <ellipse cx="72" cy="75" rx="8" ry="18" fill="#d4956b" transform="rotate(-20,72,75)"/>
            <line x1="14" y1="55" x2="28" y2="55" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <line x1="30" y1="52" x2="44" y2="52" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <line x1="46" y1="53" x2="60" y2="53" stroke="#b07040" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <rect x="10" y="90" width="60" height="28" rx="4" fill="#1a1a2e"/>
            <rect x="10" y="90" width="60" height="8" rx="2" fill={GOLD} opacity="0.8"/>
          </svg>
        </>
      )}

      {/* Sweat drops for panic reactions */}
      {r.sweat && animPhase === 'hold' && Array.from({length: 6}).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${48 + (i % 2 === 0 ? 8 : -8) + i * 2}%`,
          top: `${25 + i * 4}%`,
          fontSize: 16 + i * 2, opacity: 0.7,
          animation: `sweatDrop ${0.6 + i * 0.15}s ease-in ${i * 0.1}s infinite`,
        }}>💧</div>
      ))}

      {/* Face — true full-screen pop-out */}
      <div style={{
        position: 'absolute',
        bottom: animPhase === 'hold' ? '-5vh' : animPhase === 'out' ? '-120vh' : '-120vh',
        left: '50%',
        transform: 'translateX(-50%)',
        opacity,
        transition: animPhase === 'in'
          ? 'bottom 0.6s cubic-bezier(0.22,1.4,0.36,1), opacity 0.4s ease'
          : animPhase === 'out'
          ? 'bottom 0.4s cubic-bezier(0.55,0,1,0.45), opacity 0.35s ease-in'
          : 'none',
        zIndex: 2,
        filter: `drop-shadow(0 0 80px ${r.labelColor}) drop-shadow(0 40px 100px rgba(0,0,0,0.95))`,
      }}>
        <svg
          width="100vw"
          height="110vh"
          viewBox="0 0 90 100"
          preserveAspectRatio="xMidYMax meet"
          style={{ overflow: 'visible', display: 'block' }}
        >
          {/* Hat */}
          <rect x="22" y="2" width="46" height="28" rx="3" fill="#1a1a1a" stroke={GOLD} strokeWidth="1.5"/>
          <rect x="14" y="28" width="62" height="7" rx="2" fill="#111" stroke={GOLD} strokeWidth="1"/>
          <rect x="22" y="24" width="46" height="5" rx="1" fill={GOLD} opacity="0.8"/>
          {/* Head */}
          <rect x="36" y="87" width="18" height="12" rx="3" fill="#c8956b"/>
          <ellipse cx="45" cy="64" rx="28" ry="30" fill="#d4956b"/>
          <ellipse cx="40" cy="50" rx="10" ry="7" fill="rgba(255,255,255,0.12)" transform="rotate(-15,40,50)"/>
          <ellipse cx="25" cy="70" rx="7" ry="5" fill="rgba(220,100,80,0.25)"/>
          <ellipse cx="65" cy="70" rx="7" ry="5" fill="rgba(220,100,80,0.25)"/>
          {/* Eyebrows */}
          <path d={`M 26 ${56+r.eyebrowL} Q 33 ${50+r.eyebrowL} 38 ${56+r.eyebrowL*0.3}`} stroke="#3a1f0a" strokeWidth="4" strokeLinecap="round" fill="none"/>
          <path d={`M 52 ${56+r.eyebrowR*0.3} Q 57 ${50+r.eyebrowR} 64 ${56+r.eyebrowR}`} stroke="#3a1f0a" strokeWidth="4" strokeLinecap="round" fill="none"/>
          {/* Eyes */}
          <ellipse cx="32" cy="63" rx="8" ry={Math.max(1, 9 - r.eyeSquint * 0.6)} fill="white"/>
          <ellipse cx="58" cy="63" rx="8" ry={Math.max(1, 9 - r.eyeSquint * 0.6)} fill="white"/>
          <circle cx={32 + po.x + lookDir} cy={63+po.y} r={ps} fill="#2c1a0a" style={{ transition: 'cx 0.15s ease' }}/>
          <circle cx={58 + po.x + lookDir} cy={63+po.y} r={ps} fill="#2c1a0a" style={{ transition: 'cx 0.15s ease' }}/>
          <circle cx="34" cy="61" r="1.8" fill="white" opacity="0.9"/>
          <circle cx="60" cy="61" r="1.8" fill="white" opacity="0.9"/>
          {/* Squint lines */}
          {r.eyeSquint > 2 && <>
            <path d={`M 24 ${66+r.eyeSquint*0.5} Q 32 ${64+r.eyeSquint*0.3} 40 ${66+r.eyeSquint*0.5}`} stroke="#b07040" strokeWidth="1.5" fill="none" opacity="0.5"/>
            <path d={`M 50 ${66+r.eyeSquint*0.5} Q 58 ${64+r.eyeSquint*0.3} 66 ${66+r.eyeSquint*0.5}`} stroke="#b07040" strokeWidth="1.5" fill="none" opacity="0.5"/>
          </>}
          {/* Nose */}
          <ellipse cx="45" cy="72" rx="6" ry="5" fill="#c07a50"/>
          <ellipse cx="41" cy="74" rx="3" ry="2.5" fill="#a06040" opacity="0.6"/>
          <ellipse cx="49" cy="74" rx="3" ry="2.5" fill="#a06040" opacity="0.6"/>
          {/* Mouth */}
          <path d={`M 33 ${80-r.mouthCurve*0.2} Q 45 ${80+r.mouthCurve*0.4} 57 ${80-r.mouthCurve*0.2}`}
            stroke="#7a3520" strokeWidth="3" strokeLinecap="round" fill="none"/>
          {r.mouthCurve > 12 && (
            <path d={`M 36 ${79-r.mouthCurve*0.1} Q 45 ${83+r.mouthCurve*0.3} 54 ${79-r.mouthCurve*0.1}`} fill="white" opacity="0.85"/>
          )}
          {/* Bow tie */}
          <polygon points="35,91 42,87 42,95" fill={GOLD} opacity="0.9"/>
          <polygon points="55,91 48,87 48,95" fill={GOLD} opacity="0.9"/>
          <circle cx="45" cy="91" r="3.5" fill={GOLD}/>
        </svg>
      </div>

      {/* Label */}
      <div style={{
        position: 'relative', zIndex: 3, marginTop: 16,
        fontSize: 28, fontWeight: 900, fontFamily: FONT,
        color: r.labelColor,
        textShadow: `0 0 30px ${r.labelColor}`,
        letterSpacing: '0.06em',
        opacity: animPhase === 'hold' ? 1 : 0,
        transform: animPhase === 'hold' ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}>
        {r.label}
      </div>
    </div>
  );
}

function DealerCharacter({ mood = 'idle', isDealing }) {
  const m = DEALER_MOODS[mood] || DEALER_MOODS.idle;
  const [blink, setBlink] = useState(false);
  const [prevMood, setPrevMood] = useState(mood);
  const [animating, setAnimating] = useState(false);

  // Blink randomly
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Mood transition bounce
  useEffect(() => {
    if (mood !== prevMood) {
      setAnimating(true);
      setPrevMood(mood);
      setTimeout(() => setAnimating(false), 400);
    }
  }, [mood]);

  const eyeH = blink ? 1 : 10;
  const bounce = animating ? 'dealerBounce 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none';
  const dealAnim = isDealing ? 'dealerDeal 0.35s ease-in-out infinite alternate' : 'none';

  // Pupil position
  const pupilOffset = {
    center: { x: 0, y: 0 },
    up:     { x: 0, y: -2 },
    down:   { x: 0, y: 2 },
    side:   { x: 2, y: 0 },
    wide:   { x: 0, y: 0 },
  }[m.pupils] || { x: 0, y: 0 };

  const pupilSize = m.pupils === 'wide' ? 5 : 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* SVG face */}
      <div style={{ animation: `${bounce}, ${dealAnim}`, transformOrigin: 'center bottom' }}>
        <svg width="min(90px, 22vw)" height="min(100px, 24vw)" viewBox="0 0 90 100" style={{ overflow: 'visible', filter: `drop-shadow(0 0 12px ${GOLD}55)` }}>

          {/* ── Hat ── */}
          <rect x="22" y="2" width="46" height="28" rx="3" fill="#1a1a1a" stroke={GOLD} strokeWidth="1.5"/>
          <rect x="14" y="28" width="62" height="7" rx="2" fill="#111" stroke={GOLD} strokeWidth="1"/>
          {/* hat band */}
          <rect x="22" y="24" width="46" height="5" rx="1" fill={GOLD} opacity="0.7"/>
          {/* hat shine */}
          <ellipse cx="36" cy="10" rx="8" ry="3" fill="rgba(255,255,255,0.06)" transform="rotate(-10,36,10)"/>

          {/* ── Head ── */}
          {/* Neck */}
          <rect x="36" y="87" width="18" height="12" rx="3" fill="#c8956b"/>
          {/* Head shape — exaggerated large forehead */}
          <ellipse cx="45" cy="64" rx="28" ry="30" fill="#d4956b"/>
          {/* Forehead highlight */}
          <ellipse cx="40" cy="50" rx="10" ry="7" fill="rgba(255,255,255,0.12)" transform="rotate(-15,40,50)"/>
          {/* Cheek blush */}
          <ellipse cx="25" cy="70" rx="7" ry="5" fill="rgba(220,100,80,0.2)"/>
          <ellipse cx="65" cy="70" rx="7" ry="5" fill="rgba(220,100,80,0.2)"/>

          {/* ── Eyebrows — exaggerated & animated ── */}
          {/* Left eyebrow */}
          <path
            d={`M 26 ${56 + m.eyebrowL} Q 33 ${50 + m.eyebrowL} 38 ${56 + m.eyebrowL * 0.3}`}
            stroke="#3a1f0a" strokeWidth="3.5" strokeLinecap="round" fill="none"
            style={{ transition: 'd 0.3s ease' }}
          />
          {/* Right eyebrow */}
          <path
            d={`M 52 ${56 + m.eyebrowR * 0.3} Q 57 ${50 + m.eyebrowR} 64 ${56 + m.eyebrowR}`}
            stroke="#3a1f0a" strokeWidth="3.5" strokeLinecap="round" fill="none"
            style={{ transition: 'd 0.3s ease' }}
          />

          {/* ── Eyes ── */}
          {/* Left eye white */}
          <ellipse cx="32" cy="63" rx="8" ry={eyeH * 0.8 - m.eyeSquint * 0.5} fill="white" style={{ transition: 'ry 0.1s' }}/>
          {/* Right eye white */}
          <ellipse cx="58" cy="63" rx="8" ry={eyeH * 0.8 - m.eyeSquint * 0.5} fill="white" style={{ transition: 'ry 0.1s' }}/>
          {/* Left pupil */}
          <circle cx={32 + pupilOffset.x} cy={63 + pupilOffset.y} r={blink ? 0 : pupilSize} fill="#2c1a0a" style={{ transition: 'r 0.1s, cx 0.2s, cy 0.2s' }}/>
          {/* Right pupil */}
          <circle cx={58 + pupilOffset.x} cy={63 + pupilOffset.y} r={blink ? 0 : pupilSize} fill="#2c1a0a" style={{ transition: 'r 0.1s, cx 0.2s, cy 0.2s' }}/>
          {/* Eye shine */}
          {!blink && <><circle cx={34} cy={61} r={1.5} fill="white" opacity="0.8"/><circle cx={60} cy={61} r={1.5} fill="white" opacity="0.8"/></>}
          {/* Lower eyelid squint lines */}
          {m.eyeSquint > 1 && <>
            <path d={`M 24 ${65 + m.eyeSquint} Q 32 ${63 + m.eyeSquint} 40 ${65 + m.eyeSquint}`} stroke="#b07040" strokeWidth="1.5" fill="none" opacity="0.5"/>
            <path d={`M 50 ${65 + m.eyeSquint} Q 58 ${63 + m.eyeSquint} 66 ${65 + m.eyeSquint}`} stroke="#b07040" strokeWidth="1.5" fill="none" opacity="0.5"/>
          </>}

          {/* ── Nose — big caricature nose ── */}
          <ellipse cx="45" cy="72" rx="6" ry="5" fill="#c07a50"/>
          <ellipse cx="41" cy="74" rx="3" ry="2.5" fill="#a06040" opacity="0.6"/>
          <ellipse cx="49" cy="74" rx="3" ry="2.5" fill="#a06040" opacity="0.6"/>
          {/* nose bridge */}
          <path d="M 43 63 Q 42 68 41 73" stroke="#b07040" strokeWidth="1.5" fill="none" opacity="0.4"/>

          {/* ── Mouth — animated curve ── */}
          <path
            d={`M 33 ${80 - m.mouthCurve * 0.2} Q 45 ${80 + m.mouthCurve * 0.4} 57 ${80 - m.mouthCurve * 0.2}`}
            stroke="#7a3520" strokeWidth="2.5" strokeLinecap="round" fill="none"
            style={{ transition: 'd 0.35s ease' }}
          />
          {/* Teeth on big smile */}
          {m.mouthCurve > 12 && (
            <path d={`M 36 ${79 - m.mouthCurve * 0.1} Q 45 ${83 + m.mouthCurve * 0.3} 54 ${79 - m.mouthCurve * 0.1}`}
              fill="white" opacity="0.85"/>
          )}
          {/* Frown line corners */}
          {m.mouthCurve < -8 && <>
            <path d={`M 33 ${80 - m.mouthCurve * 0.2} Q 30 ${82 - m.mouthCurve * 0.1} 29 ${85}`} stroke="#7a3520" strokeWidth="1.5" fill="none" opacity="0.5"/>
            <path d={`M 57 ${80 - m.mouthCurve * 0.2} Q 60 ${82 - m.mouthCurve * 0.1} 61 ${85}`} stroke="#7a3520" strokeWidth="1.5" fill="none" opacity="0.5"/>
          </>}

          {/* ── Ears ── */}
          <ellipse cx="17" cy="64" rx="5" ry="7" fill="#c8956b"/>
          <ellipse cx="17" cy="64" rx="3" ry="4.5" fill="#b07855"/>
          <ellipse cx="73" cy="64" rx="5" ry="7" fill="#c8956b"/>
          <ellipse cx="73" cy="64" rx="3" ry="4.5" fill="#b07855"/>

          {/* ── Collar & Bow tie ── */}
          <path d="M 30 98 L 36 88 L 45 92 L 54 88 L 60 98" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
          {/* bow tie */}
          <polygon points="35,91 42,87 42,95" fill={GOLD} opacity="0.9"/>
          <polygon points="55,91 48,87 48,95" fill={GOLD} opacity="0.9"/>
          <circle cx="45" cy="91" r="3.5" fill={GOLD}/>

          {/* ── Sweat drops ── */}
          {m.sweat && <>
            <ellipse cx="70" cy="52" rx="2.5" ry="4" fill="#7dd3fc" opacity="0.8" style={{ animation: 'sweatDrop 0.8s ease-in infinite' }}/>
            <ellipse cx="74" cy="58" rx="2" ry="3" fill="#7dd3fc" opacity="0.6" style={{ animation: 'sweatDrop 0.8s ease-in 0.3s infinite' }}/>
          </>}

          {/* ── Dealing arm ── */}
          {isDealing && (
            <g style={{ animation: 'dealArm 0.4s ease-in-out infinite alternate', transformOrigin: '20px 85px' }}>
              <line x1="20" y1="88" x2="5" y2="75" stroke="#c8956b" strokeWidth="5" strokeLinecap="round"/>
              {/* card in hand */}
              <rect x="-4" y="62" width="14" height="18" rx="2" fill="#fff" stroke={GOLD} strokeWidth="1.5" transform="rotate(-20,-4,62)"/>
            </g>
          )}

        </svg>
      </div>

      {/* Speech bubble */}
      <div style={{
        position: 'relative',
        background: 'rgba(5,8,13,0.92)',
        border: `1px solid ${GOLD}44`,
        borderRadius: 10, padding: '5px 12px',
        fontSize: 9, color: `${GOLD}dd`, fontFamily: FONT,
        letterSpacing: '0.05em', textAlign: 'center',
        maxWidth: 180, lineHeight: 1.4,
        boxShadow: `0 4px 16px rgba(0,0,0,0.5)`,
        animation: animating ? 'bubblePop 0.3s ease' : 'none',
      }}>
        {/* bubble tail */}
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: `6px solid ${GOLD}44`,
        }}/>
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


// ── Cut Card Modal ────────────────────────────────────────────────────────────

function CutCardModal({ data, position, onPositionChange, onConfirm, timerLeft }) {
  const total    = data.deckSize;
  const pct      = Math.round((position / total) * 100);
  const numCards = NUM_DECKS_VISUAL * 52;

  // Visual deck — show as stacked card layers
  const DECK_HEIGHT = 160;
  const cutY = DECK_HEIGHT - Math.round((position / total) * DECK_HEIGHT);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 301, background: '#0a0e14',
        border: `1px solid ${GOLD}55`, borderRadius: 16,
        padding: '24px 28px', width: 320, fontFamily: FONT,
        boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 40px ${GOLD}22`,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.1em' }}>CUT THE DECK</div>
          <div style={{ fontSize: 9, color: '#4a5568', marginTop: 4, fontFamily: FONT }}>
            Drag the slider to choose where to cut
          </div>
        </div>

        {/* Visual deck with cut indicator */}
        <div style={{ position: 'relative', height: DECK_HEIGHT + 20, marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          {/* Bottom half */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: 80, height: DECK_HEIGHT - cutY,
            background: 'linear-gradient(180deg, #1a1060 0%, #2d1b8e 100%)',
            border: `1px solid ${GOLD}44`, borderRadius: '0 0 4px 4px',
            boxShadow: '4px 4px 0 rgba(0,0,0,0.3)',
          }}>
            <div style={{ position: 'absolute', top: 4, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: `${GOLD}88`, fontFamily: FONT }}>
              {total - position} cards
            </div>
          </div>

          {/* Top half (separated) */}
          <div style={{
            position: 'absolute', bottom: DECK_HEIGHT - cutY + 12, left: '50%', transform: 'translateX(-50%)',
            width: 80, height: cutY,
            background: 'linear-gradient(180deg, #312e81 0%, #1a1060 100%)',
            border: `1px solid ${GOLD}66`, borderRadius: '4px 4px 0 0',
            boxShadow: '-4px -4px 0 rgba(0,0,0,0.3)',
            transition: 'bottom 0.1s',
          }}>
            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: `${GOLD}88`, fontFamily: FONT }}>
              {position} cards
            </div>
          </div>

          {/* Cut line */}
          <div style={{
            position: 'absolute', bottom: DECK_HEIGHT - cutY + 5, left: '50%',
            transform: 'translateX(-50%)',
            width: 100, height: 2,
            background: GOLD, borderRadius: 1,
            boxShadow: `0 0 8px ${GOLD}`,
          }} />

          {/* Cut card indicator */}
          <div style={{
            position: 'absolute', bottom: DECK_HEIGHT - cutY + 1, right: 'calc(50% - 56px)',
            fontSize: 8, color: GOLD, fontFamily: FONT, whiteSpace: 'nowrap',
          }}>◀ cut</div>
        </div>

        {/* Slider */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="range"
            min={data.minCut} max={data.maxCut} step={1}
            value={position}
            onChange={e => onPositionChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: GOLD, height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#374151', fontFamily: FONT, marginTop: 4 }}>
            <span>Front</span>
            <span style={{ color: GOLD, fontWeight: 700 }}>{pct}% through deck</span>
            <span>Back</span>
          </div>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: timerLeft <= 5 ? '#ef4444' : '#4a5568', fontFamily: FONT }}>
            {timerLeft <= 5 ? `⚠️ Auto-cutting in ${timerLeft}s` : `${timerLeft}s to cut`}
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: timerLeft <= 5 ? '#ef4444' : GOLD, width: `${(timerLeft / data.timeLimit) * 100}%`, transition: 'width 1s linear, background 0.3s', borderRadius: 1 }} />
          </div>
        </div>

        {/* Confirm button */}
        <button onClick={onConfirm} style={{
          width: '100%', padding: '12px', borderRadius: 8, cursor: 'pointer',
          background: `linear-gradient(135deg, ${GOLD}, #a07828)`,
          border: 'none', color: '#000', fontSize: 12, fontWeight: 900,
          fontFamily: FONT, letterSpacing: '0.08em',
          boxShadow: `0 4px 20px ${GOLD}44`,
        }}>
          ✂️ CUT HERE
        </button>
      </div>
    </>
  );
}

const NUM_DECKS_VISUAL = 5;


// ── Hand History Panel ────────────────────────────────────────────────────────

function HandHistoryPanel({ history, onClose }) {
  const SUIT_SYM = { h:'♥', d:'♦', c:'♣', s:'♠' };
  const SUIT_COLOR = { h:'#dc2626', d:'#dc2626', c:'#1e1b4b', s:'#1e1b4b' };

  function MiniCard({ card }) {
    if (!card || card === '??') return (
      <div style={{ width:18, height:24, borderRadius:3, background:'#1a1060', border:'1px solid #6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#6366f1' }}>🂠</div>
    );
    const val = card.slice(0,-1), suit = card.slice(-1);
    return (
      <div style={{ width:18, height:24, borderRadius:3, background: suit==='h'||suit==='d'?'#fff5f5':'#f0f0ff', border:'1px solid rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:SUIT_COLOR[suit]||'#111', lineHeight:1 }}>
        {val}<span style={{fontSize:6}}>{SUIT_SYM[suit]}</span>
      </div>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'flex-end', justifyContent:'center',
    }} onClick={onClose}>
      <div style={{
        width:'100%', maxWidth:640, maxHeight:'80vh',
        background:'#0a0e14', borderRadius:'16px 16px 0 0',
        border:`1px solid ${GOLD}33`, borderBottom:'none',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid ${GOLD}22` }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#f1f5f9', fontFamily:FONT }}>HAND HISTORY</div>
            <div style={{ fontSize:9, color:'#374151', fontFamily:FONT }}>{history.length} hands recorded this session</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#6b7280', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        {/* List */}
        <div style={{ overflowY:'auto', flex:1, padding:'8px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          {history.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, fontSize:11, color:'#374151', fontFamily:FONT }}>No hands played yet</div>
          ) : history.map(hand => {
            const win = hand.chipChange > 0;
            const push = hand.chipChange === 0;
            const bj = hand.hands?.some(h => h.outcome === 'blackjack');
            const outcomeColor = bj ? GOLD : win ? '#22c55e' : push ? '#94a3b8' : '#ef4444';
            const outcomeLabel = bj ? 'BLACKJACK' : win ? 'WIN' : push ? 'PUSH' : hand.hands?.some(h=>h.outcome==='bust') ? 'BUST' : 'LOSE';

            return (
              <div key={hand.id} style={{
                background:'rgba(255,255,255,0.02)', border:`1px solid ${outcomeColor}22`,
                borderLeft:`3px solid ${outcomeColor}`, borderRadius:8,
                padding:'10px 12px',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:8, color:'#374151', fontFamily:FONT }}>HAND #{hand.handNumber}</span>
                    <span style={{ fontSize:8, color:'#374151', fontFamily:FONT }}>{hand.timestamp}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:outcomeColor, fontFamily:FONT, letterSpacing:'0.08em' }}>{outcomeLabel}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:outcomeColor, fontFamily:FONT }}>
                      {hand.chipChange > 0 ? '+' : ''}{hand.chipChange?.toLocaleString()} OTJ
                    </span>
                  </div>
                </div>

                <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  {/* Player hands */}
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:7, color:'#374151', fontFamily:FONT, marginBottom:3 }}>YOU</div>
                    {hand.hands?.map((h, hi) => (
                      <div key={hi} style={{ display:'flex', gap:2, alignItems:'center', marginBottom:2 }}>
                        {h.cards?.map((c,ci) => <MiniCard key={ci} card={c} />)}
                        <span style={{ fontSize:8, color:'#94a3b8', marginLeft:4, fontFamily:FONT }}>{calcHandTotal(h.cards)}</span>
                        <span style={{ fontSize:7, color:outcomeColor, marginLeft:2, fontFamily:FONT, textTransform:'uppercase' }}>{h.outcome}</span>
                      </div>
                    ))}
                  </div>

                  {/* Dealer hand */}
                  <div>
                    <div style={{ fontSize:7, color:'#374151', fontFamily:FONT, marginBottom:3 }}>DEALER</div>
                    <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                      {hand.dealerCards?.map((c,ci) => <MiniCard key={ci} card={c} />)}
                      <span style={{ fontSize:8, color:'#94a3b8', marginLeft:4, fontFamily:FONT }}>
                        {hand.dealerTotal > 21 ? `BUST(${hand.dealerTotal})` : hand.dealerTotal}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
  const [cutCardUI, setCutCardUI]       = useState(null); // { deckSize, minCut, maxCut, timeLimit, cutterName }
  const [cutPosition, setCutPosition]   = useState(0);
  const [cutTimer, setCutTimer]         = useState(0);
  const [cutPending, setCutPending]     = useState(null); // { cutterName } for spectators
  const [projectiles, setProjectiles]   = useState([]);
  const [dealerMood, setDealerMood]     = useState('idle');
  const [isDealing, setIsDealing]       = useState(false);
  const [cardProjectiles, setCardProjectiles] = useState([]);
  const cardProjectileId = useRef(0);
  const [zoomReaction, setZoomReaction] = useState(null);
  const [handHistory, setHandHistory]   = useState([]); // last 20 hands
  const [showHistory, setShowHistory]   = useState(false);
  const projectileId = useRef(0);
  const tableRef     = useRef(null);
  const roomRef      = useRef(null);
  const leaveCalledRef = useRef(false);

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

        // ── Watch game_state for zoom-worthy moments ──
        let lastPhase = 'betting';
        room.onMessage('game_state', state => {
          if (!mounted) return;
          // After a player acts (player_turn phase) check their hand total
          if (state.phase === 'player_turn' || state.phase === 'dealer_turn' || state.phase === 'payout') {
            const myIdx = state.mySeat;
            if (myIdx != null && myIdx !== -1 && state.seats?.[myIdx]) {
              const mySeatData = state.seats[myIdx];
              const activeHand = mySeatData.hands?.[mySeatData.activeHand];
              if (activeHand?.cards?.length >= 2) {
                const total = calcHandTotal(activeHand.cards);
                const wasBust = activeHand.status === 'bust';
                const is21    = total === 21 && !wasBust;
                const isBJ    = activeHand.cards.length === 2 && total === 21;
                if (wasBust)  setZoomReaction('bust');
                else if (isBJ) setZoomReaction('blackjack');
                else if (is21) setZoomReaction('player_21');
              }
            }
            // Dealer bust check
            if (state.phase === 'payout' && state.dealerCards?.length >= 2) {
              const dt = calcHandTotal(state.dealerCards);
              if (dt > 21) setZoomReaction('dealer_bust');
              else if (dt === 21) setZoomReaction('dealer_21');
            }
          }
          lastPhase = state.phase;
        });

        room.onMessage('bet_timer',       ({ timeLeft }) => mounted && setBetTimer(timeLeft));
        room.onMessage('turn_change',     ({ timeLeft }) => mounted && setTurnTimer(timeLeft));
        room.onMessage('turn_timer',      ({ timeLeft }) => mounted && setTurnTimer(timeLeft));
        room.onMessage('new_round', () => mounted && (setCurrentBet(0), setBetLocked(false), setTurnTimer(null), setBetTimer(20), setPayoutResults(null), setDealerMood('idle'), setCardProjectiles([]), setCutPending(null), setZoomReaction(null)));
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

        room.onMessage('payout_results', ({ results, dealerCards, dealerTotal }) => {
          if (!mounted) return;
          setPayoutResults(results);
          // Record this hand in history
          setHandHistory(prev => {
            const mine = results.find(r => r.username === username);
            if (!mine) return prev;
            const entry = {
              id:           Date.now(),
              handNumber:   gameState?.handNumber || 0,
              dealerCards:  dealerCards || [],
              dealerTotal:  dealerTotal || 0,
              hands:        mine.hands || [],
              chipChange:   mine.chipChange,
              newChips:     mine.newChips,
              timestamp:    new Date().toLocaleTimeString(),
            };
            return [entry, ...prev].slice(0, 20);
          });
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

        room.onMessage('cut_card_request', (data) => {
          if (!mounted) return;
          setCutCardUI(data);
          setCutPosition(Math.floor((data.minCut + data.maxCut) / 2));
          setCutTimer(data.timeLimit);
          const iv = setInterval(() => {
            setCutTimer(t => {
              if (t <= 1) { clearInterval(iv); setCutCardUI(null); return 0; }
              return t - 1;
            });
          }, 1000);
        });

        room.onMessage('cut_card_pending', ({ cutterName }) => {
          if (mounted) setCutPending({ cutterName });
        });
        room.onMessage('error', ({ message }) => { if (mounted) { setError(message); setTimeout(() => setError(null), 3000); } });

        room.onLeave(code => {
          if (!mounted || leaveCalledRef.current) return;
          if (code !== 1000) {
            retries++;
            if (retries <= MAX_RETRIES) {
              setError(`Disconnected — reconnecting (${retries}/${MAX_RETRIES})...`);
              setTimeout(() => mounted && connect(), 3000);
            } else {
              setError('Could not connect to table. Please try again.');
              setTimeout(() => navigate('/blackjack'), 3000);
            }
          } else navigate('/blackjack');
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
    return () => {
      mounted = false;
      if (!leaveCalledRef.current && roomRef.current) {
        try { roomRef.current.leave(); } catch {}
      }
    };
  }, [roomId, tier]);

  function send(action, data = {}) { roomRef.current?.send(action, data); }

  // Derived
  const { phase, seats, mySeat, currentSeat, dealerCards, dealerTotal, config } = gameState || {};
  const me         = (mySeat != null && mySeat !== -1) ? seats?.[mySeat] : null;
  const myHand     = me?.hands?.[me?.activeHand];
  const isMyTurn   = phase === 'player_turn' && currentSeat === mySeat && mySeat !== -1;
  const isBetting  = phase === 'betting';
  const isSeated   = mySeat != null && mySeat !== -1;

  function cardRank(c) { return ['T','J','Q','K'].includes(c[0]) ? 10 : c[0] === 'A' ? 11 : parseInt(c[0]); }
  const myCanDouble = isMyTurn && myHand?.cards.length === 2 && (me?.chips || 0) >= myHand.bet;
  const myCanSplit  = isMyTurn && myHand?.cards.length === 2 && cardRank(myHand.cards[0]) === cardRank(myHand.cards[1]);

  function handleSeatClick(seatIndex) {
    if (isSeated) return;
    if (phase && phase !== 'betting') return;
    const minBuyIn = config?.minBet ? config.minBet * 5 : 500;
    const amount = buyIn || minBuyIn;
    // Send sit_down directly — no modal needed, buyIn comes from lobby
    roomRef.current?.send('sit_down', { seatIndex, buyIn: amount });
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
    <div data-page="bj-table" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#03060a', fontFamily: FONT,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        height: 44, zIndex: 25,
        background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${GOLD}22`,
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
      }}>
        <button onClick={() => {
          leaveCalledRef.current = true;
          if (roomRef.current) { try { roomRef.current.leave(true); } catch {} roomRef.current = null; }
          sessionStorage.removeItem(SESSION_KEY);
          navigate('/blackjack');
        }} style={{
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 10, fontFamily: FONT,
        }}>← LEAVE</button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.1em' }}>🎰 OTJ BLACKJACK</span>
          <button onClick={() => setShowHistory(true)} style={{ marginLeft: 8, fontSize: 9, color: GOLD, background: `${GOLD}15`, border: `1px solid ${GOLD}33`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontFamily: FONT }}>📋 HISTORY</button>
          <span style={{ fontSize: 9, color: '#374151', marginLeft: 8 }}>{config?.label}</span>
        </div>

        <HouseBankPill />
        {me && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontFamily: FONT }}>
              🪙 {me.chips?.toLocaleString()} OTJ
            </div>
            <div style={{ fontSize: 8, color: '#374151', fontFamily: FONT }}>OTJ BUCKS</div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ flexShrink: 0, textAlign: 'center', background: 'rgba(239,68,68,0.9)', color: '#fff', padding: '6px 20px', fontSize: 11, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Payout */}
      <PayoutBanner results={payoutResults} myUsername={username} />

      {/* Table felt */}
      <div ref={tableRef} style={{
        position: 'relative', width: '100%', maxWidth: 920,
        flex: 1,
        maxHeight: 'min(calc(100dvh - 44px - 110px), 620px)',
        margin: '0 auto',
        background: 'radial-gradient(ellipse at 50% 35%, #0e4425 0%, #082b18 55%, #030f08 100%)',
        borderTop: '6px solid #7c4a1e',
        overflow: 'hidden',
      }}>

        {/* Felt weave */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '8px 8px', pointerEvents: 'none' }} />

        {/* Watermark */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, fontWeight: 900, color: 'rgba(201,168,76,0.05)', letterSpacing: '0.35em', fontFamily: FONT, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          ★ OVERTIME JOURNAL CASINO ★
        </div>

        {/* Shoe progress bar */}
        {gameState?.shoe && (
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ fontSize: 7, color: `${GOLD}55`, fontFamily: FONT, letterSpacing: '0.1em' }}>
              SHOE {gameState.shoe.pctRemaining}% · {gameState.shoe.remaining} cards
            </div>
            <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: gameState.shoe.pctRemaining > 40 ? GOLD : gameState.shoe.pctRemaining > 20 ? '#f59e0b' : '#ef4444',
                width: `${gameState.shoe.pctRemaining}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* BJ payout arc text */}
        <div style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 9, color: `${GOLD}40`, fontFamily: FONT, letterSpacing: '0.2em' }}>BLACKJACK PAYS 3 TO 2</div>
          <div style={{ fontSize: 8, color: `${GOLD}25`, fontFamily: FONT, letterSpacing: '0.15em', marginTop: 2 }}>DEALER MUST STAND ON 17 AND DRAW TO 16</div>
        </div>

        {/* Dealer zone */}
        <div style={{ position: 'absolute', top: '2%', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <DealerCharacter mood={dealerMood} isDealing={isDealing} />
          {(dealerCards || []).length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
              {dealerCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                  <Card card={c} />
                </div>
              ))}
            </div>
          )}
          {dealerTotal > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: dealerTotal > 21 ? '#ef4444' : GOLD, fontFamily: FONT, marginTop: -4 }}>
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

        {/* MY hand — always centered on table regardless of seat position */}
        {me?.hands?.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '22%', left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            zIndex: 5, pointerEvents: 'none',
          }}>
            {me.hands.map((hand, hi) => (
              <Hand key={hi} hand={hand} isActive={isMyTurn && hi === me.activeHand} />
            ))}
          </div>
        )}

        {/* Phase label */}
        {phase && phase !== 'betting' && (
          <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: `${GOLD}55`, letterSpacing: '0.2em', fontFamily: FONT }}>
            {phase === 'player_turn' ? '— YOUR TURN —' : phase === 'dealer_turn' ? '— DEALER PLAYS —' : phase === 'payout' ? '— RESULTS —' : ''}
          </div>
        )}

        {/* Player seats */}
        {seats?.map((seat, i) => {
          const pos    = SEAT_POSITIONS[i];
          const isMe   = mySeat !== -1 && i === mySeat;
          const myTurn = i === currentSeat && phase === 'player_turn';
          return (
            <div key={i}
              onClick={() => {
                if (!seat) { handleSeatClick(i); }
                else if (i !== mySeat) { setEmojiTarget(i); }
              }}
              style={{
                position: 'absolute', bottom: pos.bottom, left: pos.left,
                transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                cursor: (!seat && !isSeated) || (seat && i !== mySeat) ? 'pointer' : 'default',
                zIndex: myTurn ? 6 : 3,
              }}
            >
              {!seat ? (
                <div
                  style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.015)', border: `2px dashed ${GOLD}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: !isSeated ? GOLD : '#374151', fontFamily: FONT, cursor: !isSeated ? 'pointer' : 'default', transition: 'all 0.2s' }}
                  onMouseEnter={e => { if (!isSeated) e.currentTarget.style.background = `${GOLD}15`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                >SIT</div>
              ) : (
                <>
                  {/* Hands — MY hands render centered via absolute overlay, others small at seat */}
                  {seat.hands?.length > 0 && !isMe && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      marginBottom: 3, maxWidth: 100,
                    }}>
                      {seat.hands.map((hand, hi) => (
                        <div key={hi} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <Hand hand={hand} isActive={myTurn && hi === seat.activeHand} small />
                        </div>
                      ))}
                    </div>
                  )}
                  {seat.bet > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: `${GOLD}12`, border: `1px solid ${GOLD}28`, padding: '1px 6px', borderRadius: 8, fontFamily: FONT, marginBottom: 2 }}>
                      BET {seat.bet.toLocaleString()} OTJ
                    </div>
                  )}
                  <div style={{ border: `2px solid ${myTurn ? GOLD : isMe ? '#ef4444' : 'rgba(255,255,255,0.07)'}`, borderRadius: '50%', boxShadow: myTurn ? `0 0 20px ${GOLD}88, 0 0 40px ${GOLD}44` : 'none', transition: 'all 0.3s', animation: myTurn ? 'seatPulse 1.2s ease-in-out infinite' : 'none' }}>
                    <AvatarMini config={seat.avatar?.config} size={40} />
                  </div>
                  <div style={{ background: myTurn ? `rgba(201,168,76,0.15)` : 'rgba(3,6,10,0.88)', borderRadius: 5, padding: '2px 7px', textAlign: 'center', minWidth: 68, border: `1px solid ${myTurn ? GOLD+'55' : GOLD+'18'}`, transition: 'all 0.3s' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: isMe ? '#ef4444' : myTurn ? GOLD : '#f1f5f9', fontFamily: FONT }}>
                      {seat.username?.slice(0,10)}{isMe ? ' (you)' : ''}
                      {myTurn && !isMe && <span style={{ color: GOLD, marginLeft: 3 }}>←</span>}
                    </div>
                    <div style={{ fontSize: 9, color: GOLD, fontFamily: FONT }}>{seat.chips?.toLocaleString()} OTJ</div>
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

      {isBetting && isSeated && me && config && !betLocked && (
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



      {/* Hand history panel */}
      {showHistory && (
        <HandHistoryPanel history={handHistory} onClose={() => setShowHistory(false)} />
      )}

      {/* Dealer zoom reaction — only for big moments */}
      {zoomReaction && (
        <DealerZoom
          reaction={zoomReaction}
          onDone={() => setZoomReaction(null)}
        />
      )}

      {/* Cut card modal — shown to the cutter */}
      {cutCardUI && (
        <CutCardModal
          data={cutCardUI}
          position={cutPosition}
          onPositionChange={setCutPosition}
          timerLeft={cutTimer}
          onConfirm={() => {
            send('cut_card', { position: cutPosition });
            setCutCardUI(null);
          }}
        />
      )}

      {/* Cut pending banner — shown to everyone else */}
      {cutPending && !cutCardUI && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 100, textAlign: 'center', pointerEvents: 'none',
          background: 'rgba(3,6,10,0.9)', border: `1px solid ${GOLD}44`,
          borderRadius: 12, padding: '16px 24px',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✂️</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontFamily: FONT }}>{cutPending.cutterName} is cutting the deck...</div>
        </div>
      )}

      <style>{`
        @keyframes bannerPop { from { opacity:0; transform:translate(-50%,-50%) scale(0.7); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes winPop { from { opacity:0; transform:scale(0.4); } to { opacity:1; transform:scale(1); } }
        @keyframes winHold { 0%,100% { transform:scale(1); } 50% { transform:scale(1.04); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes flashIn { from { opacity:0; } 30% { opacity:1; } to { opacity:0.6; } }
        @keyframes cardFlip { from { transform:rotateY(90deg) scale(0.5); opacity:0; } to { transform:rotateY(0deg) scale(1); opacity:1; } }
        @keyframes confetti0 { to { transform:translate(-120px,-200px) rotate(720deg); opacity:0; } }
        @keyframes confetti1 { to { transform:translate(150px,-180px) rotate(-540deg); opacity:0; } }
        @keyframes confetti2 { to { transform:translate(-80px,160px) rotate(480deg); opacity:0; } }
        @keyframes confetti3 { to { transform:translate(100px,140px) rotate(-360deg); opacity:0; } }
        html, body { height: 100%; height: -webkit-fill-available; overflow: hidden; }
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes dealerDeal { from { transform: rotate(-6deg) translateY(0px); } to { transform: rotate(6deg) translateY(-4px); } }
        @keyframes fingerGrab { from { transform: scaleX(-1) rotate(-10deg) translateX(-20px); opacity:0; } to { transform: scaleX(-1) rotate(-10deg) translateX(0); opacity:1; } }
        @keyframes handSlideUp { from { transform: translateY(140px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes dealerBounce { 0% { transform: scale(1); } 40% { transform: scale(1.12) translateY(-4px); } 70% { transform: scale(0.96) translateY(1px); } 100% { transform: scale(1); } }
        @keyframes sweatDrop { 0% { transform: translateY(0); opacity: 0.8; } 100% { transform: translateY(12px); opacity: 0; } }
        @keyframes dealArm { from { transform: rotate(-15deg); } to { transform: rotate(10deg); } }
        @keyframes bubblePop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
