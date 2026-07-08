// Template for config.js — copy this to `config.js` and fill in your Supabase values.
//   cp config.example.js config.js   (then edit)
//
// config.js is gitignored: the anon key is public-by-design (Row-Level Security is what
// protects data, see docs/DECISIONS.md ADR-010), but we keep tokens out of git to satisfy
// the secret scanner. Get both values from Supabase → Project Settings → API.
// Use the `anon` / `public` key — NEVER the `service_role` key (it bypasses RLS).
window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
window.sb = (window.supabase && window.SUPABASE_URL.startsWith('https://YOUR-'))
  ? null  // not configured yet → app stays in guest mode
  : (window.supabase ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
