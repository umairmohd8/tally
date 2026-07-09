// ============================================
// SOCIAL — friends & sharing (simulated, localStorage) · Inkwell skin
// Mirrors the owner-habit shape so HabitUtils.computeStreak + dots work unchanged.
// ============================================
const { useState: useStateS } = React;

// ---- seed helpers ----
function seedMe() {
  return { id: 'me', name: 'you', avatarColor: 'pop' };
}

// Build a friend habit using the SAME shape as owner habits, with ~70 days of plausible data.
function mkFriendHabit(id, name, color, schedule, today, prob) {
  const { dayKey, addDays, isScheduled } = window.HabitUtils;
  const completions = {};
  for (let i = 0; i < 70; i++) {
    const d = addDays(today, -i);
    if (!isScheduled({ schedule }, d)) continue;
    if (i === 0) { if (Math.random() < prob * 0.6) completions[dayKey(d)] = true; continue; }
    if (Math.random() < prob) completions[dayKey(d)] = true;
  }
  return { id, name, color, schedule, timeOfDay: 'whenever', completions, createdAt: dayKey(addDays(today, -70)) };
}

function makeFriend(name, avatarColor, today) {
  const id = 'f' + Date.now() + Math.floor(Math.random() * 1000);
  const habits = [
    mkFriendHabit(id + '-a', 'Morning walk', 'cloud', { type: 'daily' }, today, 0.8),
    mkFriendHabit(id + '-b', 'Read', 'plum', { type: 'weekly_count', count: 4 }, today, 0.6),
  ];
  return { id, name, avatarColor, habits };
}

function seedFriends(today) {
  const maya = { id: 'fm', name: 'maya', avatarColor: 'plum', habits: [
    mkFriendHabit('fm-run', 'Run', 'cloud', { type: 'specific_days', days: [1, 3, 5] }, today, 0.85),
    mkFriendHabit('fm-read', 'Read 20 pages', 'cobalt', { type: 'daily' }, today, 0.7),
  ] };
  const jess = { id: 'fj', name: 'jess', avatarColor: 'pop', habits: [
    mkFriendHabit('fj-med', 'Meditate', 'butter', { type: 'daily' }, today, 0.9),
  ] };
  const sam = { id: 'fs', name: 'sam', avatarColor: 'cobalt', habits: [
    mkFriendHabit('fs-water', 'Drink water', 'cobalt', { type: 'daily' }, today, 0.75),
    mkFriendHabit('fs-stretch', 'Stretch', 'cloud', { type: 'weekly_count', count: 3 }, today, 0.5),
  ] };
  return [maya, jess, sam];
}

// ---- read-only friend habit row (no check, no menu) ----
function FriendHabitRow({ habit, today }) {
  const { colorOf, dayKey, addDays, computeStreak, getSchedule } = window.HabitUtils;
  const swatch = colorOf(habit.color);
  const isWeekly = getSchedule(habit).type === 'weekly_count';
  const streak = computeStreak(habit, today, null);
  const todayKey = dayKey(today);
  const doneToday = !!habit.completions[todayKey];
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dayKey(d);
    dots.push({ k, filled: !!habit.completions[k], isToday: i === 0 });
  }
  return (
    <div className="friend-habit">
      <span className="swatch" style={{ background: swatch }} />
      <span className="friend-habit-name">{habit.name}</span>
      {doneToday && <span className="friend-today-dot" style={{ background: swatch }} title="done today" />}
      {streak > 0 && <span className="friend-streak" title={`${streak} ${isWeekly ? 'week' : 'day'} streak`}>{streak}{isWeekly ? 'w' : 'd'}</span>}
      <span className="streak-dots" aria-label="Last 7 days">
        {dots.map((dot) => (
          <span
            key={dot.k}
            className={`streak-dot ${dot.filled ? 'filled' : ''} ${dot.isToday ? 'today' : ''}`}
            style={dot.filled ? { background: swatch } : undefined}
            title={dot.k}
          />
        ))}
      </span>
    </div>
  );
}

// ---- one friend ----
function FriendCard({ friend, today, onRemove }) {
  const { colorOf } = window.HabitUtils;
  const initial = (friend.name || '?').trim().charAt(0).toUpperCase();
  const shared = friend.habits || [];
  return (
    <div className="friend-card">
      <div className="friend-card-head">
        <span className="avatar" style={{ background: colorOf(friend.avatarColor) }}>{initial}</span>
        <div className="friend-card-id">
          <div className="friend-card-name">{friend.name}</div>
          <div className="friend-card-meta">
            {shared.length === 0 ? 'nothing shared yet' : `${shared.length} shared habit${shared.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button className="icon-btn" aria-label={`Remove ${friend.name}`} onClick={() => onRemove(friend.id)}>
          <window.Icons.X size={15} />
        </button>
      </div>
      {shared.length > 0 && (
        <div className="friend-habits">
          {shared.map((h) => <FriendHabitRow key={h.id} habit={h} today={today} />)}
        </div>
      )}
    </div>
  );
}

// ---- add a (simulated) friend ----
function AddFriendModal({ onClose, onAdd }) {
  const { COLORS } = window.HabitUtils;
  const [name, setName] = useStateS('');
  const [avatarColor, setAvatarColor] = useStateS(COLORS[0].key);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = () => { if (!name.trim()) return; onAdd(name.trim(), avatarColor); };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Add friend">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">New friend</div>
            <div className="modal-title">Who's keeping you honest?</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <input ref={inputRef} className="text-input" placeholder="e.g. maya" value={name} maxLength={24}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
          <div className="field">
            <div className="field-label">Color</div>
            <div className="swatch-row" role="radiogroup" aria-label="Avatar color">
              {COLORS.map((c) => (
                <button key={c.key} role="radio" aria-checked={avatarColor === c.key} aria-label={c.key}
                  className="swatch-btn" style={{ '--swatch': c.value }} onClick={() => setAvatarColor(c.key)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={submit}>Add friend</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- add a friend by invite code (signed-in) ----
function AddByCode({ onAddByCode }) {
  const [code, setCode] = useStateS('');
  const [err, setErr] = useStateS('');
  const [busy, setBusy] = useStateS(false);
  const ERRORS = {
    not_found: "no one has that code",
    self: "that's your own code",
    already_friends: "you're already friends",
  };
  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setErr('');
    try {
      await onAddByCode(c);
      setCode('');
    } catch (e) {
      const key = (e && e.message ? e.message : '').trim();
      setErr(ERRORS[key] || 'could not add · check the code');
    } finally { setBusy(false); }
  };
  return (
    <div className="add-by-code">
      <input className="text-input" placeholder="enter a friend's code" value={code} maxLength={8}
        onChange={(e) => { setErr(''); setCode(e.target.value.toUpperCase()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button className="btn btn-primary" disabled={!code.trim() || busy} onClick={submit}>add</button>
      {err && <div className="add-by-code-err">{err}</div>}
    </div>
  );
}

// ---- the Friends tab body ----
function FriendsScreen({ me, friends, today, signedIn, myCode, onAddByCode, onAddFriend, onRemoveFriend, onRenameMe }) {
  const { colorOf } = window.HabitUtils;
  const [adding, setAdding] = useStateS(false);
  const [editingName, setEditingName] = useStateS(false);
  const [nameDraft, setNameDraft] = useStateS(me.name);
  const [copied, setCopied] = useStateS(false);
  React.useEffect(() => { setNameDraft(me.name); }, [me.name]);
  const saveName = () => { onRenameMe(nameDraft); setEditingName(false); };
  const copyCode = () => {
    if (!myCode) return;
    try { navigator.clipboard.writeText(myCode); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) {}
  };
  return (
    <div className="friends-screen">
      <div className="friends-me">
        <span className="avatar" style={{ background: colorOf(me.avatarColor) }}>
          {(me.name || '?').trim().charAt(0).toUpperCase()}
        </span>
        {editingName ? (
          <input className="text-input friends-me-input" value={nameDraft} autoFocus maxLength={24}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameDraft(me.name); setEditingName(false); } }}
            onBlur={saveName} />
        ) : (
          <button className="friends-me-name" onClick={() => setEditingName(true)}>you · {me.name}</button>
        )}
      </div>

      {signedIn && myCode && (
        <div className="invite-panel">
          <div className="invite-label">your code · share it to connect</div>
          <button className="invite-code" onClick={copyCode} title="copy">
            {myCode}<span className="invite-copy">{copied ? 'copied' : 'copy'}</span>
          </button>
          <AddByCode onAddByCode={onAddByCode} />
        </div>
      )}

      {friends.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Better together.</div>
          <div className="empty-sub">
            {signedIn ? 'share your code, add a friend, keep each other honest.'
                      : 'Add a friend, share a habit or two, keep each other honest.'}
          </div>
          {!signedIn && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a friend</button>}
        </div>
      ) : (
        <>
          {friends.map((f) => <FriendCard key={f.id} friend={f} today={today} onRemove={onRemoveFriend} />)}
          {!signedIn && (
            <div className="add-row">
              <button className="add-btn" onClick={() => setAdding(true)}>
                <window.Icons.Plus size={13} /> add friend
              </button>
            </div>
          )}
        </>
      )}

      {adding && <AddFriendModal onClose={() => setAdding(false)} onAdd={(name, color) => { onAddFriend(name, color); setAdding(false); }} />}
    </div>
  );
}

window.Social = { FriendsScreen, FriendCard, FriendHabitRow, AddFriendModal, AddByCode, seedMe, seedFriends, makeFriend };
