/**
 * PokerLobby.jsx — OTJ Poker Lobby
 * 
 * Browse tables by tier, see live player counts, join or create tables.
 * Deducts buy-in from bankroll via Supabase before joining Colyseus room.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AvatarMini } from '../components/common/AvatarSystem';

const FONT = "'JetBrains Mono','SF Mono',monospace";

const TIERS = {
  rookie:      { label: 'ROOKIE',      emoji: '🟢', blinds: [5, 10],    minBuy: 200,   maxBuy: 1000,  color: '#22c55e' },
  regular:     { label: 'REGULAR',     emoji: '🔵', blinds: [25, 50],   minBuy: 1000,  maxBuy: 5000,  color: '#3b82f6' },
  high_roller: { label: 'HIGH ROLLER', emoji: '🔴', blinds: [100, 200], minBuy: 5000,  maxBuy: 10000, color: '#ef4444' },
};

function formatBucks(n) {
  if (n == null) return "$0";
  return "$" + Math.abs(Math.round(n)).toLocaleString();
}

export default function PokerLobby({ user, profile }) {
  const [selectedTier, setSelectedTier] = useState('rookie');
  const [buyIn, setBuyIn] = useState(TIERS.rookie.minBuy);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();

  const tier = TIERS[selectedTier];
  const bankroll = profile?.bankroll || 0;
  const canAfford = bankroll >= tier.minBuy;

  // Update buyIn when tier changes
  useEffect(() => {
    setBuyIn(TIERS[selectedTier].minBuy);
    setError(null);
  }, [selectedTier]);

  async function handleJoinTable() {
    if (!user || !profile) { setError('Sign in to play poker'); return; }
    if (buyIn < tier.minBuy || buyIn > tier.maxBuy) { setError(`Buy-in must be ${formatBucks(tier.minBuy)} – ${formatBucks(tier.maxBuy)}`); return; }
    if (bankroll < buyIn) { setError('Not enough OTJ Bucks!'); return; }

    setJoining(true);
    setError(null);

    try {
      // Deduct buy-in from bankroll
      const { error: deductErr } = await supabase.rpc('deduct_bucks', {
        p_user_id: user.id,
        p_amount: buyIn,
      });

      if (deductErr) {
        // Fallback: manual deduction if RPC doesn't exist
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ bankroll: bankroll - buyIn })
          .eq('user_id', user.id);
        
        if (updateErr) throw updateErr;
      }

      // Log to bucks_ledger
      await supabase.from('bucks_ledger').insert({
        user_id: user.id,
        type: 'poker_buyin',
        amount: -buyIn,
        balance_after: bankroll - buyIn,
        note: `Poker buy-in (${tier.label} table)`,
      }).catch(() => {});

      // Navigate to poker table with join params
      navigate(`/poker/table`, {
        state: {
          tier: selectedTier,
          buyIn,
          userId: user.id,
          username: profile.username,
          avatarConfig: profile.avatar_config || {},
          roomCode: roomCode || null,
        },
      });
    } catch (err) {
      console.error('Poker join error:', err);
      setError('Failed to join — try again');
      setJoining(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: FONT, padding: '24px 16px 60px', maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🃏</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          OTJ POKER
        </h1>
        <div style={{ fontSize: 11, color: '#4a5568' }}>Texas Hold'em · 6-Max · 5% Rake</div>
      </div>

      {/* Bankroll display */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(251,191,36,0.04) 100%)',
        border: '1px solid rgba(34,197,94,0.12)', borderRadius: 12,
        padding: '14px 18px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.12em' }}>YOUR BANKROLL</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>{formatBucks(bankroll)}</div>
        </div>
        {profile && (
          <AvatarMini config={profile.avatar_config} size={40} />
        )}
      </div>

      {/* Tier Selection */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
        SELECT TABLE
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {Object.entries(TIERS).map(([key, t]) => {
          const selected = selectedTier === key;
          const affordable = bankroll >= t.minBuy;
          return (
            <div
              key={key}
              onClick={() => affordable && setSelectedTier(key)}
              style={{
                padding: '16px 18px', borderRadius: 12, cursor: affordable ? 'pointer' : 'not-allowed',
                background: selected ? `${t.color}10` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selected ? `${t.color}40` : 'rgba(255,255,255,0.06)'}`,
                opacity: affordable ? 1 : 0.4,
                transition: 'all 0.15s ease',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: selected ? t.color : '#f1f5f9', marginBottom: 4 }}>
                  {t.emoji} {t.label}
                </div>
                <div style={{ fontSize: 10, color: '#4a5568' }}>
                  Blinds: {formatBucks(t.blinds[0])}/{formatBucks(t.blinds[1])}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: selected ? t.color : '#94a3b8' }}>
                  {formatBucks(t.minBuy)} – {formatBucks(t.maxBuy)}
                </div>
                <div style={{ fontSize: 9, color: '#374151' }}>buy-in range</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Buy-in Slider */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            BUY-IN AMOUNT
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: tier.color }}>{formatBucks(buyIn)}</div>
        </div>
        <input
          type="range"
          min={tier.minBuy}
          max={Math.min(tier.maxBuy, bankroll)}
          step={tier.blinds[1]}
          value={buyIn}
          onChange={e => setBuyIn(Number(e.target.value))}
          disabled={!canAfford}
          style={{ width: '100%', accentColor: tier.color }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#374151', marginTop: 4 }}>
          <span>Min: {formatBucks(tier.minBuy)}</span>
          <span>Max: {formatBucks(Math.min(tier.maxBuy, bankroll))}</span>
        </div>
      </div>

      {/* Room Code (optional — for private tables) */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
          JOIN PRIVATE TABLE (OPTIONAL)
        </div>
        <input
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="Enter 4-letter code"
          maxLength={4}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#f1f5f9', fontSize: 14, fontFamily: FONT, outline: 'none',
            boxSizing: 'border-box', textAlign: 'center', letterSpacing: '0.3em',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 11, color: '#ef4444', textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Join Button */}
      <button
        onClick={handleJoinTable}
        disabled={joining || !canAfford || !user}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
          background: !canAfford ? '#374151' : tier.color,
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: joining || !canAfford ? 'not-allowed' : 'pointer',
          fontFamily: FONT, letterSpacing: '0.08em',
          opacity: joining ? 0.6 : 1,
          transition: 'all 0.15s ease',
        }}
      >
        {joining ? 'JOINING...' : !user ? 'SIGN IN TO PLAY' : !canAfford ? 'NOT ENOUGH BUCKS' : `SIT DOWN · ${formatBucks(buyIn)}`}
      </button>

      {/* Info */}
      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: '#374151', lineHeight: 1.8 }}>
        5% rake capped at $250 · Winnings return to bankroll · 30s turn timer
      </div>

      <div style={{ textAlign: 'center', marginTop: 32, fontSize: 10, color: '#1e1040', letterSpacing: '0.12em' }}>
        ★ OVERTIME JOURNAL ★
      </div>
    </div>
  );
}
