import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { TICK_SECONDS } from "../scripts/sim/constants.js";
import { BALLS, ballTrail } from "../scripts/assets/ball-catalog.js";
import {
  FIRE_SURFACES,
  MAX_FIRES,
  addFire,
  clearFlameTrail,
  createFlameTrail,
  emberAlpha,
  emitFlameTrail,
  fireProgress,
  firesOn,
  tickFlameTrail,
} from "../scripts/effects/flame-trail.js";

suite("flame trail — a ball that burns");

const MAGMA = "magma-ball";

/**
 * A deterministic stand-in for `Math.random`, cycling a fixed sequence.
 *
 * The same trick `tests/splat.test.js` uses, and for the same reason: a burst
 * has a SHAPE, and asserting the shape needs the dice to stop rolling.
 */
function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

/** Shed a trail off a moving ball for `seconds`, and hand back the field. */
function fly(style, seconds, { speed = 5, random = sequence([0.5]) } = {}) {
  const field = createFlameTrail();
  const ticks = Math.round(seconds / TICK_SECONDS);
  for (let tick = 0; tick < ticks; tick++) {
    emitFlameTrail(field, { x: 0, y: 1, z: 0.4, vx: 0, vy: 0, vz: speed, dt: TICK_SECONDS, style, random });
  }
  return field;
}

// ---------------------------------------------------------------------------
// The catalog end — which balls burn at all
// ---------------------------------------------------------------------------

test("burning is opt-in per ball, and exactly the balls that declare it burn", () => {
  const burning = BALLS.filter((ball) => ball.trail);
  assert(burning.length > 0, "if no ball burned the whole path would be dead code");
  assert(burning.length < BALLS.length, "if every ball burned it would not need declaring");

  for (const ball of BALLS) {
    if (!ball.trail) {
      assertEqual(ballTrail(ball.id), null, `${ball.id} should report no trail`);
      continue;
    }
    const trail = ballTrail(ball.id);
    assert(trail.core && trail.flame && trail.smoke, `${ball.id} needs all three flame colours`);
    assert(trail.rate > 0 && trail.life > 0 && trail.size > 0, `${ball.id} trail is not emissive`);
    assert(trail.fire.life > 0 && trail.fire.rate > 0 && trail.fire.radius > 0, `${ball.id} fire is not alight`);
  }
});

test("an unknown ball id burns like the default rather than throwing", () => {
  assertEqual(ballTrail("no-such-ball"), ballTrail("basketball"));
});

test("a fire can only be lit on a surface a shot is ALREADY dead on", () => {
  // The same rule `SPLAT_SURFACES` lives by, and the reason it is worth
  // restating: a fire on the rim would sit exactly where the player most needs
  // to read the ring, at the moment a rattle is still deciding.
  assertEqual([...FIRE_SURFACES].sort().join(","), "floor,wall");
  for (const surface of ["rim", "backboard", "ceiling", "score", "bin-rim", "bin-wall"]) {
    assert(!firesOn(surface), `${surface} must never catch fire`);
  }
});

// ---------------------------------------------------------------------------
// The trail
// ---------------------------------------------------------------------------

test("a ball with no trail block sheds nothing, so the call can stay unconditional", () => {
  const field = createFlameTrail();
  emitFlameTrail(field, { x: 0, y: 1, z: 0, vz: 6, dt: TICK_SECONDS, style: null });
  assertEqual(field.embers.length, 0);
  assertEqual(field.pending, 0, "a ball that does not burn must not accumulate a debt either");
});

test("the fractional emission rate is carried between ticks rather than rounded away", () => {
  // THE reason `pending` exists. A rate of 120/s is two grains a tick, but a
  // rate under 60 is a fraction of one — floor that every tick and a slow
  // trail never appears at all.
  const style = { ...ballTrail(MAGMA), rate: 20 };
  const field = fly(style, 1, { speed: 6 });
  assert(field.embers.length >= 18 && field.embers.length <= 22, `20/s gave ${field.embers.length} in a second`);
});

test("a trail is drawn by MOTION — a fast ball streams and a still one only smoulders", () => {
  const style = ballTrail(MAGMA);
  const fast = fly(style, 0.5, { speed: 8 }).embers.length;
  const still = fly(style, 0.5, { speed: 0 }).embers.length;
  assert(still > 0, "a ball sitting in its own fire still gives something off");
  assert(fast > still * 2, `fast ${fast} vs still ${still} — motion has to be visible in the trail`);
});

test("grains are SHED, not carried — the trail is left behind by the ball", () => {
  // If a grain kept the ball's velocity it would travel along with the sprite
  // and there would be no trail at all, just a halo.
  const speed = 6;
  const field = fly(ballTrail(MAGMA), TICK_SECONDS, { speed });
  assert(field.embers.length > 0);
  for (const ember of field.embers) {
    assert(Math.abs(ember.vz) < speed * 0.5, `a grain kept ${ember.vz.toFixed(2)} of the ball's ${speed}`);
  }
});

test("grains rise, and never fall through the floor", () => {
  const field = createFlameTrail();
  // Emitted over several ticks rather than one: at this rate a single tick is a
  // fraction of a grain, which is the carry the test above exists for.
  for (let tick = 0; tick < 4; tick++) {
    emitFlameTrail(field, { x: 0, y: 0.02, z: 0.3, vz: 4, dt: TICK_SECONDS, style: ballTrail(MAGMA), random: sequence([0.5]) });
  }
  const [ember] = field.embers;
  assert(ember, "four ticks of a live trail must produce at least one grain");
  const startY = ember.y;
  for (let tick = 0; tick < 12; tick++) tickFlameTrail(field, TICK_SECONDS, { random: sequence([0.5]) });
  assert(field.embers.includes(ember), "the grain should still be alive after 0.2s");
  assert(ember.y >= 0, "a grain must not sink through the floor");
  assert(ember.y > startY, "hot air lifts a grain — it is buoyant, not ballistic");
});

test("grains expire, so a long run does not accumulate a room full of fire", () => {
  const style = ballTrail(MAGMA);
  const field = fly(style, 0.5, { speed: 6 });
  const peak = field.embers.length;
  assert(peak > 0);
  for (let tick = 0; tick < Math.ceil((style.life * 2) / TICK_SECONDS); tick++) {
    tickFlameTrail(field, TICK_SECONDS, { random: sequence([0.5]) });
  }
  assertEqual(field.embers.length, 0, "every grain should have burnt out");
});

test("a grain fades from fresh to gone, which is what the renderer reads", () => {
  const field = fly(ballTrail(MAGMA), TICK_SECONDS, { speed: 4 });
  const [ember] = field.embers;
  assert(emberAlpha(ember) > 0.98, "a fresh grain is at full brightness");
  ember.age = ember.life;
  assertEqual(emberAlpha(ember), 0);
  ember.age = ember.life * 10;
  assertEqual(emberAlpha(ember), 0, "an overdue grain clamps rather than going negative");
});

// ---------------------------------------------------------------------------
// The fire it leaves
// ---------------------------------------------------------------------------

test("landing lights a fire, and reports that it did so the sizzle can follow", () => {
  const field = createFlameTrail();
  const lit = addFire(field, { surface: "floor", x: 0.2, y: 0.16, z: 0.4, style: ballTrail(MAGMA), random: sequence([0.5]) });
  assert(lit, "a magma ball landing on bare floor has to light something");
  assertEqual(field.fires.length, 1);
  assertEqual(field.fires[0].y, 0, "a floor fire burns ON the floor, not at the ball's centre height");
});

test("a wall fire keeps the height it struck at", () => {
  const field = createFlameTrail();
  addFire(field, { surface: "wall", x: 0, y: 1.4, z: 0.9, style: ballTrail(MAGMA), random: sequence([0.5]) });
  assertEqual(field.fires[0].y, 1.4);
});

test("a ball with no trail block lights nothing, and neither does the rim", () => {
  const field = createFlameTrail();
  assert(!addFire(field, { surface: "floor", x: 0, y: 0, z: 0.3, style: null }));
  assert(!addFire(field, { surface: "rim", x: 0, y: 1.6, z: 0.8, style: ballTrail(MAGMA) }));
  assertEqual(field.fires.length, 0);
});

test("a rolling ball does not lay down a continuous ribbon of fires", () => {
  // THE test on the spacing rule. The floor collider reports a contact every
  // 8ms substep for as long as the ball is rolling, so without it one landing
  // blows the whole cap inside a tenth of a second and the room is a bonfire.
  const field = createFlameTrail();
  const style = ballTrail(MAGMA);
  let lit = 0;
  for (let step = 0; step < 40; step++) {
    // Creeping forward a millimetre a substep, which is what a settling ball does.
    if (addFire(field, { surface: "floor", x: 0, y: 0, z: 0.3 + step * 0.001, style, random: sequence([0.5]) })) lit += 1;
  }
  assertEqual(lit, 1, "one landing is one fire");
});

test("roll far enough and you light somewhere else", () => {
  const field = createFlameTrail();
  const style = ballTrail(MAGMA);
  assert(addFire(field, { surface: "floor", x: 0, y: 0, z: 0.3, style, random: sequence([0.5]) }));
  assert(addFire(field, { surface: "floor", x: 0.5, y: 0, z: 0.3, style, random: sequence([0.5]) }));
  assertEqual(field.fires.length, 2);
});

test("the number of live fires is capped, oldest out", () => {
  const field = createFlameTrail();
  const style = ballTrail(MAGMA);
  for (let index = 0; index < MAX_FIRES + 4; index++) {
    addFire(field, { surface: "floor", x: index, y: 0, z: 0.3, style, random: sequence([0.5]) });
  }
  assertEqual(field.fires.length, MAX_FIRES);
  assertEqual(field.fires[0].x, 4, "the four oldest fires should have gone out");
});

test("a fire throws grains of its own, dies down, and then is out", () => {
  const field = createFlameTrail();
  const style = ballTrail(MAGMA);
  addFire(field, { surface: "floor", x: 0, y: 0, z: 0.4, style, random: sequence([0.5]) });

  const early = [];
  for (let tick = 0; tick < Math.round(0.3 / TICK_SECONDS); tick++) {
    const before = field.embers.length;
    tickFlameTrail(field, TICK_SECONDS, { random: sequence([0.5]) });
    early.push(field.embers.length - before);
  }
  assert(early.reduce((a, b) => a + b, 0) > 0, "a fresh fire has to be giving something off");

  for (let tick = 0; tick < Math.ceil(style.fire.life / TICK_SECONDS) + 2; tick++) {
    tickFlameTrail(field, TICK_SECONDS, { random: sequence([0.5]) });
  }
  assertEqual(field.fires.length, 0, "a fire has to go out on its own");
});

test("a fire reports how far through its life it is, clamped at both ends", () => {
  const field = createFlameTrail();
  addFire(field, { surface: "floor", x: 0, y: 0, z: 0.4, style: ballTrail(MAGMA), random: sequence([0.5]) });
  const [fire] = field.fires;
  assertEqual(fireProgress(fire), 0);
  fire.age = fire.life / 2;
  assert(Math.abs(fireProgress(fire) - 0.5) < 1e-9);
  fire.age = fire.life * 4;
  assertEqual(fireProgress(fire), 1);
});

test("clearing puts every fire out and empties the air", () => {
  const field = fly(ballTrail(MAGMA), 0.3, { speed: 6 });
  addFire(field, { surface: "floor", x: 0, y: 0, z: 0.4, style: ballTrail(MAGMA), random: sequence([0.5]) });
  assert(field.embers.length > 0 && field.fires.length > 0);

  clearFlameTrail(field);
  assertEqual(field.embers.length, 0);
  assertEqual(field.fires.length, 0);
  assertEqual(field.pending, 0, "a carried fraction would spawn a grain into the next run");
});

finish();
