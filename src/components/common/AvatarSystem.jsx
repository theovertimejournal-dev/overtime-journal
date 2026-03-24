/**
 * AvatarSystem.jsx — OTJ Character Avatar System
 * 
 * SVG-based avatar builder with cosmetic customization.
 * Used across: Profile, Poker, Arcade, Leaderboard, future Open World.
 * 
 * Components:
 *   <Avatar />          — renders a character (read-only display)
 *   <AvatarCreator />   — full customization UI with preview
 *   <AvatarMini />      — small avatar for leaderboards/chat
 * 
 * Avatar data shape (stored in Supabase profiles.avatar_config):
 * {
 *   base: "shark",
 *   skinTone: "#D4A574",
 *   hat: "crown",
 *   eyewear: "sunglasses",
 *   chain: "gold_chain",
 *   expression: "confident",
 *   cardBack: "flame",
 *   winAnimation: "confetti"
 * }
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ── Asset Definitions ───────────────────────────────────────────────────────

const BASES = {
  shark:   { label: "The Shark",   color: "#1e3a5f", desc: "Cool. Calculated. Dangerous.", free: true },
  whale:   { label: "The Whale",   color: "#8b5e3c", desc: "Big bets. Big energy.", free: true },
  rookie:  { label: "The Rookie",  color: "#4a9e6f", desc: "Fresh to the game.", free: true },
  grinder: { label: "The Grinder", color: "#6b5b7b", desc: "Headphones on. World off.", free: true },
  ghost:   { label: "The Ghost",   color: "#2a2a3e", desc: "You won't see them coming.", free: true },
};

const SKIN_TONES = [
  { id: "light",       color: "#FDDBB4" },
  { id: "light_med",   color: "#D4A574" },
  { id: "medium",      color: "#B07840" },
  { id: "med_dark",    color: "#8D5524" },
  { id: "dark",        color: "#5C3310" },
  { id: "deep",        color: "#3B1F0B" },
];

const HATS = {
  none:      { label: "None", price: 0, free: true },
  snapback:  { label: "Snapback", price: 200 },
  crown:     { label: "Crown", price: 500 },
  headband:  { label: "Headband", price: 200 },
  beanie:    { label: "Beanie", price: 300 },
  cowboy:    { label: "Cowboy", price: 400 },
  bucket:    { label: "Bucket Hat", price: 350 },
  visor:     { label: "Visor", price: 250 },
};

const EYEWEAR = {
  none:          { label: "None", price: 0, free: true },
  sunglasses:    { label: "Sunglasses", price: 300 },
  nerd_glasses:  { label: "Nerd Glasses", price: 200 },
  shutter:       { label: "Shutter Shades", price: 400 },
  monocle:       { label: "Monocle", price: 350 },
  sport:         { label: "Sport Visor", price: 250 },
};

const CHAINS = {
  none:        { label: "None", price: 0, free: true },
  gold_chain:  { label: "Gold Chain", price: 500 },
  diamond:     { label: "Diamond Pendant", price: 800 },
  otj_logo:    { label: "OTJ Chain", price: 1000 },
  silver:      { label: "Silver Chain", price: 400 },
  cuban:       { label: "Cuban Link", price: 700 },
};

const EXPRESSIONS = {
  neutral:    { label: "Neutral", free: true },
  confident:  { label: "Confident", free: true },
  smirk:      { label: "Smirk", free: true },
  intense:    { label: "Intense", free: true },
  chill:      { label: "Chill", free: true },
};

const CARD_BACKS = {
  classic:   { label: "Classic Red", price: 0, color: "#c41e3a", free: true },
  flame:     { label: "Flame", price: 300, color: "#ff6b35" },
  ice:       { label: "Ice", price: 300, color: "#60a5fa" },
  galaxy:    { label: "Galaxy", price: 500, color: "#7c3aed" },
  gold_foil: { label: "Gold Foil", price: 800, color: "#fbbf24" },
  neon:      { label: "Neon", price: 400, color: "#22c55e" },
  otj_red:   { label: "OTJ Red", price: 0, color: "#ef4444", free: true },
};

// ── SVG Avatar Renderer ─────────────────────────────────────────────────────

function renderAvatar(config = {}, size = 120) {
  const {
    base = "rookie",
    skinTone = "#D4A574",
    hat = "none",
    eyewear = "none",
    chain = "none",
    expression = "neutral",
  } = config;

  const baseData = BASES[base] || BASES.rookie;
  const scale = size / 120;

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* Body / Torso */}
      <ellipse cx="60" cy="105" rx="32" ry="18" fill={baseData.color} opacity="0.9" />
      
      {/* Neck */}
      <rect x="52" y="72" width="16" height="14" rx="4" fill={skinTone} />
      
      {/* Chain */}
      {chain !== "none" && renderChain(chain)}
      
      {/* Head */}
      <ellipse cx="60" cy="52" rx="26" ry="28" fill={skinTone} />
      
      {/* Ears */}
      <ellipse cx="34" cy="52" rx="5" ry="7" fill={skinTone} />
      <ellipse cx="86" cy="52" rx="5" ry="7" fill={skinTone} />
      
      {/* Eyes */}
      {renderEyes(expression, eyewear)}
      
      {/* Mouth */}
      {renderMouth(expression)}
      
      {/* Eyewear */}
      {eyewear !== "none" && renderEyewear(eyewear)}
      
      {/* Hair / Hat */}
      {hat === "none" ? renderHair(base) : renderHat(hat)}
    </svg>
  );
}

function renderEyes(expression) {
  switch (expression) {
    case "confident":
      return (<>
        <ellipse cx="49" cy="48" rx="4" ry="4.5" fill="white" />
        <ellipse cx="71" cy="48" rx="4" ry="4.5" fill="white" />
        <circle cx="50" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="72" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="50.8" cy="47.2" r="0.8" fill="white" />
        <circle cx="72.8" cy="47.2" r="0.8" fill="white" />
        {/* Confident eyebrows — slightly raised */}
        <path d="M43 40 Q49 37 55 39" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M65 39 Q71 37 77 40" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>);
    case "intense":
      return (<>
        <ellipse cx="49" cy="48" rx="4" ry="3.5" fill="white" />
        <ellipse cx="71" cy="48" rx="4" ry="3.5" fill="white" />
        <circle cx="50" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="72" cy="48" r="2.5" fill="#1a1a2e" />
        {/* Intense eyebrows — angled down */}
        <path d="M43 42 Q49 38 55 40" stroke="#1a1a2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M65 40 Q71 38 77 42" stroke="#1a1a2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>);
    case "chill":
      return (<>
        {/* Half-closed eyes */}
        <path d="M45 49 Q49 46 53 49" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M67 49 Q71 46 75 49" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M44 41 Q49 39 54 41" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M66 41 Q71 39 76 41" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>);
    case "smirk":
      return (<>
        <ellipse cx="49" cy="48" rx="4" ry="4.5" fill="white" />
        <ellipse cx="71" cy="48" rx="4" ry="4.5" fill="white" />
        <circle cx="50" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="72" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="50.8" cy="47.2" r="0.8" fill="white" />
        <circle cx="72.8" cy="47.2" r="0.8" fill="white" />
        {/* One eyebrow raised */}
        <path d="M43 40 Q49 37 55 40" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M65 41 Q71 36 77 39" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>);
    default: // neutral
      return (<>
        <ellipse cx="49" cy="48" rx="4" ry="4.5" fill="white" />
        <ellipse cx="71" cy="48" rx="4" ry="4.5" fill="white" />
        <circle cx="50" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="72" cy="48" r="2.5" fill="#1a1a2e" />
        <circle cx="50.8" cy="47.2" r="0.8" fill="white" />
        <circle cx="72.8" cy="47.2" r="0.8" fill="white" />
        <path d="M43 41 Q49 39 55 41" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M65 41 Q71 39 77 41" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>);
  }
}

function renderMouth(expression) {
  switch (expression) {
    case "confident":
      return <path d="M50 62 Q60 68 70 62" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />;
    case "smirk":
      return <path d="M50 63 Q57 63 64 61 Q68 60 72 62" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />;
    case "intense":
      return <path d="M50 64 L70 64" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />;
    case "chill":
      return <path d="M52 62 Q60 66 68 62" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M52 63 Q60 66 68 63" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
  }
}

function renderHair(base) {
  switch (base) {
    case "shark":
      return <path d="M34 45 Q38 22 60 20 Q82 22 86 45" fill="#1a1a2e" />;
    case "whale":
      return <path d="M36 48 Q40 28 60 26 Q80 28 84 48 L82 42 Q78 30 60 28 Q42 30 38 42 Z" fill="#4a3728" />;
    case "grinder":
      return (<>
        <path d="M35 50 Q38 24 60 22 Q82 24 85 50" fill="#2d1810" />
        <path d="M38 46 Q40 30 60 28 Q80 30 82 46" fill="#3d2815" />
      </>);
    case "ghost":
      return <path d="M33 48 Q36 18 60 16 Q84 18 87 48 L85 40 Q82 22 60 20 Q38 22 35 40 Z" fill="#f1f5f9" />;
    default: // rookie
      return <path d="M36 46 Q40 26 60 24 Q80 26 84 46" fill="#4a2e1a" />;
  }
}

function renderHat(hat) {
  switch (hat) {
    case "snapback":
      return (<>
        <path d="M30 42 Q32 28 60 26 Q88 28 90 42 L28 42 Z" fill="#c41e3a" />
        <rect x="28" y="40" width="64" height="6" rx="2" fill="#8b1a2b" />
        <rect x="72" y="38" width="22" height="4" rx="1" fill="#8b1a2b" /> {/* brim */}
      </>);
    case "crown":
      return (<>
        <polygon points="36,38 40,18 48,30 54,14 60,28 66,14 72,30 80,18 84,38" fill="#fbbf24" />
        <rect x="36" y="36" width="48" height="6" rx="1" fill="#eab308" />
        <circle cx="48" cy="28" r="2" fill="#ef4444" />
        <circle cx="60" cy="22" r="2" fill="#3b82f6" />
        <circle cx="72" cy="28" r="2" fill="#22c55e" />
      </>);
    case "headband":
      return <rect x="34" y="38" width="52" height="5" rx="2" fill="#ef4444" />;
    case "beanie":
      return (<>
        <path d="M34 44 Q36 22 60 18 Q84 22 86 44" fill="#3b82f6" />
        <rect x="33" y="42" width="54" height="5" rx="2" fill="#2563eb" />
        <circle cx="60" cy="16" r="4" fill="#3b82f6" />
      </>);
    case "cowboy":
      return (<>
        <path d="M32 42 Q36 26 60 24 Q84 26 88 42" fill="#8B6914" />
        <ellipse cx="60" cy="42" rx="40" ry="6" fill="#A07818" />
        <rect x="36" y="38" width="48" height="4" rx="1" fill="#6B4F12" />
      </>);
    case "bucket":
      return (<>
        <path d="M34 44 Q38 28 60 26 Q82 28 86 44" fill="#4a5568" />
        <ellipse cx="60" cy="44" rx="34" ry="5" fill="#374151" />
      </>);
    case "visor":
      return (<>
        <rect x="34" y="38" width="52" height="5" rx="2" fill="#f1f5f9" />
        <rect x="62" y="36" width="28" height="4" rx="1" fill="#e2e8f0" />
      </>);
    default:
      return null;
  }
}

function renderChain(chain) {
  switch (chain) {
    case "gold_chain":
      return (<>
        <path d="M44 80 Q48 90 60 92 Q72 90 76 80" stroke="#fbbf24" strokeWidth="2.5" fill="none" />
        <circle cx="60" cy="92" r="4" fill="#fbbf24" />
      </>);
    case "diamond":
      return (<>
        <path d="M44 80 Q48 88 60 90 Q72 88 76 80" stroke="#e2e8f0" strokeWidth="2" fill="none" />
        <polygon points="60,86 56,92 60,98 64,92" fill="#60a5fa" stroke="#e2e8f0" strokeWidth="1" />
      </>);
    case "otj_logo":
      return (<>
        <path d="M44 80 Q48 88 60 90 Q72 88 76 80" stroke="#fbbf24" strokeWidth="2.5" fill="none" />
        <circle cx="60" cy="94" r="6" fill="#c41e3a" stroke="#fbbf24" strokeWidth="1.5" />
        <text x="60" y="97" textAnchor="middle" fontSize="7" fontWeight="bold" fill="white">OTJ</text>
      </>);
    case "silver":
      return (<>
        <path d="M44 80 Q48 90 60 92 Q72 90 76 80" stroke="#94a3b8" strokeWidth="2" fill="none" />
        <circle cx="60" cy="92" r="3" fill="#cbd5e1" />
      </>);
    case "cuban":
      return (<>
        <path d="M42 80 Q46 92 60 94 Q74 92 78 80" stroke="#fbbf24" strokeWidth="3.5" fill="none" strokeDasharray="4 2" />
      </>);
    default:
      return null;
  }
}

function renderEyewear(eyewear) {
  switch (eyewear) {
    case "sunglasses":
      return (<>
        <rect x="40" y="43" width="16" height="10" rx="3" fill="#1a1a2e" opacity="0.85" />
        <rect x="64" y="43" width="16" height="10" rx="3" fill="#1a1a2e" opacity="0.85" />
        <line x1="56" y1="47" x2="64" y2="47" stroke="#1a1a2e" strokeWidth="2" />
        <line x1="40" y1="47" x2="34" y2="45" stroke="#1a1a2e" strokeWidth="1.5" />
        <line x1="80" y1="47" x2="86" y2="45" stroke="#1a1a2e" strokeWidth="1.5" />
      </>);
    case "nerd_glasses":
      return (<>
        <circle cx="49" cy="48" r="9" stroke="#4a3728" strokeWidth="2" fill="none" />
        <circle cx="71" cy="48" r="9" stroke="#4a3728" strokeWidth="2" fill="none" />
        <line x1="58" y1="48" x2="62" y2="48" stroke="#4a3728" strokeWidth="2" />
        <line x1="40" y1="48" x2="34" y2="46" stroke="#4a3728" strokeWidth="1.5" />
        <line x1="80" y1="48" x2="86" y2="46" stroke="#4a3728" strokeWidth="1.5" />
      </>);
    case "shutter":
      return (<>
        <rect x="38" y="43" width="20" height="12" rx="2" fill="#1a1a2e" />
        <rect x="62" y="43" width="20" height="12" rx="2" fill="#1a1a2e" />
        {[0,3,6,9].map(y => (
          <line key={`l${y}`} x1="39" y1={44+y} x2="57" y2={44+y} stroke="#c41e3a" strokeWidth="1" />
        ))}
        {[0,3,6,9].map(y => (
          <line key={`r${y}`} x1="63" y1={44+y} x2="81" y2={44+y} stroke="#c41e3a" strokeWidth="1" />
        ))}
        <line x1="58" y1="48" x2="62" y2="48" stroke="#1a1a2e" strokeWidth="2" />
      </>);
    case "monocle":
      return (<>
        <circle cx="71" cy="48" r="9" stroke="#fbbf24" strokeWidth="2" fill="rgba(251,191,36,0.1)" />
        <line x1="71" y1="57" x2="68" y2="80" stroke="#fbbf24" strokeWidth="1" />
      </>);
    case "sport":
      return (<>
        <path d="M36 46 Q48 42 60 43 Q72 42 84 46" stroke="#f1f5f9" strokeWidth="3" fill="none" />
        <rect x="36" y="44" width="48" height="8" rx="3" fill="rgba(241,245,249,0.15)" />
      </>);
    default:
      return null;
  }
}

// ── Display Components ──────────────────────────────────────────────────────

export function Avatar({ config = {}, size = 120, style = {} }) {
  return (
    <div style={{ width: size, height: size, ...style }}>
      {renderAvatar(config, size)}
    </div>
  );
}

export function AvatarMini({ config = {}, size = 36, style = {} }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden",
      border: "2px solid rgba(255,255,255,0.1)", ...style,
    }}>
      {renderAvatar(config, size)}
    </div>
  );
}

// ── Avatar Creator Component ────────────────────────────────────────────────

export function AvatarCreator({ userId, currentConfig = {}, onSave, onClose }) {
  const [config, setConfig] = useState({
    base: "rookie",
    skinTone: "#D4A574",
    hat: "none",
    eyewear: "none",
    chain: "none",
    expression: "neutral",
    cardBack: "classic",
    ...currentConfig,
  });
  const [activeTab, setActiveTab] = useState("base");
  const [saving, setSaving] = useState(false);
  const [ownedItems, setOwnedItems] = useState(new Set());
  const [bucks, setBucks] = useState(0);

  useEffect(() => {
    loadOwnedItems();
    loadBucks();
  }, []);

  async function loadOwnedItems() {
    if (!userId) return;
    const { data } = await supabase.from('user_cosmetics').select('item_name').eq('user_id', userId);
    if (data) {
      const owned = new Set(data.map(d => d.item_name));
      // Add all free items
      Object.entries({ ...HATS, ...EYEWEAR, ...CHAINS, ...CARD_BACKS }).forEach(([key, val]) => {
        if (val.free) owned.add(key);
      });
      Object.keys(BASES).forEach(k => owned.add(k));
      Object.keys(EXPRESSIONS).forEach(k => owned.add(k));
      Object.keys(SKIN_TONES.reduce((a, t) => ({ ...a, [t.id]: true }), {})).forEach(k => owned.add(k));
      setOwnedItems(owned);
    }
  }

  async function loadBucks() {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('bucks_balance').eq('user_id', userId).single();
    if (data) setBucks(data.bucks_balance || 0);
  }

  async function purchaseItem(itemName, price) {
    if (bucks < price) return alert("Not enough OTJ Bucks!");
    
    const { error } = await supabase.from('user_cosmetics').insert({
      user_id: userId, item_name: itemName, equipped: false,
    });
    if (error && error.code !== '23505') { // ignore duplicate
      alert("Purchase failed");
      return;
    }

    await supabase.rpc('deduct_bucks', { p_user_id: userId, p_amount: price });
    setBucks(b => b - price);
    setOwnedItems(prev => new Set([...prev, itemName]));
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      avatar_config: config,
    }).eq('user_id', userId);

    setSaving(false);
    if (!error && onSave) onSave(config);
  }

  function update(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  const TABS = [
    { id: "base", label: "Character" },
    { id: "skin", label: "Skin" },
    { id: "hat", label: "Hats" },
    { id: "eyewear", label: "Eyewear" },
    { id: "chain", label: "Chains" },
    { id: "expression", label: "Expression" },
    { id: "cards", label: "Cards" },
  ];

  const F = "'JetBrains Mono','SF Mono',monospace";

  return (
    <div style={{
      background: "#0f0f1a", borderRadius: 16, padding: 24,
      border: "1px solid rgba(255,255,255,0.08)", maxWidth: 600, width: "100%",
      fontFamily: F,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", letterSpacing: "0.05em" }}>
          AVATAR CREATOR
        </div>
        <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>
          💰 {bucks.toLocaleString()} Bucks
        </div>
      </div>

      {/* Preview */}
      <div style={{
        display: "flex", justifyContent: "center", padding: 20,
        background: "rgba(255,255,255,0.02)", borderRadius: 12, marginBottom: 20,
        border: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ textAlign: "center" }}>
          <Avatar config={config} size={160} />
          <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
            {BASES[config.base]?.label || "Character"}
          </div>
          <div style={{ fontSize: 10, color: "#4a5568", fontStyle: "italic" }}>
            {BASES[config.base]?.desc || ""}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 16, overflowX: "auto",
        padding: "2px 0",
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: activeTab === tab.id ? "#c41e3a" : "rgba(255,255,255,0.05)",
              color: activeTab === tab.id ? "white" : "#94a3b8",
              fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: F, letterSpacing: "0.05em",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Options Grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
        maxHeight: 240, overflowY: "auto", padding: 4,
      }}>
        {activeTab === "base" && Object.entries(BASES).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.base === key}
            owned={true} price={0} color={val.color}
            onClick={() => update("base", key)} />
        ))}

        {activeTab === "skin" && SKIN_TONES.map(tone => (
          <div key={tone.id} onClick={() => update("skinTone", tone.color)}
            style={{
              width: "100%", aspectRatio: "1", borderRadius: 10, cursor: "pointer",
              background: tone.color,
              border: config.skinTone === tone.color ? "3px solid #c41e3a" : "3px solid transparent",
              transition: "border 0.15s",
            }}
          />
        ))}

        {activeTab === "hat" && Object.entries(HATS).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.hat === key}
            owned={ownedItems.has(key)} price={val.price}
            onClick={() => ownedItems.has(key) ? update("hat", key) : purchaseItem(key, val.price)} />
        ))}

        {activeTab === "eyewear" && Object.entries(EYEWEAR).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.eyewear === key}
            owned={ownedItems.has(key)} price={val.price}
            onClick={() => ownedItems.has(key) ? update("eyewear", key) : purchaseItem(key, val.price)} />
        ))}

        {activeTab === "chain" && Object.entries(CHAINS).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.chain === key}
            owned={ownedItems.has(key)} price={val.price}
            onClick={() => ownedItems.has(key) ? update("chain", key) : purchaseItem(key, val.price)} />
        ))}

        {activeTab === "expression" && Object.entries(EXPRESSIONS).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.expression === key}
            owned={true} price={0}
            onClick={() => update("expression", key)} />
        ))}

        {activeTab === "cards" && Object.entries(CARD_BACKS).map(([key, val]) => (
          <ItemCard key={key} label={val.label} selected={config.cardBack === key}
            owned={ownedItems.has(key)} price={val.price} color={val.color}
            onClick={() => ownedItems.has(key) ? update("cardBack", key) : purchaseItem(key, val.price)} />
        ))}
      </div>

      {/* Save / Close */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={handleSave} disabled={saving}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 8, border: "none",
            background: "#c41e3a", color: "white", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: F, letterSpacing: "0.1em",
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? "SAVING..." : "SAVE AVATAR"}
        </button>
        {onClose && (
          <button onClick={onClose}
            style={{
              padding: "12px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: F,
            }}>
            CLOSE
          </button>
        )}
      </div>
    </div>
  );
}

// ── Item Card (for shop grid) ───────────────────────────────────────────────

function ItemCard({ label, selected, owned, price, color, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        padding: "10px 8px", borderRadius: 8, cursor: "pointer", textAlign: "center",
        background: selected ? "rgba(196,30,58,0.15)" : "rgba(255,255,255,0.03)",
        border: selected ? "2px solid #c41e3a" : "2px solid rgba(255,255,255,0.06)",
        transition: "all 0.15s",
      }}>
      {color && (
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: color,
          margin: "0 auto 6px",
          border: "2px solid rgba(255,255,255,0.1)",
        }} />
      )}
      <div style={{ fontSize: 10, fontWeight: 600, color: selected ? "#f1f5f9" : "#94a3b8" }}>
        {label}
      </div>
      {!owned && price > 0 && (
        <div style={{ fontSize: 9, color: "#fbbf24", marginTop: 3 }}>
          💰 {price}
        </div>
      )}
      {owned && !selected && (
        <div style={{ fontSize: 8, color: "#22c55e", marginTop: 3 }}>OWNED</div>
      )}
    </div>
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────

export { BASES, HATS, EYEWEAR, CHAINS, EXPRESSIONS, CARD_BACKS, SKIN_TONES };
export default Avatar;
