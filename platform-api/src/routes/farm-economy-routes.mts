import { readJsonBody, writeJson } from "../http-utils.mjs";

export async function handleFarmEconomyRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const adopting = pathname === "/games/farm/adoptions" && method === "POST";
  const buyingSupply = pathname === "/games/farm/supplies/purchases" && method === "POST";
  if (!adopting && !buyingSupply) return false;
  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
    return true;
  }
  const action = adopting ? services?.adoptFarmPet : services?.purchaseFarmSupply;
  if (typeof action !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  const input = adopting
    ? { playerId: authClaims.playerId, speciesId: body.value?.speciesId, name: body.value?.name, purchaseId: body.value?.purchaseId }
    : { playerId: authClaims.playerId, itemId: body.value?.itemId, quantity: body.value?.quantity, purchaseId: body.value?.purchaseId };
  try {
    const purchase = await action(input);
    if (!purchase?.ok) {
      const conflict = new Set(["insufficient_tickets", "inventory_full", "farm_full", "needs_water"]);
      writeJson(res, conflict.has(purchase?.error) ? 409 : 400, { status: "error", ...purchase, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { purchase }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_purchase", timestamp }, requestOrigin);
  }
  return true;
}

