export type CabinetPart = Readonly<{
  id: string;
  material: "paint" | "decal" | "emissive" | "metal";
}>;

export type CabinetDefinition = Readonly<{
  id: string;
  kind: "arcade-cabinet";
  gameSlug: string;
  title: string;
  description: string;
  launchMode: "cabinet-screen" | "fullscreen";
  dimensions: Readonly<{ width: number; depth: number; height: number }>;
  placement: Readonly<{ surface: "floor"; snapDegrees: number; clearance: number }>;
  unlock: Readonly<{ type: "starter" | "achievement" | "purchase"; source: string }>;
  interaction: Readonly<{
    radius: number;
    facingThreshold: number;
    anchor: Readonly<{ x: number; y: number; z: number }>;
  }>;
  palette: Readonly<{
    shell: string;
    trim: string;
    sky: string;
    grass: string;
    warning: string;
  }>;
  parts: readonly CabinetPart[];
}>;

export const BIRD_DUTY_CABINET: CabinetDefinition = Object.freeze({
  id: "cabinet.bird-duty.standard",
  kind: "arcade-cabinet",
  gameSlug: "bird-duty",
  title: "Bird Duty",
  description: "A sky-blue upright cabinet with a wire-perched bird topper and splat-yellow controls.",
  launchMode: "cabinet-screen",
  dimensions: Object.freeze({ width: 0.86, depth: 0.92, height: 2.22 }),
  placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
  unlock: Object.freeze({ type: "starter", source: "Bird Duty cabinet collection" }),
  interaction: Object.freeze({
    radius: 1.55,
    facingThreshold: 0.45,
    anchor: Object.freeze({ x: 0, y: 1.18, z: 0.49 }),
  }),
  palette: Object.freeze({
    shell: "#15304b",
    trim: "#8fd7ff",
    sky: "#56bce8",
    grass: "#6dad45",
    warning: "#ffd33d",
  }),
  parts: Object.freeze([
    Object.freeze({ id: "shell", material: "paint" }),
    Object.freeze({ id: "side-art-left", material: "decal" }),
    Object.freeze({ id: "side-art-right", material: "decal" }),
    Object.freeze({ id: "marquee", material: "emissive" }),
    Object.freeze({ id: "screen", material: "emissive" }),
    Object.freeze({ id: "control-deck", material: "paint" }),
    Object.freeze({ id: "coin-door", material: "metal" }),
    Object.freeze({ id: "topper", material: "paint" }),
  ]),
});

export const LOVERS_LOST_CABINET: CabinetDefinition = Object.freeze({
  id: "cabinet.lovers-lost.standard",
  kind: "arcade-cabinet",
  gameSlug: "lovers-lost",
  title: "Lovers Lost",
  description: "A cosmic-purple twin-player cabinet with split controls, reunion-heart lighting, and mirrored runner art.",
  launchMode: "cabinet-screen",
  dimensions: Object.freeze({ width: 0.92, depth: 0.98, height: 2.3 }),
  placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
  unlock: Object.freeze({ type: "starter", source: "Lovers Lost cabinet collection" }),
  interaction: Object.freeze({
    radius: 1.62,
    facingThreshold: 0.42,
    anchor: Object.freeze({ x: 0, y: 1.2, z: 0.51 }),
  }),
  palette: Object.freeze({
    shell: "#241342",
    trim: "#ff8ebd",
    sky: "#181568",
    grass: "#6633aa",
    warning: "#ffd166",
  }),
  parts: Object.freeze([
    Object.freeze({ id: "shell", material: "paint" }),
    Object.freeze({ id: "side-art-left", material: "decal" }),
    Object.freeze({ id: "side-art-right", material: "decal" }),
    Object.freeze({ id: "marquee", material: "emissive" }),
    Object.freeze({ id: "screen", material: "emissive" }),
    Object.freeze({ id: "control-deck", material: "paint" }),
    Object.freeze({ id: "coin-door", material: "metal" }),
    Object.freeze({ id: "topper", material: "emissive" }),
  ]),
});

export const SUMORAI_CABINET: CabinetDefinition = Object.freeze({
  id: "cabinet.sumorai.standard",
  kind: "arcade-cabinet",
  gameSlug: "sumorai",
  title: "Sumorai",
  description: "A black-and-crimson two-player cabinet with moonlit forest art, dueling controls, and an enso blade topper.",
  launchMode: "cabinet-screen",
  dimensions: Object.freeze({ width: 0.92, depth: 0.98, height: 2.3 }),
  placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
  unlock: Object.freeze({ type: "starter", source: "Sumorai cabinet collection" }),
  interaction: Object.freeze({
    radius: 1.62,
    facingThreshold: 0.42,
    anchor: Object.freeze({ x: 0, y: 1.2, z: 0.51 }),
  }),
  palette: Object.freeze({
    shell: "#160d10",
    trim: "#c63c32",
    sky: "#142c4d",
    grass: "#243f43",
    warning: "#e6d5b8",
  }),
  parts: Object.freeze([
    Object.freeze({ id: "shell", material: "paint" }),
    Object.freeze({ id: "side-art-left", material: "decal" }),
    Object.freeze({ id: "side-art-right", material: "decal" }),
    Object.freeze({ id: "marquee", material: "emissive" }),
    Object.freeze({ id: "screen", material: "emissive" }),
    Object.freeze({ id: "control-deck", material: "paint" }),
    Object.freeze({ id: "coin-door", material: "metal" }),
    Object.freeze({ id: "topper", material: "emissive" }),
  ]),
});

export const YAM_BOWLING_CABINET: CabinetDefinition = Object.freeze({
  id: "cabinet.yam-bowling.lane",
  kind: "arcade-cabinet",
  gameSlug: "yam-bowling",
  title: "Yam Bowling",
  description: "A compact glow-bowling lane with a working approach, full pin deck, a low ball return, and a neon marquee across the pinsetter hood.",
  launchMode: "fullscreen",
  dimensions: Object.freeze({ width: 2.35, depth: 6, height: 1.2 }),
  placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
  unlock: Object.freeze({ type: "starter", source: "Yam Bowling lane collection" }),
  interaction: Object.freeze({
    radius: 3.7,
    facingThreshold: 0.35,
    anchor: Object.freeze({ x: 0, y: 1.02, z: 2.48 }),
  }),
  palette: Object.freeze({
    shell: "#17101f",
    trim: "#e03622",
    sky: "#322052",
    grass: "#d9a85f",
    warning: "#ffd76a",
  }),
  parts: Object.freeze([
    Object.freeze({ id: "lane", material: "paint" }),
    Object.freeze({ id: "gutters", material: "metal" }),
    Object.freeze({ id: "pin-deck", material: "paint" }),
    Object.freeze({ id: "pins", material: "paint" }),
    Object.freeze({ id: "ball-return", material: "paint" }),
    Object.freeze({ id: "marquee", material: "emissive" }),
  ]),
});

export const SHARK_HALL_POOL_TABLE: CabinetDefinition = Object.freeze({
  id: "cabinet.shark-hall.pool-table",
  kind: "arcade-cabinet",
  gameSlug: "shark-hall",
  title: "Shark Hall",
  description: "A tournament-size walnut pool table with navy cloth, a full rack, brass details, and neon-lit edges.",
  launchMode: "fullscreen",
  dimensions: Object.freeze({ width: 3.12, depth: 1.82, height: 1.02 }),
  placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
  unlock: Object.freeze({ type: "starter", source: "Shark Hall table collection" }),
  interaction: Object.freeze({
    radius: 2.25,
    facingThreshold: 0.32,
    anchor: Object.freeze({ x: 0, y: 0.92, z: 1.02 }),
  }),
  palette: Object.freeze({
    shell: "#2b160e",
    trim: "#d0a253",
    sky: "#162d49",
    grass: "#234663",
    warning: "#f2dd9b",
  }),
  parts: Object.freeze([
    Object.freeze({ id: "table", material: "paint" }),
    Object.freeze({ id: "felt", material: "paint" }),
    Object.freeze({ id: "rails", material: "paint" }),
    Object.freeze({ id: "pockets", material: "metal" }),
    Object.freeze({ id: "balls", material: "paint" }),
    Object.freeze({ id: "cues", material: "paint" }),
    Object.freeze({ id: "edge-lighting", material: "emissive" }),
  ]),
});

export const CABINET_CATALOG: readonly CabinetDefinition[] = Object.freeze([
  BIRD_DUTY_CABINET,
  LOVERS_LOST_CABINET,
  SUMORAI_CABINET,
  YAM_BOWLING_CABINET,
  SHARK_HALL_POOL_TABLE,
]);

export function getCabinetFootprint(definition: CabinetDefinition): { width: number; depth: number } {
  const padding = definition.placement.clearance * 2;
  return {
    width: Number((definition.dimensions.width + padding).toFixed(3)),
    depth: Number((definition.dimensions.depth + padding).toFixed(3)),
  };
}

export function getCabinetLaunchUrl(
  definition: CabinetDefinition,
  roomHref: string,
  shared?: Readonly<{ roomId: string; cabinetInstanceId: string }>,
): string {
  const url = new URL(`../games/${encodeURIComponent(definition.gameSlug)}/index.html`, roomHref);
  url.searchParams.set("cabinet", "1");
  if (shared?.roomId && shared.cabinetInstanceId) {
    url.searchParams.set("arcadeRoomId", shared.roomId);
    url.searchParams.set("cabinetInstanceId", shared.cabinetInstanceId);
    url.searchParams.set("arcadeSession", `${shared.roomId}:${shared.cabinetInstanceId}`);
  }
  return url.toString();
}

export function validateCabinetDefinition(definition: CabinetDefinition): string[] {
  const errors: string[] = [];
  for (const dimension of ["width", "depth", "height"] as const) {
    if (!Number.isFinite(definition.dimensions[dimension]) || definition.dimensions[dimension] <= 0) {
      errors.push(`dimensions.${dimension} must be greater than zero`);
    }
  }
  const ids = definition.parts.map((part) => part.id);
  if (new Set(ids).size !== ids.length) errors.push("part ids must be unique");
  return errors;
}
