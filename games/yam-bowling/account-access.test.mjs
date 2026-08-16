import test from "node:test";
import assert from "node:assert/strict";

import {
  FACTORY_ACCOUNT_FEATURE_MESSAGE,
  FACTORY_ACCOUNT_FEATURE_SELECTOR,
  createYamAccountAccess,
} from "./account-access.mjs";

test("signed-out players cannot enter entitlement or online modes", () => {
  let redirects = 0;
  const access = createYamAccountAccess({
    readAccount: () => ({ authenticated: false, token: "" }),
    redirectToSignIn: () => { redirects += 1; },
  });

  assert.equal(access.isEligible(), false);
  assert.equal(access.requireFactoryAccount(), false);
  assert.equal(redirects, 1);
});

test("a real Factory auth token opens account-backed modes without redirecting", () => {
  let redirects = 0;
  const access = createYamAccountAccess({
    readAccount: () => ({ authenticated: true, token: "factory-token" }),
    redirectToSignIn: () => { redirects += 1; },
  });

  assert.equal(access.isEligible(), true);
  assert.equal(access.requireFactoryAccount(), true);
  assert.equal(redirects, 0);
});

test("Yam uses one explicit gate selector and copy for Profile, Circuit, and Online", () => {
  assert.equal(FACTORY_ACCOUNT_FEATURE_SELECTOR, "[data-factory-account-feature]");
  assert.match(FACTORY_ACCOUNT_FEATURE_MESSAGE, /sign in/i);
  assert.match(FACTORY_ACCOUNT_FEATURE_MESSAGE, /circuit/i);
  assert.match(FACTORY_ACCOUNT_FEATURE_MESSAGE, /online/i);
  assert.match(FACTORY_ACCOUNT_FEATURE_MESSAGE, /room/i);
});
