import {
  buildClearCookieHeader,
  buildSetCookieHeader,
  signToken,
} from "../auth-helpers.mjs";
import { readJsonBody, writeJson } from "../http-utils.mjs";

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 1) return false;
  const afterAt = trimmed.slice(atIdx + 1);
  return afterAt.includes(".") && afterAt.length > 2 && !trimmed.includes(" ");
}

// Account and session endpoints stay together so auth ownership stays explicit
// even as the main app router is split into smaller route families.
export async function handleAuthRoute(context) {
  const {
    req,
    res,
    method,
    pathname,
    authClaims,
    requestOrigin,
    timestamp,
    services,
  } = context;
  const {
    registerAccount,
    loginAccount,
    requestPasswordReset,
    resetPassword,
    deleteAccount,
    jwtSecret,
    isProduction,
  } = services;

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

    const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
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

    const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
    res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
    writeJson(res, 200, { token, playerId: result.playerId, email: result.email }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/auth/logout") {
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
      ? signToken({ playerId: authClaims.playerId, email: authClaims.email }, jwtSecret)
      : null;
    writeJson(res, 200, {
      ok: true,
      playerId: authClaims.playerId,
      email: authClaims.email,
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
