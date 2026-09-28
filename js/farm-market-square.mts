// The Market Square, as data. PURE — no THREE, no DOM, no storage.
//
// The square is a second walled field beside the farm, reached through the
// farm's front gate (farm-gateway.mts), and it is built from the same parts:
// its paving, walls, well, benches, lamps and dressing are ordinary farm decor
// rows in a fixed layout, so the farm's world renderer draws them, the farm's
// obstacle/seat/door rules make them solid and usable, and nothing here is a
// second copy of a model or a rule. What the farm has no row for — the market
// STALLS and the order board — is described here once, and both the renderer
// (farm-market-props.mts) and the walker read that one description, so a
// stall's counter is exactly where it blocks.
//
// Nobody owns the square and nothing in it is saved: the layout is a constant.
// Everyone standing in it shares one presence room (`MARKET_PRESENCE_ROOM`).

import { FARM_BOUNDS, normalizeFarmLayout, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";
import type { FarmObstacle } from "./farm-body.mjs";
import type { SurfaceStyle } from "./arcade-room-catalog/surfaces.mjs";

/** Everyone in the square shares one presence room on the arcade-room bridge (it takes any room id). */
export const MARKET_PRESENCE_ROOM = "farm:market-square";
export const MARKET_BOUNDS = FARM_BOUNDS;
/** Just inside the south gate — the road from the farm — looking north across the square. */
export const MARKET_SPAWN: Readonly<{ x: number; z: number; yaw: number }> = Object.freeze({ x: 0, z: MARKET_BOUNDS.depth / 2 - 2.2, yaw: 0 });
/**
 * The square is paved: stone setts on the room's `brick` pattern (stone, a
 * second stone, the mortar), about a third of a metre each. No farm can buy it,
 * so it is a style here rather than a row in the farm's ground catalog.
 */
export const MARKET_PAVING: SurfaceStyle = Object.freeze({
  pattern: "brick",
  colors: Object.freeze(["#9a948a", "#857f75", "#5d5850"]),
  repeat: 14,
  roughness: 0.92,
  metalness: 0,
});

/** The instance id of the gate home. */
export const MARKET_HOME_GATE = "market-gate-home";
/** The gate in the north wall, down to the Cove (farm-cove.mts). */
export const MARKET_COVE_GATE = "market-gate-cove";
/** Where the Cove gate stands along the north wall: in the lane between the Produce Merchant and the Kitchen. */
export const COVE_GATE_X = 3.7;
/** Just inside the north gate, back up from the Cove, looking south into the square. */
export const MARKET_COVE_SPAWN: Readonly<{ x: number; z: number; yaw: number }> = Object.freeze({ x: COVE_GATE_X, z: -(MARKET_BOUNDS.depth / 2 - 2.2), yaw: Math.PI });

// The stone wall is 0.5 deep; its outer face sits on the inset line like the farm's fence.
const WALL = MARKET_BOUNDS.width / 2 - MARKET_BOUNDS.wallInset - 0.25;
const GATE_WIDTH = 2.4;
const SOUTH_RUN = WALL - GATE_WIDTH / 2 + 0.25;
// The north wall runs either side of the Cove gate.
const NORTH_WEST_RUN = WALL + 0.25 + (COVE_GATE_X - GATE_WIDTH / 2);
const NORTH_EAST_RUN = WALL + 0.25 - (COVE_GATE_X + GATE_WIDTH / 2);
const QUARTER = Math.PI / 2;

const row = (instanceId: string, itemId: string, x: number, z: number, rotationY = 0, length = 0): FarmDecorRow =>
  Object.freeze({ instanceId, itemId, x, z, rotationY, length });

/** Everything in the square the farm's catalog already draws. */
export const MARKET_DECOR: readonly FarmDecorRow[] = Object.freeze([
  // The walls, the gate in the south wall that leads back to the farm, and the one in the north wall down to the Cove.
  row("market-wall-nw", "decor.fence.stone-wall", -(WALL + 0.25) + NORTH_WEST_RUN / 2, -WALL, 0, NORTH_WEST_RUN),
  row("market-wall-ne", "decor.fence.stone-wall", WALL + 0.25 - NORTH_EAST_RUN / 2, -WALL, 0, NORTH_EAST_RUN),
  row(MARKET_COVE_GATE, "decor.fence.gate", COVE_GATE_X, -WALL, 0),
  row("market-signpost-cove", "decor.prop.signpost", COVE_GATE_X - 1.9, -WALL + 1.1, Math.PI),
  row("market-wall-w", "decor.fence.stone-wall", -WALL, 0, QUARTER, WALL * 2 + 0.5),
  row("market-wall-e", "decor.fence.stone-wall", WALL, 0, QUARTER, WALL * 2 + 0.5),
  row("market-wall-sw", "decor.fence.stone-wall", -(GATE_WIDTH / 2 + SOUTH_RUN / 2), WALL, 0, SOUTH_RUN),
  row("market-wall-se", "decor.fence.stone-wall", GATE_WIDTH / 2 + SOUTH_RUN / 2, WALL, 0, SOUTH_RUN),
  row(MARKET_HOME_GATE, "decor.fence.gate", 0, WALL, 0),
  row("market-signpost", "decor.prop.signpost", 2.1, WALL - 1.1, 0),
  // The middle of the square: the well, benches facing it, lamps at the corners.
  row("market-well", "decor.prop.well", 0, 0),
  row("market-bench-n", "decor.prop.bench", 0, -2.6, Math.PI),
  row("market-bench-s", "decor.prop.bench", 0, 2.6, 0),
  row("market-bench-w", "decor.prop.bench", -2.6, 0, -QUARTER),
  row("market-bench-e", "decor.prop.bench", 2.6, 0, QUARTER),
  row("market-lamp-nw", "decor.prop.lamp-post", -4.2, -4.2),
  row("market-lamp-ne", "decor.prop.lamp-post", 4.2, -4.2),
  row("market-lamp-sw", "decor.prop.lamp-post", -4.2, 4.2),
  row("market-lamp-se", "decor.prop.lamp-post", 4.2, 4.2),
  row("market-lamp-gate-w", "decor.prop.lamp-post", -1.8, WALL - 1.1),
  // Dressing round the stalls: stock waiting to go out, a wagon being unloaded.
  row("market-crates-1", "decor.prop.crates", -3.9, -10.4, 0.2),
  row("market-barrel-1", "decor.prop.barrel", 6.6, -12.3),
  row("market-barrel-2", "decor.prop.barrel", 7.4, -12.7),
  row("market-hay-1", "decor.prop.hay-bale", -11.2, -11.3, 0.3),
  row("market-wagon", "decor.prop.wagon", 11.1, -8.6, 0.12),
  row("market-pump", "decor.prop.water-pump", -3.4, 5.6),
  row("market-flowers-1", "decor.plant.flower-bed", -6.2, 11.9),
  row("market-flowers-2", "decor.plant.flower-bed", 6.2, 11.9),
  row("market-gazebo", "decor.building.gazebo", -9.2, 8.6),
  // Trees in the corners, clear of the stalls and the road in.
  row("market-oak-1", "decor.plant.oak", -11.6, -5.4),
  row("market-oak-2", "decor.plant.oak", 11.7, 11.4),
  row("market-birch-1", "decor.plant.birch", 11.8, 5.6),
  row("market-birch-2", "decor.plant.birch", -12, 12),
]);

/** The square as a farm document, so every farm rule that reads a layout reads it unchanged. */
export function marketSquareLayout(): FarmLayout {
  return normalizeFarmLayout({
    version: 3,
    onboarding: { status: "complete", introSeen: true },
    ground: "ground.gravel",
    pets: [],
    decor: MARKET_DECOR,
  });
}

export type MarketStallKind = "stall" | "board";

export type MarketStall = Readonly<{
  id: string;
  kind: MarketStallKind;
  title: string;
  /** Open for business in this version. A shut stall still answers E, to say what it will be. */
  open: boolean;
  x: number;
  z: number;
  /** The stall's front (its counter side) faces its local +z. */
  rotationY: number;
  footprint: Readonly<{ width: number; depth: number }>;
  /** The awning's stripes, the sign's ink. */
  colors: readonly [string, string];
  /** Who keeps it (an arcade avatar), stood behind the counter. None for the board. */
  keeper: Readonly<{ name: string; avatarId: string; greeting: string }> | null;
  /** What E says at a shut stall. */
  closedNote: string;
  /** A board's pinned notices, by heading (the Order Board's by default). */
  notices?: readonly string[];
}>;

const stall = (spec: Omit<MarketStall, "footprint"> & Partial<Pick<MarketStall, "footprint">>): MarketStall =>
  Object.freeze({ footprint: Object.freeze({ width: 3.4, depth: 2 }), ...spec });

export const PRODUCE_STALL_ID = "produce";
export const ORDER_BOARD_ID = "orders";
export const KITCHEN_STALL_ID = "kitchen";
export const SAWMILL_STALL_ID = "sawmill";
export const SEED_STALL_ID = "seeds";
export const EXCHANGE_BOARD_ID = "exchange";

/**
 * The square's stalls. The Produce Merchant (v1, paying the day's prices), the
 * Order Board (Phase 4), the Kitchen (Phase 6, buying cooked dishes), the
 * Sawmill (Phase 7: saws logs into planks for a fee, and buys furniture) and
 * the Seed Merchant (every seed, with three on special each day) are open,
 * and the Exchange Board, where players list goods for each other's tickets.
 */
export const MARKET_STALLS: readonly MarketStall[] = Object.freeze([
  stall({
    id: PRODUCE_STALL_ID, kind: "stall", title: "Produce Merchant", open: true,
    x: 0, z: -9.4, rotationY: 0, colors: ["#3f8a46", "#f4ecd6"],
    keeper: Object.freeze({ name: "Marigold", avatarId: "avatar.villager-f", greeting: "Ingredients for the pot, or a harvest to sell?" }),
    closedNote: "",
  }),
  stall({
    id: SEED_STALL_ID, kind: "stall", title: "Seed Merchant", open: true,
    x: -7.4, z: -9.4, rotationY: 0, colors: ["#d2a032", "#f4ecd6"],
    keeper: Object.freeze({ name: "Juniper", avatarId: "avatar.hero-f", greeting: "Three packets on special today — nowhere else sells them cheaper." }),
    closedNote: "",
  }),
  stall({
    id: KITCHEN_STALL_ID, kind: "stall", title: "Kitchen", open: true,
    x: 7.4, z: -9.4, rotationY: 0, colors: ["#b8452f", "#f4ecd6"],
    keeper: Object.freeze({ name: "Basil", avatarId: "avatar.villager-m", greeting: "New recipes on the shelf — and I'll buy what you cook." }),
    closedNote: "",
  }),
  stall({
    id: SAWMILL_STALL_ID, kind: "stall", title: "Sawmill", open: true,
    x: -11, z: 1.2, rotationY: QUARTER, colors: ["#7a5534", "#e9d9bb"],
    keeper: Object.freeze({ name: "Bram", avatarId: "avatar.ogre", greeting: "Logs to saw? A ticket a log. Or have you made something?" }),
    closedNote: "",
  }),
  stall({
    id: ORDER_BOARD_ID, kind: "board", title: "Order Board", open: true,
    x: 11.2, z: 1.2, rotationY: -QUARTER, footprint: Object.freeze({ width: 2.6, depth: 0.5 }),
    colors: ["#6b4b2c", "#f4ecd6"], keeper: null,
    closedNote: "",
  }),
  stall({
    id: EXCHANGE_BOARD_ID, kind: "board", title: "Exchange Board", open: true,
    x: 11.2, z: -4.4, rotationY: -QUARTER, footprint: Object.freeze({ width: 2.6, depth: 0.5 }),
    colors: ["#2f5f8a", "#f4ecd6"], keeper: null,
    closedNote: "",
    notices: Object.freeze(["For sale", "For sale", "Bargain", "For sale", "Tickets"]),
  }),
]);

export function findMarketStall(id: string): MarketStall | undefined {
  return MARKET_STALLS.find((entry) => entry.id === id);
}

/** A point in a stall's own frame, in the square. */
export function stallLocalToWorld(entry: MarketStall, local: Readonly<{ x: number; z: number }>): { x: number; z: number } {
  const cos = Math.cos(entry.rotationY);
  const sin = Math.sin(entry.rotationY);
  return { x: entry.x + local.x * cos + local.z * sin, z: entry.z - local.x * sin + local.z * cos };
}

/** Where the keeper stands (behind the counter) and the yaw that faces them out over it. */
export function keeperPose(entry: MarketStall): { x: number; z: number; yaw: number } {
  const at = stallLocalToWorld(entry, { x: 0, z: -entry.footprint.depth / 2 + 0.55 });
  // A body's yaw is the walker's: forward = (-sin yaw, -cos yaw). The stall faces (sin r, cos r).
  return { ...at, yaw: entry.rotationY - Math.PI };
}

/** The stalls as solids: the whole stall, keeper and all, is behind the counter. */
export function stallObstacles(stalls: readonly MarketStall[] = MARKET_STALLS): FarmObstacle[] {
  return stalls.map((entry) => ({
    instanceId: `stall-${entry.id}`,
    x: entry.x,
    z: entry.z,
    rotationY: entry.rotationY,
    footprint: entry.footprint,
    bottom: 0,
    top: Infinity,
  }));
}

/** How close to a stall's counter, and how squarely faced, E works it. */
export const STALL_REACH = Object.freeze({ radius: 1.9, facingThreshold: 0.45 });

/** The stall the player is at the counter of and looking at, or null. */
export function findStallInReach(
  pose: Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>,
  stalls: readonly MarketStall[] = MARKET_STALLS,
): MarketStall | null {
  let best: MarketStall | null = null;
  let bestDistance = Infinity;
  for (const entry of stalls) {
    const counter = stallLocalToWorld(entry, { x: 0, z: entry.footprint.depth / 2 });
    const distance = Math.hypot(pose.x - counter.x, pose.z - counter.z);
    if (distance > STALL_REACH.radius) continue;
    // In front of the counter, not round the back.
    const front = { x: Math.sin(entry.rotationY), z: Math.cos(entry.rotationY) };
    if ((pose.x - counter.x) * front.x + (pose.z - counter.z) * front.z < -0.05) continue;
    const toward = { x: entry.x - pose.x, z: entry.z - pose.z };
    const length = Math.hypot(toward.x, toward.z) || 1;
    if ((pose.forward.x * toward.x + pose.forward.z * toward.z) / length < STALL_REACH.facingThreshold) continue;
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

export function stallPrompt(entry: MarketStall, signedIn: boolean): string {
  if (!entry.open) return `${entry.title} · closed for now · Press E to read the notice`;
  if (entry.id === EXCHANGE_BOARD_ID) return signedIn ? `Press E to buy and sell at the ${entry.title}` : `${entry.title} · sign in to buy and sell`;
  if (entry.kind === "board") return signedIn ? `Press E to read the ${entry.title}` : `${entry.title} · sign in to fill orders`;
  if (entry.id === SAWMILL_STALL_ID) return signedIn ? `Press E to saw logs and sell furniture to ${entry.keeper?.name ?? entry.title}` : `${entry.title} · sign in to saw logs and sell furniture`;
  if (entry.id === SEED_STALL_ID) return signedIn ? `Press E to buy seeds from ${entry.keeper?.name ?? entry.title} · today's specials` : `${entry.title} · sign in to buy seeds`;
  const goods = entry.id === KITCHEN_STALL_ID ? "cooking" : "produce";
  if (!signedIn) return `${entry.title} · sign in to buy and sell ${goods}`;
  return entry.id === KITCHEN_STALL_ID
    ? `Press E to buy recipes and sell cooking to ${entry.keeper?.name ?? entry.title}`
    : `Press E to buy ingredients and sell produce to ${entry.keeper?.name ?? entry.title}`;
}
