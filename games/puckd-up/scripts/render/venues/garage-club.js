import { createVenueHelpers } from './helpers.js';

export const GARAGE_CLUB_STYLE = Object.freeze({
    floorSurface: 'concrete',
    tableSurface: 'garageLaminate',
    tableColor: 0x14272c,
    overheadSpans: false,
    level: Object.freeze({
        width: 160, depth: 220, clearHeight: 22,
        clubZoneWidth: 38, clubZoneDepth: 50, parkingSetback: 18,
    }),
    vehicle: Object.freeze({ length: 36, width: 14.5, height: 11 }),
});

export function buildGarageClub(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Garage Club';
    const { level, vehicle } = GARAGE_CLUB_STYLE;

    const floor = makeSurface(GARAGE_CLUB_STYLE.floorSurface, 0x34383a, {
        accent: 0x151718, repeat: [18, 24], seed: 311, roughness: .82, metalness: .05,
    });
    const structuralConcrete = makeSurface('concrete', 0x565654, {
        accent: 0x222321, repeat: [3, 8], seed: 307, roughness: .88, metalness: .02,
    });
    const steel = makeStd(0x3d474b, { roughness: .38, metalness: .76 });
    const charcoal = makeStd(0x171c1e, { roughness: .55, metalness: .32 });
    const glass = makeStd(0x244a50, { roughness: .12, metalness: .22, transparent: true, opacity: .62 });
    const safetyYellow = makeStd(0xe4a42c, { roughness: .42, metalness: .28, emissive: 0xa45c10, emissiveIntensity: .32 });
    const lineWhite = makeStd(0xd9d6c7, { roughness: .74, metalness: .02 });
    const amber = makeStd(0xff9c3f, { roughness: .18, metalness: .24, emissive: 0xff7a24, emissiveIntensity: 1.25 });
    const teal = makeStd(0x50d8d4, { roughness: .16, metalness: .28, emissive: 0x34bcb9, emissiveIntensity: 1.25 });
    const clubFloor = makeSurface('rubber', 0x252b2d, {
        accent: 0x0d1011, repeat: [6, 9], seed: 337, roughness: .76, metalness: .03,
    });

    addBox(g, [level.width, .48, level.depth], [0, -.74, -20], floor);
    addBox(g, [level.clubZoneWidth, .08, level.clubZoneDepth], [0, -.44, 0], clubFloor);

    // Full-size parking bays make the table read as an installation inside a broad level.
    const markings = [];
    for (const side of [-1, 1]) {
        const innerX = side * 14;
        const outerX = side * 38;
        markings.push({ x: innerX, y: -.485, z: -20, sx: .16, sy: .025, sz: 180 });
        markings.push({ x: outerX, y: -.485, z: -20, sx: .16, sy: .025, sz: 180 });
        for (const z of [-100, -60, -20, 20, 60])
            markings.push({ x: side * 26, y: -.482, z, sx: 24, sy: .025, sz: .16 });
    }
    addInstancedBoxes(g, markings, lineWhite);

    // Perimeter columns communicate the generous clear height while keeping the camera corridor open.
    const pillars = [];
    for (const x of [-68, -46, 46, 68]) {
        for (const z of [-105, -70, -35, 0, 35, 70])
            pillars.push({ x, y: level.clearHeight / 2 - .5, z, sx: 3.2, sy: level.clearHeight, sz: 3.2 });
    }
    addInstancedBoxes(g, pillars, structuralConcrete);
    for (const x of [-68, -46, 46, 68]) {
        for (const z of [-105, -70, -35, 0, 35, 70]) {
            addBox(g, [3.4, .70, 3.4], [x, 2.1, z], safetyYellow);
            addBox(g, [3.4, .70, 3.4], [x, 3.55, z], charcoal);
        }
    }

    // Architectural beams and services stay on the remote wall, never above the table.
    addBox(g, [level.width - 6, level.clearHeight, 1.1], [0, level.clearHeight / 2 - .5, -129], structuralConcrete);
    addBox(g, [level.width - 10, 1.2, 1.7], [0, level.clearHeight - 1.5, -128], steel);
    for (const y of [4.5, 10.5, 16.5])
        addBox(g, [level.width - 16, .35, .35], [0, y, -127.3], y === 10.5 ? safetyYellow : steel);
    for (const x of [-60, -40, -20, 0, 20, 40, 60])
        addNeonStrip(g, [11, .32, .18], [x, 17.5, -126.5], x % 40 === 0 ? 0x55d9d2 : 0xff9b3c, 1.15);

    function addCar(x, z, color, heading = 0) {
        const body = makeStd(color, { roughness: .34, metalness: .58 });
        const cos = Math.cos(heading), sin = Math.sin(heading);
        const place = (localX, localZ) => [x + localX * cos + localZ * sin, z - localX * sin + localZ * cos];
        const bodyHeight = vehicle.height * .42;
        const cabinHeight = vehicle.height * .50;
        const bodyY = -.5 + bodyHeight / 2;
        const cabinY = -.5 + bodyHeight + cabinHeight / 2;
        addBox(g, [vehicle.width, bodyHeight, vehicle.length], [x, bodyY, z], body, [0, heading, 0]);
        const cabin = place(0, -vehicle.length * .04);
        const windshield = place(0, -vehicle.length * .07);
        addBox(g, [vehicle.width * .82, cabinHeight, vehicle.length * .52], [cabin[0], cabinY, cabin[1]], body, [0, heading, 0]);
        addBox(g, [vehicle.width * .70, vehicle.height * .27, vehicle.length * .30], [windshield[0], cabinY + .2, windshield[1]], glass, [0, heading, 0]);
        const wheelRadius = vehicle.height * .23;
        for (const wheelX of [-vehicle.width * .49, vehicle.width * .49]) {
            for (const wheelZ of [-vehicle.length * .31, vehicle.length * .31]) {
                const wheelPosition = place(wheelX, wheelZ);
                const wheel = addCylinder(g, wheelRadius, vehicle.width * .10, [wheelPosition[0], wheelRadius - .5, wheelPosition[1]], charcoal, 24);
                wheel.rotation.set(0, heading, Math.PI / 2);
            }
        }
        const light = place(0, -vehicle.length * .505);
        addBox(g, [vehicle.width * .70, vehicle.height * .08, .18], [light[0], bodyY, light[1]], color === 0x773b35 ? amber : teal, [0, heading, 0]);
    }

    // True-scale vehicles remain well outside the table and establish a familiar reference.
    const cars = [
        [-54, -104, 0x773b35, 0], [54, -104, 0x254c66, 0],
        [-30, -75, 0x54595c, Math.PI / 2], [25, -33.25, 0x6b6134, Math.PI / 2],
    ];
    for (const car of cars) addCar(...car);

    // A glass-fronted club booth and an access ramp create distinct destinations at the level edge.
    addBox(g, [34, 18, 18], [-55, 8.5, -112], charcoal);
    addBox(g, [29, 12.5, .35], [-55, 8.8, -101.8], glass);
    addNeonStrip(g, [24, .35, .18], [-55, 16.5, -101.5], 0xff9b3c, 1.45);
    addBox(g, [28, .75, 58], [55, .95, -100], structuralConcrete, [-.045, 0, 0]);
    for (const x of [42, 68])
        addNeonStrip(g, [.20, .16, 52], [x, 1.25, -99], 0x55d9d2, .95, [-.045, 0, 0]);

    // Floor-level guide lights define the circulation zone without any overhead obstruction.
    const pulse = [];
    for (const side of [-1, 1]) {
        pulse.push(addNeonStrip(g, [.14, .08, level.clubZoneDepth - 2], [side * (level.clubZoneWidth / 2 - .7), -.37, 0], side < 0 ? 0xff8e32 : 0x47c9ca, .82).mat);
        for (const z of [-90, -50, -10, 30, 70])
            pulse.push(addNeonStrip(g, [7, .08, .16], [side * 72, -.40, z], side < 0 ? 0xff8e32 : 0x47c9ca, .95).mat);
    }
    pulse.push(addNeonStrip(g, [level.clubZoneWidth - 2, .08, .14], [0, -.37, level.clubZoneDepth / 2 - .7], 0xff8e32, .75).mat);
    pulse.push(addNeonStrip(g, [level.clubZoneWidth - 2, .08, .14], [0, -.37, -level.clubZoneDepth / 2 + .7], 0x47c9ca, .75).mat);

    // Duct risers terminate against the rear wall instead of spanning above play.
    for (const x of [-70, 70]) {
        addCylinder(g, .72, 18, [x, 8.5, -116], steel, 20);
        addBox(g, [6.5, 3.8, 2.8], [x, 17.5, -116], makeSurface('corrugated', 0x4b5559, {
            accent: 0x202628, repeat: [3, 2], seed: x < 0 ? 347 : 349, roughness: .58, metalness: .46,
        }));
    }

    const amberLight = new THREE.PointLight(0xe48232, 22, 85, 1.8);
    amberLight.position.set(-28, 11, -38);
    g.add(amberLight);
    const tealLight = new THREE.PointLight(0x45bfc5, 21, 85, 1.8);
    tealLight.position.set(28, 11, -28);
    g.add(tealLight);
    const rearLight = new THREE.PointLight(0xb8dad8, 24, 110, 1.8);
    rearLight.position.set(0, 15, -92);
    g.add(rearLight);
    g.userData.pulse = pulse;
    return g;
}
