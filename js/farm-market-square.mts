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

// The stone wall is 0.5 deep; its outer face sits on the inset line like the farm's fence.
const WALL = MARKET_BOUNDS.width / 2 - MARKET_BOUNDS.wallInset - 0.25;
const GATE_WIDTH = 2.4;
const SOUTH_RUN = WALL - GATE_WIDTH / 2 + 0.25;
const QUARTER = Math.PI / 2;

const row = (instanceId: string, itemId: string, x: number, z: number, rotationY = 0, length = 0): FarmDecorRow =>
  Object.freeze({ instanceId, itemId, x, z, rotationY, length });

/** Everything in the square the farm's catalog already draws. */
export const MARKET_DECOR: readonly FarmDecorRow[] = Object.freeze([
  // The walls, and the gate in the south wall that leads back to the farm.
  row("market-wall-n", "decor.fence.stone-wall", 0, -WALL, 0, WALL * 2 + 0.5),
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
  row("market-barrel-1", "decor.prop.barrel", 3.6, -10.6),
  row("market-barrel-2", "decor.prop.barrel", 4.3, -10.1),
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
}>;

const stall = (spec: Omit<MarketStall, "footprint"> & Partial<Pick<MarketStall, "footprint">>): MarketStall =>
  Object.freeze({ footprint: Object.freeze({ width: 3.4, depth: 2 }), ...spec });

export const PRODUCE_STALL_ID = "produce";

/**
 * The square's stalls. v1 opens the Produce Merchant; the others stand where
 * they will trade, shuttered, and say so — the plan's Seed Merchant, Kitchen,
 * Sawmill and Order Board, in the order the plan brings them online.
 */
export const MARKET_STALLS: readonly MarketStall[] = Object.freeze([
  stall({
    id: PRODUCE_STALL_ID, kind: "stall", title: "Produce Merchant", open: true,
    x: 0, z: -9.4, rotationY: 0, colors: ["#3f8a46", "#f4ecd6"],
    keeper: Object.freeze({ name: "Marigold", avatarId: "avatar.villager-f", greeting: "Fresh from the field? I'll buy the lot." }),
    closedNote: "",
  }),
  stall({
    id: "seeds", kind: "stall", title: "Seed Merchant", open: false,
    x: -7.4, z: -9.4, rotationY: 0, colors: ["#d2a032", "#f4ecd6"], keeper: null,
    closedNote: "The Seed Merchant's shutters are down. Seeds are still sold from your farm's Inventory.",
  }),
  stall({
    id: "kitchen", kind: "stall", title: "Kitchen", open: false,
    x: 7.4, z: -9.4, rotationY: 0, colors: ["#b8452f", "#f4ecd6"], keeper: null,
    closedNote: "The Kitchen is not cooking yet. Recipes come with the Cooking skill.",
  }),
  stall({
    id: "sawmill", kind: "stall", title: "Sawmill", open: false,
    x: -11, z: 1.2, rotationY: QUARTER, colors: ["#7a5534", "#e9d9bb"], keeper: null,
    closedNote: "The Sawmill is quiet. It opens when timber trees and Woodcutting arrive.",
  }),
  stall({
    id: "orders", kind: "board", title: "Order Board", open: false,
    x: 11.2, z: 1.2, rotationY: -QUARTER, footprint: Object.freeze({ width: 2.6, depth: 0.5 }),
    colors: ["#6b4b2c", "#f4ecd6"], keeper: null,
    closedNote: "No orders are pinned up yet. Contracts open with Farming levels.",
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
  if (!signedIn) return `${entry.title} · sign in to sell your produce`;
  return `Press E to sell produce to ${entry.keeper?.name ?? entry.title}`;
}
