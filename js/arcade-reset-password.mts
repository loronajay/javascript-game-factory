import { createAuthApiClient } from "./platform/api/auth-api.mjs";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "This reset link is invalid.",
  token_expired: "This reset link has expired. Request a new one.",
  token_already_used: "This reset link has already been used.",
  account_not_found: "No account found for this reset link.",
  not_configured: "Password reset is unavailable right now.",
  network_error: "Could not reach the server. Try again.",
};

function showFlash(el: HTMLElement | null, message: string, isSuccess = false): void {
  if (!el) return;
  el.textContent = message;
  el.style.color = isSuccess ? "#7fff7f" : "";
}

function clearFlash(el: HTMLElement | null): void {
  if (el) { el.textContent = ""; el.style.color = ""; }
}

function setSubmitting(button: HTMLButtonElement | null, submitting: boolean): void {
  if (!button) return;
  button.disabled = submitting;
  button.textContent = submitting ? "Saving..." : "Set New Password";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetPasswordForm") as HTMLFormElement | null;
  const flashEl = document.getElementById("authFlash");
  const submitBtn = document.getElementById("resetSubmit") as HTMLButtonElement | null;
  const auth = createAuthApiClient();

  if (!form) return;

  const token = new URLSearchParams(window.location.search).get("token") || "";

  if (!token) {
    showFlash(flashEl, "No reset token found. Request a new reset link.");
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFlash(flashEl);

    const newPassword = (form as any).newPassword?.value || "";
    const confirmPassword = (form as any).confirmPassword?.value || "";

    if (!newPassword || newPassword.length < 8) {
      showFlash(flashEl, "Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showFlash(flashEl, "Passwords do not match.");
      return;
    }

    setSubmitting(submitBtn, true);
    const result = await auth.resetPassword({ token, newPassword });
    setSubmitting(submitBtn, false);

    if (!result?.ok) {
      const msg = ERROR_MESSAGES[result?.error ?? ""] || "Something went wrong. Please try again.";
      showFlash(flashEl, msg);
      return;
    }

    showFlash(flashEl, "Password updated. Redirecting to sign in...", true);
    setTimeout(() => { window.location.href = "../sign-in/index.html"; }, 1500);
  });
});
