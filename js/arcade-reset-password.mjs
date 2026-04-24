import { createAuthApiClient } from "./platform/api/auth-api.mjs";

const ERROR_MESSAGES = {
  invalid_token: "This reset link is invalid.",
  token_expired: "This reset link has expired. Request a new one.",
  token_already_used: "This reset link has already been used.",
  account_not_found: "No account found for this reset link.",
  not_configured: "Password reset is unavailable right now.",
  network_error: "Could not reach the server. Try again.",
};

function showFlash(el, message, isSuccess = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isSuccess ? "#7fff7f" : "";
}

function clearFlash(el) {
  if (el) { el.textContent = ""; el.style.color = ""; }
}

function setSubmitting(button, submitting) {
  if (!button) return;
  button.disabled = submitting;
  button.textContent = submitting ? "Saving..." : "Set New Password";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetPasswordForm");
  const flashEl = document.getElementById("authFlash");
  const submitBtn = document.getElementById("resetSubmit");
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

    const newPassword = form.newPassword?.value || "";
    const confirmPassword = form.confirmPassword?.value || "";

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
      const msg = ERROR_MESSAGES[result?.error] || "Something went wrong. Please try again.";
      showFlash(flashEl, msg);
      return;
    }

    showFlash(flashEl, "Password updated. Redirecting to sign in...", true);
    setTimeout(() => { window.location.href = "../sign-in/index.html"; }, 1500);
  });
});
