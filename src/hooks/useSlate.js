import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MOCK_NBA_SLATE = {
  date: "2026-03-06",
  yesterday_record: "5-2",
  cumulative_record: "11-2",
  cumulative_note: "Over two nights",
  headline: "JAYSON TATUM EXPECTED TO MAKE SEASON DEBUT TONIGHT VS DAL",
  b2b_lesson: "PHX -9.5 lost to CHI 103-105 last night. Not all B2Bs are equal — CHI only traveled from OKC (short flight, same time zone).",
  yesterday_results: [
    { game: "DAL @ ORL", lean: "ORL", result: "W", score: "114-115", note: "ORL wins by 1 — Wendell Carter Jr. game-winner" },
    { game: "BKN @ MIA", lean: "MIA", result: "W", score: "110-126", note: "MIA -11.5 covered — blowout" },
    { game: "GSW @ HOU", lean: "HOU", result: "L", score: "115-113", note: "GSW upset — Curry played, hit clutch shots" },
  ],
  games_count: 3,
  games: [
    {
      matchup: "DAL @ BOS", game_time: "7:00 PM ET", status: "Tonight",
      away: { team: "DAL", record: "21-41", net_rating: -4.8, off_rating: 112.5, def_rating: 117.3, bench_net: -2.5, bench_ppg: 34.0, three_pct: 35.2, last10_three: 33.8, close_pct: .333, b2b: true, rest_days: 0, last5: "L-L-L-L-L", streak: "L5", key_out: [] },
      home: { team: "BOS", record: "41-21", net_rating: 6.8, off_rating: 117.5, def_rating: 110.7, bench_net: 3.0, bench_ppg: 39.5, three_pct: 37.5, last10_three: 36.8, close_pct: .667, b2b: false, rest_days: 1, last5: "W-W-L-W-W", streak: "W1", key_out: [] },
      spread: "BOS -14.5",
      edge: { lean: "BOS", confidence: "HIGH", score: 38.0, signals: [{ type: "B2B_FATIGUE", detail: "DAL on B2B", favors: "BOS", strength: "STRONG", impact: 8.0 }], ou_lean: "UNDER" }
    },
  ],
  b2b_tiers: [], b2b_tags: [], spread_mismatches: []
};

// Normalize a game row from Supabase to match the expected shape
function normalizeGame(g) {
  return {
    ...g,
    edge: g.edge || g.edge_data || {},
    away: g.away || g.away_data || {},
    home: g.home || g.home_data || {},
  };
}

export function useSlate(sport = 'nba', date = null) {
  // Use local date, not UTC — toISOString() returns UTC which can be
  // yesterday's date in US timezones (AZ is UTC-7, so before 7pm = wrong date)
  function getLocalDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const targetDate = date || getLocalDate();
  const [slate, setSlate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('loading');

  useEffect(() => {
    async function fetchSlate() {
      setLoading(true);
      setError(null);
      try {
        // Fetch slate row — yesterday_results is a jsonb column, NOT a joined table
        const { data: slateData, error: slateError } = await supabase
          .from('slates')
          .select('*')
          .eq('sport', sport)
          .eq('date', targetDate)
          .single();

        if (slateError || !slateData) {
          console.info('[useSlate] No Supabase slate found — using mock data');
          setSlate(MOCK_NBA_SLATE);
          setSource('mock');
          return;
        }

        // Fetch related games rows separately
        const { data: gamesData, error: gamesError } = await supabase
          .from('games')
          .select('*')
          .eq('slate_id', slateData.id);

        if (gamesError) {
          console.warn('[useSlate] Games fetch failed:', gamesError.message);
        }

        setSlate({
          ...slateData,
          games: (gamesData || []).map(normalizeGame),
          yesterday_results: slateData.yesterday_results || [],
        });
        setSource('supabase');

      } catch (err) {
        console.warn('[useSlate] Fetch failed, using mock:', err.message);
        setSlate(MOCK_NBA_SLATE);
        setSource('mock');
      } finally {
        setLoading(false);
      }
    }

    fetchSlate();
  }, [sport, targetDate]);

  return { slate, loading, error, source };
}
