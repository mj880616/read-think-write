import { createClient } from '@supabase/supabase-js';
import { SESSION_KEY, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: SESSION_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
