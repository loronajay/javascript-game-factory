import { createVenueHelpers } from './helpers.js';

export function buildZeroGArena(THREE) {
    const { makeStd, addBox, addCylinder, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Zero-G Arena';
    addSkyDome(g, { top: 0x01040c, bottom: 0x09142a, horizon: 0x050b18, radius: 54, y: 6, z: -10 });
    const floor = makeStd(0x0c121d, { roughness: .24, metalness: .7 });
    const white = makeStd(0xaebdca, { roughness: .22, metalness: .68 });
    const dark = makeStd(0x151d29, { roughness: .35, metalness: .62 });
    const cyan = makeStd(0x4ed9e8, { emissive: 0x4ed9e8, emissiveIntensity: 1.25, roughness: .12, metalness: .5 });
    const gold = makeStd(0xe9bd5b, { emissive: 0xc98b2e, emissiveIntensity: 1.05, roughness: .18, metalness: .58 });
    addBox(g, [32, .4, 40], [0, -.72, -1], floor);
    // Side pylons suggest station ribs without putting geometry above the play corridor.
    for (const x of [-12.4, 12.4]) {
        addBox(g, [.3, 5.2, 31], [x, 2.0, -2], dark);
        addNeonStrip(g, [.08, .08, 27], [x * .88, .24, -2], 0x4ed9e8, 1.25);
        for (const z of [-12, -6, 0, 6]) addBox(g, [.28, 5.5, .28], [x * .93, 2.2, z], white);
    }
    // A rear observation ring frames the horizon behind the far goal, clear of the table.
    const observationRing = new THREE.Mesh(new THREE.TorusGeometry(10.5, .16, 10, 72), white);
    observationRing.position.set(0, 3.2, -22);
    g.add(observationRing);
    // A planet through the far observation glass gives this venue a unique horizon.
    const planet = new THREE.Mesh(new THREE.SphereGeometry(6.2, 36, 24), new THREE.MeshStandardMaterial({ color: 0x356ba1, emissive: 0x153d70, emissiveIntensity: .38, roughness: .7 }));
    planet.position.set(-10, 2, -31); g.add(planet);
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(6.3, 36, 24), new THREE.MeshBasicMaterial({ color: 0xcce8ef, transparent: true, opacity: .12, wireframe: true })); cloud.position.copy(planet.position); g.add(cloud);
    const stars = makePoints(g, 520, 0xddeaff, [62, 30, 35], [0, 8, -35], .055, 911); stars.material.opacity = .92;
    for (const x of [-8.5, 8.5]) {
        addCylinder(g, .85, .22, [x, -.35, -11], dark, 28);
        addCylinder(g, .32, 2.1, [x, .62, -11], white, 20);
    }
    const stationLight = new THREE.PointLight(0x4ed9e8, 13, 22, 2); stationLight.position.set(8, 4, -7); g.add(stationLight);
    const championLight = new THREE.PointLight(0xe9bd5b, 9, 18, 2); championLight.position.set(-8, 3, -3); g.add(championLight);
    g.userData.pulse = [cyan, gold];
    return g;
}
