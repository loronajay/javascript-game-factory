import fs from 'node:fs';
function edit(file, update) { fs.writeFileSync(file, update(fs.readFileSync(file, 'utf8'))); }
function replaceTest(text, name, body) {
  const start = text.indexOf(`test("${name}",`);
  if (start < 0) throw new Error(name);
  const end = text.indexOf('\n});', start) + 4;
  return text.slice(0, start) + body + text.slice(end);
}
edit('tests/horse-screen.test.js', s => {
  s = s.replace('import { HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";', 'import { HOOP_MODES } from "../scripts/sim/hoop.js";\nimport { BIN_MOTIONS } from "../scripts/sim/bin-placement.js";');
  s = s.replace('import { defaultHoopPlacement }', 'import { HOOP_PLACEMENT_BOUNDS, defaultHoopPlacement }').replaceAll('HOOP_TRAVEL_BOUNDS', 'HOOP_PLACEMENT_BOUNDS');
  s = replaceTest(s, 'HORSE offers every saved shot and loads its target, tools, room, and ball', `test("HORSE refuses Lab imports without changing or deleting saved shots", () => {
  const store = createTrickShotStore({ storage: createMemoryStorage(), makeId: () => "lab-shot" });
  const saved = store.save({ name: "Keep me", target: { kind: "bin" }, pieces: [{ type: "board", id: "pad" }] });
  const { horse } = harness({ mode: "local", store });
  horse.enter({ mode: "local" });
  const before = structuredClone(horse.setup);
  assertDeepEqual(horse.savedShots(), []);
  assertEqual(horse.useSavedShot(saved.id), false);
  for (const type of ["board", "spring", "cannon"]) assertEqual(horse.addPiece(type), false);
  assertDeepEqual(horse.pieces, []);
  assertDeepEqual(horse.setup, before);
  assertDeepEqual(store.get(saved.id), saved, "Lab data must remain intact");
});`);
  s = replaceTest(s, 'a saved tool layout becomes part of the standing shot the matcher inherits', `test("both Horse targets retain every motion option", () => {
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local" });
  for (const [kind, motions] of [["hoop", HOOP_MODES], ["bin", BIN_MOTIONS]]) {
    for (const motion of motions) {
      horse.placeTarget({ kind, motionId: motion.id });
      assertEqual(horse.setup.motionId, motion.id);
      const start = horse.targetNow();
      for (let i = 0; i < 23; i++) horse.tick();
      if (motion.id !== "still") assert(JSON.stringify(start) !== JSON.stringify(horse.targetNow()), motion.id + " stopped moving");
    }
  }
});

test("a hoop can be hung low and across the full aiming range", () => {
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local" });
  horse.placeTarget({ kind: "hoop", motionId: "still", placement: { cx: 630, rimY: 420, z: 0.1 } });
  assertDeepEqual(horse.setup.placement, { cx: 630, rimY: 420 });
});`);
  s = replaceTest(s, 'the HORSE placement panel exposes the lab tool tray and saved-shot bank', `test("the retained Horse tool tray is hidden while the Lab remains available", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(/<details[^>]*class="horse-trick-tools"[^>]*hidden/.test(html));
  assert(html.includes('id="trickShotScreen"'));
});`);
  s = replaceTest(s, 'the court records the tools the ball touched, and holds the matcher to them', `test("the CPU never places tools on any difficulty", () => {
  for (const difficulty of ["easy", "medium", "hard"]) {
    const { horse } = harness({ mode: "cpu", difficulty, random: () => 0 });
    horse.enter({ mode: "cpu", difficulty });
    horse.match.turn = 1;
    for (let i = 0; i < 65; i++) horse.tick();
    assertDeepEqual(horse.pieces, []);
    assertEqual(horse.phase, "aiming");
  }
});`);
  return s;
});
edit('tests/horse-online.test.js', s => {
  s = s.replace('import { HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";', 'import { HOOP_PLACEMENT_BOUNDS } from "../scripts/sim/hoop-placement.js";').replaceAll('HOOP_TRAVEL_BOUNDS', 'HOOP_PLACEMENT_BOUNDS');
  s = s.replace('an online placement carries a bounded Lab tool layout and room', 'an online placement strips Lab tools while keeping the target and room');
  s = s.replace('assertEqual(setup.pieces.length, 1);\n  assertEqual(setup.pieces[0].id, "bank-pad");', 'assertEqual(setup.pieces.length, 0);');
  s = s.replace('assertEqual(onlineClient.placements[0].pieces.length, 1);', 'assertEqual(onlineClient.placements[0].pieces.length, 0);');
  s = s.replace('the visible HORSE tray adds a Lab tool through the placement panel', 'stale Horse tool controls cannot add a Lab tool');
  s = s.replace('assertEqual(horse.pieces.length, 1, "clicking the on-screen tray did not add its tool");', 'assertEqual(horse.pieces.length, 0, "a stale control added a tool");');
  return s;
});
edit('tests/horse.test.js', s => {
  s = s.replace('assertEqual(HOOP_PLACEMENT_BOUNDS, HOOP_TRAVEL_BOUNDS);', 'assertEqual(HOOP_PLACEMENT_BOUNDS.minX, AIM_MIN_X);\n  assertEqual(HOOP_PLACEMENT_BOUNDS.maxX, AIM_MAX_X);\n  assert(HOOP_PLACEMENT_BOUNDS.maxY > 400, "a low wall hoop should be placeable");');
  s = s.replaceAll('HOOP_TRAVEL_BOUNDS.minX', 'HOOP_PLACEMENT_BOUNDS.minX').replaceAll('HOOP_TRAVEL_BOUNDS.maxX', 'HOOP_PLACEMENT_BOUNDS.maxX').replaceAll('HOOP_TRAVEL_BOUNDS.minY', 'HOOP_PLACEMENT_BOUNDS.minY').replaceAll('HOOP_TRAVEL_BOUNDS.maxY', 'HOOP_PLACEMENT_BOUNDS.maxY');
  const start = s.indexOf('test("the duty is the tools');
  const end = s.indexOf('test("the CPU\'s lead is one statement', start);
  s = s.slice(0, start) + `test("old apparatus setups cannot create duties or CPU recipes", () => {
  const setup = { kind: "bin", pieces: [pad("a", {})], requiredPieces: ["a"], provenPull: { power: 0.5, aimX: 480 } };
  assertEqual(requiredPieceIds(setup).length, 0);
  assertEqual(unmetPieceIds(setup).length, 0);
  assertEqual(needsProvenPull(setup), false);
  assertEqual(provenPullShot(setup), null);
  const match = createHorseMatch({ mode: "local" });
  resolveHorseShot(match, true, setup, { touched: ["a"], pull: setup.provenPull });
  assertEqual(match.standingShot.pieces.length, 0);
  assertEqual(match.standingShot.provenPull, undefined);
  match.standingShot = setup; // A pre-change snapshot may still carry a duty.
  assertEqual(judgeHorseShot(match, { scored: true }).made, true);
  assertEqual(shotSetupFor(match, null).pieces.length, 0);
});

test("Horse replay ignores even a cannon placed directly on the ball path", () => {
  const setup = normalizeTrickShotTarget({ kind: "hoop", motionId: "still" });
  const intent = { ...leadPull(setup, "basketball"), ballId: "basketball" };
  const bare = replayHorseShot({ setup, intent, trace: true });
  const point = bare.path.find(p => p.vy < 0);
  const cannon = createSandboxPiece("cannon", { id: "catch", x: point.x, y: point.y - 0.2, z: point.z });
  const dirty = replayHorseShot({ setup: { ...setup, pieces: [cannon] }, intent, trace: true });
  assertEqual(JSON.stringify(dirty), JSON.stringify(bare));
});

test("all CPU difficulties decline Lab tools and planning", () => {
  for (const difficulty of ["easy", "medium", "hard"]) {
    for (const roll of [0, 0.3, 0.99]) assertEqual(cpuSetsTrickShot(difficulty, () => roll), false);
  }
  assertEqual(planCpuTrickShot({ setup: normalizeTrickShotTarget({ kind: "hoop" }), ballId: "basketball" }), null);
});

` + s.slice(end);
  return s;
});
edit('tests/trick-shot-target.test.js', s => s.replace('HOOP_MODES, HOOP_TRAVEL_BOUNDS', 'HOOP_MODES').replace('clampHoopPlacement, defaultHoopPlacement', 'HOOP_PLACEMENT_BOUNDS, clampHoopPlacement, defaultHoopPlacement').replaceAll('HOOP_TRAVEL_BOUNDS', 'HOOP_PLACEMENT_BOUNDS'));
edit('tests/server-mirror.test.js', s => {
  s = s.replace('  sanitizeHorseShot,', '  sanitizeHorseShot,\n  sanitizeHorsePlacement,');
  s = s.replace('"sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/launch.js",', '"sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/hoop-placement.js", "sim/launch.js",');
  const start = s.indexOf('test("authoritative HORSE holds a matcher');
  s = s.slice(0, start) + `test("authoritative Horse rejects Lab tools from stale or crafted clients", () => {
  const setup = sanitizeHorsePlacement({ kind: "hoop", motionId: "horizontal", placement: { cx: 480, rimY: 400, z: 0.1 }, pieces: [{ type: "cannon", id: "bad" }], requiredPieces: ["bad"] });
  assertEqual(setup.pieces.length, 0);
  assertEqual(setup.motionId, "horizontal");
  assertEqual(setup.placement.rimY, 400);
  assertEqual(setup.placement.z, undefined);
});

finish();
`;
  return s;
});
