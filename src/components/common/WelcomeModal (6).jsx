import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

async function subscribeEmail(email, source) {
  if (!email || !email.includes('@')) return;
  await supabase.from('email_subscribers').upsert(
    { email: email.trim().toLowerCase(), source },
    { onConflict: 'email', ignoreDuplicates: true }
  );
}

function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Snapchat|Instagram|BytedanceWebview|musical_ly|Twitter|LinkedIn/i.test(ua);
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// ─── Live record hook ────────────────────────────────────────────────────────
// Pulls the platform "ceo" account record for the current month.
// Falls back to hardcoded values if the query fails or returns no data.

function useLiveRecord() {
  const [stats, setStats] = useState({ record: '—', winPct: '—', units: '—' });

  useEffect(() => {
    async function fetchRecord() {
      try {
        // Get current month boundaries in YYYY-MM-DD format
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const monthStart = `${y}-${m}-01`;
        // Last day of month
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
        const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

        // Fetch resolved picks for the "ceo" account this month
        const { data: ceoProfile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', 'ceo')
          .single();

        if (!ceoProfile) return;

        const { data: picks } = await supabase
          .from('game_picks')
          .select('result, net, wager, locked_odds')
          .eq('user_id', ceoProfile.user_id)
          .gte('slate_date', monthStart)
          .lte('slate_date', monthEnd)
          .in('result', ['win', 'loss']);

        if (!picks || picks.length === 0) return;

        const wins = picks.filter(p => p.result === 'win').length;
        const losses = picks.filter(p => p.result === 'loss').length;
        const total = wins + losses;
        const pct = total > 0 ? Math.round((wins / total) * 100) : 0;

        // Calculate units: each pick is 1 unit risked.
        // Win: payout based on American odds. Loss: -1 unit.
        let units = 0;
        for (const p of picks) {
          if (p.result === 'win') {
            const odds = p.locked_odds || -110;
            units += odds > 0 ? odds / 100 : 100 / Math.abs(odds);
          } else {
            units -= 1;
          }
        }

        setStats({
          record: `${wins}-${losses}`,
          winPct: `${pct}%`,
          units: `${units >= 0 ? '+' : ''}${units.toFixed(1)}u`,
        });
      } catch {
        // Silently fail — hardcoded fallback stays
      }
    }

    fetchRecord();
  }, []);

  return stats;
}

// ─── WelcomeModal ────────────────────────────────────────────────────────────

export function WelcomeModal({ onClose }) {
  const [mode, setMode] = useState('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailNewsletter, setEmailNewsletter] = useState(true);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);

  const liveRecord = useLiveRecord();

  const signInWithGoogle = async () => {
    if (isInAppBrowser()) { setShowInAppWarning(true); return; }
    if (emailNewsletter && email) await subscribeEmail(email, 'welcome_modal');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleEmailSignIn = async () => {
    setLoading(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else onClose();
    setLoading(false);
  };

  const handleEmailSignUp = async () => {
    if (password !== confirmPassword) { setMessage("Passwords don't match."); return; }
    setLoading(true); setMessage('');
    if (emailNewsletter && email) await subscribeEmail(email, 'welcome_modal_signup');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMessage(error.message);
    else setMessage('Check your email to confirm your account!');
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setLoading(true); setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setMessage(error.message);
    else setMessage('Password reset email sent!');
    setLoading(false);
  };

  const handleEmailOnly = async () => {
    if (!email || !email.includes('@')) return;
    await subscribeEmail(email, 'welcome_modal_email_only');
    setEmailSubmitted(true);
  };

  const msgStyle = {
    marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
    background: message.includes('!') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    border: `1px solid ${message.includes('!') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
    color: message.includes('!') ? '#86efac' : '#fca5a5',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 200 }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 201,
        background: '#0d0f18', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: '36px 32px 28px', width: '100%', maxWidth: 420,
        textAlign: 'center', boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* In-app browser warning */}
        {showInAppWarning && (
          <div style={{ marginBottom: 16, padding: '12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#fca5a5', textAlign: 'left' }}>
            ⚠️ Google sign-in doesn't work here. Copy the link and open in <strong>Chrome or Safari</strong>.
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); }} style={{ display: 'block', marginTop: 8, background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              📋 Copy Link
            </button>
          </div>
        )}

        {/* MAIN VIEW */}
        {mode === 'main' && (
          <>
            <div style={{ fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>The Overtime Journal</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.03em' }}>
              Stop guessing.<br /><span style={{ color: '#ef4444' }}>Start edging.</span>
            </div>
            <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.8, marginBottom: 20 }}>
              NBA · NHL · MLB · NFL edge analysis.<br />
              Bench metrics, B2B fatigue, spread mismatches.
            </div>

            {/* LIVE record — pulls from ceo account, updates monthly */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
              {[
                { label: 'THIS MONTH', value: liveRecord.record },
                { label: 'WIN %',      value: liveRecord.winPct },
                { label: 'UNITS',      value: liveRecord.units },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <input style={{ ...inputStyle, marginBottom: 10 }} type="email" placeholder="your@email.com (optional)" value={email} onChange={e => setEmail(e.target.value)} />

            <div onClick={() => setEmailNewsletter(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1px solid ${emailNewsletter ? '#ef4444' : 'rgba(255,255,255,0.15)'}`, background: emailNewsletter ? 'rgba(239,68,68,0.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {emailNewsletter && <span style={{ fontSize: 9, color: '#ef4444' }}>✓</span>}
              </div>
              <span style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.4 }}>Email me the daily sharp pick + OTJ updates</span>
            </div>

            {/* Primary: Create account with email */}
            <button onClick={() => setMode('signup')} style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08))', color: '#f1f5f9', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8 }}>
              Create Free Account
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 8px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 11, color: '#374151' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>

            <button onClick={signInWithGoogle} style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
              <GoogleIcon /> Continue with Google
            </button>

            <button onClick={() => setMode('signin')} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', background: 'transparent', color: '#6b7280', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 14 }}>
              Already have an account? Sign In
            </button>

            {!emailSubmitted ? (
              <button onClick={handleEmailOnly} style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: '#374151', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: email ? 'pointer' : 'default', opacity: email ? 1 : 0.4, marginBottom: 14 }}>
                Just email me picks — no account needed
              </button>
            ) : (
              <div style={{ marginBottom: 14, fontSize: 11, color: '#22c55e' }}>✓ You're on the list — daily picks incoming</div>
            )}

            <div onClick={onClose} style={{ fontSize: 11, color: '#1f2937', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = '#374151'}
              onMouseLeave={e => e.currentTarget.style.color = '#1f2937'}>
              <span>↓</span><span>See today's free pick first</span>
            </div>
          </>
        )}

        {/* SIGN IN VIEW */}
        {mode === 'signin' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>Welcome back</div>
            <input style={{ ...inputStyle, marginBottom: 10 }} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input style={{ ...inputStyle, marginBottom: 6 }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()} />
            <div style={{ textAlign: 'right', marginBottom: 14 }}>
              <span onClick={() => setMode('forgot')} style={{ fontSize: 11, color: '#7C3AED', cursor: 'pointer' }}>Forgot password?</span>
            </div>
            <button onClick={handleEmailSignIn} disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 11, color: '#374151' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <button onClick={signInWithGoogle} style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <GoogleIcon /> Continue with Google
            </button>
            {message && <div style={msgStyle}>{message}</div>}
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
              No account?{' '}<span onClick={() => setMode('signup')} style={{ color: '#7C3AED', cursor: 'pointer', fontWeight: 700 }}>Sign up</span>
            </div>
            <button onClick={() => setMode('main')} style={{ marginTop: 14, background: 'none', border: 'none', color: '#374151', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          </>
        )}

        {/* SIGN UP VIEW */}
        {mode === 'signup' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>Create your account</div>
            <input style={{ ...inputStyle, marginBottom: 10 }} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input style={{ ...inputStyle, marginBottom: 10 }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <input style={{ ...inputStyle, marginBottom: 14 }} type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            <button onClick={handleEmailSignUp} disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8 }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 11, color: '#374151' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <button onClick={signInWithGoogle} style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <GoogleIcon /> Continue with Google
            </button>
            {message && <div style={msgStyle}>{message}</div>}
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
              Already have an account?{' '}<span onClick={() => setMode('signin')} style={{ color: '#7C3AED', cursor: 'pointer', fontWeight: 700 }}>Sign in</span>
            </div>
            <button onClick={() => setMode('main')} style={{ marginTop: 14, background: 'none', border: 'none', color: '#374151', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          </>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {mode === 'forgot' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Reset password</div>
            <div style={{ fontSize: 12, color: '#4a5568', marginBottom: 20 }}>We'll send a reset link to your email.</div>
            <input style={{ ...inputStyle, marginBottom: 14 }} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <button onClick={handleForgotPassword} disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>
            {message && <div style={msgStyle}>{message}</div>}
            <button onClick={() => setMode('signin')} style={{ marginTop: 14, background: 'none', border: 'none', color: '#374151', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>← Back to sign in</button>
          </>
        )}

        <div style={{ marginTop: 16, fontSize: 10, color: '#1f2937', lineHeight: 1.6 }}>
          <a href="/terms" style={{ color: '#374151' }}>Terms</a> · <a href="/privacy" style={{ color: '#374151' }}>Privacy</a>
        </div>
      </div>
    </>
  );
}
