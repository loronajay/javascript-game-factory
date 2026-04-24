import { randomUUID } from "node:crypto";

import { createAccount, findAccountByEmail, findAccountByPlayerId, verifyAccountPassword } from "../db/auth.mjs";
import { savePlayerProfile } from "../db/profiles.mjs";

export async function registerAccountService(pool, { email, password, profileName, claimPlayerId }) {
  const existing = await findAccountByEmail(pool, email);
  if (existing) return { error: "email_taken" };

  let playerId;
  if (claimPlayerId && typeof claimPlayerId === "string" && claimPlayerId.trim()) {
    const existingAccount = await findAccountByPlayerId(pool, claimPlayerId.trim());
    if (existingAccount) return { error: "player_already_claimed" };
    playerId = claimPlayerId.trim();
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
