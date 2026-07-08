// ============================================
// AUTH UI — window.Auth: SignInModal + AccountControl. Talks to window.Sync.
// ============================================
const { useState: useStateA } = React;

function SignInModal({ onClose }) {
  const [mode, setMode] = useStateA('choose'); // 'choose' | 'phone' | 'code'
  const [phone, setPhone] = useStateA('');
  const [code, setCode] = useStateA('');
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
  const sendCode = async () => {
    if (!phone.trim()) return;
    setErr(''); setBusy(true);
    try { await window.Sync.signInPhone(phone.trim()); setMode('code'); }
    catch (e) { setErr(e.message || 'Could not send code'); }
    setBusy(false);
  };
  const verify = async () => {
    if (!code.trim()) return;
    setErr(''); setBusy(true);
    try { await window.Sync.verifyPhone(phone.trim(), code.trim()); /* app.jsx onAuth closes the modal on session */ }
    catch (e) { setErr(e.message || 'Wrong code'); setBusy(false); }
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
              <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('phone')}>Use phone number</button>
            </div>
          )}
          {mode === 'phone' && (
            <div className="field">
              <input className="text-input" placeholder="+1 555 123 4567" value={phone} autoFocus
                onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }} />
            </div>
          )}
          {mode === 'code' && (
            <div className="field">
              <div className="field-label">Code sent to {phone}</div>
              <input className="text-input" placeholder="123456" value={code} autoFocus inputMode="numeric"
                onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} />
            </div>
          )}
          {err && <div className="sync-err">{err}</div>}
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Not now</button>
            {mode === 'phone' && <button className="btn btn-primary" disabled={busy || !phone.trim()} onClick={sendCode}>Send code</button>}
            {mode === 'code' && <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={verify}>Verify</button>}
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
