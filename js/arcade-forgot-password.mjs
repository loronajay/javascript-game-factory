import { createAuthApiClient } from "./platform/api/auth-api.mjs";

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
  button.textContent = submitting ? "Sending..." : "Send Reset Link";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotPasswordForm");
  const flashEl = document.getElementById("authFlash");
  const submitBtn = document.getElementById("forgotSubmit");
  const auth = createAuthApiClient();

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFlash(flashEl);

    const email = form.email?.value?.trim() || "";
    if (!email) {
      showFlash(flashEl, "Please enter your email address.");
      return;
    }

    setSubmitting(submitBtn, true);
    await auth.forgotPassword({ email });
    setSubmitting(submitBtn, false);

    // Always show success to avoid leaking whether the email is registered
    showFlash(flashEl, "If that email is registered, a reset link is on its way.", true);
    form.reset();
  });
});
