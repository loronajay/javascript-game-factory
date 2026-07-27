import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_MODES,
  authErrorMessage,
  nextModeAfterRegister,
  panelCopy,
  submitLabel,
  validateAuthForm,
} from "../src/ui/authFormModel.js";

test("sign-in requires an email and a password", () => {
  const missingEmail = validateAuthForm({ mode: AUTH_MODES.signIn, email: "", password: "hunter22" });
  assert.equal(missingEmail.ok, false);
  assert.equal(missingEmail.field, "email");

  const missingPassword = validateAuthForm({ mode: AUTH_MODES.signIn, email: "a@b.co", password: "" });
  assert.equal(missingPassword.ok, false);
  assert.equal(missingPassword.field, "password");

  assert.equal(validateAuthForm({ mode: AUTH_MODES.signIn, email: "a@b.co", password: "x" }).ok, true);
});

test("sign-in does not impose the 8-character rule", () => {
  // Only registration has a minimum length. Applying it at sign-in would lock out
  // any account created before the rule existed.
  const result = validateAuthForm({ mode: AUTH_MODES.signIn, email: "a@b.co", password: "short" });
  assert.equal(result.ok, true);
});

test("sign-up enforces the server's 8-character minimum", () => {
  const tooShort = validateAuthForm({
    mode: AUTH_MODES.signUp,
    email: "a@b.co",
    password: "1234567",
  });
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.field, "password");
  assert.match(tooShort.message, /8/);

  assert.equal(
    validateAuthForm({ mode: AUTH_MODES.signUp, email: "a@b.co", password: "12345678" }).ok,
    true,
  );
});

test("email shape is validated before hitting the network", () => {
  for (const email of ["nope", "no@domain", "@b.co", "a b@c.co", "a@b.", ""]) {
    const result = validateAuthForm({ mode: AUTH_MODES.signUp, email, password: "12345678" });
    assert.equal(result.ok, false, `expected ${JSON.stringify(email)} to be rejected`);
    assert.equal(result.field, "email");
  }
  assert.equal(
    validateAuthForm({ mode: AUTH_MODES.signUp, email: "a.b+tag@sub.example.co", password: "12345678" }).ok,
    true,
  );
});

test("forgot-password only needs an email", () => {
  const result = validateAuthForm({ mode: AUTH_MODES.forgot, email: "a@b.co", password: "" });
  assert.equal(result.ok, true);

  const bad = validateAuthForm({ mode: AUTH_MODES.forgot, email: "", password: "" });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, "email");
});

test("values are trimmed before validation", () => {
  assert.equal(validateAuthForm({ mode: AUTH_MODES.signIn, email: "  a@b.co  ", password: "x" }).ok, true);
  assert.equal(validateAuthForm({ mode: AUTH_MODES.signIn, email: "   ", password: "x" }).ok, false);
});

test("every server error code maps to human copy", () => {
  const serverCodes = [
    "auth_not_configured",
    "invalid_credentials",
    "invalid_email",
    "missing_credentials",
    "not_authenticated",
    "password_too_short",
    "email_taken",
    "player_already_claimed",
    "network_error",
    "not_configured",
  ];
  for (const code of serverCodes) {
    const message = authErrorMessage(code);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0, `no copy for ${code}`);
    // Raw snake_case codes must never reach the player.
    assert.ok(!message.includes("_"), `raw code leaked for ${code}: ${message}`);
  }
});

test("unknown and empty error codes fall back to generic copy", () => {
  const fallback = authErrorMessage("some_new_code_from_the_future");
  assert.ok(fallback.length > 0);
  assert.ok(!fallback.includes("_"));
  assert.equal(authErrorMessage(""), fallback);
  assert.equal(authErrorMessage(undefined), fallback);
});

test("submit label reflects mode and in-flight state", () => {
  assert.notEqual(submitLabel(AUTH_MODES.signIn, false), submitLabel(AUTH_MODES.signUp, false));
  assert.notEqual(submitLabel(AUTH_MODES.signIn, false), submitLabel(AUTH_MODES.signIn, true));
  for (const mode of Object.values(AUTH_MODES)) {
    assert.ok(submitLabel(mode, false).length > 0);
    assert.ok(submitLabel(mode, true).length > 0);
  }
});

test("panel copy exists for every mode", () => {
  for (const mode of Object.values(AUTH_MODES)) {
    const copy = panelCopy(mode);
    assert.ok(copy.title.length > 0, `no title for ${mode}`);
    assert.ok(copy.blurb.length > 0, `no blurb for ${mode}`);
  }
});

test("registering lands the player straight in, not back at sign-in", () => {
  // /auth/register returns a token, so a successful sign-up is already a session.
  // Bouncing to the sign-in form would make the player type their password twice.
  assert.equal(nextModeAfterRegister({ ok: true, token: "t" }), null);
  assert.equal(nextModeAfterRegister({ ok: false, error: "email_taken" }), AUTH_MODES.signIn);
  assert.equal(nextModeAfterRegister({ ok: false, error: "invalid_email" }), null);
});
