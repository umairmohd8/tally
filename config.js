// Public Supabase config. Safe to commit — the anon key is designed to be public;
// Row-Level Security is what protects data. (See docs/DECISIONS.md ADR-010.)
window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
window.sb = (window.supabase && window.SUPABASE_URL.startsWith('https://YOUR-'))
  ? null  // not configured yet → app stays in guest mode
  : (window.supabase ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
