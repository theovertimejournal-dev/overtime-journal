import { useState } from 'react';
import { supabase } from '../../lib/supabase';

async function subscribeEmail(email, source) {
  if (!email || !email.includes('@')) return;
  await supabase.from('email_subscribers').upsert(
    { email: email.trim().toLowerCase(), source },
    { onConflict: 'email', ignoreDuplicates: true }
  );
}

export function WelcomeModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [wantsEmail, setWantsEmail] = useState(true);
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const signIn = async () => {
    if (wantsEmail && email) await subscribeEmail(email, 'welcome_modal');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleEmailOnly = async () => {
    if (!email || !email.includes('@')) return;
    await subscribeEmail(email, 'welcome_modal_email_only');
    setEmailSubmitted(true);
  };

  return (
    <>
      <div style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 200,
      }} />

      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 201,
        background: "#0d0f18",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20,
        padding: "40px 36px 32px",
        width: "100%",
        maxWidth: 420,
        textAlign: "center",
        boxShadow: "0 0 60px rgba(0,0,0,0.8)",
      }}>

        <div style={{ fontSize: 11, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>
          The Overtime Journal
        </div>

        <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.03em" }}>
          Stop guessing.<br />
          <span style={{ color: "#ef4444" }}>Start edging.</span>
        </div>

        <div style={{ fontSize: 12, color: "#4a5568", lineHeight: 1.8, marginBottom: 20 }}>
          NBA · NHL · MLB · NFL edge analysis.<br />
          Bench metrics, B2B fatigue, spread mismatches — all in one place.
        </div>

        {/* Social proof */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 24 }}>
          {[
            { label: "THIS MONTH", value: "11-2" },
            { label: "WIN %", value: "84%" },
            { label: "UNITS", value: "+18.3u" },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 9, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Email field */}
        <div style={{ marginBottom: 10, textAlign: "left" }}>
          <input
            type="email"
            placeholder="your@email.com (optional)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0", fontSize: 12, fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Email checkbox */}
        <div
          onClick={() => setWantsEmail(p => !p)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 18, cursor: "pointer", textAlign: "left"
          }}
        >
          <div style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            border: `1px solid ${wantsEmail ? "#ef4444" : "rgba(255,255,255,0.15)"}`,
            background: wantsEmail ? "rgba(239,68,68,0.2)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {wantsEmail && <span style={{ fontSize: 9, color: "#ef4444" }}>✓</span>}
          </div>
          <span style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.4 }}>
            Email me the daily sharp pick + OTJ updates
          </span>
        </div>

        {/* Create account button */}
        <button
          onClick={signIn}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08))",
            color: "#f1f5f9", fontSize: 14, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            marginBottom: 8, transition: "all 0.15s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "linear-gradient(135deg, rgba(239,68,68,0.3), rgba(239,68,68,0.15))"}
          onMouseLeave={e => e.currentTarget.style.background = "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08))"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Create Free Account
        </button>

        <button
          onClick={signIn}
          style={{
            width: "100%", padding: "11px 0", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.03)",
            color: "#6b7280", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer", marginBottom: 14,
          }}
        >
          Sign In
        </button>

        {/* Email only CTA */}
        {!emailSubmitted ? (
          <button
            onClick={handleEmailOnly}
            style={{
              width: "100%", padding: "9px 0", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.05)",
              background: "transparent",
              color: "#374151", fontSize: 11, fontWeight: 600,
              fontFamily: "inherit",
              cursor: email ? "pointer" : "default",
              opacity: email ? 1 : 0.4,
              marginBottom: 14,
            }}
          >
            Just email me picks — no account needed
          </button>
        ) : (
          <div style={{ marginBottom: 14, fontSize: 11, color: "#22c55e" }}>
            ✓ You're on the list — daily picks incoming
          </div>
        )}

        <div
          onClick={onClose}
          style={{
            fontSize: 11, color: "#1f2937", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            transition: "color 0.15s"
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#374151"}
          onMouseLeave={e => e.currentTarget.style.color = "#1f2937"}
        >
          <span>↓</span>
          <span>See today's free pick first</span>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: "#1f2937", lineHeight: 1.6 }}>
          Free forever. No credit card.{" "}
          <a href="/terms" style={{ color: "#374151" }}>Terms</a> ·{" "}
          <a href="/privacy" style={{ color: "#374151" }}>Privacy</a>
        </div>
      </div>
    </>
  );
}
