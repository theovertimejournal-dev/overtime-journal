import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function AuthButton() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={user.user_metadata.avatar_url} alt="avatar"
          style={{ width: 24, height: 24, borderRadius: '50%' }} />
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {user.user_metadata.full_name}
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
    <button onClick={signIn} style={{
      fontSize: 11, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      color: '#e2e8f0', fontFamily: 'inherit', fontWeight: 600
    }}>
      Sign in with Google
    </button>
  );
}