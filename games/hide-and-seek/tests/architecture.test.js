const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('main is a small composition root and gameplay responsibilities live in modules', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const lines = main.split(/\r?\n/).length;

  assert.ok(lines <= 160, `main.js should stay below 160 lines; found ${lines}`);

  for (const moduleName of [
    'game-config.js',
    'rendering.js',
    'world.js',
    'hotel.js',
    'elevator.js',
    'player.js',
    'monster.js',
  ]) {
    assert.ok(fs.existsSync(path.join(projectRoot, 'modules', moduleName)), `${moduleName} is missing`);
    assert.match(main, new RegExp(moduleName.replace('.', '\\.')));
  }
});

test('opening a room door does not change the renderer light count', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');

  assert.doesNotMatch(hotel, /roomFill\s*=\s*new THREE\.PointLight/);
  assert.doesNotMatch(hotel, /fillLight\.visible/);
  assert.match(hotel, /fillFixture/);
});

test('the demon inspection view is a dedicated interactive model viewer', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'modules', 'model-viewer.js')));
  assert.match(main, /createModelViewer/);
  assert.match(html, /\?inspect=monster/);
});

test('rendering avoids expensive unused shadows and caps high-DPI resolution', () => {
  const rendering = fs.readFileSync(path.join(projectRoot, 'modules', 'rendering.js'), 'utf8');

  assert.match(rendering, /shadowMap\.enabled\s*=\s*false/);
  assert.match(rendering, /Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*1\.5\)/);
});

test('only lights near the active floor stay in the realtime lighting pass', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');

  assert.match(hotel, /selectVisibleLightFloors/);
  // This used to assert `light.visible =`, which was the bug rather than the invariant: hiding a
  // light removes it from three's light state, `numPointLights` is part of the shader program's
  // cache key, and so every material in the hotel recompiled on the frame the player entered the
  // stairwell. The lamps near the player are now assigned into a fixed pool instead, so the count
  // never moves. Toggling visibility here again would bring the stall back.
  assert.doesNotMatch(hotel, /light\.visible\s*=/);
  assert.match(hotel, /LIGHT_POOL_SIZE/);
});

test('the flashlight dims rather than hides, so clicking it cannot recompile the scene', () => {
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');

  // Same rule as the lamp pool, one light down: `numSpotLights` is in the program cache key too.
  assert.doesNotMatch(player, /flashlightBeam\.visible\s*=/);
  assert.match(player, /flashlightBeam\.intensity\s*=/);
});

test('the demon brings every light it will ever have to the scene up front', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  // The face is a GLB that lands a beat after the round starts. A light arriving with it moves the
  // scene's point-light count, and that count is part of every material's shader program key.
  assert.ok(monster.indexOf('new THREE.PointLight(0xb50006') < monster.indexOf('function createModelDetails'));
  assert.match(monster, /details\.add\(headHalo\)/);
});

test('shaders are compiled up front rather than on the frame a material is first seen', () => {
  const rendering = fs.readFileSync(path.join(projectRoot, 'modules', 'rendering.js'), 'utf8');
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

  assert.match(rendering, /renderer\.compile\(/);
  assert.match(main, /warmUp\(\)/);
});

test('the demon face follows the animated head and shares the body forward direction', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.doesNotMatch(monster, /model\.rotation\.y\s*=\s*Math\.PI/);
  assert.match(monster, /getObjectByName\(['"]Head['"]\)/);
  assert.match(monster, /headBone\.getWorldPosition/);
  assert.match(monster, /updateHeadDetails/);
});

test('demons play authored Blender clips instead of deforming static meshes at runtime', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.doesNotMatch(monster, /procedural-rig/);
  assert.doesNotMatch(monster, /UAL2_Standard\.glb/);
  for (const clip of ['Creature_Idle', 'Creature_Stalk', 'Creature_Chase']) {
    assert.match(monster, new RegExp(clip));
  }
});

test('rejected horror prototypes are isolated from every gameplay roster', () => {
  const demons = fs.readFileSync(path.join(projectRoot, 'modules', 'demons.js'), 'utf8');
  const maps = fs.readFileSync(path.join(projectRoot, 'map-catalog.js'), 'utf8');

  assert.doesNotMatch(demons, /horror\/.*-rigged\.glb/);
  assert.doesNotMatch(maps, /horror\/.*-rigged\.glb/);
  assert.match(demons, /assets\/UAL2_Standard\.glb/);
});

test('the demon face has an aggressive brow, horns, jaw, and fangs', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  for (const detail of ['Slanted Eye', 'Brow Ridge', 'Crown Horn', 'Demon Jaw', 'Upper Fang']) assert.match(monster, new RegExp(detail));
});

test('the demon reads as a silhouette in the dark through a fresnel rim on its skin', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /onBeforeCompile/);
  assert.match(monster, /vViewPosition/);
  assert.match(monster, /rimPulse/);
  assert.match(monster, /customProgramCacheKey/);
});

test('the gaunt red eyes are parented to the authored head bone', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /visual\?\.eyes === ['"]red['"]/);
  assert.match(monster, /getObjectByName\(['"]Head['"]\)/);
  assert.match(monster, /headBone\.getWorldQuaternion/);
  assert.match(monster, /updateHeadDetails\(\)/);
  assert.match(monster, /0xff1008/);
});

test('the game chooses authored stalk and chase actions from replicated gameplay state', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /return awareness\.state === ENEMY_STATES\.CHASE \? chaseAction : stalkAction/);
  assert.match(monster, /moving = !!remotePose\.moving/);
  assert.match(monster, /setAnimation\(gameplayAction\(\), 1\)/);
});

test('the demon menace reacts to its awareness state instead of holding one pose', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /updateMenace/);
  assert.match(monster, /jawGroup/);
  assert.match(monster, /ENEMY_STATES\.CHASE/);
});

test('gameplay advances on a fixed timestep rather than on the display refresh rate', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const performanceModule = fs.readFileSync(path.join(projectRoot, 'modules', 'performance.js'), 'utf8');

  assert.match(performanceModule, /createFixedTimestep/);
  assert.match(main, /createFixedTimestep/);
  assert.match(main, /for \(let tick = 0; tick < ticks; tick \+= 1\) simulate\(timestep\.step/);
  // The old loop fed a clamped rAF delta straight into gameplay.
  assert.doesNotMatch(main, /Math\.min\(frameDelta, 0\.05\)/);
});

test('players are rigged human figures driven by pure avatar rules', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const avatars = fs.readFileSync(path.join(projectRoot, 'modules', 'avatars.js'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'avatar-logic.js')), 'avatar-logic.js is missing');
  assert.match(main, /createAvatars/);
  assert.match(main, /HotelAvatarLogic/);
  assert.match(avatars, /quaternius-player\/base-character\.glb/);
  assert.match(avatars, /quaternius-player\/locomotion\.glb/);
  assert.doesNotMatch(avatars, /UAL2_Standard\.glb/);
  // Which clip plays is a rule, not a rendering detail: it stays in avatar-logic.js so a server can
  // run the same decision headlessly.
  assert.doesNotMatch(avatars, /Idle_[A-Za-z]+_Loop|Walk_Carry_Loop|Zombie_|Jog_Fwd_Loop|Sprint_Loop/);
  assert.match(avatars, /logic\.pickClipName/);
  assert.match(avatars, /avatar\.body\.remove\(avatar\.placeholder\)/);
  // Preserve the Base Characters textures; replacing every material with one blue material is the
  // mannequin bug in a different disguise.
  assert.doesNotMatch(avatars, /node\.material\s*=/);
});

test('a cloned avatar gets its own skeleton instead of sharing the source rig', () => {
  const avatars = fs.readFileSync(path.join(projectRoot, 'modules', 'avatars.js'), 'utf8');

  assert.match(avatars, /skeleton\.clone\(\)/);
  assert.match(avatars, /node\.bind\(node\.skeleton, node\.bindMatrix\)/);
});

test('the stairwell lights only nearby floors and draws its static geometry in one batch', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');

  // Floor 0 (stairwell/elevator) used to switch every light in the hotel on at once.
  assert.doesNotMatch(hotel, /activeFloor === 0 \|\| floor === activeFloor/);
  assert.match(hotel, /selectVisibleLightFloors/);
  assert.match(hotel, /mergeGeometries/);
  assert.match(hotel, /Stair Treads/);
});

test('static hotel geometry is merged per floor and nothing that moves is merged away', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');
  const furnishings = fs.readFileSync(path.join(projectRoot, 'modules', 'furnishings.js'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'modules', 'static-batcher.js')), 'static-batcher.js is missing');
  assert.match(hotel, /createStaticBatcher/);
  assert.match(hotel, /batcher\.flatten\(group/);
  // A merged mesh has no identity and no local transform. Everything that swings, slides, is
  // animated, or has to be recognised by the interaction ray is named as a skip root — if one of
  // these stops being excluded the failure is a door that will not open, not a slow frame.
  for (const kept of [/skip\.add\(item\.hinge\)/, /skip\.add\(item\.drawer\)/, /skip\.add\(entry\.group\)/, /skip\.add\(item\.object\)/, /skip\.add\(door\.fillFixture\)/]) {
    assert.match(hotel, kept);
  }
  // Two meshes can only share a draw call if they share a material instance, so anything the hotel
  // places dozens of may not mint one per placement.
  assert.doesNotMatch(furnishings, /CylinderGeometry\([^)]*\), new THREE\.MeshStandardMaterial/);
});

test('the local head collapse is re-applied after the mixer writes each frame', () => {
  const avatars = fs.readFileSync(path.join(projectRoot, 'modules', 'avatars.js'), 'utf8');

  // The rig's clips carry scale tracks, so a one-off scale at load is overwritten on the next frame.
  assert.match(avatars, /mixer\.update\([^)]*\); applyLocalOverrides\(avatar\)/);
  assert.match(avatars, /headBone\.scale\.setScalar/);
  assert.doesNotMatch(avatars, /crouchPosture/);
});

test('the heat meter keeps its rules pure and lets the demon read them', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');
  const heatModule = fs.readFileSync(path.join(projectRoot, 'modules', 'heat.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'heat-logic.js')), 'heat-logic.js is missing');
  assert.match(html, /heat-logic\.js/);
  assert.match(html, /id="heatMeter"/);
  assert.match(main, /createHeat/);
  assert.match(main, /HotelHeat/);
  // Timing, zone tests and target selection are rules a server must be able to run headlessly, so
  // the runtime module may only call into the pure layer, never re-implement it.
  for (const rule of ['logic.locateZone', 'logic.updateHeat', 'logic.selectHuntTarget']) assert.match(heatModule, new RegExp(rule.replace('.', '\.')));
  for (const tuning of ['fillSeconds', 'tunnelDrainSeconds', 'hallwayStepDistance']) assert.doesNotMatch(heatModule, new RegExp(tuning));
  // Which spaces exist is a rule too — the runtime module may not decide what a tunnel is.
  assert.match(heatModule, /logic\.ZONE_KINDS\.TUNNEL/);
  // The demon acts on the meter; a full meter that nothing hunts is just a HUD decoration.
  assert.match(monster, /getHuntTarget/);
  assert.match(monster, /routePurpose === 'hunt'/);
});

test('sprinting is metered by pure stamina rules the movement code only reads', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');
  const staminaModule = fs.readFileSync(path.join(projectRoot, 'modules', 'stamina.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'stamina-logic.js')), 'stamina-logic.js is missing');
  assert.match(html, /stamina-logic\.js/);
  assert.match(html, /id="staminaMeter"/);
  assert.match(main, /createStamina/);
  assert.match(main, /HotelStamina/);
  // Drain, recovery rates and the exhaustion lockout are rules a server must run headlessly.
  assert.match(staminaModule, /logic\.updateStamina/);
  for (const tuning of ['sprintSeconds', 'recoverThreshold', 'crouchRecoverSeconds']) assert.doesNotMatch(staminaModule, new RegExp(tuning));
  // Holding shift may no longer be the whole sprint decision.
  assert.doesNotMatch(player, /keys\.ShiftLeft \|\| keys\.ShiftRight \? CONFIG\.sprintSpeed/);
  assert.match(player, /stamina\.update\(delta/);
});

test('the demo runs behind a menu state machine and pauses the simulation with it', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');
  const menuModule = fs.readFileSync(path.join(projectRoot, 'modules', 'menu.js'), 'utf8');
  const soloMatch = fs.readFileSync(path.join(projectRoot, 'modules', 'solo-match.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'menu-logic.js')), 'menu-logic.js is missing');
  assert.match(html, /menu-logic\.js/);
  for (const screen of ['menuTitle', 'menuSoloSetup', 'menuOnline', 'menuHowTo', 'menuExtras', 'menuPause']) assert.match(html, new RegExp(`id="${screen}"`));
  assert.match(html, /id="soloHiderCount"/);
  assert.match(html, /id="soloHideSeconds"/);
  assert.match(main, /normalizeMatchConfig/);
  assert.match(soloMatch, /count:\s*Math\.max\(0, match\.hiderCount/);
  assert.match(main, /createMenu/);
  assert.match(menuModule, /logic\.nextMenuState/);
  // Which screen follows which action is a rule; the runtime module only paints it.
  assert.doesNotMatch(menuModule, /SCREENS\.PAUSE\s*:/);
  // The player reports lock changes to the menu instead of driving the overlay itself, so the caught
  // screen cannot get a pause menu stacked on top of it.
  assert.doesNotMatch(player, /overlay\.style\.display/);
  assert.match(player, /menu\.dispatch/);
  // Nothing simulates behind a menu: the accumulator is not advanced while paused, so a meter cannot
  // tick through the pause and the paused seconds are never replayed on resume.
  assert.match(main, /const running = /);
  assert.match(main, /running \? timestep\.advance\(frameDelta\) : 0/);
  // Esc can release the browser's pointer lock, but it cannot pause a live authority. The menu
  // rejects the transition and the client keeps applying snapshots while the server match runs.
  assert.match(main, /canPause:\s*\(\)\s*=>\s*!online\?\.isActive\(\)/);
  assert.match(main, /online\.isActive\(\).*world\.state\.isLocked/);
  assert.match(menuModule, /allowPause/);
  assert.match(player, /paused === false.*enterDragLookMode/);
});

test('the round keeps its rules pure and resolves catches on the authority side', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const roundModule = fs.readFileSync(path.join(projectRoot, 'modules', 'round.js'), 'utf8');
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');
  const soloMatch = fs.readFileSync(path.join(projectRoot, 'modules', 'solo-match.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'round-logic.js')), 'round-logic.js is missing');
  assert.match(html, /round-logic\.js/);
  assert.match(html, /id="roundHud"/);
  assert.match(soloMatch, /createRound/);
  assert.match(main, /HotelRound/);
  // Roles, the two win conditions and the clock are rules a server has to run headlessly, so the
  // runtime module may only call into the pure layer.
  for (const rule of ['logic.tickRound', 'logic.canTag', 'logic.resolveTag', 'logic.resolveDemonCatch', 'logic.describeRound']) {
    assert.match(roundModule, new RegExp(rule.replace('.', '\.')));
  }
  for (const tuning of ['durationSeconds', 'hideSeconds', 'tagDistance']) assert.doesNotMatch(roundModule, new RegExp(tuning));
  // A tag is decided from positions by the round, never announced by whoever thinks they were
  // touched — that is the shape the server has to keep online.
  assert.doesNotMatch(roundModule, /hider\.tagged|reportTag/);
  // The head start is a rule about walking, so the player has to honour it.
  assert.match(player, /seekerHeld/);
  assert.match(roundModule, /elevator\.holdSeeker/);
  assert.match(roundModule, /elevator\.releaseSeeker/);
});

test('the hiders are stand-ins for players, not a second kind of body', () => {
  const hidersModule = fs.readFileSync(path.join(projectRoot, 'modules', 'hiders.js'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'hider-logic.js')), 'hider-logic.js is missing');
  // Which spot, when to bolt and how fast are decisions; only the walking lives in the module.
  for (const rule of ['logic.chooseHideSpot', 'logic.updateHider', 'logic.movementSpeed']) {
    assert.match(hidersModule, new RegExp(rule.replace('.', '\.')));
  }
  for (const tuning of ['panicDistance', 'calmSeconds', 'settleSeconds']) assert.doesNotMatch(hidersModule, new RegExp(tuning));
  // They wear the same rig every player wears and cross the building the way the demon crosses it:
  // through the map's own navigation graph, not a second idea of where the corridors are.
  assert.match(hidersModule, /avatars\.spawn/);
  assert.match(hidersModule, /avatars\.setPose/);
  assert.match(hidersModule, /createNavigator/);
  assert.match(hidersModule, /planFloorRoute/);
  assert.match(hidersModule, /heatLogic\.updatePlayerHeat/);
});

test('collision is plain headless data rather than geometry discovered from meshes', () => {
  const world = fs.readFileSync(path.join(projectRoot, 'modules', 'world.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'collision-logic.js')));
  assert.match(html, /collision-logic\.js/);
  assert.match(world, /logic\.collidesAt/);
  assert.doesNotMatch(world, /Box3\(\)\.setFromObject/);
});

test('the building is pure data and the renderer only draws what the plan describes', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');
  const furnishings = fs.readFileSync(path.join(projectRoot, 'modules', 'furnishings.js'), 'utf8');
  const world = fs.readFileSync(path.join(projectRoot, 'modules', 'world.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'hotel-plan.js')), 'hotel-plan.js is missing');
  assert.match(html, /hotel-plan\.js/);
  assert.match(hotel, /planApi\.createHotelPlan/);
  assert.match(world, /planApi\.walkHeightAt/);
  assert.match(world, /planApi\.hingedBounds/);

  // Where a wall, a room or a bed goes is layout, and layout lives in the plan. If the renderer
  // starts authoring positions again the server and the client can disagree about the building —
  // which is the same thing as saying only the client knows who was caught.
  for (const authored of [
    /addRoom\s*\(/, /addSecretTunnel\s*\(/, /splitWallForOpening/, /addElevatorHall/,
    /createStairLayout/, /addWall\(group/, /roomVariants/, /secretLinks/,
  ]) assert.doesNotMatch(hotel, authored);

  // Furniture is solid because the plan says so, not because a mesh happened to register itself.
  assert.doesNotMatch(furnishings, /registerBoxCollider/);
  assert.match(furnishings, /function place\(parent, placement\)/);
});

test('player-facing creature copy consistently names The Bellhop', () => {
  const copy = ['index.html', 'modules/monster.js', 'modules/round.js', 'modules/model-viewer.js']
    .map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8'))
    .join('\n');

  assert.match(copy, /The Bellhop/);
  assert.doesNotMatch(copy, /The Guest|THE GUEST/);
});

test('a map owns its demon roster and every demon in it starts clear of the others', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const demons = fs.readFileSync(path.join(projectRoot, 'modules', 'demons.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const maps = require(path.join(projectRoot, 'map-catalog.js'));

  assert.match(main, /createDemons/);
  assert.match(main, /roster:/, 'the roster comes from the map, not from a hard-coded pair');
  // Clear of the demons already standing, measured as a distance. It was a floor each, which
  // Cinder Mall cannot satisfy: three demons, two levels.
  assert.match(demons, /takenSpawns/);
  assert.doesNotMatch(demons, /excludedSpawnFloors/);
  assert.match(html, /The Housekeeper/);
  // Two was the hotel's number, never a rule. The renderer must not name a demon or count them.
  assert.doesNotMatch(demons, /includeHousekeeper/);
  assert.deepEqual(maps.demonRosterFor('grand-hotel').map((entry) => entry.name), ['The Bellhop', 'The Housekeeper']);
  assert.ok(maps.demonCountFor('cinder-mall') > 2, 'a map must be able to hold more than two demons');
});

test('the maps are a registry both sides of the wire read', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');
  const mirrorTool = fs.readFileSync(path.join(projectRoot, 'tools', 'mirror-sim.mjs'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'map-catalog.js')), 'map-catalog.js is missing');
  assert.ok(fs.existsSync(path.join(projectRoot, 'modules', 'map-session.js')), 'map-session.js is missing');
  assert.match(html, /map-catalog\.js/);
  assert.match(main, /createMapSession/);
  assert.match(main, /'HotelMaps'/);
  // The renderer walks whatever plan the registry resolves; it must not name a building's factory.
  assert.match(hotel, /resolveMapPlan/);
  // The authority has to agree with the client about which building a round is in, so the registry
  // is mirrored like every other rule the tick depends on.
  assert.match(mirrorTool, /'map-catalog\.js'/, 'map-catalog.js must be mirrored to the server');
});

test('how tall a building is comes from the map, not from the hotel’s four', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');
  assert.match(hotel, /world\.state\.floorCount = floorDefs\.length/);

  // These are every module that used to walk floors 1..4 by hand. A three-level map would have been
  // silently wrong in each of them, so the literal must not come back.
  for (const name of ['elevator.js', 'hiders.js', 'monster.js', 'player.js', 'seeker.js']) {
    const source = fs.readFileSync(path.join(projectRoot, 'modules', name), 'utf8');
    assert.doesNotMatch(source, /<=\s*4;\s*(floor|id)/, `${name} still assumes four floors`);
    assert.doesNotMatch(source, /floorCount:\s*4/, `${name} still assumes four floors`);
    assert.match(source, /world\.state\.floorCount/, `${name} should read the map's floor count`);
  }

  // The authority reads it too, so a map's height is one number on both sides of the wire.
  const sim = fs.readFileSync(path.join(projectRoot, 'sim-logic.js'), 'utf8');
  assert.match(sim, /floorCount: player\.floorCount/);
  assert.match(sim, /id <= player\.floorCount/);
});

test('a map is picked before a round and never swapped underneath one', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const menu = fs.readFileSync(path.join(projectRoot, 'modules', 'menu.js'), 'utf8');
  const online = fs.readFileSync(path.join(projectRoot, 'modules', 'online.js'), 'utf8');
  const onlineLogic = fs.readFileSync(path.join(projectRoot, 'online-logic.js'), 'utf8');

  assert.match(html, /id="soloMapCards"/);
  // The picker is filled from the catalog, so adding a location never means editing the menu, and
  // its floorplans are derived from each map's own plan rather than shipped as art that goes stale.
  const mapPicker = fs.readFileSync(path.join(projectRoot, 'modules', 'map-picker.js'), 'utf8');
  assert.match(menu, /createMapPicker/);
  assert.match(mapPicker, /maps\.listMaps\(\)/);
  assert.match(mapPicker, /HotelMapPreview/);
  assert.match(html, /id="onlineMapCards"/);
  // The map picker is an empty container in the markup. Other settings may author their options —
  // a role is a role — but a location is a catalog row, so naming one here would be a second list.
  const picker = /<div id="soloMapCards"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(picker, 'the map picker container is missing');
  assert.equal(picker[1].trim(), '', 'locations must not be authored in the markup');
  assert.match(menu, /mapSession\.select/);
  // Online, the map is a lobby setting so matchmaking keeps two buildings in two pools, and the
  // snapshot names it so a client can refuse a round it has no geometry for.
  assert.match(onlineLogic, /lobbySettingsFor/);
  assert.match(onlineLogic, /snapshotMapMismatch/);
  assert.match(online, /settings: lobbySettings\(\)/);
  assert.match(online, /snapshotMapMismatch/);
});

test('flashlight state is part of the player snapshot before networking is added', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'flashlight-logic.js')));
  assert.match(html, /flashlight-logic\.js/);
  assert.match(player, /flashlightOn/);
  assert.match(player, /hotel:flashlight-change|flashlight-change/);
  const prototypeApi = fs.readFileSync(path.join(projectRoot, 'modules', 'prototype-api.js'), 'utf8');
  assert.match(prototypeApi, /player:\s*player\.getState\(\)/);
  assert.ok(fs.existsSync(path.join(projectRoot, 'modules', 'flashlight-pickups.js')));
  assert.match(main, /createFlashlightPickups/);
  assert.match(player, /flashlightCharge/);
});

test('every body walks through the one pure mover and no module reimplements it', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const world = fs.readFileSync(path.join(projectRoot, 'modules', 'world.js'), 'utf8');
  const movers = ['player.js', 'monster.js', 'hiders.js']
    .map((file) => [file, fs.readFileSync(path.join(projectRoot, 'modules', file), 'utf8')]);

  assert.ok(fs.existsSync(path.join(projectRoot, 'movement-logic.js')), 'movement-logic.js is missing');
  assert.match(html, /movement-logic\.js/);
  // The world answers the two questions a mover asks; it does not move anything itself.
  assert.match(world, /const space = \{/);
  assert.match(world, /groundAt:/);

  for (const [file, source] of movers) {
    assert.match(source, /movement\.step(Axes|Toward)\(/, `${file} should walk through movement-logic.js`);
    // Sliding along a wall, snapping to the ground and giving up when boxed in are rules. A module
    // that re-derives them is a second physics implementation the server would have to match.
    assert.doesNotMatch(source, /world\.resolveGroundHeight\(/, `${file} should not resolve ground itself`);
    assert.doesNotMatch(source, /world\.collidesAt\(/, `${file} should not test collision itself`);
  }
});

test('line of sight is an AABB ray in the pure layer rather than a renderer raycast', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');
  const collisionLogic = fs.readFileSync(path.join(projectRoot, 'collision-logic.js'), 'utf8');

  assert.match(collisionLogic, /function segmentBlocked/);
  // The demon decided what it could see with a THREE.Raycaster, which a server cannot run — and it
  // skipped every collider whose `enabled` flag was absent, which is all of the plan's records.
  assert.doesNotMatch(monster, /new THREE\.Raycaster\(\)/);
  assert.match(monster, /world\.sightBlocked\(/);
});

test('a whole round can be ticked with no renderer in the process', () => {
  const headless = fs.readFileSync(path.join(projectRoot, 'tests', 'headless-round.test.js'), 'utf8');
  const fixture = fs.readFileSync(path.join(projectRoot, 'tests', 'helpers', 'hotel-fixture.js'), 'utf8');

  // This is the gate for networking: if either file ever needs Three.js, the simulation seam has
  // leaked back into the runtime modules and the server cannot own the tick.
  for (const [name, source] of [['headless-round.test.js', headless], ['hotel-fixture.js', fixture]]) {
    assert.doesNotMatch(source, /THREE|three\.module/, `${name} must stay renderer-free`);
  }
  assert.match(headless, /movement-logic/);
  assert.match(headless, /round-logic/);
});

test('the authoritative simulation is mirrored to the network server without drift', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'tools', 'sim-mirror-manifest.json'), 'utf8'));
  const crypto = require('node:crypto');
  const hash = (text) => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

  // The server adjudicates catches by running these exact files. If one is edited here and not
  // re-mirrored, it decides rounds in a hotel that no longer exists while every suite stays green.
  for (const [name, recorded] of Object.entries(manifest.files)) {
    assert.equal(hash(fs.readFileSync(path.join(projectRoot, name), 'utf8')), recorded,
      `${name} changed without re-mirroring — run: node tools/mirror-sim.mjs`);
  }
});

test('the authoritative round is one pure tick the client and the server share', () => {
  // Comments stripped: prose may name the renderer it is deliberately avoiding, code may not.
  const sim = fs.readFileSync(path.join(projectRoot, 'sim-logic.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.ok(fs.existsSync(path.join(projectRoot, 'sim-logic.js')), 'sim-logic.js is missing');
  // A client sends what it is trying to do; what happened is the tick's answer. Nothing in here may
  // read a position, a charge or a catch off an input.
  assert.match(sim, /function readInput/);
  assert.doesNotMatch(sim, /raw\.(x|y|z|charge|alive|caught)(?![A-Za-z])/);
  assert.doesNotMatch(sim, /THREE|document\.|window\./);
});

test('online play is server authoritative and the client only sends intent', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const onlineModule = fs.readFileSync(path.join(projectRoot, 'modules', 'online.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'online-logic.js')), 'online-logic.js is missing');
  assert.match(html, /online-logic\.js/);
  assert.match(html, /id="menuOnline"/);
  assert.match(main, /createOnline/);

  // The runtime module may not own a rule: connection state, what is worth sending and how far a
  // client may disagree with the server all live in the pure layer a test can run.
  for (const rule of ['logic.applyNetEvent', 'logic.describeInput', 'logic.shouldSendInput', 'logic.reconcilePosition', 'logic.interpolatePose']) {
    assert.match(onlineModule, new RegExp(rule.replace('.', '\.')));
  }
  // A client that decides its own catch is the obvious cheat. Nothing here may resolve one, and
  // nothing here may decide a door, a drawer or a key either — those are contested state too.
  assert.doesNotMatch(onlineModule, /resolveTag|resolveDemonCatch|canTag/);
  assert.doesNotMatch(onlineModule, /applyInteraction|forceDoorOpen|createFixtureState|tickFixtures|tickDemon/);

  // There is one authority per hotel: the local round stands down online.
  assert.match(main, /if \(online\.isActive\(\)\) online\.update\(delta\); else if \(round\)/);

  // The demons still render online, but as puppets. Their *brain* is what stands down — the client
  // poses them from the snapshot and never detects, routes or catches on its own.
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');
  assert.match(monster, /setRemotePose/);
  assert.match(monster, /if \(remotePose\) \{ updateRemote\(delta\); return; \}/);
  assert.match(monster, /if \(world\.state\.remoteFixtures\) return;/, 'waiting for an online pose must never run the local demon brain');
  assert.match(onlineModule, /demons\.applySnapshot/);

  // The offline stand-ins leave when real guests arrive. A hider nobody can catch, standing still in
  // a corridor, is a decoy the seeker wastes the whole round on.
  assert.match(onlineModule, /hiders\.standDown\(\)/);

  // Everything the server owns has to actually reach the renderer, or online is a hotel where a door
  // someone else opened is still a wall for you.
  for (const applied of ['hotel.applyOpening', 'furnishings.applyDrawer', 'elevator.applyRemote', 'flashlightDrops.applySnapshot']) {
    assert.match(onlineModule, new RegExp(applied.replace('.', '\.')), `online.js must draw ${applied} from the snapshot`);
  }
});

test('the authoritative tick owns the fixtures and the demons, and the pure layer is mirrored whole', () => {
  const sim = fs.readFileSync(path.join(projectRoot, 'sim-logic.js'), 'utf8');
  // Comments stripped: prose may name the renderer it is deliberately avoiding, code may not.
  const strip = (name) => fs.readFileSync(path.join(projectRoot, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const fixtures = strip('fixtures-logic.js');
  const demon = strip('demon-logic.js');
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'tools', 'sim-mirror-manifest.json'), 'utf8'));

  // Neither may reach for a renderer: they run on a server that has no DOM and no WebGL.
  for (const source of [fixtures, demon]) assert.doesNotMatch(source, /THREE|document\.|window\.|requestAnimationFrame/);

  // The tick composes them rather than re-deriving them; a second door animation or a second hunt
  // is a second authority.
  assert.match(sim, /fixtures\.tickFixtures/);
  assert.match(sim, /demonLogic\.tickDemon/);
  assert.match(sim, /demonLogic\.caughtBy/);
  assert.match(sim, /fixtures\.releaseElevator/);

  // A mirrored file the server never loads is drift waiting to happen.
  for (const name of ['fixtures-logic.js', 'demon-logic.js']) {
    assert.ok(name in manifest.files, `${name} must be mirrored to the network server`);
  }
});
