export const BIRD_DUTY_CABINET = Object.freeze({
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
export const LOVERS_LOST_CABINET = Object.freeze({
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
export const SUMORAI_CABINET = Object.freeze({
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
export const BATTLESHITS_CABINET = Object.freeze({
    id: "cabinet.battleshits.standard",
    kind: "arcade-cabinet",
    gameSlug: "battleshits",
    title: "Battleshits",
    description: "A navy-and-brass two-player cabinet with fleet controls, porcelain firepower, and storm-tossed side art.",
    launchMode: "cabinet-screen",
    dimensions: Object.freeze({ width: 0.92, depth: 0.98, height: 2.3 }),
    placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
    unlock: Object.freeze({ type: "starter", source: "Battleshits cabinet collection" }),
    interaction: Object.freeze({
        radius: 1.62,
        facingThreshold: 0.42,
        anchor: Object.freeze({ x: 0, y: 1.2, z: 0.51 }),
    }),
    palette: Object.freeze({
        shell: "#071a2f",
        trim: "#c89a42",
        sky: "#0d4f7c",
        grass: "#0a7391",
        warning: "#f2e5c4",
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
export const YAM_BOWLING_CABINET = Object.freeze({
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
export const SHARK_HALL_POOL_TABLE = Object.freeze({
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
export const PUCK_D_UP_AIR_HOCKEY = Object.freeze({
    id: "cabinet.puckd-up.air-hockey",
    kind: "arcade-cabinet",
    gameSlug: "puckd-up",
    title: "Puck'd Up",
    description: "A competition air hockey table with a perforated ice bed, recessed goals, sculpted underbody, twin score towers, and electric edge lighting.",
    launchMode: "fullscreen",
    dimensions: Object.freeze({ width: 1.35, depth: 2.45, height: 1.22 }),
    placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
    unlock: Object.freeze({ type: "starter", source: "Puck'd Up table collection" }),
    interaction: Object.freeze({
        radius: 1.85,
        facingThreshold: 0.34,
        anchor: Object.freeze({ x: 0, y: 0.9, z: 1.38 }),
    }),
    palette: Object.freeze({
        shell: "#08111f",
        trim: "#59d8ff",
        sky: "#1477ff",
        grass: "#eef8ff",
        warning: "#ff304c",
    }),
    parts: Object.freeze([
        Object.freeze({ id: "table-body", material: "paint" }),
        Object.freeze({ id: "playfield", material: "paint" }),
        Object.freeze({ id: "rails", material: "metal" }),
        Object.freeze({ id: "goals", material: "metal" }),
        Object.freeze({ id: "mallets", material: "paint" }),
        Object.freeze({ id: "puck", material: "paint" }),
        Object.freeze({ id: "scoreboard", material: "emissive" }),
        Object.freeze({ id: "edge-lighting", material: "emissive" }),
    ]),
});
export const MINI_HOOPS_CABINET = Object.freeze({
    id: "cabinet.mini-hoops.carnival",
    kind: "arcade-cabinet",
    gameSlug: "mini-hoops",
    title: "Mini Hoops",
    description: "A full walk-up carnival basketball machine with an enclosed return court, regulation-style rim, ball trough, scoring tower, and glowing midway marquee.",
    launchMode: "fullscreen",
    dimensions: Object.freeze({ width: 2.1, depth: 3.2, height: 2.55 }),
    placement: Object.freeze({ surface: "floor", snapDegrees: 15, clearance: 0.06 }),
    unlock: Object.freeze({ type: "starter", source: "Mini Hoops carnival collection" }),
    interaction: Object.freeze({
        radius: 2.15,
        facingThreshold: 0.34,
        anchor: Object.freeze({ x: 0, y: 1.1, z: 1.72 }),
    }),
    palette: Object.freeze({
        shell: "#161b31",
        trim: "#f08a34",
        sky: "#29b6d8",
        grass: "#f3c24f",
        warning: "#f45151",
    }),
    parts: Object.freeze([
        Object.freeze({ id: "court-ramp", material: "paint" }),
        Object.freeze({ id: "ball-trough", material: "paint" }),
        Object.freeze({ id: "cage", material: "metal" }),
        Object.freeze({ id: "backboard", material: "paint" }),
        Object.freeze({ id: "hoop", material: "metal" }),
        Object.freeze({ id: "basketballs", material: "paint" }),
        Object.freeze({ id: "scoreboard", material: "emissive" }),
        Object.freeze({ id: "marquee", material: "emissive" }),
        Object.freeze({ id: "edge-lighting", material: "emissive" }),
    ]),
});
export const CABINET_CATALOG = Object.freeze([
    BIRD_DUTY_CABINET,
    LOVERS_LOST_CABINET,
    SUMORAI_CABINET,
    BATTLESHITS_CABINET,
    YAM_BOWLING_CABINET,
    SHARK_HALL_POOL_TABLE,
    PUCK_D_UP_AIR_HOCKEY,
    MINI_HOOPS_CABINET,
]);
export function getCabinetFootprint(definition) {
    const padding = definition.placement.clearance * 2;
    return {
        width: Number((definition.dimensions.width + padding).toFixed(3)),
        depth: Number((definition.dimensions.depth + padding).toFixed(3)),
    };
}
export function getCabinetLaunchUrl(definition, roomHref, shared) {
    const url = new URL(`../games/${encodeURIComponent(definition.gameSlug)}/index.html`, roomHref);
    url.searchParams.set("cabinet", "1");
    if (shared?.roomId && shared.cabinetInstanceId) {
        url.searchParams.set("arcadeRoomId", shared.roomId);
        url.searchParams.set("cabinetInstanceId", shared.cabinetInstanceId);
        url.searchParams.set("arcadeSession", `${shared.roomId}:${shared.cabinetInstanceId}`);
    }
    return url.toString();
}
export function validateCabinetDefinition(definition) {
    const errors = [];
    for (const dimension of ["width", "depth", "height"]) {
        if (!Number.isFinite(definition.dimensions[dimension]) || definition.dimensions[dimension] <= 0) {
            errors.push(`dimensions.${dimension} must be greater than zero`);
        }
    }
    const ids = definition.parts.map((part) => part.id);
    if (new Set(ids).size !== ids.length)
        errors.push("part ids must be unique");
    return errors;
}
