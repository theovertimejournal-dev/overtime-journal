import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return (
    /FBAN|FBAV|FB_IAB/i.test(ua) ||
    /Snapchat/i.test(ua) ||
    /Instagram/i.test(ua) ||
    /BytedanceWebview|musical_ly/i.test(ua) ||
    /Twitter/i.test(ua) ||
    /LinkedIn/i.test(ua)
  );
}

const modalOverlay = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 24px', overflowY: 'auto',
};

const modalBox = {
  background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16, padding: 28, maxWidth: 360, width: '100%',
  fontFamily: "'JetBrains Mono','SF Mono',monospace",
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  marginBottom: 10,
};

const btnPrimary = {
  width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
  background: '#7C3AED', border: 'none', color: '#fff',
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit', marginBottom: 8,
};

const btnSecondary = {
  width: '100%', padding: '10px 0', borderRadius: 8, cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', marginBottom: 8,
};

const btnGhost = {
  width: '100%', padding: '8px 0', borderRadius: 8, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
  color: '#6b7280', fontSize: 12, fontFamily: 'inherit',
};

const divider = {
  display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0',
};

export function AuthButton() {
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showBrowserWarning, setShowBrowserWarning] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const openModal = () => {
    if (isInAppBrowser()) { setShowBrowserWarning(true); return; }
    setMessage(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setMode('signin'); setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const signInWithGoogle = async () => {
    if (isInAppBrowser()) { setShowBrowserWarning(true); return; }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleEmailSignIn = async () => {
    setLoading(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else setShowModal(false);
    setLoading(false);
  };

  const handleEmailSignUp = async () => {
    if (password !== confirmPassword) { setMessage("Passwords don't match."); return; }
    setLoading(true); setMessage('');
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

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/';
  };

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {user.user_metadata?.avatar_url && (
          <img src={user.user_metadata.avatar_url} alt="avatar"
            style={{ width: 24, height: 24, borderRadius: '50%' }} />
        )}
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {user.user_metadata?.full_name || user.email}
        </span>
        <button onClick={signOut} style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#6b7280', fontFamily: 'inherit'
        }}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={openModal} style={{
        fontSize: 11, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        color: '#e2e8f0', fontFamily: 'inherit', fontWeight: 600
      }}>
        Sign In
      </button>

      {/* In-app browser warning */}
      {showBrowserWarning && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>
              Open in Chrome or Safari
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
              Sign-in doesn't work inside Snapchat, Instagram, or Facebook browsers.
              Copy the link and open it in <strong style={{ color: '#e2e8f0' }}>Chrome</strong> or <strong style={{ color: '#e2e8f0' }}>Safari</strong>.
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); setShowBrowserWarning(false); }} style={btnPrimary}>
              📋 Copy Link
            </button>
            <button onClick={() => setShowBrowserWarning(false)} style={btnGhost}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Auth modal */}
      {showModal && (
        <div style={modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={modalBox}>
            <div style={{ marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', letterSpacing: 2, marginBottom: 4 }}>OTJ</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </div>
            </div>

            {mode === 'forgot' && (
              <>
                <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <button style={btnPrimary} onClick={handleForgotPassword} disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Email'}
                </button>
                <button style={btnGhost} onClick={() => setMode('signin')}>← Back to sign in</button>
              </>
            )}

            {mode === 'signin' && (
              <>
                <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()} />
                <div style={{ textAlign: 'right', marginBottom: 10 }}>
                  <span onClick={() => setMode('forgot')} style={{ fontSize: 11, color: '#7C3AED', cursor: 'pointer' }}>
                    Forgot password?
                  </span>
                </div>
                <button style={btnPrimary} onClick={handleEmailSignIn} disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
                <div style={divider}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 11, color: '#4b5563' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <button style={btnSecondary} onClick={signInWithGoogle}>
                  <span style={{ marginRight: 8 }}>G</span> Continue with Google
                </button>
                <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#6b7280' }}>
                  No account?{' '}
                  <span onClick={() => setMode('signup')} style={{ color: '#7C3AED', cursor: 'pointer', fontWeight: 700 }}>Sign up</span>
                </div>
              </>
            )}

            {mode === 'signup' && (
              <>
                <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                <button style={btnPrimary} onClick={handleEmailSignUp} disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
                <div style={divider}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 11, color: '#4b5563' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <button style={btnSecondary} onClick={signInWithGoogle}>
                  <span style={{ marginRight: 8 }}>G</span> Continue with Google
                </button>
                <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#6b7280' }}>
                  Already have an account?{' '}
                  <span onClick={() => setMode('signin')} style={{ color: '#7C3AED', cursor: 'pointer', fontWeight: 700 }}>Sign in</span>
                </div>
              </>
            )}

            {message && (
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: message.includes('!') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${message.includes('!') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: message.includes('!') ? '#86efac' : '#fca5a5',
              }}>
                {message}
              </div>
            )}

            <button onClick={closeModal} style={{ ...btnGhost, marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
