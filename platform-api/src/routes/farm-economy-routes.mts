import { readJsonBody, writeJson } from "../http-utils.mjs";
import { farmMarketBoard, farmMarketDay } from "../services/farm-market-day.mjs";

export async function handleFarmEconomyRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  // Today's Market prices are the same for everyone and nobody's business: a public read.
  if (pathname === "/games/farm/market/prices" && method === "GET") {
    writeJson(res, 200, { market: farmMarketBoard(farmMarketDay(Date.now())) }, requestOrigin);
    return true;
  }
  const adopting = pathname === "/games/farm/adoptions" && method === "POST";
  const buyingSupply = pathname === "/games/farm/supplies/purchases" && method === "POST";
  const harvesting = pathname === "/games/farm/harvests" && method === "POST";
  const harvestingTree = pathname === "/games/farm/trees/harvests" && method === "POST";
  const selling = pathname === "/games/farm/market/sales" && method === "POST";
  const readingOrders = pathname === "/games/farm/market/orders" && method === "GET";
  const fillingOrder = pathname === "/games/farm/market/orders/fulfillments" && method === "POST";
  const cooking = pathname === "/games/farm/kitchen/cooks" && method === "POST";
  const milling = pathname === "/games/farm/workshop/mills" && method === "POST";
  const crafting = pathname === "/games/farm/workshop/crafts" && method === "POST";
  const breeding = pathname === "/games/farm/pets/breedings" && method === "POST";
  if (!adopting && !buyingSupply && !harvesting && !harvestingTree && !selling && !readingOrders && !fillingOrder && !cooking && !milling && !crafting && !breeding) return false;
  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
    return true;
  }
  if (harvesting) return handleHarvest(context);
  if (harvestingTree) return handleTreeHarvest(context);
  if (selling) return handleSale(context);
  if (readingOrders) return handleOrderBoard(context);
  if (fillingOrder) return handleOrderFill(context);
  if (cooking) return handleCook(context);
  if (milling) return handleMill(context);
  if (crafting) return handleCraft(context);
  if (breeding) return handleBreeding(context);
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
    : { playerId: authClaims.playerId, itemId: body.value?.itemId, quantity: body.value?.quantity, purchaseId: body.value?.purchaseId, ...(body.value?.venue === "market" ? { venue: "market", day: body.value?.day } : {}) };
  try {
    const purchase = await action(input);
    if (!purchase?.ok) {
      const conflict = new Set(["insufficient_tickets", "inventory_full", "already_owned", "farm_full", "needs_water", "level_too_low", "prices_changed"]);
      writeJson(res, conflict.has(purchase?.error) ? 409 : 400, { status: "error", ...purchase, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { purchase }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_purchase", timestamp }, requestOrigin);
  }
  return true;
}


/**
 * POST /games/farm/harvests — self only. The client sends its farm and a cell;
 * the server decides ripeness and yield (db/farm-economy.mts). Refusals still
 * return the verified farm so the client can adopt the server's view.
 */
async function handleHarvest(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.harvestFarmCrop !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const harvest = await services.harvestFarmCrop({
      playerId: authClaims.playerId,
      plotId: body.value?.plotId,
      cellId: body.value?.cellId,
      layout: body.value?.layout,
    });
    if (!harvest?.ok) {
      const conflict = new Set(["not_ready", "dead", "empty"]);
      writeJson(res, conflict.has(harvest?.error) ? 409 : 400, { status: "error", ...harvest, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { harvest }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_harvest", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/trees/harvests — self only. Pick a fruit tree or fell a
 * timber tree: the client sends its farm and a Tree Plot; whether the tree is
 * ready, and what it pays, are the server's (db/farm-economy.mts `harvestFarmTree`).
 * Refusals still return the verified farm so the client can adopt it.
 */
async function handleTreeHarvest(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.harvestFarmTree !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const harvest = await services.harvestFarmTree({ playerId: authClaims.playerId, plotId: body.value?.plotId, layout: body.value?.layout });
    if (!harvest?.ok) {
      const conflict = new Set(["not_ready", "empty"]);
      writeJson(res, conflict.has(harvest?.error) ? 409 : 400, { status: "error", ...harvest, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { harvest }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_tree_harvest", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/kitchen/cooks — self only. The client sends its farm, a
 * recipe, the scores of its cooking steps and a cook id; whether the recipe is
 * taught, whether the basket holds it, the dish's stars and the XP are the
 * server's (db/farm-kitchen.mts `cookFarmDish`). Refusals still return the
 * verified farm so the client can adopt it.
 */
async function handleCook(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.cookFarmDish !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const cook = await services.cookFarmDish({
      playerId: authClaims.playerId,
      recipeId: body.value?.recipeId,
      scores: body.value?.scores,
      cookId: body.value?.cookId,
      layout: body.value?.layout,
    });
    if (!cook?.ok) {
      const conflict = new Set(["not_enough_produce", "level_too_low", "pantry_full"]);
      writeJson(res, conflict.has(cook?.error) ? 409 : 400, { status: "error", ...cook, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { cook }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_cook", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/workshop/mills — self only. Saw logs into planks: at the
 * Market Square's Sawmill (`at: "market"`, a fee per log, the stored farm) or
 * at the farm's own Sawmill (`at: "farm"`, free, the submitted farm verified
 * like a harvest). What a log saws into, the fee and the XP are the server's
 * (db/farm-workshop.mts `millFarmLogs`).
 */
async function handleMill(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.millFarmLogs !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const mill = await services.millFarmLogs({
      playerId: authClaims.playerId,
      speciesId: body.value?.speciesId,
      logs: body.value?.logs,
      at: body.value?.at,
      millId: body.value?.millId,
      layout: body.value?.layout,
    });
    if (!mill?.ok) {
      const conflict = new Set(["not_enough_logs", "planks_full", "insufficient_tickets", "no_sawmill"]);
      writeJson(res, conflict.has(mill?.error) ? 409 : 400, { status: "error", ...mill, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { mill }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_mill", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/workshop/crafts — self only. The client sends its farm, a
 * pattern (the decor item it makes), the scores of its steps and a craft id;
 * whether the pattern is taught, whether the planks and tickets cover it, the
 * piece's stars and the XP are the server's (db/farm-workshop.mts `craftFarmPiece`).
 */
async function handleCraft(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.craftFarmPiece !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const craft = await services.craftFarmPiece({
      playerId: authClaims.playerId,
      itemId: body.value?.itemId,
      scores: body.value?.scores,
      craftId: body.value?.craftId,
      layout: body.value?.layout,
    });
    if (!craft?.ok) {
      const conflict = new Set(["not_enough_planks", "level_too_low", "workshop_full", "insufficient_tickets", "no_workbench"]);
      writeJson(res, conflict.has(craft?.error) ? 409 : 400, { status: "error", ...craft, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { craft }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_craft", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/market/sales — self only. The body names crops and counts
 * and an idempotency key; the price and the payout are the server's
 * (db/farm-economy.mts `sellFarmProduce`). Any price the client sends is ignored.
 */
async function handleSale(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.sellFarmProduce !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const sale = await services.sellFarmProduce({
      playerId: authClaims.playerId,
      items: body.value?.items,
      saleId: body.value?.saleId,
      day: body.value?.day,
    });
    if (!sale?.ok) {
      const conflict = new Set(["not_enough_produce", "not_enough_dishes", "not_enough_furniture", "prices_changed"]);
      writeJson(res, conflict.has(sale?.error) ? 409 : 400, { status: "error", ...sale, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { sale }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_sale", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * GET /games/farm/market/orders — self only. Today's board, which orders this
 * player has filled, their Farming level and their basket. The board itself is
 * the same for everyone; only the ticks are personal, which is why it is not public.
 */
async function handleOrderBoard(context: any): Promise<boolean> {
  const { res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.getFarmOrderBoard !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  try {
    const board = await services.getFarmOrderBoard({ playerId: authClaims.playerId });
    writeJson(res, 200, { board }, requestOrigin);
  } catch {
    writeJson(res, 500, { status: "error", error: "farm_orders_unavailable", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/market/orders/fulfillments — self only. The body names an
 * order id and nothing else counts: what it asks for, what it pays and whether
 * it is still on the board are the server's (db/farm-economy.mts `fillFarmOrder`).
 */
async function handleOrderFill(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.fillFarmOrder !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const fill = await services.fillFarmOrder({ playerId: authClaims.playerId, orderId: body.value?.orderId });
    if (!fill?.ok) {
      const conflict = new Set(["not_enough_produce", "level_too_low", "order_expired"]);
      writeJson(res, conflict.has(fill?.error) ? 409 : 400, { status: "error", ...fill, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { fill }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_order", timestamp }, requestOrigin);
  }
  return true;
}

/**
 * POST /games/farm/pets/breedings — self only. The body names a mother, a
 * father, the young one's name and a breed id; whether the pair may breed, the
 * fee and everything the young one inherits are the server's, read off the
 * STORED farm (db/farm-pet-breeding.mts). Refusals return the stored farm.
 */
async function handleBreeding(context: any): Promise<boolean> {
  const { req, res, authClaims, requestOrigin, timestamp, services } = context;
  if (typeof services?.breedFarmPets !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_economy_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const body = await readJsonBody(req);
  if (!body.ok) {
    writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
    return true;
  }
  try {
    const breeding = await services.breedFarmPets({
      playerId: authClaims.playerId,
      motherId: body.value?.motherId,
      fatherId: body.value?.fatherId,
      name: body.value?.name,
      breedId: body.value?.breedId,
    });
    if (!breeding?.ok) {
      const conflict = new Set(["insufficient_tickets", "farm_full", "not_grown", "hungry", "unhappy", "resting"]);
      writeJson(res, conflict.has(breeding?.error) ? 409 : 400, { status: "error", ...breeding, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { breeding }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_breeding", timestamp }, requestOrigin);
  }
  return true;
}
