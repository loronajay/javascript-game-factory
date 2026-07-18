import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { bindFactoryProfileToSession } from "./platform/identity/factory-profile.mjs";
import { resolveAppRedirectTarget } from "./arcade-paths.mjs";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  missing_credentials: "Please enter your email and password.",
  auth_not_configured: "Sign-in is unavailable right now.",
  network_error: "Could not reach the server. Try again.",
  not_configured: "Sign-in is unavailable right now.",
};

function showFlash(el: HTMLElement | null, message: string): void {
  if (el) el.textContent = message;
}

function clearFlash(el: HTMLElement | null): void {
  if (el) el.textContent = "";
}

function setSubmitting(button: HTMLButtonElement | null, submitting: boolean): void {
  if (!button) return;
  button.disabled = submitting;
  button.textContent = submitting ? "Signing in..." : "Sign In";
}

function applySessionToProfile(playerId: any): void {
  bindFactoryProfileToSession(playerId);
}

function getRedirectTarget(): string {
  const params = new URLSearchParams(window.location.search);
  return resolveAppRedirectTarget(params.get("next"), {
    currentHref: window.location.href,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signInForm") as HTMLFormElement | null;
  const flashEl = document.getElementById("authFlash");
  const submitBtn = document.getElementById("signInSubmit") as HTMLButtonElement | null;
  const signUpLink = document.querySelector<HTMLAnchorElement>(".auth-card__switch[href*='sign-up']");
  const auth = createAuthApiClient();

  if (signUpLink) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) {
      const signUpUrl = new URL(signUpLink.getAttribute("href") || "../sign-up/index.html", window.location.href);
      signUpUrl.searchParams.set("next", next);
      signUpLink.href = signUpUrl.toString();
    }
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFlash(flashEl);

    const email = (form as any).email?.value?.trim() || "";
    const password = (form as any).password?.value || "";

    if (!email || !password) {
      showFlash(flashEl, "Please enter your email and password.");
      return;
    }

    setSubmitting(submitBtn, true);

    const result = await auth.login({ email, password });

    setSubmitting(submitBtn, false);

    if (!result?.ok) {
      const msg = ERROR_MESSAGES[result?.error ?? ""] || "Something went wrong. Please try again.";
      showFlash(flashEl, msg);
      return;
    }

    applySessionToProfile(result.playerId);
    window.location.href = getRedirectTarget();
  });
});
