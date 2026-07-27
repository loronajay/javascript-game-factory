// In-app account panel: sign in, create account, and request a password reset
// without leaving the game.
//
// The packaged app has no arcade shell, so the shared gate's redirect to
// ../../sign-in/index.html goes nowhere. This is the app's replacement front door.
// It talks to the SAME platform endpoints the web sign-in pages use, so an account
// created here is an ordinary Javascript Game Factory account that works on the web
// too — there is exactly one identity system.
//
// All I/O is injectable (`auth`, `onSignedIn`, `documentRef`) so the flow can be driven
// headlessly in a test harness without a real backend or a WebView.

import { el } from "./domHelpers.js";
import {
  AUTH_MODES,
  authErrorMessage,
  nextModeAfterRegister,
  panelCopy,
  submitLabel,
  validateAuthForm,
} from "./authFormModel.js";
import { createAuthApiClient } from "../../../../js/platform/api/auth-api.mjs";
import {
  bindFactoryProfileToSession,
  loadFactoryProfile,
} from "../../../../js/platform/identity/factory-profile.mjs";

let host = null;
let activeClose = null;

function ensureHost(documentRef) {
  if (host && host.isConnected) return host;
  host = documentRef.createElement("div");
  host.className = "ref-modal auth-modal";
  host.hidden = true;
  documentRef.body.appendChild(host);
  return host;
}

function field(labelText, input) {
  const wrap = el("label", "auth-field");
  wrap.appendChild(el("span", "auth-field-label", labelText));
  wrap.appendChild(input);
  return wrap;
}

function textInput(documentRef, { type, name, autocomplete, placeholder }) {
  const input = documentRef.createElement("input");
  input.type = type;
  input.name = name;
  input.className = "auth-input";
  input.autocomplete = autocomplete;
  if (placeholder) input.placeholder = placeholder;
  // The WebView zooms on focus when the font is under 16px; the stylesheet pins it,
  // but autocapitalize/autocorrect still have to be off or emails get mangled.
  input.autocapitalize = "off";
  input.autocorrect = "off";
  input.spellcheck = false;
  return input;
}

export function openAuthPanel({
  mode = AUTH_MODES.signIn,
  auth = createAuthApiClient(),
  onSignedIn = null,
  documentRef = globalThis.document,
} = {}) {
  // Re-opening while already open should switch modes, not stack two overlays.
  if (activeClose) activeClose();

  const overlay = ensureHost(documentRef);
  let currentMode = mode;
  let submitting = false;
  // Survives a re-render, so switching modes can carry a message across (e.g.
  // "that email is already registered" when sign-up bounces you to sign-in).
  let pendingFlash = null;

  return new Promise((resolve) => {
    let settled = false;

    function close(result) {
      if (settled) return;
      settled = true;
      activeClose = null;
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlayClick);
      documentRef.removeEventListener("keydown", onKey);
      overlay.replaceChildren();
      resolve(result);
    }
    activeClose = () => close(null);

    function onOverlayClick(event) {
      if (event.target === overlay && !submitting) close(null);
    }
    function onKey(event) {
      if (event.key === "Escape" && !submitting) close(null);
    }

    function render() {
      overlay.replaceChildren();
      const copy = panelCopy(currentMode);

      const card = el("div", "ref-card auth-card");
      overlay.appendChild(card);

      const head = el("header", "ref-head auth-head");
      const headRow = el("div", "ref-head-title");
      headRow.appendChild(el("h2", "", copy.title));
      const closeBtn = el("button", "ref-close", "Close");
      closeBtn.type = "button";
      closeBtn.addEventListener("click", () => close(null));
      headRow.appendChild(closeBtn);
      head.appendChild(headRow);
      card.appendChild(head);

      const body = el("div", "auth-body");
      card.appendChild(body);
      body.appendChild(el("p", "auth-blurb", copy.blurb));

      const form = documentRef.createElement("form");
      form.className = "auth-form";
      form.noValidate = true;
      body.appendChild(form);

      const inputs = {};

      if (currentMode === AUTH_MODES.signUp) {
        inputs.profileName = textInput(documentRef, {
          type: "text",
          name: "profileName",
          autocomplete: "nickname",
          placeholder: "Optional",
        });
        form.appendChild(field("Display Name", inputs.profileName));
      }

      inputs.email = textInput(documentRef, {
        type: "email",
        name: "email",
        autocomplete: "email",
        placeholder: "you@example.com",
      });
      form.appendChild(field("Email", inputs.email));

      if (currentMode !== AUTH_MODES.forgot) {
        inputs.password = textInput(documentRef, {
          type: "password",
          name: "password",
          autocomplete: currentMode === AUTH_MODES.signUp ? "new-password" : "current-password",
          placeholder: currentMode === AUTH_MODES.signUp ? "At least 8 characters" : "",
        });
        form.appendChild(field("Password", inputs.password));
      }

      const flash = el("p", "auth-flash");
      flash.setAttribute("role", "status");
      form.appendChild(flash);

      const submit = el("button", "primary menu-btn auth-submit", submitLabel(currentMode, false));
      submit.type = "submit";
      form.appendChild(submit);

      const switcher = el("div", "auth-switch");
      form.appendChild(switcher);

      function addSwitch(label, nextMode) {
        const button = el("button", "auth-switch-btn", label);
        button.type = "button";
        button.addEventListener("click", () => {
          if (submitting) return;
          currentMode = nextMode;
          render();
        });
        switcher.appendChild(button);
      }

      if (currentMode === AUTH_MODES.signIn) {
        addSwitch("Create an account", AUTH_MODES.signUp);
        addSwitch("Forgot password?", AUTH_MODES.forgot);
      } else if (currentMode === AUTH_MODES.signUp) {
        addSwitch("I already have an account", AUTH_MODES.signIn);
      } else {
        addSwitch("Back to sign in", AUTH_MODES.signIn);
      }

      function setFlash(message, kind = "error") {
        flash.textContent = message || "";
        flash.classList.toggle("is-error", Boolean(message) && kind === "error");
        flash.classList.toggle("is-ok", Boolean(message) && kind === "ok");
      }

      if (pendingFlash) {
        setFlash(pendingFlash.message, pendingFlash.kind);
        pendingFlash = null;
      }

      function setSubmitting(value) {
        submitting = value;
        submit.disabled = value;
        submit.textContent = submitLabel(currentMode, value);
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitting) return;
        setFlash("");

        const email = inputs.email.value;
        const password = inputs.password?.value ?? "";

        const check = validateAuthForm({ mode: currentMode, email, password });
        if (!check.ok) {
          setFlash(check.message);
          inputs[check.field]?.focus?.();
          return;
        }

        setSubmitting(true);
        let result;
        try {
          if (currentMode === AUTH_MODES.forgot) {
            result = await auth.forgotPassword({ email: email.trim() });
          } else if (currentMode === AUTH_MODES.signUp) {
            // Claim this device's local guest identity so campaign/Valor progress
            // earned before signing up carries into the new account.
            const claimPlayerId = loadFactoryProfile()?.playerId || "";
            result = await auth.register({
              email: email.trim(),
              password,
              profileName: inputs.profileName?.value?.trim() || "",
              claimPlayerId,
            });
          } else {
            result = await auth.login({ email: email.trim(), password });
          }
        } catch {
          result = { ok: false, error: "network_error" };
        }
        setSubmitting(false);

        if (currentMode === AUTH_MODES.forgot) {
          // Never reveal whether an email is registered.
          setFlash("If that email has an account, a reset link is on its way.", "ok");
          return;
        }

        if (!result?.ok) {
          const message = authErrorMessage(result?.error);
          const switchTo = currentMode === AUTH_MODES.signUp ? nextModeAfterRegister(result) : null;
          if (switchTo) {
            // Carry the reason across the re-render so the player understands why
            // the form just changed under them.
            pendingFlash = { message, kind: "error" };
            currentMode = switchTo;
            render();
          } else {
            setFlash(message);
          }
          return;
        }

        if (result.playerId) {
          bindFactoryProfileToSession(result.playerId, undefined, {
            profileName: result.profileName,
          });
        }

        try {
          await onSignedIn?.(result);
        } catch {
          // A failure re-syncing menus must not look like a failed sign-in; the
          // token is already stored and the session is real.
        }

        close({ ok: true, playerId: result.playerId, profileName: result.profileName });
      });

      // Autofocus only on pointer-precise devices. On a short landscape phone the
      // software keyboard would immediately cover the form it just focused.
      const coarse = documentRef.defaultView?.matchMedia?.("(pointer: coarse)")?.matches;
      if (!coarse) inputs.email.focus?.();
    }

    overlay.hidden = false;
    overlay.addEventListener("click", onOverlayClick);
    documentRef.addEventListener("keydown", onKey);
    render();
  });
}

export { AUTH_MODES };
