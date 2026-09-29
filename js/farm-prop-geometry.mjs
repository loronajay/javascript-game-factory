// Pure silhouette layouts for the farm's hand-built props. Keeping the shape
// math out of the Three.js builders makes entrance clearances and distinctive
// profiles testable without pretending to unit-test renderer calls.
/** The two plank-filled triangles between the doghouse walls and its pitched roof. */
export function doghouseGableMesh() {
    const halfWidth = 0.55;
    const wallTop = 0.9;
    const ridgeY = 1.3;
    const frontZ = 0.65;
    const backZ = -0.65;
    return Object.freeze({
        // Opposite winding keeps each end facing out from the house.
        positions: Object.freeze([
            -halfWidth, wallTop, frontZ, halfWidth, wallTop, frontZ, 0, ridgeY, frontZ,
            -halfWidth, wallTop, backZ, 0, ridgeY, backZ, halfWidth, wallTop, backZ,
        ]),
        uvs: Object.freeze([
            0, 0, halfWidth * 2, 0, halfWidth, ridgeY - wallTop,
            0, 0, halfWidth, ridgeY - wallTop, halfWidth * 2, 0,
        ]),
    });
}
/** Five open shell faces for a tray that flares up and widens away from its wheel. */
export function wheelbarrowTrayShell() {
    const floorHeight = 0.34;
    const rimHeight = 0.7;
    const front = Object.freeze({ z: -0.5, bottomWidth: 0.28, topWidth: 0.5 });
    const rear = Object.freeze({ z: 0.42, bottomWidth: 0.48, topWidth: 0.68 });
    const point = (x, y, z) => Object.freeze([x, y, z]);
    const fb = front.bottomWidth / 2;
    const ft = front.topWidth / 2;
    const rb = rear.bottomWidth / 2;
    const rt = rear.topWidth / 2;
    const lowFront = floorHeight - 0.05;
    const lowRear = floorHeight + 0.05;
    const highFront = rimHeight + 0.04;
    const highRear = rimHeight - 0.04;
    const faces = Object.freeze([
        Object.freeze({ name: "floor", corners: Object.freeze([point(-fb, lowFront, front.z), point(fb, lowFront, front.z), point(rb, lowRear, rear.z), point(-rb, lowRear, rear.z)]) }),
        Object.freeze({ name: "front", corners: Object.freeze([point(-fb, lowFront, front.z), point(-ft, highFront, front.z), point(ft, highFront, front.z), point(fb, lowFront, front.z)]) }),
        Object.freeze({ name: "rear", corners: Object.freeze([point(-rb, lowRear, rear.z), point(rb, lowRear, rear.z), point(rt, highRear, rear.z), point(-rt, highRear, rear.z)]) }),
        Object.freeze({ name: "left", corners: Object.freeze([point(-fb, lowFront, front.z), point(-rb, lowRear, rear.z), point(-rt, highRear, rear.z), point(-ft, highFront, front.z)]) }),
        Object.freeze({ name: "right", corners: Object.freeze([point(fb, lowFront, front.z), point(ft, highFront, front.z), point(rt, highRear, rear.z), point(rb, lowRear, rear.z)]) }),
    ]);
    return Object.freeze({ floorHeight, rimHeight, front, rear, faces });
}
function stoneAt(index, x, y, z, radius, variantOffset) {
    const wobble = (index * 37 + variantOffset * 19) % 11;
    return Object.freeze({
        x,
        y,
        z,
        radius,
        scale: Object.freeze([
            0.82 + (wobble % 5) * 0.09,
            0.72 + ((wobble * 2 + index) % 7) * 0.055,
            0.78 + ((wobble * 3 + index) % 6) * 0.06,
        ]),
        turn: ((wobble - 5) * Math.PI) / 28,
    });
}
/** A layered cave shell whose front stones respect the catalog entrance box. */
export function aquaticArchStones(width, depth, entrance, variant) {
    const stones = [];
    const front = depth / 2 - 0.16;
    const offset = variant === "reef" ? 2 : 7;
    const sideRadius = Math.min(0.34, width * 0.1);
    const sideX = entrance.width / 2 + sideRadius * 1.25;
    for (const side of [-1, 1]) {
        for (let tier = 0; tier < 4; tier += 1) {
            stones.push(stoneAt(stones.length, side * (sideX + (tier % 2) * 0.07), sideRadius + tier * sideRadius * 1.42, front - tier * 0.035, sideRadius, offset));
        }
    }
    const crownRadius = Math.min(0.3, width * 0.09);
    for (let index = 0; index < 9; index += 1) {
        const angle = (index / 8) * Math.PI;
        const x = Math.cos(angle) * (entrance.width / 2 + crownRadius * 0.95);
        const y = entrance.height + crownRadius + Math.sin(angle) * 0.48;
        stones.push(stoneAt(stones.length, x, y, front - 0.03 - Math.sin(angle) * 0.08, crownRadius, offset));
    }
    const backRows = variant === "reef" ? 9 : 11;
    for (let index = 0; index < backRows; index += 1) {
        const angle = (index / backRows) * Math.PI * 2 + 0.24;
        const radius = 0.3 + ((index * 3 + offset) % 4) * 0.035;
        stones.push(stoneAt(stones.length, Math.sin(angle) * width * 0.38, radius * 0.75 + (index % 3) * 0.22, -depth * (0.12 + (index % 2) * 0.17), radius, offset));
    }
    return Object.freeze(stones);
}
/** An uneven double ring of stones with an honest opening on the +z side. */
export function lagoonRimStones(radius, entranceWidth) {
    const stones = [];
    for (let index = 0; index < 28; index += 1) {
        const angle = (index / 28) * Math.PI * 2;
        const stoneRadius = 0.17 + (index % 5) * 0.014;
        const x = Math.sin(angle) * radius * (0.78 + (index % 2) * 0.055);
        const z = Math.cos(angle) * radius * (0.76 + ((index + 1) % 3) * 0.035);
        const scaleX = 0.82 + ((index * 2) % 5) * 0.09;
        if (z > 0 && Math.abs(x) - stoneRadius * scaleX < entranceWidth / 2)
            continue;
        const stone = stoneAt(index, x, stoneRadius * (0.72 + (index % 3) * 0.08), z, stoneRadius, 5);
        stones.push(Object.freeze({ ...stone, scale: Object.freeze([scaleX, stone.scale[1], stone.scale[2]]) }));
    }
    return Object.freeze(stones);
}
