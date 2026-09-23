// Pure sky layout. The renderer consumes these unit vectors, while tests can
// prove the sky is deterministic and the two celestial bodies truly oppose
// one another without loading THREE or a browser.
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
/** A seeded spherical scatter with independent altitude and azimuth—no rows, spirals, or repeating bands. */
export function generateStarField(count, seed = 20260922) {
    const random = mulberry32(seed);
    const total = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    const stars = [];
    for (let index = 0; index < total; index += 1) {
        const y = 0.06 + random() * 0.93;
        const angle = random() * Math.PI * 2;
        const horizontal = Math.sqrt(1 - y * y);
        const sparkle = random();
        stars.push(Object.freeze({
            x: Math.cos(angle) * horizontal,
            y,
            z: Math.sin(angle) * horizontal,
            size: sparkle > 0.94 ? "bright" : sparkle > 0.7 ? "medium" : "faint",
            warmth: random(),
        }));
    }
    return Object.freeze(stars);
}
/** Sunrise is east, noon crosses a tilted southern arc, sunset is west; the moon is always opposite. */
export function celestialOrbit(minutes) {
    const finite = Number.isFinite(minutes) ? minutes : 0;
    const dayMinute = ((finite % 1440) + 1440) % 1440;
    const angle = ((dayMinute - 360) / 1440) * Math.PI * 2;
    const orbitTilt = Math.PI / 10;
    const sun = Object.freeze({
        x: Math.cos(angle),
        y: Math.sin(angle) * Math.cos(orbitTilt),
        z: Math.sin(angle) * Math.sin(orbitTilt),
    });
    return Object.freeze({ sun, moon: Object.freeze({ x: -sun.x, y: -sun.y, z: -sun.z }) });
}
