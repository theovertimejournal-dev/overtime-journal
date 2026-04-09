/**
 * BlackjackLobby.jsx — OTJ Blackjack Lobby
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from 'colyseus.js';
import { supabase } from '../lib/supabase';

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL || 'wss://overtime-journal-server.up.railway.app';
const FONT = "'JetBrains Mono','SF Mono',monospace";
const GOLD = '#c9a84c';

const TIERS = {
  low:  { label: 'Low Stakes',  emoji: '🟢', min: 100,  max: 500,   minBuyIn: 500,   color: '#22c55e', desc: 'For beginners' },
  mid:  { label: 'Mid Stakes',  emoji: '🟡', min: 500,  max: 5000,  minBuyIn: 2500,  color: GOLD,      desc: 'Standard tables' },
  high: { label: 'High Roller', emoji: '🔴', min: 2500, max: 25000, minBuyIn: 12500, color: '#ef4444', desc: 'Big money' },
};

export default function BlackjackLobby({ user, profile, onEnterTable }) {
  const [selectedTier, setSelectedTier] = useState('mid');
  const [buyIn, setBuyIn]       = useState(2500);
  const [rooms, setRooms]       = useState([]);
  const [houseBank, setHouseBank] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState(null);

  const tier = TIERS[selectedTier];

  useEffect(() => {
    supabase.from('house_bank').select('balance,total_raked').eq('id', 1).maybeSingle()
      .then(({ data }) => data && setHouseBank(data));
  }, []);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const c = new Client(COLYSEUS_URL);
        const r = await c.getAvailableRooms('blackjack');
        if (mounted) setRooms(r || []);
      } catch { if (mounted) setRooms([]); }
    }
    poll();
    const iv = setInterval(poll, 8000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  useEffect(() => { setBuyIn(TIERS[selectedTier].minBuyIn); }, [selectedTier]);

  async function join(roomId) {
    if (!user || !profile) { setStatus({ type: 'error', msg: 'Log in first' }); return; }
    const meta = rooms.find(r => r.roomId === roomId);
    const t = meta?.metadata?.tier || selectedTier;
    const b = TIERS[t]?.minBuyIn || buyIn;
    if ((profile.bankroll || 0) < b) { setStatus({ type: 'error', msg: 'Not enough OTJ Bucks' }); return; }
    setLoading(true);
    try {
      const c = new Client(COLYSEUS_URL);
      const room = await c.joinById(roomId, { userId: profile.user_id, username: profile.username, avatar: { config: profile.avatar_config }, buyIn: b });
      onEnterTable(room, { tier: t, buyIn: b, userId: profile.user_id, username: profile.username, avatarConfig: profile.avatar_config });
    } catch { setStatus({ type: 'error', msg: 'Failed to join' }); setLoading(false); }
  }

  async function quickPlay() {
    if (!user || !profile) { setStatus({ type: 'error', msg: 'Log in first' }); return; }
    if ((profile.bankroll || 0) < buyIn) { setStatus({ type: 'error', msg: 'Not enough OTJ Bucks' }); return; }
    setLoading(true); setStatus(null);
    try {
      const c = new Client(COLYSEUS_URL);
      const opts = { userId: profile.user_id, username: profile.username, avatar: { config: profile.avatar_config }, buyIn, tier: selectedTier };
      const open = rooms.find(r => r.metadata?.tier === selectedTier && r.clients < 5);
      const room = open ? await c.joinById(open.roomId, opts) : await c.create('blackjack', opts);
      onEnterTable(room, { tier: selectedTier, buyIn, userId: profile.user_id, username: profile.username, avatarConfig: profile.avatar_config });
    } catch (err) { setStatus({ type: 'error', msg: err.message }); setLoading(false); }
  }

  const activeTables = rooms.filter(r => r.metadata?.tier === selectedTier);

  return (
    <div style={{ minHeight: '100vh', background: '#03060a', fontFamily: FONT, padding: '24px 16px 60px', maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎰</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '0.06em' }}>OTJ BLACKJACK</h1>
        <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: '0.12em' }}>BEAT THE DEALER · BLACKJACK PAYS 3:2</div>
        {houseBank && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '5px 14px', borderRadius: 20, background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
            <span style={{ fontSize: 9, color: `${GOLD}88`, fontFamily: FONT }}>🏦 HOUSE BANK</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: GOLD, fontFamily: FONT }}>${Math.round((houseBank.balance || 0) / 10000).toLocaleString()}</span>
            <span style={{ fontSize: 8, color: '#374151', fontFamily: FONT }}>({(houseBank.balance || 0).toLocaleString()} Bucks)</span>
          </div>
        )}
      </div>

      {/* Tier select */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.15em', marginBottom: 8, fontFamily: FONT }}>SELECT TABLE</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(TIERS).map(([key, t]) => (
            <button key={key} onClick={() => setSelectedTier(key)} style={{
              flex: 1, padding: '12px 6px', borderRadius: 10, cursor: 'pointer',
              background: selectedTier === key ? `${t.color}18` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedTier === key ? t.color+'55' : 'rgba(255,255,255,0.06)'}`,
              textAlign: 'center', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 20, marginBottom: 3 }}>{t.emoji}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: selectedTier === key ? t.color : '#6b7280', fontFamily: FONT }}>{t.label.toUpperCase()}</div>
              <div style={{ fontSize: 8, color: '#374151', marginTop: 2, fontFamily: FONT }}>${t.min.toLocaleString()}–${t.max.toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Buy-in */}
      <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${GOLD}22` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT }}>BUY-IN AMOUNT</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: GOLD, fontFamily: FONT }}>${buyIn.toLocaleString()}</span>
        </div>
        <input type="range"
          min={tier.minBuyIn} max={Math.min(tier.minBuyIn * 10, profile?.bankroll || tier.minBuyIn)} step={tier.min}
          value={buyIn} onChange={e => setBuyIn(Number(e.target.value))}
          style={{ width: '100%', accentColor: GOLD, height: 4 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 8, color: '#374151', fontFamily: FONT }}>Min ${tier.minBuyIn.toLocaleString()}</span>
          <span style={{ fontSize: 8, color: '#374151', fontFamily: FONT }}>Balance: ${(profile?.bankroll || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Quick play */}
      <button onClick={quickPlay} disabled={loading || !user} style={{
        width: '100%', padding: '14px', borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
        background: loading ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${GOLD}, #a07828)`,
        border: 'none', color: loading ? '#4a5568' : '#000',
        fontSize: 13, fontWeight: 900, fontFamily: FONT, letterSpacing: '0.08em',
        marginBottom: 16, boxShadow: loading ? 'none' : `0 4px 24px ${GOLD}44`,
        transition: 'transform 0.1s',
      }}
      onMouseEnter={e => !loading && (e.currentTarget.style.transform = 'scale(1.02)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {loading ? 'JOINING...' : `🃏 QUICK PLAY — ${tier.label.toUpperCase()}`}
      </button>

      {status && (
        <div style={{
          padding: '8px 14px', borderRadius: 8, marginBottom: 16, fontSize: 10,
          background: status.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          color: status.type === 'error' ? '#ef4444' : '#22c55e', fontFamily: FONT,
        }}>{status.msg}</div>
      )}

      {/* Live tables */}
      <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.15em', marginBottom: 10, fontFamily: FONT }}>
        LIVE TABLES — {tier.label.toUpperCase()} ({activeTables.length})
      </div>
      {activeTables.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', border: `1px dashed ${GOLD}18`, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: '#374151', fontFamily: FONT }}>No open tables — Quick Play will create one</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeTables.map(room => (
            <div key={room.roomId} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${GOLD}15`, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', fontFamily: FONT }}>Table #{room.roomId.slice(-4).toUpperCase()}</div>
                <div style={{ fontSize: 9, color: '#4a5568', fontFamily: FONT, marginTop: 2 }}>{room.clients}/{room.maxClients || 5} players · {room.metadata?.phase || 'betting'}</div>
              </div>
              <div style={{ display: 'flex' }}>
                {Array.from({ length: room.clients }).map((_, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: tier.color, border: '1px solid #03060a', marginLeft: i > 0 ? -2 : 0 }} />
                ))}
                {Array.from({ length: Math.max(0, (room.maxClients || 5) - room.clients) }).map((_, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid #03060a', marginLeft: -2 }} />
                ))}
              </div>
              {room.clients < (room.maxClients || 5) && (
                <button onClick={() => join(room.roomId)} style={{ padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: `${GOLD}15`, border: `1px solid ${GOLD}40`, color: GOLD, fontSize: 10, fontWeight: 700, fontFamily: FONT }}>
                  JOIN →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rules */}
      <div style={{ marginTop: 28, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.01)', border: `1px solid ${GOLD}12` }}>
        <div style={{ fontSize: 9, color: `${GOLD}66`, fontFamily: FONT, letterSpacing: '0.15em', marginBottom: 8 }}>HOW TO PLAY</div>
        {[
          ['🃏', 'Get to 21 without busting — beat the dealer'],
          ['🂡', 'Blackjack (Ace + face) pays 3:2'],
          ['2×', 'Double down on any two cards'],
          ['✂️', 'Split matching cards into two hands'],
          ['🏦', '2% rake on losses builds the house bank'],
          ['⭐', 'Earn OTJ Points every hand → redeem for gift cards'],
        ].map(([icon, text]) => (
          <div key={icon} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 9, color: '#6b7280' }}>
            <span style={{ flexShrink: 0, width: 16 }}>{icon}</span>
            <span style={{ fontFamily: FONT }}>{text}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 9, color: '#1e1040', letterSpacing: '0.12em', fontFamily: FONT }}>
        ★ OVERTIME JOURNAL CASINO ★
      </div>
    </div>
  );
}
