import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_CHANGED_EVENT,
  handleSignInLinkClick,
  isNativeApp,
  notifySessionChanged,
  requestFactorySignIn,
  setInAppSignInHandler,
} from "../src/platform/factorySignIn.js";

test("native detection reads the Capacitor bridge", () => {
  assert.equal(isNativeApp({}), false);
  assert.equal(isNativeApp({ Capacitor: {} }), false);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false);
  // Older bridges expose a boolean instead of a method.
  assert.equal(isNativeApp({ Capacitor: { isNative: true } }), true);
});

test("native detection never throws on a hostile global", () => {
  assert.equal(isNativeApp(null), false);
  assert.equal(isNativeApp(undefined), false);
  assert.equal(
    isNativeApp({
      Capacitor: {
        isNativePlatform() {
          throw new Error("bridge exploded");
        },
      },
    }),
    false,
  );
});

test("with no in-app handler it falls back to the shell redirect", (t) => {
  t.after(() => setInAppSignInHandler(null));
  setInAppSignInHandler(null);

  let redirected = 0;
  const handled = requestFactorySignIn({ redirect: () => { redirected += 1; } });

  assert.equal(handled, false);
  assert.equal(redirected, 1);
});

test("a registered in-app handler wins and the shell redirect never fires", (t) => {
  t.after(() => setInAppSignInHandler(null));

  let opened = 0;
  let redirected = 0;
  setInAppSignInHandler(() => { opened += 1; });

  const handled = requestFactorySignIn({ redirect: () => { redirected += 1; } });

  assert.equal(handled, true);
  assert.equal(opened, 1);
  // This is the whole point: in the packaged app ../../sign-in/index.html does not
  // exist, so a redirect there is a dead end.
  assert.equal(redirected, 0);
});

test("a throwing in-app handler falls back rather than stranding the player", (t) => {
  t.after(() => setInAppSignInHandler(null));

  let redirected = 0;
  setInAppSignInHandler(() => { throw new Error("panel failed to open"); });

  const handled = requestFactorySignIn({ redirect: () => { redirected += 1; } });

  assert.equal(handled, false);
  assert.equal(redirected, 1);
});

test("the handler receives the caller's options", (t) => {
  t.after(() => setInAppSignInHandler(null));

  let seen = null;
  setInAppSignInHandler((options) => { seen = options; });
  requestFactorySignIn({ reason: "shop", redirect: () => {} });

  assert.equal(seen?.reason, "shop");
});

test("setInAppSignInHandler ignores non-functions", (t) => {
  t.after(() => setInAppSignInHandler(null));

  setInAppSignInHandler("not a function");
  let redirected = 0;
  requestFactorySignIn({ redirect: () => { redirected += 1; } });
  assert.equal(redirected, 1);
});

test("sign-in link clicks are handled in-app but fall through on web", (t) => {
  t.after(() => setInAppSignInHandler(null));

  // Web: no handler registered, so the anchor's own href must do the navigating.
  // Returning true here would preventDefault and leave the player stuck.
  setInAppSignInHandler(null);
  assert.equal(handleSignInLinkClick(), false);

  let opened = 0;
  setInAppSignInHandler(() => { opened += 1; });
  assert.equal(handleSignInLinkClick(), true);
  assert.equal(opened, 1);
});

test("a throwing link handler lets the anchor navigate instead", (t) => {
  t.after(() => setInAppSignInHandler(null));
  setInAppSignInHandler(() => { throw new Error("boom"); });
  assert.equal(handleSignInLinkClick(), false);
});

test("notifySessionChanged never throws without a DOM", () => {
  assert.doesNotThrow(() => notifySessionChanged(null));
  assert.doesNotThrow(() => notifySessionChanged(undefined));

  let dispatched = null;
  notifySessionChanged({ dispatchEvent: (event) => { dispatched = event.type; } });
  assert.equal(dispatched, SESSION_CHANGED_EVENT);
});
