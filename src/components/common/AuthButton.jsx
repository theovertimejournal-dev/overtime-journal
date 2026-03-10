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

export function AuthButton({ onSignIn }) {
  const [user, setUser] = useState(null);
  const [showBrowserWarning, setShowBrowserWarning] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = () => {
    if (isInAppBrowser()) { setShowBrowserWarning(true); return; }
    if (onSignIn) onSignIn();
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/';
  };

  const modalOverlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
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
      <button onClick={handleSignIn} style={{
        fontSize: 11, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        color: '#e2e8f0', fontFamily: 'inherit', fontWeight: 600
      }}>
        Sign In
      </button>

      {showBrowserWarning && (
        <div style={modalOverlay}>
          <div style={{
            background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center'
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>
              Open in Chrome or Safari
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
              Sign-in doesn't work inside Snapchat, Instagram, or Facebook browsers.
              Copy the link and open it in <strong style={{ color: '#e2e8f0' }}>Chrome</strong> or <strong style={{ color: '#e2e8f0' }}>Safari</strong>.
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); setShowBrowserWarning(false); }} style={{
              width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
              background: '#7C3AED', border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', marginBottom: 8,
            }}>
              📋 Copy Link
            </button>
            <button onClick={() => setShowBrowserWarning(false)} style={{
              width: '100%', padding: '8px 0', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
              color: '#6b7280', fontSize: 12, fontFamily: 'inherit',
            }}>Dismiss</button>
          </div>
        </div>
      )}
    </>
  );
}
