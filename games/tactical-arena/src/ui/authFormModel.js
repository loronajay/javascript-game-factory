// Pure display/validation rules for the in-app account panel.
//
// Browser-independent on purpose: the panel in authPanel.js owns the DOM and the
// network call, this owns the decisions. Keeping them apart is what makes the
// rules testable without a WebView.
//
// Client validation here deliberately mirrors platform-api/src/routes/auth-routes.mts
// rather than trying to be stricter. Diverging would either reject accounts the
// server would have accepted, or promise the player something the server refuses.

export const AUTH_MODES = Object.freeze({
  signIn: "signIn",
  signUp: "signUp",
  forgot: "forgot",
});

// The server's own minimum (auth-routes.mts rejects < 8 with password_too_short).
const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose: one @, no whitespace, and a dotted domain. The server is the
// real authority; this only catches obvious typos before spending a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

const ERROR_COPY = Object.freeze({
  auth_not_configured: "Accounts are unavailable right now. Please try again later.",
  invalid_credentials: "That email and password combination did not match an account.",
  invalid_email: "Please enter a valid email address.",
  missing_credentials: "Please enter both your email and password.",
  not_authenticated: "Your session expired. Please sign in again.",
  password_too_short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  email_taken: "That email is already registered. Try signing in instead.",
  player_already_claimed:
    "This device's arcade identity is already linked to an account. Try signing in instead.",
  network_error: "Could not reach the server. Check your connection and try again.",
  not_configured: "Accounts are unavailable right now. Please try again later.",
});

const GENERIC_ERROR = "Something went wrong. Please try again.";

const MODE_COPY = Object.freeze({
  [AUTH_MODES.signIn]: Object.freeze({
    title: "Sign In",
    blurb: "Sign in to your Javascript Game Factory account to play online, rank up, and shop.",
  }),
  [AUTH_MODES.signUp]: Object.freeze({
    title: "Create Account",
    blurb: "Your account works across the whole Javascript Game Factory arcade, not just here.",
  }),
  [AUTH_MODES.forgot]: Object.freeze({
    title: "Reset Password",
    blurb: "We'll email you a link to set a new password.",
  }),
});

const SUBMIT_COPY = Object.freeze({
  [AUTH_MODES.signIn]: Object.freeze({ idle: "Sign In", busy: "Signing in..." }),
  [AUTH_MODES.signUp]: Object.freeze({ idle: "Create Account", busy: "Creating account..." }),
  [AUTH_MODES.forgot]: Object.freeze({ idle: "Send Reset Link", busy: "Sending..." }),
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function invalid(field, message) {
  return Object.freeze({ ok: false, field, message });
}

export function validateAuthForm({ mode = AUTH_MODES.signIn, email, password } = {}) {
  const cleanEmail = text(email);
  if (!cleanEmail) return invalid("email", "Please enter your email address.");
  if (!EMAIL_PATTERN.test(cleanEmail)) return invalid("email", ERROR_COPY.invalid_email);

  if (mode === AUTH_MODES.forgot) return Object.freeze({ ok: true });

  const rawPassword = typeof password === "string" ? password : "";
  if (!rawPassword) return invalid("password", "Please enter your password.");

  // Only registration enforces the length floor. Applying it at sign-in would lock
  // out any account created before the rule existed.
  if (mode === AUTH_MODES.signUp && rawPassword.length < MIN_PASSWORD_LENGTH) {
    return invalid("password", ERROR_COPY.password_too_short);
  }

  return Object.freeze({ ok: true });
}

export function authErrorMessage(code) {
  const key = typeof code === "string" ? code : "";
  return ERROR_COPY[key] || GENERIC_ERROR;
}

export function submitLabel(mode, submitting = false) {
  const copy = SUBMIT_COPY[mode] || SUBMIT_COPY[AUTH_MODES.signIn];
  return submitting ? copy.busy : copy.idle;
}

export function panelCopy(mode) {
  return MODE_COPY[mode] || MODE_COPY[AUTH_MODES.signIn];
}

// Which mode to switch to after a registration attempt, or null to stay put.
// A successful register already returns a token, so the player is signed in — bouncing
// them to the sign-in form would make them type their password a second time.
export function nextModeAfterRegister(result) {
  if (result?.ok) return null;
  const code = typeof result?.error === "string" ? result.error : "";
  return code === "email_taken" || code === "player_already_claimed" ? AUTH_MODES.signIn : null;
}
