import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.href = "";
    this.textContent = "";
    this.disabled = false;
    this.listeners = new Map();
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }
}

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("sign-in create-account link and sign-up success preserve the game return target", async () => {
  let domReady = null;
  const signUpLink = new FakeElement({ href: "../sign-up/index.html" });

  globalThis.localStorage = storageAdapter();
  globalThis.window = {
    location: {
      href: "https://arcade.example/sign-in/index.html?next=/games/tactical-arena/index.html",
      search: "?next=/games/tactical-arena/index.html",
      hostname: "arcade.example",
    },
  };
  globalThis.document = {
    getElementById() {
      return null;
    },
    querySelector() {
      return signUpLink;
    },
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") domReady = handler;
    },
  };

  await import(`../../../js/arcade-sign-in.mjs?test=${Date.now()}`);
  domReady();

  assert.equal(
    signUpLink.href,
    "https://arcade.example/sign-up/index.html?next=%2Fgames%2Ftactical-arena%2Findex.html",
  );

  let submitHandler = null;
  domReady = null;
  const form = new FakeElement();
  const signInLink = new FakeElement({ href: "../sign-in/index.html" });
  form.profileName = { value: "Pilot" };
  form.email = { value: "pilot@example.com" };
  form.password = { value: "password123" };
  form.addEventListener = (type, handler) => {
    if (type === "submit") submitHandler = handler;
  };

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      token: "token-1",
      playerId: "player-1",
      profileName: "Pilot",
    }),
  });
  globalThis.window = {
    __JGF_PLATFORM_API_URL__: "https://api.example",
    location: {
      href: "https://arcade.example/sign-up/index.html?next=/games/tactical-arena/index.html",
      search: "?next=/games/tactical-arena/index.html",
      hostname: "arcade.example",
    },
  };
  globalThis.document = {
    getElementById(id) {
      if (id === "signUpForm") return form;
      if (id === "signUpSubmit") return new FakeElement();
      return new FakeElement();
    },
    querySelector() {
      return signInLink;
    },
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") domReady = handler;
    },
  };

  await import(`../../../js/arcade-sign-up.mjs?test=${Date.now()}`);
  domReady();
  assert.equal(
    signInLink.href,
    "https://arcade.example/sign-in/index.html?next=%2Fgames%2Ftactical-arena%2Findex.html",
  );
  await submitHandler({ preventDefault() {} });

  const redirectUrl = new URL(globalThis.window.location.href);
  assert.equal(redirectUrl.pathname.replace(/\\/g, "/").endsWith("/games/tactical-arena/index.html"), true);
});
