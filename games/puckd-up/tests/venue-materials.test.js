import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVenueHelpers, SURFACE_RECIPES } from '../scripts/render/venues/helpers.js';
import { HYPER_ARCADE_STYLE } from '../scripts/render/venues/hyper-arcade.js';
import { COMPETITION_CIRCUIT_STYLE } from '../scripts/render/venues/competition-circuit.js';
import { PARK_JAM_STYLE } from '../scripts/render/venues/park-jam.js';
import { SKYLINE_ROOFTOP_STYLE } from '../scripts/render/venues/skyline-rooftop.js';
import { GARAGE_CLUB_STYLE } from '../scripts/render/venues/garage-club.js';
import { BOARDWALK_BASH_STYLE } from '../scripts/render/venues/boardwalk-bash.js';
import { FREIGHT_YARD_STYLE } from '../scripts/render/venues/freight-yard.js';
import { ZERO_G_ARENA_STYLE } from '../scripts/render/venues/zero-g-arena.js';

class MeshStandardMaterial {
    constructor(options) { Object.assign(this, options); this.userData = {}; }
}

class DataTexture {
    constructor(data, width, height, format) {
        this.image = { data, width, height };
        this.format = format;
        this.repeat = { set: (x, y) => { this.repeatValue = [x, y]; } };
    }
}

const THREE = {
    MeshStandardMaterial,
    DataTexture,
    RGBAFormat: 'rgba',
    RepeatWrapping: 'repeat',
    SRGBColorSpace: 'srgb',
};

test('procedural venue surfaces create deterministic, repeating color textures', () => {
    const first = createVenueHelpers(THREE).makeSurface('concrete', 0x706e68, {
        accent: 0x312f2c,
        repeat: [6, 9],
        seed: 27,
    });
    const second = createVenueHelpers(THREE).makeSurface('concrete', 0x706e68, {
        accent: 0x312f2c,
        repeat: [6, 9],
        seed: 27,
    });

    assert.equal(first.userData.surfaceKind, 'concrete');
    assert.equal(first.map.wrapS, THREE.RepeatWrapping);
    assert.equal(first.map.wrapT, THREE.RepeatWrapping);
    assert.equal(first.map.colorSpace, THREE.SRGBColorSpace);
    assert.deepEqual(first.map.repeatValue, [6, 9]);
    assert.deepEqual(first.map.image.data, second.map.image.data);
    assert.ok(new Set(first.map.image.data).size > 16, 'texture should contain visible tonal variation');
});

test('surface library covers a distinct primary material for every arena', () => {
    const expected = {
        'hyper-arcade.js': 'arcadeCarpet',
        'competition-circuit.js': 'arenaFloor',
        'park-jam.js': 'grass',
        'skyline-rooftop.js': 'roofing',
        'garage-club.js': 'concrete',
        'boardwalk-bash.js': 'wood',
        'freight-yard.js': 'asphalt',
        'zero-g-arena.js': 'spacePanels',
    };

    for (const [file, recipe] of Object.entries(expected)) {
        assert.ok(Object.hasOwn(SURFACE_RECIPES, recipe), `${recipe} recipe`);
        const source = readFileSync(new URL(`../scripts/render/venues/${file}`, import.meta.url), 'utf8');
        assert.match(source, new RegExp(`(?:makeSurface\\(['\"]${recipe}['\"]|floorSurface:\\s*['\"]${recipe}['\"])`), `${file} should use ${recipe}`);
    }
});

test('surface materials gracefully remain flat when texture support is unavailable', () => {
    const helpers = createVenueHelpers({ MeshStandardMaterial });
    const material = helpers.makeSurface('wood', 0x72513b, { roughness: .86 });

    assert.equal(material.color, 0x72513b);
    assert.equal(material.map, undefined);
    assert.equal(material.userData.surfaceKind, 'wood');
});

test('the two broad daylight workspaces include authored, camera-readable surface details', () => {
    const freight = readFileSync(new URL('../scripts/render/venues/freight-yard.js', import.meta.url), 'utf8');
    const park = readFileSync(new URL('../scripts/render/venues/park-jam.js', import.meta.url), 'utf8');

    assert.match(freight, /containerRibs/, 'containers need modeled corrugation, not only colored boxes');
    assert.match(freight, /railSleepers/, 'the freight floor needs real track structure');
    assert.match(park, /courtMarkings/, 'the park slab needs authored paint and wear landmarks');
});

test('Hyper Arcade uses human-scale architecture and a dedicated table finish', () => {
    assert.equal(HYPER_ARCADE_STYLE.floorSurface, 'arcadeCarpet');
    assert.equal(HYPER_ARCADE_STYLE.tableSurface, 'acrylic');
    assert.notEqual(HYPER_ARCADE_STYLE.floorSurface, HYPER_ARCADE_STYLE.tableSurface,
        'the air-hockey playfield must not copy the venue floor material');
    assert.equal(HYPER_ARCADE_STYLE.overheadSpans, false,
        'nothing may cross the camera-to-playfield corridor');
    const tableChannels = [HYPER_ARCADE_STYLE.tableColor >> 16, HYPER_ARCADE_STYLE.tableColor >> 8, HYPER_ARCADE_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');

    assert.ok(HYPER_ARCADE_STYLE.room.width >= 44, 'the room should extend far beyond the ten-unit-wide table');
    assert.ok(HYPER_ARCADE_STYLE.room.depth >= 62, 'the arcade should continue deep behind and around the table');
    assert.ok(HYPER_ARCADE_STYLE.room.wallHeight >= 12, 'the architecture should read as a large public venue');
    assert.ok(HYPER_ARCADE_STYLE.cabinet.width >= 2.8, 'arcade banks need to remain readable after moving away from the rails');
    assert.ok(HYPER_ARCADE_STYLE.cabinet.height >= 7.5, 'arcade cabinets need to establish believable scale against the table');
    assert.ok(HYPER_ARCADE_STYLE.cabinet.depth >= 3.2, 'arcade cabinets should read as substantial furniture, not flat screens');
});

test('Competition Circuit reads as a full stadium without compromising the playfield', () => {
    assert.equal(COMPETITION_CIRCUIT_STYLE.floorSurface, 'arenaFloor');
    assert.equal(COMPETITION_CIRCUIT_STYLE.tableSurface, 'tournamentComposite');
    assert.notEqual(COMPETITION_CIRCUIT_STYLE.floorSurface, COMPETITION_CIRCUIT_STYLE.tableSurface,
        'the tournament table must not copy the stadium floor');
    assert.equal(COMPETITION_CIRCUIT_STYLE.overheadSpans, false,
        'stadium architecture must leave the camera-to-playfield corridor open');

    const tableChannels = [COMPETITION_CIRCUIT_STYLE.tableColor >> 16, COMPETITION_CIRCUIT_STYLE.tableColor >> 8, COMPETITION_CIRCUIT_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(COMPETITION_CIRCUIT_STYLE.bowl.width >= 58, 'the bowl should extend far beyond the table width');
    assert.ok(COMPETITION_CIRCUIT_STYLE.bowl.depth >= 72, 'the stadium should continue deep behind both ends');
    assert.ok(COMPETITION_CIRCUIT_STYLE.bowl.tiers >= 7, 'the stands need enough tiers to read as a major venue');
    assert.ok(COMPETITION_CIRCUIT_STYLE.bowl.tierRise >= 1, 'each tier needs camera-readable elevation');
});

test('Park Jam reads as a full municipal park with a dedicated outdoor table', () => {
    assert.equal(PARK_JAM_STYLE.floorSurface, 'grass');
    assert.equal(PARK_JAM_STYLE.tableSurface, 'outdoorComposite');
    assert.notEqual(PARK_JAM_STYLE.floorSurface, PARK_JAM_STYLE.tableSurface,
        'the outdoor table must not copy either the lawn or concrete court');
    assert.equal(PARK_JAM_STYLE.overheadSpans, false,
        'trees and park structures must leave the playfield sightline open');
    const tableChannels = [PARK_JAM_STYLE.tableColor >> 16, PARK_JAM_STYLE.tableColor >> 8, PARK_JAM_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(PARK_JAM_STYLE.park.width >= 68, 'the lawn should extend far beyond the table and court');
    assert.ok(PARK_JAM_STYLE.park.depth >= 84, 'the park needs substantial foreground and background depth');
    assert.ok(PARK_JAM_STYLE.park.courtWidth >= 34, 'the table needs broad circulation space on the court');
    assert.ok(PARK_JAM_STYLE.park.treeHeight >= 8, 'mature perimeter trees should establish believable scale');
});

test('Skyline Rooftop reads as a full building roof with a dedicated table finish', () => {
    assert.equal(SKYLINE_ROOFTOP_STYLE.floorSurface, 'roofing');
    assert.equal(SKYLINE_ROOFTOP_STYLE.tableSurface, 'rooftopResin');
    assert.notEqual(SKYLINE_ROOFTOP_STYLE.floorSurface, SKYLINE_ROOFTOP_STYLE.tableSurface,
        'the rooftop table must not copy the roof membrane');
    assert.equal(SKYLINE_ROOFTOP_STYLE.overheadSpans, false,
        'rooftop structures must leave the complete playfield sightline open');
    const tableChannels = [SKYLINE_ROOFTOP_STYLE.tableColor >> 16, SKYLINE_ROOFTOP_STYLE.tableColor >> 8, SKYLINE_ROOFTOP_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(SKYLINE_ROOFTOP_STYLE.roof.width >= 68, 'the roof plate should extend far beyond the table');
    assert.ok(SKYLINE_ROOFTOP_STYLE.roof.depth >= 84, 'the rooftop needs believable foreground and background depth');
    assert.ok(SKYLINE_ROOFTOP_STYLE.roof.parapetHeight >= 2.5, 'perimeter walls need credible full-building scale');
    assert.ok(SKYLINE_ROOFTOP_STYLE.roof.serviceHeight >= 8, 'mechanical structures should establish architectural scale');
});

test('Garage Club reads as a full parking level with a dedicated table finish', () => {
    assert.equal(GARAGE_CLUB_STYLE.floorSurface, 'concrete');
    assert.equal(GARAGE_CLUB_STYLE.tableSurface, 'garageLaminate');
    assert.notEqual(GARAGE_CLUB_STYLE.floorSurface, GARAGE_CLUB_STYLE.tableSurface,
        'the garage table must not copy the parking-deck concrete');
    assert.equal(GARAGE_CLUB_STYLE.overheadSpans, false,
        'beams, pipes, and fixtures must not cross the camera-to-playfield corridor');
    const tableChannels = [GARAGE_CLUB_STYLE.tableColor >> 16, GARAGE_CLUB_STYLE.tableColor >> 8, GARAGE_CLUB_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(GARAGE_CLUB_STYLE.level.width >= 140, 'the parking level should extend far beyond the table');
    assert.ok(GARAGE_CLUB_STYLE.level.depth >= 180, 'the garage needs believable foreground and background depth');
    assert.ok(GARAGE_CLUB_STYLE.level.clearHeight >= 18, 'the club garage needs a generous commercial clear height');
    assert.ok(GARAGE_CLUB_STYLE.level.clubZoneWidth >= 34, 'the table needs a dedicated activity zone, not a parking stall');
    assert.ok(GARAGE_CLUB_STYLE.level.clubZoneDepth >= 44, 'the activity zone needs circulation space at both goals');
    assert.ok(GARAGE_CLUB_STYLE.level.parkingSetback >= 18,
        'parked vehicles must sit in a rear row instead of flanking the table');
    assert.ok(GARAGE_CLUB_STYLE.vehicle.length >= 30,
        'a car should read as roughly twice the length of the fixed sixteen-unit air-hockey table');
    assert.ok(GARAGE_CLUB_STYLE.vehicle.width >= 12,
        'a car should approach the fixed ten-unit table width instead of reading as a miniature');
    assert.ok(GARAGE_CLUB_STYLE.vehicle.height >= 8,
        'vehicle height must reinforce the human scale of the surrounding architecture');
});

test('Boardwalk Bash reads as a full amusement pier with a dedicated table finish', () => {
    assert.equal(BOARDWALK_BASH_STYLE.floorSurface, 'wood');
    assert.equal(BOARDWALK_BASH_STYLE.tableSurface, 'boardwalkComposite');
    assert.notEqual(BOARDWALK_BASH_STYLE.floorSurface, BOARDWALK_BASH_STYLE.tableSurface,
        'the boardwalk table must not copy the pier planks');
    assert.equal(BOARDWALK_BASH_STYLE.overheadSpans, false,
        'lights and amusement structures must stay outside the playfield sightline');
    const tableChannels = [BOARDWALK_BASH_STYLE.tableColor >> 16, BOARDWALK_BASH_STYLE.tableColor >> 8, BOARDWALK_BASH_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(BOARDWALK_BASH_STYLE.pier.width >= 160, 'the pier should extend far beyond the fixed table');
    assert.ok(BOARDWALK_BASH_STYLE.pier.depth >= 220, 'the boardwalk needs substantial foreground and background depth');
    assert.ok(BOARDWALK_BASH_STYLE.pier.plazaWidth >= 44, 'the table needs a dedicated open activity plaza');
    assert.ok(BOARDWALK_BASH_STYLE.landmarks.wheelRadius >= 60,
        'the Ferris wheel must tower over the table instead of reading as a tabletop prop');
    assert.ok(BOARDWALK_BASH_STYLE.landmarks.vendorWidth >= 30,
        'vendor buildings must provide credible human-scale architecture');
    assert.ok(BOARDWALK_BASH_STYLE.landmarks.lampHeight >= 24,
        'pier lamps must be scaled against people, not against the game table');
});

test('Freight Yard reads as a full intermodal yard with a dedicated table finish', () => {
    assert.equal(FREIGHT_YARD_STYLE.floorSurface, 'asphalt');
    assert.equal(FREIGHT_YARD_STYLE.tableSurface, 'yardComposite');
    assert.notEqual(FREIGHT_YARD_STYLE.floorSurface, FREIGHT_YARD_STYLE.tableSurface,
        'the freight table must not copy the asphalt apron');
    assert.equal(FREIGHT_YARD_STYLE.overheadSpans, false,
        'cranes and yard lighting must leave the complete playfield sightline open');
    const tableChannels = [FREIGHT_YARD_STYLE.tableColor >> 16, FREIGHT_YARD_STYLE.tableColor >> 8, FREIGHT_YARD_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(FREIGHT_YARD_STYLE.yard.width >= 240, 'the intermodal yard should dwarf the fixed table');
    assert.ok(FREIGHT_YARD_STYLE.yard.depth >= 300, 'the yard needs believable working depth');
    assert.ok(FREIGHT_YARD_STYLE.yard.apronWidth >= 56, 'the table needs a broad, dedicated event apron');
    assert.ok(FREIGHT_YARD_STYLE.container.length >= 80,
        'shipping containers must be several times longer than the air-hockey table');
    assert.ok(FREIGHT_YARD_STYLE.container.width >= 16, 'container width must provide a credible human-scale reference');
    assert.ok(FREIGHT_YARD_STYLE.container.height >= 18, 'containers must tower above the table surface');
    assert.ok(FREIGHT_YARD_STYLE.crane.height >= 70, 'yard cranes must read as major industrial architecture');
});

test('Zero-G Arena reads as a full orbital hangar with a dedicated table finish', () => {
    assert.equal(ZERO_G_ARENA_STYLE.floorSurface, 'spacePanels');
    assert.equal(ZERO_G_ARENA_STYLE.tableSurface, 'zeroGComposite');
    assert.notEqual(ZERO_G_ARENA_STYLE.floorSurface, ZERO_G_ARENA_STYLE.tableSurface,
        'the Zero-G table must not copy the station deck panels');
    assert.equal(ZERO_G_ARENA_STYLE.overheadSpans, false,
        'station ribs and light channels must leave the playfield sightline open');
    const tableChannels = [ZERO_G_ARENA_STYLE.tableColor >> 16, ZERO_G_ARENA_STYLE.tableColor >> 8, ZERO_G_ARENA_STYLE.tableColor]
        .map(channel => channel & 255);
    assert.ok(Math.max(...tableChannels) <= 0x55, 'the playfield finish must remain dark');
    assert.ok(ZERO_G_ARENA_STYLE.station.width >= 180, 'the hangar deck should dwarf the fixed table');
    assert.ok(ZERO_G_ARENA_STYLE.station.depth >= 240, 'the station needs believable foreground and background depth');
    assert.ok(ZERO_G_ARENA_STYLE.station.clearHeight >= 48, 'the orbital hangar needs monumental vertical scale');
    assert.ok(ZERO_G_ARENA_STYLE.station.apronWidth >= 52, 'the table needs a dedicated open competition apron');
    assert.ok(ZERO_G_ARENA_STYLE.landmarks.ringRadius >= 60,
        'the observation ring must read as architecture, not a tabletop prop');
    assert.ok(ZERO_G_ARENA_STYLE.landmarks.planetRadius >= 70,
        'the planet must dominate the distant horizon rather than resemble a game ball');
    assert.ok(ZERO_G_ARENA_STYLE.landmarks.airlockHeight >= 26,
        'airlocks should provide a credible human-scale reference');
});
