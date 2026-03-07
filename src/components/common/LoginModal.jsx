import { useState } from 'react';
import { supabase } from '../../lib/supabase';

async function subscribeEmail(email, source) {
  if (!email || !email.includes('@')) return;
  await supabase.from('email_subscribers').upsert(
    { email: email.trim().toLowerCase(), source },
    { onConflict: 'email', ignoreDuplicates: true }
  );
}

export function LoginModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [wantsEmail, setWantsEmail] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const signIn = async () => {
    if (wantsEmail && email) await subscribeEmail(email, 'login_modal');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleEmailOnly = async () => {
    if (!email || !email.includes('@')) return;
    await subscribeEmail(email, 'login_modal_email_only');
    setSubmitted(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 101,
        background: "#0f1117",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: "36px 40px",
        width: "100%",
        maxWidth: 400,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏀</div>

        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Sign in to view edge analysis
        </div>

        <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 28, lineHeight: 1.7 }}>
          Unlock edge scores, B2B tiers, spread mismatches, and pick logging.
          <br />No password needed — just Google.
        </div>

        {/* Blurred stats teaser */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
          {[
            { label: "Edge Score", value: "██" },
            { label: "Confidence", value: "███" },
            { label: "Signals", value: "████" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 8, padding: "10px 8px"
            }}>
              <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "transparent", background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Email field */}
        <div style={{ marginBottom: 12, textAlign: "left" }}>
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

        {/* Email opt-in checkbox */}
        <div
          onClick={() => setWantsEmail(p => !p)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 20, cursor: "pointer", textAlign: "left"
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

        {/* Sign in button */}
        <button
          onClick={signIn}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "#f1f5f9", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Email only option */}
        {!submitted ? (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={handleEmailOnly}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.05)",
                background: "transparent",
                color: "#374151", fontSize: 11, fontWeight: 600,
                fontFamily: "inherit", cursor: email ? "pointer" : "default",
                opacity: email ? 1 : 0.4,
              }}
            >
              Just email me picks — no account
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 11, color: "#22c55e" }}>
            ✓ You're on the list — daily picks incoming
          </div>
        )}

        <button
          onClick={onClose}
          style={{ marginTop: 10, background: "none", border: "none", color: "#374151", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          Maybe later
        </button>

        <div style={{ marginTop: 14, fontSize: 10, color: "#1f2937", lineHeight: 1.6 }}>
          By signing in you agree to our{" "}
          <a href="/terms" style={{ color: "#374151" }}>Terms</a> and{" "}
          <a href="/privacy" style={{ color: "#374151" }}>Privacy Policy</a>.
                  </div>
      </div>
    </>
  );
}
