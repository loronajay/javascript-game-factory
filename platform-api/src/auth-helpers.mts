import jwt from "jsonwebtoken";

const COOKIE_NAME = "arcade_session";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function signToken(payload: any, secret: any): string {
  return jwt.sign(payload, secret, { expiresIn: TOKEN_MAX_AGE_SECONDS });
}

export function verifyToken(token: any, secret: any): any {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: unknown): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== "string") return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

export function extractTokenFromRequest(req: any): string {
  const authHeader = String(req?.headers?.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    const headerToken = authHeader.slice(7).trim();
    if (headerToken) return headerToken;
  }
  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return cookies[COOKIE_NAME] || "";
}

export function buildSetCookieHeader(token: any, isProduction: any): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${TOKEN_MAX_AGE_SECONDS}`,
    "HttpOnly",
  ];
  if (isProduction) {
    parts.push("Secure");
    parts.push("SameSite=None");
  } else {
    parts.push("SameSite=Lax");
  }
  return parts.join("; ");
}

export function buildClearCookieHeader(isProduction: any): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
  ];
  if (isProduction) {
    parts.push("Secure");
    parts.push("SameSite=None");
  } else {
    parts.push("SameSite=Lax");
  }
  return parts.join("; ");
}
