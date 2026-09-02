import { buildHyperArcade, HYPER_ARCADE_STYLE } from './hyper-arcade.js';
import { buildCompetitionCircuit, COMPETITION_CIRCUIT_STYLE } from './competition-circuit.js';
import { buildParkJam, PARK_JAM_STYLE } from './park-jam.js';
import { buildSkylineRooftop, SKYLINE_ROOFTOP_STYLE } from './skyline-rooftop.js';
import { buildGarageClub, GARAGE_CLUB_STYLE } from './garage-club.js';
import { buildBoardwalkBash, BOARDWALK_BASH_STYLE } from './boardwalk-bash.js';
import { buildFreightYard, FREIGHT_YARD_STYLE } from './freight-yard.js';
import { buildZeroGArena, ZERO_G_ARENA_STYLE } from './zero-g-arena.js';
import { createVenueHelpers } from './helpers.js';
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
    arenaGroups.set('garage_club', buildGarageClub(THREE));
    arenaGroups.set('boardwalk_bash', buildBoardwalkBash(THREE));
    arenaGroups.set('freight_yard', buildFreightYard(THREE));
    arenaGroups.set('zero_g_arena', buildZeroGArena(THREE));
    const { makeSurface } = createVenueHelpers(THREE);
    const TABLE_FINISHES = {
        hyper_arcade: { kind: HYPER_ARCADE_STYLE.tableSurface, color: HYPER_ARCADE_STYLE.tableColor, accent: 0x4c6470, repeat: [4, 7], seed: 701, roughness: .20, metalness: .12, emissive: 0x071116, emissiveIntensity: .10 },
        competition_circuit: { kind: COMPETITION_CIRCUIT_STYLE.tableSurface, color: COMPETITION_CIRCUIT_STYLE.tableColor, accent: 0x4d6978, repeat: [6, 10], seed: 709, roughness: .30, metalness: .24, emissive: 0x061018, emissiveIntensity: .08 },
        park_jam: { kind: PARK_JAM_STYLE.tableSurface, color: PARK_JAM_STYLE.tableColor, accent: 0x456052, repeat: [5, 9], seed: 719, roughness: .48, metalness: .05, emissive: 0x04100b, emissiveIntensity: .06 },
        skyline_rooftop: { kind: SKYLINE_ROOFTOP_STYLE.tableSurface, color: SKYLINE_ROOFTOP_STYLE.tableColor, accent: 0x415967, repeat: [5, 9], seed: 727, roughness: .38, metalness: .12, emissive: 0x06121a, emissiveIntensity: .08 },
        garage_club: { kind: GARAGE_CLUB_STYLE.tableSurface, color: GARAGE_CLUB_STYLE.tableColor, accent: 0x476266, repeat: [5, 9], seed: 733, roughness: .34, metalness: .10, emissive: 0x061315, emissiveIntensity: .08 },
        boardwalk_bash: { kind: BOARDWALK_BASH_STYLE.tableSurface, color: BOARDWALK_BASH_STYLE.tableColor, accent: 0x50666a, repeat: [5, 9], seed: 739, roughness: .40, metalness: .08, emissive: 0x071416, emissiveIntensity: .07 },
        freight_yard: { kind: FREIGHT_YARD_STYLE.tableSurface, color: FREIGHT_YARD_STYLE.tableColor, accent: 0x536266, repeat: [5, 9], seed: 743, roughness: .46, metalness: .10, emissive: 0x071214, emissiveIntensity: .07 },
        zero_g_arena: { kind: ZERO_G_ARENA_STYLE.tableSurface, color: ZERO_G_ARENA_STYLE.tableColor, accent: 0x4f6875, repeat: [5, 9], seed: 751, roughness: .28, metalness: .24, emissive: 0x06121c, emissiveIntensity: .09 },
    };
    for (const [id, finish] of Object.entries(TABLE_FINISHES)) {
        const material = makeSurface(finish.kind, finish.color || 0xeeeeee, finish);
        arenaGroups.get(id).userData.fieldMap = material.map || null;
    }
    for (const group of arenaGroups.values()) {
        group.visible = false;
        venueRoot.add(group);
    }
    const ARENA_THEMES = {
        hyper_arcade: { background: 0x05020d, fog: 0x0b0615, fogNear: 36, fogFar: 70, hemiSky: 0xa77bff, hemiGround: 0x27102e, hemi: 1.95, key: 0xf8eaff, keyIntensity: 3.15, cool: 0x20c8ff, coolIntensity: 30, warmIntensity: 26, exposure: 1.44, bed: 0x17131f, field: 0xffffff, rail: 0x33263f, railTop: 0xb49cc4, line: 0x754c8f },
        competition_circuit: { background: 0x070b12, fog: 0x080d13, fogNear: 42, fogFar: 78, hemiSky: 0xcce9ff, hemiGround: 0x0e141a, hemi: 1.78, key: 0xffffff, keyIntensity: 3.10, cool: 0x4b9bc7, coolIntensity: 21, warmIntensity: 18, exposure: 1.18, bed: 0x111820, field: 0xffffff, rail: 0x323b45, railTop: 0x86919b, line: 0xa3bfd2 },
        park_jam: { background: 0x6fa7cd, fog: 0xb7cbd2, fogNear: 48, fogFar: 88, hemiSky: 0xffe8bf, hemiGround: 0x4a6840, hemi: 2.25, key: 0xffdda0, keyIntensity: 3.75, cool: 0x7cb5c9, coolIntensity: 8, warmIntensity: 8, exposure: 1.05, bed: 0x272927, field: 0xffffff, rail: 0x555e60, railTop: 0xa4a69d, line: 0xf0e7c8 },
        skyline_rooftop: { background: 0x071a35, fog: 0x172746, fogNear: 50, fogFar: 96, hemiSky: 0x86abe7, hemiGround: 0x11182a, hemi: 2.15, key: 0xd5e5ff, keyIntensity: 3.15, cool: 0x5baaf0, coolIntensity: 25, warmIntensity: 17, exposure: 1.42, bed: 0x182432, field: 0xffffff, rail: 0x2c3d50, railTop: 0x7189a4, line: 0x96bce0 },
        garage_club: { background: 0x171c1e, fog: 0x24292b, fogNear: 44, fogFar: 86, hemiSky: 0xc8e2dc, hemiGround: 0x1c1712, hemi: 1.72, key: 0xe0f4ef, keyIntensity: 2.65, cool: 0x54b9bf, coolIntensity: 17, warmIntensity: 21, exposure: 1.16, bed: 0x171d1f, field: 0xffffff, rail: 0x384345, railTop: 0x849294, line: 0xd5b06c },
        boardwalk_bash: { background: 0xb76f72, fog: 0xdc9b79, fogNear: 90, fogFar: 230, hemiSky: 0xffc58d, hemiGround: 0x355e65, hemi: 2.2, key: 0xffc487, keyIntensity: 3.6, cool: 0x4aa7b8, coolIntensity: 9, warmIntensity: 14, exposure: 1.16, bed: 0x263238, field: 0xffffff, rail: 0x46575c, railTop: 0x9aabb0, line: 0xe8bd8f },
        freight_yard: { background: 0x07111a, fog: 0x1a2529, fogNear: 100, fogFar: 260, hemiSky: 0x8aa9b4, hemiGround: 0x18150f, hemi: 1.52, key: 0xd4e2e2, keyIntensity: 2.7, cool: 0x4a9eaa, coolIntensity: 15, warmIntensity: 24, exposure: 1.16, bed: 0x172023, field: 0xffffff, rail: 0x3f4b4e, railTop: 0x88979a, line: 0xd4a357 },
        zero_g_arena: { background: 0x01040c, fog: 0x0a1728, fogNear: 110, fogFar: 290, hemiSky: 0x8badd0, hemiGround: 0x08101b, hemi: 1.95, key: 0xe7f2ff, keyIntensity: 3.35, cool: 0x4ed9e8, coolIntensity: 29, warmIntensity: 20, exposure: 1.45, bed: 0x0c1520, field: 0xffffff, rail: 0x27384b, railTop: 0x9dafbe, line: 0x8eeaff }
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
        field.material.map = activeArenaGroup.userData.fieldMap;
        field.material.roughness = TABLE_FINISHES[id].roughness;
        field.material.metalness = TABLE_FINISHES[id].metalness;
        field.material.emissive.setHex(TABLE_FINISHES[id].emissive || 0x000000);
        field.material.emissiveIntensity = TABLE_FINISHES[id].emissiveIntensity || 0;
        field.material.needsUpdate = true;
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
