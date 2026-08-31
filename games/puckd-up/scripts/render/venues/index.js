import { buildHyperArcade } from './hyper-arcade.js';
import { buildCompetitionCircuit } from './competition-circuit.js';
import { buildParkJam } from './park-jam.js';
import { buildSkylineRooftop } from './skyline-rooftop.js';
export function createVenues(THREE, stage, table) {
    const { scene, renderer, hemi, key, cool, warm } = stage;
    const { bed, field, railVisMat, railTopMat, lineMat } = table;
    const venueRoot = new THREE.Group();
    scene.add(venueRoot);
    const arenaGroups = new Map();
    let activeArenaGroup = null;
    arenaGroups.set('hyper_arcade', buildHyperArcade(THREE));
    arenaGroups.set('competition_circuit', buildCompetitionCircuit(THREE));
    arenaGroups.set('park_jam', buildParkJam(THREE));
    arenaGroups.set('skyline_rooftop', buildSkylineRooftop(THREE));
    for (const group of arenaGroups.values()) {
        group.visible = false;
        venueRoot.add(group);
    }
    const ARENA_THEMES = {
        hyper_arcade: { background: 0x05020d, fog: 0x0b0615, fogNear: 25, fogFar: 48, hemiSky: 0x9368ff, hemiGround: 0x17071f, hemi: 1.35, key: 0xf8eaff, keyIntensity: 2.6, cool: 0x20c8ff, coolIntensity: 28, warmIntensity: 24, exposure: 1.32, bed: 0x120d19, field: 0x171326, rail: 0x33263f, railTop: 0x9c77b5, line: 0xc5a6ef },
        competition_circuit: { background: 0x070b12, fog: 0x080d13, fogNear: 30, fogFar: 62, hemiSky: 0xcce9ff, hemiGround: 0x0e141a, hemi: 1.72, key: 0xffffff, keyIntensity: 3.05, cool: 0x4b9bc7, coolIntensity: 20, warmIntensity: 17, exposure: 1.16, bed: 0x111820, field: 0x1a2630, rail: 0x323b45, railTop: 0x86919b, line: 0xa3bfd2 },
        park_jam: { background: 0x6fa7cd, fog: 0xb7cbd2, fogNear: 44, fogFar: 82, hemiSky: 0xffe8bf, hemiGround: 0x4a6840, hemi: 2.25, key: 0xffdda0, keyIntensity: 3.75, cool: 0x7cb5c9, coolIntensity: 8, warmIntensity: 8, exposure: 1.05, bed: 0x272927, field: 0x26383a, rail: 0x555e60, railTop: 0xa4a69d, line: 0xf0e7c8 },
        skyline_rooftop: { background: 0x041126, fog: 0x0c1630, fogNear: 40, fogFar: 78, hemiSky: 0x6387c7, hemiGround: 0x090b18, hemi: 1.6, key: 0xbcd6ff, keyIntensity: 2.85, cool: 0x4397df, coolIntensity: 23, warmIntensity: 16, exposure: 1.30, bed: 0x111923, field: 0x142438, rail: 0x2c3d50, railTop: 0x7189a4, line: 0x96bce0 }
    };
    function applyArenaTheme(id) {
        if (!Object.hasOwn(ARENA_THEMES, id))
            id = 'hyper_arcade';
        for (const [key, group] of arenaGroups)
            group.visible = key === id;
        activeArenaGroup = arenaGroups.get(id);
        const t = ARENA_THEMES[id];
        scene.background = new THREE.Color(t.background);
        scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
        hemi.color.setHex(t.hemiSky);
        hemi.groundColor.setHex(t.hemiGround);
        hemi.intensity = t.hemi;
        key.color.setHex(t.key);
        key.intensity = t.keyIntensity;
        cool.color.setHex(t.cool);
        cool.intensity = t.coolIntensity;
        warm.intensity = t.warmIntensity;
        renderer.toneMappingExposure = t.exposure;
        bed.material.color.setHex(t.bed);
        field.material.color.setHex(t.field);
        railVisMat.color.setHex(t.rail);
        railTopMat.color.setHex(t.railTop);
        lineMat.color.setHex(t.line);
    }
    function updateArenaVisuals(time) {
        if (!activeArenaGroup)
            return;
        const pulse = activeArenaGroup.userData.pulse || [];
        for (let i = 0; i < pulse.length; i++) {
            const mat = pulse[i];
            if (mat.userData.pulseBase === undefined)
                mat.userData.pulseBase = Math.max(.15, mat.emissiveIntensity || .6);
            const base = mat.userData.pulseBase;
            mat.emissiveIntensity = base * (.88 + .18 * Math.sin(time * (1.45 + i * .11) + i * 1.7));
        }
        const crowd = activeArenaGroup.userData.crowd;
        if (crowd) {
            crowd[0].material.opacity = .70 + .12 * Math.sin(time * 1.2);
            crowd[1].material.opacity = .40 + .10 * Math.sin(time * 1.5 + 1.2);
        }
    }
    return { applyArenaTheme, updateArenaVisuals };
}
