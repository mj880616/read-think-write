import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { isRememberedLoginValid } from './model.js';

const SESSION_STORAGE_KEY = 'rtw_auth_session_v1';
const REMEMBER_LOGIN_KEY = 'rtw_remember_until_v1';

const guardedStorage = {
  getItem(key) {
    if (key === SESSION_STORAGE_KEY) {
      const rememberedUntil = localStorage.getItem(REMEMBER_LOGIN_KEY);
      if (!isRememberedLoginValid(rememberedUntil)) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        return null;
      }
    }
    return localStorage.getItem(key);
  },
  setItem(key, value) {
    localStorage.setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: SESSION_STORAGE_KEY,
    storage: guardedStorage,
    flowType: 'pkce',
    detectSessionInUrl: false
  }
});
