export const BIRD_DUTY_CABINET = Object.freeze({
    id: "cabinet.bird-duty.standard",
    kind: "arcade-cabinet",
    gameSlug: "bird-duty",
    title: "Bird Duty",
    description: "A sky-blue upright cabinet with a wire-perched bird topper and splat-yellow controls.",
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
export const CABINET_CATALOG = Object.freeze([
    BIRD_DUTY_CABINET,
    LOVERS_LOST_CABINET,
]);
export function getCabinetFootprint(definition) {
    const padding = definition.placement.clearance * 2;
    return {
        width: Number((definition.dimensions.width + padding).toFixed(3)),
        depth: Number((definition.dimensions.depth + padding).toFixed(3)),
    };
}
export function getCabinetLaunchUrl(definition, roomHref) {
    const url = new URL(`../games/${encodeURIComponent(definition.gameSlug)}/index.html`, roomHref);
    url.searchParams.set("cabinet", "1");
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
