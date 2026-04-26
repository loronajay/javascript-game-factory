import { randomBytes, randomUUID } from "node:crypto";

import {
  consumePasswordResetToken,
  createAccount,
  createPasswordResetToken,
  deletePlayerAccount,
  findAccountByEmail,
  findAccountByPlayerId,
  findPasswordResetToken,
  updateAccountPassword,
  verifyAccountPassword,
} from "../db/auth.mjs";
import { savePlayerProfile } from "../db/profiles.mjs";

export async function registerAccountService(pool, { email, password, profileName, claimPlayerId }) {
  const existing = await findAccountByEmail(pool, email);
  if (existing) return { error: "email_taken" };

  let playerId;
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

  const account = await createAccount(pool, { email, password, playerId });
  if (!account) return { error: "account_creation_failed" };

  return { ok: true, playerId, email: account.email, profileName: resolvedProfileName };
}

export async function loginAccountService(pool, { email, password }) {
  const account = await findAccountByEmail(pool, email);
  if (!account) return { error: "invalid_credentials" };

  const valid = await verifyAccountPassword(account, password);
  if (!valid) return { error: "invalid_credentials" };

  return { ok: true, playerId: account.player_id, email: account.email };
}

export async function requestPasswordResetService(pool, emailSender, { email, appBaseUrl }) {
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

export async function resetPasswordService(pool, { token, newPassword }) {
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

export async function deleteAccountService(pool, playerId) {
  if (!playerId) return { error: "invalid_request" };
  const deleted = await deletePlayerAccount(pool, playerId);
  if (!deleted) return { error: "account_not_found" };
  return { ok: true };
}
