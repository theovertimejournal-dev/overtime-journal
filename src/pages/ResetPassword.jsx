import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * ResetPassword — the page the password-reset email link lands on (/reset-password).
 *
 * Supabase appends a recovery token to the URL; supabase-js (detectSessionInUrl)
 * exchanges it and fires a PASSWORD_RECOVERY auth event, which puts the user in a
 * short-lived recovery session. We then let them set a new password via updateUser.
 *
 * Add the route in App.jsx:  <Route path="/reset-password" element={<ResetPassword />} />
 * AND add https://overtimejournal.com/reset-password to Supabase Auth → URL
 * Configuration → Redirect URLs, or the email link will be rejected.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady]       = useState(false);   // recovery session detected
  const [checked, setChecked]   = useState(false);   // finished checking for a session
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [msg, setMsg]           = useState('');
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    let settled = false;
    const mark = () => { if (!settled) { settled = true; setReady(true); setChecked(true); } };

    // 1) Supabase emits PASSWORD_RECOVERY once it parses the token from the URL
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) mark();
    });

    // 2) Fallback: a session may already be established by the time we mount
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) mark();
      else setChecked(true);
    });

    // 3) Give the URL token ~4s to resolve before calling the link dead
    const t = setTimeout(() => setChecked(true), 4000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async () => {
    if (password.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setMsg("Passwords don't match."); return; }
    setLoading(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMsg(error.message); return; }
    setDone(true);
    setMsg('Password updated! Redirecting…');
    setTimeout(() => navigate('/nba'), 1600);
  };

  const inputStyle = {
    width: '100%', padding: '11px 12px', borderRadius: 10, boxSizing: 'border-box',
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  };
  const btnStyle = (on) => ({
    width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
    background: on ? '#7C3AED' : 'rgba(124,58,237,0.4)', color: '#fff',
    fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: on ? 'pointer' : 'default',
  });

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        width: 'min(400px, 94vw)', background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '26px 24px',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Set a new password</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 20 }}>
          Enter a new password for your Overtime Journal account.
        </div>

        {/* Link not yet valid */}
        {!ready && checked && (
          <div style={{ fontSize: 13, color: '#f59e0b', lineHeight: 1.6 }}>
            This reset link is invalid or has expired. Head back and request a new one.
            <button onClick={() => navigate('/nba')} style={{ ...btnStyle(true), marginTop: 16 }}>
              Back to OTJ
            </button>
          </div>
        )}

        {/* Still resolving */}
        {!ready && !checked && (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Verifying your reset link…</div>
        )}

        {/* Ready — show the form */}
        {ready && !done && (
          <>
            <input
              style={{ ...inputStyle, marginBottom: 10 }} type="password" placeholder="New password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <input
              style={{ ...inputStyle, marginBottom: 14 }} type="password" placeholder="Confirm new password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button onClick={submit} disabled={loading} style={btnStyle(!loading)}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </>
        )}

        {msg && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: done ? '#22c55e' : '#f87171', lineHeight: 1.5 }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
