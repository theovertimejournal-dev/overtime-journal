import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";
const SERIF = "'Georgia','Playfair Display','Times New Roman',serif";

export default function DailyNewspaper() {
  const [journal, setJournal] = useState(null);
  const [slate, setSlate] = useState(null);
  const [yesterdayResults, setYesterdayResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();

  // Get today's date in ET
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  useEffect(() => {
    loadNewspaper(selectedDate || todayET);
  }, [selectedDate]);

  async function loadNewspaper(date) {
    setLoading(true);

    // Get the journal entry (blog post)
    const [journalRes, slateRes, resultsRes] = await Promise.all([
      supabase.from("blog_posts")
        .select("*")
        .eq("sport", "nba")
        .order("date", { ascending: false })
        .limit(1),
      supabase.from("slates")
        .select("*")
        .eq("sport", "nba")
        .eq("date", date)
        .maybeSingle(),
      supabase.from("yesterday_results")
        .select("*")
        .eq("sport", "nba")
        .order("date", { ascending: false })
        .limit(1),
    ]);

    setJournal(journalRes.data?.[0] || null);
    setSlate(slateRes.data || null);
    setYesterdayResults(resultsRes.data?.[0] || null);
    setLoading(false);
  }

  // Parse journal content into paragraphs
  function renderContent(content) {
    if (!content) return null;
    return content.split('\n\n').map((block, i) => {
      const lines = block.split('\n').filter(l => l.trim());
      return (
        <div key={i} style={{ marginBottom: 24 }}>
          {lines.map((line, j) => {
            const isHeader = line === line.toUpperCase() && line.trim().length > 3
              && !line.includes('.') && line.trim().length < 80;
            const isQuote = line.includes('Yumi') || line.includes('Johnnybot') || line.includes('Krash');

            if (isHeader) {
              return (
                <div key={j} style={{
                  fontSize: 14, fontWeight: 800, color: '#ef4444',
                  letterSpacing: '0.15em', lineHeight: 1.4,
                  marginTop: i > 0 ? 32 : 0, marginBottom: 16,
                  fontFamily: MONO, textTransform: 'uppercase',
                  borderBottom: '2px solid rgba(239,68,68,0.2)',
                  paddingBottom: 8,
                }}>{line}</div>
              );
            }

            if (isQuote) {
              // Style character quotes differently
              const voiceMatch = line.match(/(Voice [123])/);
              const voiceName = voiceMatch ? voiceMatch[1] : '';
              const voiceColor = voiceName === 'Yumi' ? '#60a5fa'
                : voiceName === 'Johnnybot' ? '#f59e0b'
                : voiceName === 'Krash' ? '#22c55e' : '#94a3b8';

              return (
                <div key={j} style={{
                  fontSize: 14, color: '#c9d1d9', lineHeight: 1.85,
                  fontFamily: SERIF, fontStyle: 'normal',
                  padding: '8px 0 8px 16px',
                  borderLeft: `3px solid ${voiceColor}20`,
                  marginBottom: 8,
                }}>
                  {line.split(/(Voice [123])/).map((part, k) => {
                    if (/Voice [123]/.test(part)) {
                      const color = part === 'Yumi' ? '#60a5fa'
                        : part === 'Johnnybot' ? '#f59e0b' : '#22c55e';
                      return <span key={k} style={{ color, fontWeight: 700, fontFamily: MONO, fontSize: 11, letterSpacing: '0.05em' }}>{part}</span>;
                    }
                    return <span key={k}>{part}</span>;
                  })}
                </div>
              );
            }

            return (
              <div key={j} style={{
                fontSize: 15, color: '#b0b8c4', lineHeight: 1.9,
                fontFamily: SERIF,
              }}>{line}</div>
            );
          })}
        </div>
      );
    });
  }

  // Get sharp games from slate
  const sharpGames = (slate?.games || []).filter(g => g.edge?.confidence === 'SHARP');
  const leanGames = (slate?.games || []).filter(g => g.edge?.confidence === 'LEAN');

  // Get fresh injuries
  const freshInjuries = [];
  for (const game of (slate?.games || [])) {
    for (const side of ['away', 'home']) {
      for (const inj of (game[side]?.injuries || [])) {
        if (inj.tenure === 'fresh') {
          freshInjuries.push({ ...inj, team: game[side]?.team });
        }
      }
    }
  }

  // Yesterday's results for the sidebar
  const yRecord = yesterdayResults?.record || '—';
  const yCumulative = yesterdayResults?.cumulative_record || '—';
  const yStreak = yesterdayResults?.streak || '—';
  const yResults = yesterdayResults?.results || [];

  // Volume number (days since March 8, 2026 — launch day)
  const launchDate = new Date('2026-03-08');
  const today = new Date();
  const volNumber = Math.max(1, Math.floor((today - launchDate) / (1000 * 60 * 60 * 24)));

  // Format date for display
  const displayDate = journal?.date
    ? new Date(journal.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO }}>
        <div style={{ fontSize: 11, color: '#1e293b', letterSpacing: '0.15em' }}>LOADING THE DAILY...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f', color: '#e2e8f0', fontFamily: SERIF,
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.008) 40px, rgba(255,255,255,0.008) 41px),
        repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.008) 40px, rgba(255,255,255,0.008) 41px)
      `,
    }}>
      {/* ═══ MASTHEAD ═══ */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '32px 24px 0',
        textAlign: 'center',
      }}>
        {/* Top rule */}
        <div style={{ height: 4, background: '#ef4444', marginBottom: 8 }} />
        <div style={{ height: 1, background: 'rgba(239,68,68,0.3)', marginBottom: 16 }} />

        {/* Volume / Date line */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 9, color: '#4a5568', fontFamily: MONO, letterSpacing: '0.15em',
          marginBottom: 8,
        }}>
          <span>VOL. 1 · NO. {volNumber}</span>
          <span>OVERTIMEJOURNAL.COM</span>
          <span>{displayDate.toUpperCase()}</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 48, fontWeight: 900, color: '#f1f5f9', margin: '8px 0',
          fontFamily: SERIF, letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          THE OTJ DAILY
        </h1>

        {/* Subtitle */}
        <div style={{
          fontSize: 11, color: '#4a5568', fontFamily: MONO, letterSpacing: '0.2em',
          marginBottom: 8,
        }}>
          YOUR MORNING JOURNAL — STORIES · DATA · EDGE
        </div>

        {/* Bottom rules */}
        <div style={{ height: 1, background: 'rgba(239,68,68,0.3)', marginTop: 12 }} />
        <div style={{ height: 2, background: '#ef4444', marginTop: 4, marginBottom: 4 }} />
        <div style={{ height: 1, background: 'rgba(239,68,68,0.3)', marginTop: 4 }} />
      </div>

      {/* ═══ CONTENT GRID ═══ */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '24px 24px 60px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 32,
      }}>
        {/* ── LEFT COLUMN: Main Journal Entry ── */}
        <div>
          {journal ? (
            <>
              {/* Headline */}
              <div style={{ marginBottom: 24 }}>
                <span style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 3,
                  background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                  letterSpacing: '0.12em', fontFamily: MONO,
                }}>{journal.category}</span>

                <h2 style={{
                  fontSize: 28, fontWeight: 800, color: '#f1f5f9',
                  lineHeight: 1.25, margin: '12px 0 8px',
                  fontFamily: SERIF,
                }}>{journal.title}</h2>

                <p style={{
                  fontSize: 14, color: '#6b7280', lineHeight: 1.6,
                  fontFamily: SERIF, fontStyle: 'italic',
                  margin: '0 0 16px',
                }}>{journal.excerpt}</p>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* Body */}
              <div>{renderContent(journal.content)}</div>
            </>
          ) : (
            <div style={{
              padding: '60px 20px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', borderRadius: 12,
              border: '1px dashed rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📰</div>
              <div style={{ fontSize: 14, color: '#4a5568', fontFamily: MONO }}>
                Today's edition is being written...
              </div>
              <div style={{ fontSize: 11, color: '#374151', fontFamily: MONO, marginTop: 8 }}>
                The OTJ Daily drops every morning at 11AM ET
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Last Night's Record */}
          {yesterdayResults && (
            <div style={{
              padding: '16px', borderRadius: 10,
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.12)',
            }}>
              <div style={{
                fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em',
                color: '#ef4444', fontWeight: 700, marginBottom: 10,
              }}>LAST NIGHT</div>
              <div style={{
                fontSize: 28, fontWeight: 900, color: '#f1f5f9',
                fontFamily: MONO, marginBottom: 4,
              }}>{yRecord}</div>
              <div style={{ fontSize: 10, color: '#4a5568', fontFamily: MONO, lineHeight: 2 }}>
                Cumulative: {yCumulative} · Streak: {yStreak}
              </div>
              {yResults.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {yResults.slice(0, 6).map((r, i) => (
                    <div key={i} style={{
                      fontSize: 10, fontFamily: MONO, color: '#6b7280',
                      display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ color: r.result === 'W' ? '#22c55e' : '#ef4444' }}>
                        {r.result === 'W' ? '✓' : '✗'} {r.matchup}
                      </span>
                      <span style={{ color: '#374151' }}>{r.final_score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tonight's Slate */}
          {slate && (
            <div style={{
              padding: '16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em',
                color: '#6b7280', fontWeight: 700, marginBottom: 10,
              }}>TONIGHT'S SLATE</div>
              <div style={{ fontSize: 11, color: '#4a5568', fontFamily: MONO, marginBottom: 10 }}>
                {slate.games_count || '—'} games
              </div>

              {sharpGames.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: '#ef4444', fontFamily: MONO, letterSpacing: '0.1em', marginBottom: 6 }}>
                    SHARP PICKS
                  </div>
                  {sharpGames.map((g, i) => (
                    <div key={i} style={{
                      fontSize: 11, fontFamily: MONO, color: '#f1f5f9',
                      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {g.edge?.lean} <span style={{ color: '#ef4444' }}>SHARP</span>
                      <span style={{ color: '#4a5568', marginLeft: 6 }}>{g.matchup}</span>
                    </div>
                  ))}
                </div>
              )}

              {leanGames.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: '#f59e0b', fontFamily: MONO, letterSpacing: '0.1em', marginBottom: 6 }}>
                    LEAN PICKS
                  </div>
                  {leanGames.slice(0, 3).map((g, i) => (
                    <div key={i} style={{
                      fontSize: 11, fontFamily: MONO, color: '#e2e8f0',
                      padding: '4px 0',
                    }}>
                      {g.edge?.lean} <span style={{ color: '#4a5568' }}>{g.matchup}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => navigate('/nba')} style={{
                width: '100%', marginTop: 12, padding: '8px', borderRadius: 6,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444', fontSize: 10, fontFamily: MONO, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.08em',
              }}>
                FULL ANALYSIS →
              </button>
            </div>
          )}

          {/* Injury Wire */}
          {freshInjuries.length > 0 && (
            <div style={{
              padding: '16px', borderRadius: 10,
              background: 'rgba(239,68,68,0.03)',
              border: '1px solid rgba(239,68,68,0.08)',
            }}>
              <div style={{
                fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em',
                color: '#ef4444', fontWeight: 700, marginBottom: 10,
              }}>🏥 INJURY WIRE</div>
              {freshInjuries.map((inj, i) => (
                <div key={i} style={{
                  fontSize: 11, fontFamily: MONO, color: '#6b7280',
                  padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>{inj.name}</span>
                  <span style={{ color: '#374151' }}> · {inj.team} · {inj.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick Links */}
          <div style={{
            padding: '16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em',
              color: '#6b7280', fontWeight: 700, marginBottom: 10,
            }}>EXPLORE</div>
            {[
              { label: '🏀 Full Slate', path: '/nba' },
              { label: '🎯 Props', path: '/props' },
              { label: '📊 Record', path: '/record' },
              { label: '🏆 Leaderboard', path: '/leaderboard' },
              { label: '🕹 Arcade', path: '/arcade' },
            ].map(item => (
              <div key={item.path} onClick={() => navigate(item.path)} style={{
                fontSize: 11, fontFamily: MONO, color: '#6b7280',
                padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
                onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
              >
                {item.label} <span style={{ float: 'right', color: '#374151' }}>→</span>
              </div>
            ))}
          </div>

          {/* Gambling disclaimer */}
          <div style={{
            fontSize: 9, color: '#1e293b', fontFamily: MONO, lineHeight: 1.8,
            padding: '12px',
          }}>
            ⚠ All picks are for informational purposes only. Not financial advice. Gamble responsibly. 1-800-GAMBLER.
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '0 24px 40px',
        textAlign: 'center',
      }}>
        <div style={{ height: 2, background: '#ef4444', marginBottom: 4 }} />
        <div style={{ height: 1, background: 'rgba(239,68,68,0.3)', marginBottom: 16 }} />
        <div style={{
          fontSize: 9, color: '#374151', fontFamily: MONO, letterSpacing: '0.12em',
        }}>
          OVERTIME JOURNAL © 2026 · THE OTJ DAILY · VOL. 1, NO. {volNumber}
        </div>
      </div>
    </div>
  );
}
