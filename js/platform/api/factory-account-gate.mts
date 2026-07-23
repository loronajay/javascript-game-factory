// Shared factory-account gate: the canonical "is this a real signed-in Javascript
// Game Factory account?" check that games use to gate online play behind login.
//
// This wraps the shared auth-token helper (do NOT re-read localStorage directly) so
// every game reads the same "javascript-game-factory.authToken" key through one seam.
// Tactical Arena's Ranked gate and its casual Online gate both consume this module;
// other cabinets adopt it per planning-docs/ONLINE_LOGIN_GATE_PLAN.md.

import { getStoredAuthToken } from "./auth-token.mjs";

const PLATFORM_SIGN_IN_PATH = "../../sign-in/index.html";

export const ONLINE_ACCOUNT_REQUIRED_ERROR = "ONLINE_ACCOUNT_REQUIRED";
export const ONLINE_ACCOUNT_REQUIRED_MESSAGE =
  "Sign in to your Javascript Game Factory account to play online.";

export interface FactoryAccountSession {
  authenticated: boolean;
  playerId: string;
  token: string;
}

export interface OnlineAccountGate {
  eligible: boolean;
  errorCode: string;
  message: string;
}

interface SignInLocation {
  href?: string;
  assign?: (url: string) => void;
}

interface SignInUrlOptions {
  currentHref?: string;
  signInPath?: string;
}

interface RedirectOptions extends SignInUrlOptions {
  locationRef?: SignInLocation | null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFactoryAccountSession(value: unknown = {}): FactoryAccountSession {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const playerId = cleanText(source.playerId);
  const token = cleanText(source.token);
  const authenticated =
    Boolean(source.authenticated ?? source.ok) && Boolean(playerId || token);
  return Object.freeze({ authenticated, playerId, token });
}

export function isFactoryAccountLoggedIn(value: unknown = {}): boolean {
  return normalizeFactoryAccountSession(value).authenticated;
}

// The signed-in session, derived from the stored auth token. Injectable token reader
// keeps this unit-testable without touching a real localStorage.
export function readFactoryAccountSession(
  readToken: () => string = getStoredAuthToken,
): FactoryAccountSession {
  const token = cleanText(readToken());
  return normalizeFactoryAccountSession({ authenticated: Boolean(token), token });
}

export function createFactoryAccountSignInUrl({
  currentHref = globalThis.location?.href || "",
  signInPath = PLATFORM_SIGN_IN_PATH,
}: SignInUrlOptions = {}): string {
  const baseHref = cleanText(currentHref) || "http://localhost/";
  const url = new URL(signInPath, baseHref);
  // Preserve return-to-page UX: sign-in redirects back here when done.
  if (cleanText(currentHref)) url.searchParams.set("next", currentHref);
  return url.toString();
}

export function redirectToFactoryAccountSignIn(options: RedirectOptions = {}): string {
  const locationRef = options.locationRef ?? globalThis.location;
  const url = createFactoryAccountSignInUrl({
    ...options,
    currentHref: options.currentHref ?? locationRef?.href,
  });
  if (typeof locationRef?.assign === "function") {
    locationRef.assign(url);
  } else if (locationRef) {
    locationRef.href = url;
  }
  return url;
}

// Generic online-play gate. Same shape as the old ranked-only gate, but named for
// plain online play so any mode (casual, ranked, etc.) can reuse it.
export function getOnlineAccountGate(account: unknown = {}): OnlineAccountGate {
  const session = normalizeFactoryAccountSession(account);
  if (!session.authenticated || !session.token) {
    return Object.freeze({
      eligible: false,
      errorCode: ONLINE_ACCOUNT_REQUIRED_ERROR,
      message: ONLINE_ACCOUNT_REQUIRED_MESSAGE,
    });
  }
  return Object.freeze({ eligible: true, errorCode: "", message: "" });
}
