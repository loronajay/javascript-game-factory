import { findDecor, type DecorDefinition } from "./arcade-room-catalog/decor.mjs";
import type { RoomDecorItem } from "./arcade-room-layout.mjs";

export const CABINET_SESSION_READY = "ready" as const;
export const CABINET_SESSION_PLAYING = "playing" as const;
export const CABINET_SESSION_CLOSED = "closed" as const;

type HorizontalVector = Readonly<{ x: number; z: number }>;
type PlayerPose = HorizontalVector & Readonly<{ forward: HorizontalVector }>;
type CabinetInteractionTarget = Readonly<{
  position: HorizontalVector;
  forward: HorizontalVector;
  radius: number;
  facingThreshold: number;
}>;
type CabinetSessionStatus =
  | typeof CABINET_SESSION_READY
  | typeof CABINET_SESSION_PLAYING
  | typeof CABINET_SESSION_CLOSED;

export type CabinetSession = Readonly<{ cabinetId: string; status: CabinetSessionStatus }>;

function normalizedDot(a: HorizontalVector, b: HorizontalVector): number {
  const aLength = Math.hypot(a.x, a.z);
  const bLength = Math.hypot(b.x, b.z);
  if (aLength === 0 || bLength === 0) return -1;
  return (a.x * b.x + a.z * b.z) / (aLength * bLength);
}

export function canInteractWithCabinet(player: PlayerPose, cabinet: CabinetInteractionTarget): boolean {
  const cabinetToPlayer = {
    x: player.x - cabinet.position.x,
    z: player.z - cabinet.position.z,
  };
  const distance = Math.hypot(cabinetToPlayer.x, cabinetToPlayer.z);
  if (distance > cabinet.radius) return false;

  const playerToCabinet = { x: -cabinetToPlayer.x, z: -cabinetToPlayer.z };
  const playerIsFacingCabinet = normalizedDot(player.forward, playerToCabinet) >= cabinet.facingThreshold;
  const playerIsInFront = normalizedDot(cabinet.forward, cabinetToPlayer) >= 0;
  return playerIsFacingCabinet && playerIsInFront;
}

export type InteractiveDecorHit = Readonly<{ item: RoomDecorItem; definition: DecorDefinition }>;

/**
 * The nearest placed decor item the player can open right now, by the same reach rules a
 * cabinet uses. A wall item's local +Z faces into the room, so its forward is its rotation.
 */
export function findInteractiveDecor(decor: readonly RoomDecorItem[], player: PlayerPose): InteractiveDecorHit | null {
  let hit: InteractiveDecorHit | null = null;
  let nearest = Infinity;
  for (const item of decor) {
    const definition = findDecor(item.itemId);
    if (!definition?.interaction) continue;
    const reachable = canInteractWithCabinet(player, {
      position: { x: item.x, z: item.z },
      forward: { x: Math.sin(item.rotationY), z: Math.cos(item.rotationY) },
      radius: definition.interaction.radius,
      facingThreshold: definition.interaction.facingThreshold,
    });
    if (!reachable) continue;
    const distance = Math.hypot(player.x - item.x, player.z - item.z);
    if (distance < nearest) {
      nearest = distance;
      hit = { item, definition };
    }
  }
  return hit;
}

/** Who the player could wave at: a body in reach and roughly in front, nearest first. */
export type VisitorReachRules = Readonly<{ radius: number; facingThreshold: number }>;
export const VISITOR_REACH: VisitorReachRules = Object.freeze({ radius: 2.6, facingThreshold: 0.45 });

export function findVisitorInReach<T extends Readonly<{ pose: HorizontalVector }>>(
  player: PlayerPose,
  visitors: readonly T[],
  rules: VisitorReachRules = VISITOR_REACH,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const visitor of visitors) {
    const toVisitor = { x: visitor.pose.x - player.x, z: visitor.pose.z - player.z };
    const distance = Math.hypot(toVisitor.x, toVisitor.z);
    if (distance > rules.radius || distance < 1e-6) continue;
    if (normalizedDot(player.forward, toVisitor) < rules.facingThreshold) continue;
    if (distance < bestDistance) {
      best = visitor;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where to stand on entering: the spawn point, unless somebody is already on it.
 * Everyone enters at the same spot, so two players who arrive together would
 * otherwise be inside each other. The offsets fan out sideways, nearest first.
 */
export const SPAWN_CLEARANCE = 0.7;
const SPAWN_OFFSETS = Object.freeze([0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7]);

export function spawnOffsetForCompany(
  spawn: HorizontalVector,
  company: readonly Readonly<{ pose: HorizontalVector }>[],
  clearance = SPAWN_CLEARANCE,
): number {
  for (const offset of SPAWN_OFFSETS) {
    const x = spawn.x + offset;
    const clear = company.every((other) => Math.hypot(other.pose.x - x, other.pose.z - spawn.z) >= clearance);
    if (clear) return offset;
  }
  return SPAWN_OFFSETS[SPAWN_OFFSETS.length - 1];
}

export function getVisitorPrompt(name: string): string {
  return `Press E to wave at ${name}`;
}

export function getCabinetPrompt(canInteract: boolean, title: string): string {
  return canInteract ? `Press E to play ${title}` : "";
}

export function createCabinetSession(cabinetId: string): CabinetSession {
  return Object.freeze({ cabinetId, status: CABINET_SESSION_READY });
}

export function openCabinetSession(session: CabinetSession): CabinetSession {
  if (session.status === CABINET_SESSION_PLAYING) return session;
  return Object.freeze({ ...session, status: CABINET_SESSION_PLAYING });
}

export function closeCabinetSession(session: CabinetSession): CabinetSession {
  if (session.status === CABINET_SESSION_CLOSED) return session;
  return Object.freeze({ ...session, status: CABINET_SESSION_CLOSED });
}
