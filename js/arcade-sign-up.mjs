import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { bindFactoryProfileToSession, loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { resolveAppRedirectTarget } from "./arcade-paths.mjs";
const ERROR_MESSAGES = {
    email_taken: "That email is already registered. Sign in instead?",
    player_already_claimed: "This arcade identity is already linked to an account. Sign in instead?",
    invalid_email: "Please enter a valid email address.",
    password_too_short: "Password must be at least 8 characters.",
    auth_not_configured: "Account creation is unavailable right now.",
    network_error: "Could not reach the server. Try again.",
    not_configured: "Account creation is unavailable right now.",
};
function showFlash(el, message) {
    if (el)
        el.textContent = message;
}
function clearFlash(el) {
    if (el)
        el.textContent = "";
}
function setSubmitting(button, submitting) {
    if (!button)
        return;
    button.disabled = submitting;
    button.textContent = submitting ? "Creating account..." : "Create Account";
}
function applySessionToProfile(playerId, profileName) {
    bindFactoryProfileToSession(playerId, undefined, { profileName });
}
function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    return resolveAppRedirectTarget(params.get("next"), {
        currentHref: window.location.href,
    });
}
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("signUpForm");
    const flashEl = document.getElementById("authFlash");
    const submitBtn = document.getElementById("signUpSubmit");
    const signInLink = document.querySelector(".auth-card__switch[href*='sign-in']");
    const auth = createAuthApiClient();
    if (signInLink) {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        if (next) {
            const signInUrl = new URL(signInLink.getAttribute("href") || "../sign-in/index.html", window.location.href);
            signInUrl.searchParams.set("next", next);
            signInLink.href = signInUrl.toString();
        }
    }
    if (!form)
        return;
    const localProfile = loadFactoryProfile();
    const claimPlayerId = localProfile?.playerId || "";
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearFlash(flashEl);
        const profileName = form.profileName?.value?.trim() || "";
        const email = form.email?.value?.trim() || "";
        const password = form.password?.value || "";
        if (!email) {
            showFlash(flashEl, "Please enter your email address.");
            return;
        }
        if (!password || password.length < 8) {
            showFlash(flashEl, "Password must be at least 8 characters.");
            return;
        }
        setSubmitting(submitBtn, true);
        const result = await auth.register({ email, password, profileName, claimPlayerId });
        setSubmitting(submitBtn, false);
        if (!result?.ok) {
            const msg = ERROR_MESSAGES[result?.error ?? ""] || "Something went wrong. Please try again.";
            showFlash(flashEl, msg);
            return;
        }
        applySessionToProfile(result.playerId, result.profileName);
        window.location.href = getRedirectTarget();
    });
});
