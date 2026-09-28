// Pure roof and suspension geometry shared by the farm's building models.
// Keeping these calculations out of the renderer makes "attached" a tested
// invariant instead of a collection of hand-tuned visual offsets.
/** The lantern's top cap ends 0.17m above its light origin. */
export function hangingLightChain(lanternY, anchorY) {
    const bottomY = lanternY + 0.17;
    const topY = Math.max(anchorY, bottomY + 0.04);
    return Object.freeze({ bottomY, topY, centreY: (bottomY + topY) / 2, height: topY - bottomY });
}
/** Underside height of a straight gable slope at a coordinate across its ridge. */
export function gableRoofHeightAt(input) {
    const factor = 1 - Math.min(1, Math.abs(input.across) / input.run);
    return input.wallHeight + input.rise * factor;
}
/** Underside height of the barn's two-part gambrel profile. */
export function gambrelRoofHeightAt(input) {
    const kneeAcross = input.halfSpan * 0.55;
    const kneeY = input.wallHeight + input.rise * 0.62;
    const ridgeY = input.wallHeight + input.rise;
    const eaveY = input.wallHeight - input.overhang * 0.3;
    const across = Math.min(Math.abs(input.across), input.halfSpan + input.overhang);
    if (across <= kneeAcross)
        return ridgeY - (across / kneeAcross) * (ridgeY - kneeY);
    const lowerRun = input.halfSpan + input.overhang - kneeAcross;
    return kneeY - ((across - kneeAcross) / lowerRun) * (kneeY - eaveY);
}
/** The gazebo roof sits on a continuous header whose top is the canopy base. */
export function gazeboCanopy(wallHeight, roofHeight) {
    const headerHeight = 0.18;
    return Object.freeze({
        roofBaseY: wallHeight,
        roofCentreY: wallHeight + roofHeight / 2,
        headerCentreY: wallHeight - headerHeight / 2,
        headerHeight,
    });
}
/**
 * A hipped roof as six unshared triangles with a metre-scaled planar UV map.
 * Each slope gets its own local texture frame: procedural tiles repeat at a
 * consistent physical size instead of every vertex sampling the same pixel.
 */
export function hipRoofMesh(input) {
    const halfWidth = input.width / 2 + input.overhang;
    const halfDepth = input.depth / 2 + input.overhang;
    const eaveY = input.wallHeight;
    const ridgeY = input.wallHeight + input.rise;
    const ridgeHalfLength = Math.max(0, halfWidth - halfDepth);
    const corners = [
        [-halfWidth, eaveY, halfDepth],
        [halfWidth, eaveY, halfDepth],
        [halfWidth, eaveY, -halfDepth],
        [-halfWidth, eaveY, -halfDepth],
    ];
    const ridgeWest = [-ridgeHalfLength, ridgeY, 0];
    const ridgeEast = [ridgeHalfLength, ridgeY, 0];
    const triangles = [
        [corners[0], corners[1], ridgeEast], [corners[0], ridgeEast, ridgeWest],
        [corners[2], corners[3], ridgeWest], [corners[2], ridgeWest, ridgeEast],
        [corners[1], corners[2], ridgeEast],
        [corners[3], corners[0], ridgeWest],
    ];
    const positions = [];
    const uvs = [];
    for (const triangle of triangles) {
        const [origin, along, third] = triangle;
        const uVector = [along[0] - origin[0], along[1] - origin[1], along[2] - origin[2]];
        const uLength = Math.hypot(...uVector);
        const uAxis = uVector.map((value) => value / uLength);
        const thirdVector = [third[0] - origin[0], third[1] - origin[1], third[2] - origin[2]];
        const thirdU = thirdVector[0] * uAxis[0] + thirdVector[1] * uAxis[1] + thirdVector[2] * uAxis[2];
        const thirdVVector = thirdVector.map((value, index) => value - thirdU * uAxis[index]);
        const thirdV = Math.hypot(...thirdVVector);
        positions.push(...origin, ...along, ...third);
        uvs.push(0, 0, uLength, 0, thirdU, thirdV);
    }
    return Object.freeze({ positions: Object.freeze(positions), uvs: Object.freeze(uvs) });
}
