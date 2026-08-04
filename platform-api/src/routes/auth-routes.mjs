import { buildClearCookieHeader, buildSetCookieHeader, signToken, } from "../auth-helpers.mjs";
import { readJsonBody, writeJson } from "../http-utils.mjs";
function isValidEmail(value) {
    if (typeof value !== "string")
        return false;
    const trimmed = value.trim();
    const atIdx = trimmed.indexOf("@");
    if (atIdx < 1)
        return false;
    const afterAt = trimmed.slice(atIdx + 1);
    return afterAt.includes(".") && afterAt.length > 2 && !trimmed.includes(" ");
}
// Account and session endpoints stay together so auth ownership stays explicit
// even as the main app router is split into smaller route families.
export async function handleAuthRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services, } = context;
    const { registerAccount, loginAccount, logoutAccount, requestPasswordReset, resetPassword, deleteAccount, loadPlayerProfile, isAdminPlayer, getAccountSuspension, jwtSecret, isProduction, } = services;
    // The display name lives on the profile row, not the account row. Register already
    // returns it (it just created it); login and /auth/me have to look it up. Clients
    // without an arcade shell — the packaged Android app — have no other way to learn
    // who they are signed in as.
    const readProfileName = async (playerId) => {
        if (typeof loadPlayerProfile !== "function" || !playerId)
            return "";
        try {
            const profile = await loadPlayerProfile(playerId);
            const name = profile?.profileName;
            return typeof name === "string" ? name.trim() : "";
        }
        catch {
            return "";
        }
    };
    if (method === "POST" && pathname === "/auth/register") {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const { email, password, profileName, claimPlayerId } = body.value || {};
        if (!isValidEmail(email)) {
            writeJson(res, 400, { status: "error", error: "invalid_email", timestamp }, requestOrigin);
            return true;
        }
        if (!password || String(password).length < 8) {
            writeJson(res, 400, { status: "error", error: "password_too_short", timestamp }, requestOrigin);
            return true;
        }
        if (!jwtSecret) {
            writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await registerAccount({ email, password, profileName, claimPlayerId });
        if (!result?.ok) {
            const statusCode = result?.error === "email_taken" ? 409 : 400;
            writeJson(res, statusCode, { status: "error", error: result?.error || "register_failed", timestamp }, requestOrigin);
            return true;
        }
        const token = signToken({ playerId: result.playerId, email: result.email, sessionId: result.sessionId }, jwtSecret);
        res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
        writeJson(res, 201, { token, playerId: result.playerId, profileName: result.profileName, email: result.email }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/auth/login") {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const { email, password } = body.value || {};
        if (!isValidEmail(email) || !password) {
            writeJson(res, 400, { status: "error", error: "missing_credentials", timestamp }, requestOrigin);
            return true;
        }
        if (!jwtSecret) {
            writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await loginAccount({ email, password });
        if (!result?.ok) {
            writeJson(res, 401, { status: "error", error: "invalid_credentials", timestamp }, requestOrigin);
            return true;
        }
        const token = signToken({ playerId: result.playerId, email: result.email, sessionId: result.sessionId }, jwtSecret);
        res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
        writeJson(res, 200, {
            token,
            playerId: result.playerId,
            email: result.email,
            profileName: await readProfileName(result.playerId),
        }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/auth/logout") {
        if (authClaims?.playerId && authClaims?.sessionId && typeof logoutAccount === "function") {
            await logoutAccount(authClaims.playerId, authClaims.sessionId);
        }
        res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
        writeJson(res, 200, { ok: true }, requestOrigin);
        return true;
    }
    if (method === "GET" && pathname === "/auth/me") {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
            return true;
        }
        const freshToken = jwtSecret
            ? signToken({ playerId: authClaims.playerId, email: authClaims.email, sessionId: authClaims.sessionId }, jwtSecret)
            : null;
        // `isAdmin` here is a UI hint only — it decides whether the nav shows an Admin link.
        // It is deliberately NOT baked into the token, and no admin route trusts it: the
        // /admin/ gate re-reads authority from the database on every request. A client that
        // forges this flag gets a link to a console that will answer 403.
        const [isAdmin, suspension] = await Promise.all([
            typeof isAdminPlayer === "function" ? isAdminPlayer(authClaims.playerId) : Promise.resolve(false),
            typeof getAccountSuspension === "function" ? getAccountSuspension(authClaims.playerId) : Promise.resolve(null),
        ]);
        writeJson(res, 200, {
            ok: true,
            playerId: authClaims.playerId,
            email: authClaims.email,
            profileName: await readProfileName(authClaims.playerId),
            isAdmin: isAdmin === true,
            ...(suspension ? { suspendedUntil: suspension.until, suspendedReason: suspension.reason } : {}),
            ...(freshToken ? { token: freshToken } : {}),
        }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/auth/forgot-password") {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const { email } = body.value || {};
        if (!isValidEmail(email)) {
            writeJson(res, 200, { ok: true }, requestOrigin);
            return true;
        }
        await requestPasswordReset({ email });
        writeJson(res, 200, { ok: true }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/auth/reset-password") {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const { token, newPassword } = body.value || {};
        const result = await resetPassword({ token, newPassword });
        if (!result?.ok) {
            const statusCode = result?.error === "token_expired" || result?.error === "token_already_used"
                ? 410
                : 400;
            writeJson(res, statusCode, { status: "error", error: result?.error || "reset_failed", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { ok: true }, requestOrigin);
        return true;
    }
    if (method === "DELETE" && pathname === "/auth/account") {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
            return true;
        }
        const result = await deleteAccount(authClaims.playerId);
        if (!result?.ok) {
            writeJson(res, 400, { status: "error", error: result?.error || "delete_failed", timestamp }, requestOrigin);
            return true;
        }
        res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
        writeJson(res, 200, { ok: true }, requestOrigin);
        return true;
    }
    return false;
}
