import { randomBytes, randomUUID } from "node:crypto";

import {
  clearAccountSession,
  consumePasswordResetToken,
  createAccount,
  createPasswordResetToken,
  deletePlayerAccount,
  findAccountByEmail,
  findAccountByPlayerId,
  findPasswordResetToken,
  isAccountSessionCurrent,
  rotateAccountSession,
  updateAccountPassword,
  verifyAccountPassword,
} from "../db/auth.mjs";
import { savePlayerProfile } from "../db/profiles.mjs";

function makeSessionId(): string {
  return randomUUID();
}

export async function registerAccountService(pool: any, { email, password, profileName, claimPlayerId }: any): Promise<any> {
  const existing = await findAccountByEmail(pool, email);
  if (existing) return { error: "email_taken" };

  let playerId: string;
  if (claimPlayerId && typeof claimPlayerId === "string" && claimPlayerId.trim()) {
    const existingAccount = await findAccountByPlayerId(pool, claimPlayerId.trim());
    // If the identity is already claimed, fall back to a fresh UUID so burner/secondary
    // accounts aren't blocked just because the browser's local playerId is registered.
    playerId = existingAccount ? randomUUID() : claimPlayerId.trim();
  } else {
    playerId = randomUUID();
  }

  const resolvedProfileName = typeof profileName === "string" && profileName.trim()
    ? profileName.trim()
    : "";

  await savePlayerProfile(pool, playerId, { profileName: resolvedProfileName });

  const sessionId = makeSessionId();
  const account = await createAccount(pool, { email, password, playerId, sessionId });
  if (!account) return { error: "account_creation_failed" };

  return { ok: true, playerId, email: account.email, profileName: resolvedProfileName, sessionId };
}

export async function loginAccountService(pool: any, { email, password }: any): Promise<any> {
  const account = await findAccountByEmail(pool, email);
  if (!account) return { error: "invalid_credentials" };

  const valid = await verifyAccountPassword(account, password);
  if (!valid) return { error: "invalid_credentials" };

  const sessionId = makeSessionId();
  const session = await rotateAccountSession(pool, account.player_id, sessionId);
  if (!session) return { error: "session_update_failed" };

  return { ok: true, playerId: account.player_id, email: account.email, sessionId };
}

export async function verifyAccountSessionService(pool: any, playerId: any, sessionId: any): Promise<boolean> {
  return isAccountSessionCurrent(pool, playerId, sessionId);
}

export async function logoutAccountService(pool: any, playerId: any, sessionId: any): Promise<any> {
  await clearAccountSession(pool, playerId, sessionId);
  return { ok: true };
}

export async function requestPasswordResetService(pool: any, emailSender: any, { email, appBaseUrl }: any): Promise<any> {
  // Always return ok to avoid revealing whether an email is registered
  const account = await findAccountByEmail(pool, email);
  if (!account) return { ok: true };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await createPasswordResetToken(pool, { email: account.email, token, expiresAt });

  const resetUrl = `${appBaseUrl}/reset-password/index.html?token=${token}`;
  await emailSender.send({
    to: account.email,
    subject: "Reset your Jay's Arcade password",
    html: `
      <div style="font-family:monospace;background:#0a0a0f;color:#e0e0ff;padding:32px;max-width:480px">
        <h2 style="color:#ff6ec7;margin-top:0">Password Reset</h2>
        <p>Someone requested a password reset for your Jay's Arcade account.</p>
        <p>Click the link below to set a new password. It expires in <strong>1 hour</strong>.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#ff6ec7;color:#0a0a0f;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block">
            RESET PASSWORD
          </a>
        </p>
        <p style="font-size:12px;color:#666">If you didn't request this, ignore this email. Your password won't change.</p>
      </div>
    `,
  });

  return { ok: true };
}

export async function resetPasswordService(pool: any, { token, newPassword }: any): Promise<any> {
  if (!token || !newPassword || String(newPassword).length < 8) {
    return { error: "invalid_request" };
  }

  const record = await findPasswordResetToken(pool, token);
  if (!record) return { error: "invalid_token" };
  if (record.used_at) return { error: "token_already_used" };
  if (new Date(record.expires_at) < new Date()) return { error: "token_expired" };

  const consumed = await consumePasswordResetToken(pool, token);
  if (!consumed) return { error: "token_already_used" };

  const updated = await updateAccountPassword(pool, record.email, newPassword);
  if (!updated) return { error: "account_not_found" };

  return { ok: true };
}

export async function deleteAccountService(pool: any, playerId: any): Promise<any> {
  if (!playerId) return { error: "invalid_request" };
  const deleted = await deletePlayerAccount(pool, playerId);
  if (!deleted) return { error: "account_not_found" };
  return { ok: true };
}
