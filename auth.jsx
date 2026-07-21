// ============================================
// AUTH UI — window.Auth: SignInModal + AccountControl. Talks to window.Sync.
// ============================================
const { useState: useStateA } = React;

function SignInModal({ onClose }) {
  const [mode, setMode] = useStateA('choose'); // 'choose' | 'email' | 'sent'
  const [email, setEmail] = useStateA('');
  const [busy, setBusy] = useStateA(false);
  const [err, setErr] = useStateA('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const google = async () => {
    setErr(''); setBusy(true);
    try { await window.Sync.signInGoogle(); } catch (e) { setErr(e.message || 'Sign-in failed'); setBusy(false); }
  };
  const sendLink = async () => {
    if (!email.trim()) return;
    setErr(''); setBusy(true);
    try { await window.Sync.signInEmail(email.trim()); setMode('sent'); }
    catch (e) { setErr(e.message || 'Could not send link'); }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Sync</div>
            <div className="modal-title">Carry your habits everywhere</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>
        <div className="modal-body">
          <p className="sync-blurb">Sign in to sync across your devices. Your habits stay private — friends only ever see what you mark shared.</p>
          {mode === 'choose' && (
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={google}>Continue with Google</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('email')}>Continue with email</button>
            </div>
          )}
          {mode === 'email' && (
            <div className="field">
              <input className="text-input" type="email" placeholder="you@example.com" value={email} autoFocus inputMode="email"
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }} />
            </div>
          )}
          {mode === 'sent' && (
            <div className="field">
              <div className="field-label">Check your inbox</div>
              <p className="sync-blurb">We emailed a sign-in link to <strong>{email}</strong>. Open it in <em>this</em> browser to finish.</p>
            </div>
          )}
          {err && <div className="sync-err">{err}</div>}
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>{mode === 'sent' ? 'Done' : 'Not now'}</button>
            {mode === 'email' && <button className="btn btn-primary" disabled={busy || !email.trim()} onClick={sendLink}>Send link</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Topbar control: "sync" when signed out, initial + sign-out when signed in.
function AccountControl({ session, me, onOpenSignIn, onSignOut }) {
  const [menu, setMenu] = useStateA(false);
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    setTimeout(() => window.addEventListener('click', close, { once: true }), 0);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  if (!window.Sync.enabled()) return null; // backend not configured → no control
  if (!session) {
    return <button className="icon-btn" onClick={onOpenSignIn} aria-label="Sign in to sync" title="Sign in to sync"><window.Icons.Cloud /></button>;
  }
  const initial = me && me.avatarEmoji ? me.avatarEmoji : ((me && me.name) || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{ position: 'relative' }}>
      <button className="avatar avatar-sm" aria-label="Account" onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}
        style={{ background: window.HabitUtils.colorOf((me && me.avatarColor) || 'pop') }}>{initial}</button>
      {menu && (
        <div className="account-menu" onClick={(e) => e.stopPropagation()}>
          <div className="account-menu-name">synced as {me ? me.name : 'you'}</div>
          <button onClick={() => { onSignOut(); setMenu(false); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function CompleteProfileModal({ me, onSaveProfile, onClose }) {
  const { COLORS, colorOf } = window.HabitUtils;
  const [name, setName] = useStateA(me.name || 'you');
  const [avatarColor, setAvatarColor] = useStateA(me.avatarColor || 'pop');
  const [avatarEmoji, setAvatarEmoji] = useStateA(me.avatarEmoji || '');
  const [weeklyTarget, setWeeklyTarget] = useStateA(me.weeklyTarget !== undefined ? me.weeklyTarget : 5);

  const EMOJIS = ['🎯', '🧘', '🏃', '📝', '🥑', '💧', '📚', '☕️', '🎨', '🕯️', '🪴', '🌙'];

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    const trimmedName = name.trim();
    onSaveProfile({
      ...me,
      name: trimmedName || 'you',
      avatarColor,
      avatarEmoji,
      weeklyTarget
    });
    onClose();
  };

  const initial = avatarEmoji || (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Complete your profile">
      <div className="modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Onboarding</div>
            <div className="modal-title">Complete your profile</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>
        <div className="modal-body onboarding-modal-body">
          <p className="sync-blurb">Let's personalize your habit tracking experience! You can always change these later in the Profile tab.</p>
          
          {/* Avatar Preview */}
          <div className="onboarding-avatar-preview-wrap">
            <span className="avatar avatar-large" style={{ background: colorOf(avatarColor) }}>
              {initial}
            </span>
          </div>

          {/* Name Field */}
          <div className="field">
            <label className="field-label" htmlFor="onboarding-name-input">what should we call you?</label>
            <input
              id="onboarding-name-input"
              className="text-input"
              type="text"
              placeholder="your name"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Color Swatches */}
          <div className="field">
            <label className="field-label">choose an avatar color</label>
            <div className="swatch-row" role="radiogroup" aria-label="Avatar color">
              {COLORS.map(c => (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={avatarColor === c.key}
                  aria-label={c.key}
                  className="swatch-btn"
                  style={{ '--swatch': c.value, position: 'relative' }}
                  onClick={() => setAvatarColor(c.key)}
                >
                  {avatarColor === c.key && <span className="swatch-selected-dot" />}
                </button>
              ))}
            </div>
          </div>

          {/* Emoji Selection */}
          <div className="field">
            <label className="field-label">choose an emoji (optional)</label>
            <div className="emoji-row">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className={`emoji-btn ${avatarEmoji === emoji ? 'active' : ''}`}
                  onClick={() => setAvatarEmoji(avatarEmoji === emoji ? '' : emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly Goal Slider */}
          <div className="field">
            <label className="field-label">weekly goal: {weeklyTarget} completions / week</label>
            <input
              type="range"
              min="1"
              max="35"
              value={weeklyTarget}
              className="goal-slider"
              onChange={(e) => setWeeklyTarget(parseInt(e.target.value, 10))}
            />
          </div>
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Skip for now</button>
            <button className="btn btn-primary" onClick={submit}>Save & continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Auth = { SignInModal, AccountControl, CompleteProfileModal };
