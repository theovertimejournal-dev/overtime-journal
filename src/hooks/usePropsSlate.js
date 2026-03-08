/**
 * usePropsSlate.js
 * 
 * DROP THIS IN: src/hooks/usePropsSlate.js
 * 
 * Mirrors your existing useSlate.js pattern exactly.
 * Fetches today's props slate from Supabase props_slates table.
 * Falls back to most recent slate if today's hasn't been pushed yet.
 * 
 * SUPABASE TABLE SETUP (run once in Supabase SQL editor):
 * 
 *   create table props_slates (
 *     id bigint generated always as identity primary key,
 *     date date not null unique,
 *     props jsonb not null default '[]',
 *     games_count int default 0,
 *     generated_at timestamptz default now()
 *   );
 *
 *   -- Allow anonymous reads (same as your slates table)
 *   alter table props_slates enable row level security;
 *   create policy "anon read" on props_slates for select using (true);
 * 
 * USAGE in OTJPropsPage.jsx:
 *   Replace: const data = MOCK_PROPS;
 *   With:    const { propsSlate, loading } = usePropsSlate(today);
 *            const data = propsSlate;
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function usePropsSlate(date) {
  const [propsSlate, setPropsSlate] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [source, setSource]         = useState(null); // 'live' | 'fallback'

  useEffect(() => {
    if (!date) return;

    async function fetchSlate() {
      setLoading(true);

      // Try today's date first
      const { data: todayData, error: todayError } = await supabase
        .from('props_slates')
        .select('*')
        .eq('date', date)
        .single();

      if (todayData && !todayError) {
        setPropsSlate(todayData);
        setSource('live');
        setLoading(false);
        return;
      }

      // Fall back to most recent slate (same as useSlate.js)
      const { data: fallbackData } = await supabase
        .from('props_slates')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (fallbackData) {
        setPropsSlate(fallbackData);
        setSource('fallback');
      } else {
        setPropsSlate(null);
        setSource(null);
      }

      setLoading(false);
    }

    fetchSlate();
  }, [date]);

  return { propsSlate, loading, source };
}
