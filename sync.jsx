// ============================================
// SYNC — Supabase data layer (window.Sync). No UI.
// Guest-safe: init()/subscribe()/uuid() work with window.sb === null; every other
// method assumes a configured client and MUST be called behind Sync.enabled() /
// signed-in guards (app.jsx does exactly this).
// ============================================
(function () {
  const sb = () => window.sb; // may be null (guest / not configured)
  const enabled = () => !!window.sb;

  // RFC4122 v4 uuid — DB `uuid` columns require a real uuid. Shared with app.jsx so
  // guest and cloud habits get identical, DB-compatible ids (no 'h'+timestamp ids).
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ---- row <-> client habit mapping ----
  function rowToHabit(r, completions) {
    return {
      id: r.id, name: r.name, color: r.color, schedule: r.schedule,
      timeOfDay: r.time_of_day, reminderTime: r.reminder_time,
      endDate: r.end_date, shared: r.shared, createdAt: r.created_at,
      completions: completions || {},
    };
  }
  function habitToRow(h, userId) {
    return {
      id: h.id, user_id: userId, name: h.name, color: h.color,
      schedule: h.schedule, time_of_day: h.timeOfDay || 'whenever',
      reminder_time: h.reminderTime || null, end_date: h.endDate || null,
      shared: !!h.shared, created_at: h.createdAt, updated_at: new Date().toISOString(),
    };
  }
  async function uid() {
    // getSession() reads the cached session locally (no network); getUser() would
    // hit /auth/v1/user on every write. Same id either way.
    const { data } = await sb().auth.getSession();
    return data.session ? data.session.user.id : null;
  }

  // ---- auth ----
  // Rely solely on onAuthStateChange: supabase-js v2 emits an immediate INITIAL_SESSION,
  // so the initial session arrives exactly once (a separate getSession().then would
  // double-deliver it, double-running migration/load). Forwards (session, event).
  function init(onAuth) {
    if (!enabled()) { onAuth(null, 'DISABLED'); return { unsubscribe() {} }; }
    const { data } = sb().auth.onAuthStateChange((event, session) => onAuth(session, event));
    return data.subscription;
  }
  function signInGoogle() {
    return sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }
  function signInEmail(email) {
    // Magic link: user clicks the emailed link → redirected back here → onAuthStateChange
    // establishes the session. No code-entry step needed.
    return sb().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
  }
  function verifyEmail(email, token) { return sb().auth.verifyOtp({ email, token, type: 'email' }); }
  function signInPhone(phone) { return sb().auth.signInWithOtp({ phone }); }
  function verifyPhone(phone, token) { return sb().auth.verifyOtp({ phone, token, type: 'sms' }); }
  function signOut() { return sb().auth.signOut(); }

  // ---- profile ----
  async function loadProfile() {
    const id = await uid(); if (!id) return null;
    let { data } = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
    if (!data) {
      data = { id, name: 'you', avatar_color: 'pop' };
      await sb().from('profiles').upsert(data);
    }
    return { id: 'me', name: data.name, avatarColor: data.avatar_color };
  }
  async function saveProfile(me) {
    const id = await uid(); if (!id) return;
    await sb().from('profiles').update({ name: me.name, avatar_color: me.avatarColor }).eq('id', id);
  }

  // ---- habits ----
  async function loadHabits() {
    const { data: rows, error } = await sb().from('habits').select('*').is('deleted_at', null);
    if (error) throw error;
    const ids = rows.map((r) => r.id);
    let comps = [];
    if (ids.length) {
      const { data, error: e2 } = await sb().from('habit_completions').select('*').in('habit_id', ids);
      if (e2) throw e2; comps = data;
    }
    const byHabit = {};
    comps.forEach((c) => { (byHabit[c.habit_id] = byHabit[c.habit_id] || {})[c.day] = true; });
    return rows.map((r) => rowToHabit(r, byHabit[r.id] || {}));
  }
  async function insertHabit(h) {
    const id = await uid(); if (!id) return;
    const { error } = await sb().from('habits').insert(habitToRow(h, id));
    if (error) throw error;
  }
  async function updateHabit(h) {
    const id = await uid(); if (!id) return;
    const row = habitToRow(h, id); delete row.user_id; delete row.created_at;
    const { error } = await sb().from('habits').update(row).eq('id', h.id);
    if (error) throw error;
  }
  async function softDeleteHabit(habitId) {
    const { error } = await sb().from('habits').update({ deleted_at: new Date().toISOString() }).eq('id', habitId);
    if (error) throw error;
  }
  async function setCompletion(habitId, day, done) {
    if (done) {
      const { error } = await sb().from('habit_completions').upsert({ habit_id: habitId, day });
      if (error) throw error;
    } else {
      const { error } = await sb().from('habit_completions').delete().eq('habit_id', habitId).eq('day', day);
      if (error) throw error;
    }
  }

  // ---- migration (first sign-in) ----
  // Uploads local habits ONLY if the account has none. Returns count uploaded, or null if account already had data.
  async function migrateLocalHabits(localHabits) {
    const id = await uid(); if (!id) return null;
    // Fail safe: a FAILED existence check must NOT be read as "account is empty" —
    // doing so re-uploads local habits on top of existing ones (duplicates). Abort
    // instead. (A live RLS-recursion error here once duplicated every habit.)
    const { data: existing, error: exErr } = await sb().from('habits').select('id').is('deleted_at', null).limit(1);
    if (exErr) throw exErr;
    if (existing && existing.length) return null; // account authoritative
    const rows = [], comps = [];
    (localHabits || []).forEach((h) => {
      const newId = uuid();
      rows.push(habitToRow({ ...h, id: newId, createdAt: h.createdAt || new Date().toISOString().slice(0, 10) }, id));
      Object.keys(h.completions || {}).forEach((day) => comps.push({ habit_id: newId, day }));
    });
    if (rows.length) { const { error } = await sb().from('habits').insert(rows); if (error) throw error; }
    if (comps.length) { const { error } = await sb().from('habit_completions').insert(comps); if (error) throw error; }
    return rows.length;
  }

  // ---- social proof: distinct users who checked in on `day` (default today) ----
  // Reads a single aggregate int via a SECURITY DEFINER RPC — no row data leaves the DB.
  // Returns null if not configured or the RPC isn't installed yet (caller hides the widget).
  async function checkinsToday(day) {
    if (!enabled()) return null;
    const { data, error } = await sb().rpc('checkins_today', day ? { d: day } : {});
    if (error) return null;
    return data == null ? 0 : Number(data);
  }

  // ---- realtime: fire onChange on any of the user's habit/completion changes ----
  function subscribe(userId, onChange) {
    if (!enabled()) return () => {};
    const ch = sb().channel('tally-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: 'user_id=eq.' + userId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_completions' }, onChange)
      .subscribe();
    return () => { sb().removeChannel(ch); };
  }

  window.Sync = {
    enabled, uuid, init, signInGoogle, signInEmail, verifyEmail, signInPhone, verifyPhone, signOut,
    loadProfile, saveProfile,
    loadHabits, insertHabit, updateHabit, softDeleteHabit, setCompletion,
    migrateLocalHabits,
    checkinsToday,
    subscribe,
    _rowToHabit: rowToHabit, _habitToRow: habitToRow, _uid: uid,
  };
})();
