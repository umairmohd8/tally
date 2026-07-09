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
  const initial = ((me && me.name) || '?').trim().charAt(0).toUpperCase();
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

window.Auth = { SignInModal, AccountControl };
