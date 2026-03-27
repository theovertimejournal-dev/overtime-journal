import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useMLBPropsSlate(date) {
  const [propsSlate, setPropsSlate] = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setPropsSlate(null);

    supabase
      .from('mlb_props_slates')
      .select('*')
      .eq('date', date)
      .single()
      .then(({ data, error }) => {
        if (data) setPropsSlate(data);
        setLoading(false);
      });
  }, [date]);

  return { propsSlate, loading };
}
