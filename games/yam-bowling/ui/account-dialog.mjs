import { createAuthApiClient } from '../../../js/platform/api/auth-api.mjs';
import { AUTH_SESSION_EXPIRED_EVENT, getStoredAuthToken, storeAuthToken, clearAuthToken } from '../../../js/platform/api/auth-token.mjs';
import { bindFactoryProfileToSession, loadFactoryProfile } from '../../../js/platform/identity/factory-profile.mjs';
import { clearPlatformStorage } from '../../../js/platform/storage/storage.mjs';

// Account changes must not erase unrelated games on the shared arcade origin.
export function clearYamAccountStorage(storage = globalThis.localStorage) {
  try {
    const keys = Array.from({ length: storage?.length || 0 }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith('yam-bowling.')) storage.removeItem(key);
    clearPlatformStorage(storage);
  } catch { /* A storage failure must not trap the account panel. */ }
}

export function createYamAccountDialog({
  auth = createAuthApiClient(), doc = document,
  reload = () => location.reload(), confirmDelete = () => confirm('Permanently delete your Factory account and associated game progress across Jay Arcade games? This cannot be undone.'),
} = {}) {
  const dialog = doc.createElement('dialog');
  dialog.className = 'menu-splash-dialog native-account-dialog';
  dialog.setAttribute('aria-label', 'Yam Bowling account');
  dialog.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Close account">×</button>
    <h2 data-heading>Sign in</h2>
    <p>Use the same Factory account as Tactical Arena. Keep your bowlers, vouchers, and progress across devices.</p>
    <form data-auth>
      <label data-name-field hidden>Display name<input name="profileName" autocomplete="nickname" maxlength="12"></label>
      <label>Email<input name="email" type="email" autocomplete="username" required autocapitalize="off" spellcheck="false"></label>
      <label data-password-field>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="native-account-actions">
        <button class="button button--primary" type="submit" data-submit>Sign in</button>
        <button class="button" type="button" data-mode="register">Create account</button>
        <button class="button" type="button" data-mode="reset">Forgot password?</button>
        <button class="button" type="button" data-mode="login" hidden>Back to sign in</button>
      </div>
    </form>
    <div class="native-account-actions" data-signed-in hidden>
      <button class="button" type="button" data-sign-out>Sign out</button>
      <button class="button" type="button" data-delete>Delete account</button>
    </div>
    <p role="status" aria-live="polite" data-status></p>
    <p><a href="https://factory.jayarcade.com/privacy/">Privacy policy</a> ·
      <a href="mailto:leojaylorona.arcade@gmail.com">Support</a></p>`;
  doc.body.append(dialog);
  const status = dialog.querySelector('[data-status]');
  const form = dialog.querySelector('form');
  const password = form.elements.namedItem('password');
  const accountButton = doc.getElementById('native-account-button');
  let mode = 'login';
  let busy = false;

  function setMode(nextMode) {
    mode = nextMode;
    const reset = mode === 'reset';
    const registering = mode === 'register';
    dialog.querySelector('[data-heading]').textContent = reset ? 'Reset password' : registering ? 'Create account' : 'Sign in';
    dialog.querySelector('[data-name-field]').hidden = !registering;
    dialog.querySelector('[data-password-field]').hidden = reset;
    password.required = !reset;
    password.minLength = registering ? 8 : 0;
    password.autocomplete = registering ? 'new-password' : 'current-password';
    dialog.querySelector('[data-submit]').textContent = reset ? 'Send reset link' : registering ? 'Create account' : 'Sign in';
    for (const button of dialog.querySelectorAll('[data-mode]')) button.hidden = mode === 'login' ? button.dataset.mode === 'login' : button.dataset.mode !== 'login';
    status.textContent = '';
  }

  function sync() {
    const signedIn = Boolean(getStoredAuthToken());
    form.hidden = signedIn;
    dialog.querySelector('[data-signed-in]').hidden = !signedIn;
    if (accountButton) accountButton.textContent = signedIn ? 'Account' : 'Sign in';
    if (signedIn) dialog.querySelector('[data-heading]').textContent = 'Factory account';
  }

  function open() {
    setMode('login');
    sync();
    if (!dialog.open) dialog.showModal();
  }

  async function submit(operation) {
    if (busy) return;
    busy = true;
    for (const button of dialog.querySelectorAll('button')) button.disabled = true;
    status.textContent = 'Please wait…';
    try { await operation(); }
    catch { status.textContent = 'Could not reach your account. Please try again.'; }
    finally { busy = false; for (const button of dialog.querySelectorAll('button')) button.disabled = false; }
  }

  globalThis.addEventListener('yam-open-account', open);
  accountButton?.addEventListener('click', open);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { password.value = ''; });
  for (const button of dialog.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
  doc.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
    sync();
    if (dialog.open) { setMode('login'); status.textContent = 'Your session expired. Please sign in again.'; }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    values.email = values.email.trim();
    if (mode !== 'reset' && !values.password) { status.textContent = 'Please enter your password.'; return; }
    if (mode === 'register' && values.password.length < 8) { status.textContent = 'Password must be at least 8 characters.'; return; }
    const action = mode;
    submit(async () => {
      const result = action === 'reset' ? await auth.forgotPassword({ email: values.email })
        : action === 'register' ? await auth.register({ ...values, claimPlayerId: loadFactoryProfile()?.playerId || '' }) : await auth.login(values);
      if (!result?.ok) {
        status.textContent = result?.error === 'invalid_credentials' ? 'Email or password is incorrect.'
          : result?.error === 'email_taken' ? 'That email already has an account. Sign in instead.'
          : 'Account request could not be completed. Check your details and try again.';
        return;
      }
      if (action === 'reset') { status.textContent = 'If an account exists, a reset link will be emailed to you. After resetting, return here to sign in.'; return; }
      if (!result.playerId || !result.token) { status.textContent = 'Account created. Please sign in to continue.'; return; }
      if (loadFactoryProfile()?.playerId !== result.playerId) clearYamAccountStorage();
      bindFactoryProfileToSession(result.playerId, undefined, { profileName: result.profileName });
      // Binding can clear identity caches; retain the server-issued credential.
      storeAuthToken(result.token);
      password.value = '';
      reload();
    });
  });
  dialog.querySelector('[data-sign-out]').addEventListener('click', () => submit(async () => {
    await auth.logout(); clearAuthToken(); clearYamAccountStorage(); reload();
  }));
  dialog.querySelector('[data-delete]').addEventListener('click', () => {
    if (!confirmDelete()) return;
    submit(async () => {
      const result = await auth.deleteAccount();
      if (!result.ok) { status.textContent = 'Account deletion failed. Please retry or contact support.'; return; }
      clearAuthToken(); clearYamAccountStorage(); reload();
    });
  });
  sync();
  return { open, sync, dialog };
}
