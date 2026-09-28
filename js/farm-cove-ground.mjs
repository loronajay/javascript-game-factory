// Pure ground dressing for the Cove. Geometry lives in farm-cove-terrain;
// this module only decides which shared farm surface belongs at a point.
import { DEFAULT_GROUND_ID, findGround } from "./farm-catalog/ground.mjs";
import { COVE_WATER_LEVEL, coveGroundAt, coveWaterAt, coveWaterDistance } from "./farm-cove.mjs";
const TURF = findGround(DEFAULT_GROUND_ID).style;
const sediment = (colors, repeat) => Object.freeze({ pattern: "dirt", colors: Object.freeze([...colors]), repeat, roughness: 0.95, metalness: 0 });
/**
 * The meadow is literally the farm's starter finish. The remaining palettes
 * use that renderer's dirt pattern, recoloured for dry sand and each bed.
 */
export const COVE_GROUND_STYLES = Object.freeze({
    turf: TURF,
    shore: sediment(["#c8b783", "#8b7853", "#ead9a3", "#6f8745"], 9),
    lagoon: sediment(["#6d7048", "#43482e", "#929366", "#526c38"], 8),
    reef: sediment(["#c2b27f", "#847653", "#e3d4a0", "#728b55"], 9),
    deep: sediment(["#344852", "#1d2c35", "#52656d", "#344b3d"], 7),
});
/** Keep the visual material bands derived from the same water/height profile as collision. */
export function coveGroundSurfaceAt(point) {
    const water = coveWaterAt(point);
    if (!water)
        return coveWaterDistance(point) > -2.2 ? "shore" : "turf";
    const height = coveGroundAt(point);
    if (height > COVE_WATER_LEVEL + 0.05)
        return "shore";
    if (water.water === "lagoon")
        return "lagoon";
    return COVE_WATER_LEVEL - height > 3.4 ? "deep" : "reef";
}
