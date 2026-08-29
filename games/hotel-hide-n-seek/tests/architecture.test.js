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

  assert.match(hotel, /floorLightingChanged/);
  assert.match(hotel, /light\.visible\s*=/);
});

test('the demon face follows the animated head and shares the body forward direction', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.doesNotMatch(monster, /model\.rotation\.y\s*=\s*Math\.PI/);
  assert.match(monster, /getObjectByName\(['"]Head['"]\)/);
  assert.match(monster, /headBone\.getWorldPosition/);
  assert.match(monster, /updateHeadDetails/);
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

test('the demon wears a swaying shroud and hand talons rigged to the animated skeleton', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  for (const detail of ['Tattered Shroud', 'Hand Talon']) assert.match(monster, new RegExp(detail));
  assert.match(monster, /getObjectByName\(['"]hand_l['"]\)/);
  assert.match(monster, /getObjectByName\(['"]hand_r['"]\)/);
  assert.match(monster, /getWorldScale/);
});

test('the demon posture is forced onto the skeleton after the mixer writes each frame', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /applyPosture/);
  assert.match(monster, /spine_01/);
  assert.match(monster, /lowerarm_l/);
  assert.match(monster, /mixer\.update\([^)]*\);\s*applyPosture\(\)/);
});

test('the demon menace reacts to its awareness state instead of holding one pose', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  assert.match(monster, /updateMenace/);
  assert.match(monster, /jawGroup/);
  assert.match(monster, /ENEMY_STATES\.CHASE/);
});

test('the demon body is pulled off the human rig into a creature silhouette', () => {
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');

  for (const bone of ['calf_l', 'clavicle_r', 'thigh_l', 'index_01_l']) assert.match(monster, new RegExp(bone));
  assert.match(monster, /Spinal Barb/);
  assert.match(monster, /digitigrade/i);
  assert.match(monster, /asymmetry|asymmetric/i);
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

test('the local head collapse is re-applied after the mixer writes each frame', () => {
  const avatars = fs.readFileSync(path.join(projectRoot, 'modules', 'avatars.js'), 'utf8');

  // The rig's clips carry scale tracks, so a one-off scale at load is overwritten on the next frame.
  assert.match(avatars, /mixer\.update\([^)]*\); applyLocalOverrides\(avatar\)/);
  assert.match(avatars, /headBone\.scale\.setScalar/);
  assert.doesNotMatch(avatars, /crouchPosture/);
});

test('the sanity meter keeps its rules pure and lets the demon read them', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const monster = fs.readFileSync(path.join(projectRoot, 'modules', 'monster.js'), 'utf8');
  const sanityModule = fs.readFileSync(path.join(projectRoot, 'modules', 'sanity.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'sanity-logic.js')), 'sanity-logic.js is missing');
  assert.match(html, /sanity-logic\.js/);
  assert.match(html, /id="sanityMeter"/);
  assert.match(main, /createSanity/);
  assert.match(main, /HotelSanity/);
  // Timing, zone tests and target selection are rules a server must be able to run headlessly, so
  // the runtime module may only call into the pure layer, never re-implement it.
  for (const rule of ['logic.locateZone', 'logic.updateSanity', 'logic.selectHuntTarget']) assert.match(sanityModule, new RegExp(rule.replace('.', '\.')));
  for (const tuning of ['fillSeconds', 'tunnelDrainSeconds', 'hallwayStepDistance']) assert.doesNotMatch(sanityModule, new RegExp(tuning));
  // Which spaces exist is a rule too — the runtime module may not decide what a tunnel is.
  assert.match(sanityModule, /logic\.ZONE_KINDS\.TUNNEL/);
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
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'menu-logic.js')), 'menu-logic.js is missing');
  assert.match(html, /menu-logic\.js/);
  for (const screen of ['menuTitle', 'menuHowTo', 'menuExtras', 'menuPause']) assert.match(html, new RegExp(`id="${screen}"`));
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
});

test('the round keeps its rules pure and resolves catches on the authority side', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const roundModule = fs.readFileSync(path.join(projectRoot, 'modules', 'round.js'), 'utf8');
  const player = fs.readFileSync(path.join(projectRoot, 'modules', 'player.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'round-logic.js')), 'round-logic.js is missing');
  assert.match(html, /round-logic\.js/);
  assert.match(html, /id="roundHud"/);
  assert.match(main, /createRound/);
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
  // They wear the same rig every player wears and route through the one stairwell the demon uses.
  assert.match(hidersModule, /avatars\.spawn/);
  assert.match(hidersModule, /avatars\.setPose/);
  assert.match(hidersModule, /enemyLogic\.createStairRoute/);
  assert.match(hidersModule, /sanityLogic\.updatePlayerSanity/);
});

test('collision is plain headless data rather than geometry discovered from meshes', () => {
  const world = fs.readFileSync(path.join(projectRoot, 'modules', 'world.js'), 'utf8');
  const furnishings = fs.readFileSync(path.join(projectRoot, 'modules', 'furnishings.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(projectRoot, 'collision-logic.js')));
  assert.match(html, /collision-logic\.js/);
  assert.match(world, /logic\.collidesAt/);
  assert.match(furnishings, /registerBoxCollider/);
  assert.doesNotMatch(world, /Box3\(\)\.setFromObject/);
});

test('player-facing creature copy consistently names The Bellhop', () => {
  const copy = ['index.html', 'modules/monster.js', 'modules/round.js', 'modules/model-viewer.js']
    .map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8'))
    .join('\n');

  assert.match(copy, /The Bellhop/);
  assert.doesNotMatch(copy, /The Guest|THE GUEST/);
});
