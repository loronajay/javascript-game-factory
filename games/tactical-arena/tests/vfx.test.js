import test from "node:test";
import assert from "node:assert/strict";

import { getAbilityVfx, getAttackProjectile, getImpactVfx, getStatusVfx, getUnitStatusVfx, retuneVfx } from "../src/ui/vfxCatalog.js";

test("ability VFX are reusable templates that can be retuned per ability", () => {
  const lifeSap = getAbilityVfx("life-sap");
  assert.equal(lifeSap.type, "drain");
  assert.equal(lifeSap.particleCount, 18);
  assert.equal(lifeSap.colors.core, "#8cf0a4");

  const shadowDrain = retuneVfx(lifeSap, {
    particleCount: 10,
    colors: { core: "#b58cff" }
  });

  assert.equal(shadowDrain.type, "drain");
  assert.equal(shadowDrain.particleCount, 10);
  assert.equal(shadowDrain.colors.core, "#b58cff");
  assert.equal(lifeSap.particleCount, 18);
  assert.equal(lifeSap.colors.core, "#8cf0a4");
});

test("Volley Shot declares a cone rain of recolorable projectiles", () => {
  const volley = getAbilityVfx("volley-shot");
  assert.equal(volley.type, "volleyRain");
  assert.equal(volley.colors.core, "#f7e27d");
  assert.ok(volley.staggerMs > 0);
  assert.ok(volley.durationMs > 0);
});

test("every implemented active ART declares a distinct VFX recipe", () => {
  assert.deepEqual(
    ["footwork", "moonstrike", "mage-killer", "life-sap", "volley-shot", "poison-arrow", "leg-shot", "pray", "wish", "silence", "spark", "flee", "banish", "nuke"].map((id) => [id, getAbilityVfx(id)?.type]),
    [
      ["footwork", "dashTrail"],
      ["moonstrike", "statusStrike"],
      ["mage-killer", "statusStrike"],
      ["life-sap", "drain"],
      ["volley-shot", "volleyRain"],
      ["poison-arrow", "statusStrike"],
      ["leg-shot", "statusStrike"],
      ["pray", "healPulse"],
      ["wish", "healPulse"],
      ["silence", "statusStrike"],
      ["spark", "projectileFan"],
      ["flee", "dashTrail"],
      ["banish", "statusStrike"],
      ["nuke", "magicBurst"]
    ]
  );
  assert.equal(getAbilityVfx("moonstrike").motif, "moon");
  assert.equal(getAbilityVfx("mage-killer").motif, "silenceRune");
  assert.equal(getAbilityVfx("poison-arrow").motif, "venom");
  assert.equal(getAbilityVfx("leg-shot").motif, "snare");
  assert.equal(getAbilityVfx("silence").motif, "silenceRune");
  assert.ok(getAbilityVfx("pray").radius > getAbilityVfx("wish").radius);
});

test("ranged basic attacks fire a per-unit-type projectile with a safe fallback", () => {
  assert.equal(getAttackProjectile("archer").shape, "arrow");
  assert.equal(getAttackProjectile("sniper").shape, "tracer");
  assert.equal(getAttackProjectile("magician").shape, "orb");
  assert.equal(getAttackProjectile("mystic").shape, "orb");
  assert.equal(getAttackProjectile("necromancer").shape, "orb");
  // Unknown/new ranged types never fire nothing.
  const fallback = getAttackProjectile("some-future-unit");
  assert.equal(fallback.shape, "orb");
  assert.ok(fallback.colors.core);
});

test("rolled attack ARTS carry their own attack projectile; pure casts carry a cast projectile", () => {
  // `projectile` replaces the unit's basic-attack shot inside animateAttack.
  assert.equal(getAbilityVfx("poison-arrow").projectile.shape, "arrow");
  assert.equal(getAbilityVfx("leg-shot").projectile.shape, "arrow");
  assert.equal(getAbilityVfx("spark").projectile.shape, "orb");
  assert.equal(getAbilityVfx("banish").projectile.shape, "orb");
  assert.equal(getAbilityVfx("wither").projectile.shape, "orb");
  // `castProjectile` is flown by statusStrike itself (no attack phase to ride on).
  assert.equal(getAbilityVfx("silence").castProjectile.shape, "orb");
  assert.equal(getAbilityVfx("smoke-bomb").castProjectile.shape, "lob");
  // Melee arts fly nothing.
  assert.equal(getAbilityVfx("moonstrike").projectile, undefined);
  assert.equal(getAbilityVfx("mage-killer").projectile, undefined);
});

test("magic and casts declare a gather windup; thrown objects declare a toss windup", () => {
  // Gathers: motes converge on the caster + castCharge riser before the release.
  for (const id of ["nuke", "dark-bomb", "summon-ghoul", "lightseeker", "darkseeker", "pray", "wish", "hand-of-life", "silence", "spark", "banish", "wither"]) {
    assert.equal(getAbilityVfx(id)?.windup?.style, "gather", `${id} should gather`);
  }
  // The rage ultimate earns the heaviest gather.
  assert.ok(getAbilityVfx("nuke").windup.durationMs >= getAbilityVfx("spark").windup.durationMs);
  // Tosses: the token leans back and snaps forward before the lob.
  assert.equal(getAbilityVfx("smoke-bomb").windup.style, "toss");
  assert.equal(getAbilityVfx("throw-cigar").windup.style, "toss");
  // Physical draws and motion arts stay windup-free (pace + no gather fantasy).
  for (const id of ["poison-arrow", "leg-shot", "volley-shot", "footwork", "flee", "life-sap", "moonstrike", "mage-killer"]) {
    assert.equal(getAbilityVfx(id)?.windup, undefined, `${id} should not wind up`);
  }
});

test("Volley Shot rains real arrows and Throw Cigar is a tumbling lob", () => {
  assert.equal(getAbilityVfx("volley-shot").projectile.shape, "arrow");
  const cigar = getAbilityVfx("throw-cigar");
  assert.equal(cigar.type, "lob");
  assert.equal(cigar.projectile.shape, "lob");
  assert.equal(cigar.soundKey, "throwCigar");
});

test("signature abilities carry their bespoke recipe flags", () => {
  // Nuke owns the full detonation signature; Dark Bomb keeps only the scorch.
  const nuke = getAbilityVfx("nuke");
  assert.equal(nuke.boardFlash, true);
  assert.equal(nuke.pillar, true);
  assert.equal(nuke.afterglow, true);
  const darkBomb = getAbilityVfx("dark-bomb");
  assert.equal(darkBomb.afterglow, true);
  assert.equal(darkBomb.pillar, undefined);
  assert.equal(darkBomb.boardFlash, undefined);
  // Summon Ghoul is the grave-rising, with a stream into the summon tile.
  const summon = getAbilityVfx("summon-ghoul");
  assert.equal(summon.type, "summonRise");
  assert.equal(summon.stream.shape, "orb");
  assert.ok(summon.soilCount > 0);
  assert.ok(summon.miasmaCount > 0);
  // Life Sap channels through a visible tether.
  assert.equal(getAbilityVfx("life-sap").tether, true);
});

test("Father Time's arts declare their recipes (Age/Time Stretch motes, Rewind rise)", () => {
  const age = getAbilityVfx("age");
  assert.equal(age.type, "projectileFan");
  assert.equal(age.soundKey, "age");
  const stretch = getAbilityVfx("time-stretch");
  assert.equal(stretch.type, "projectileFan");
  assert.equal(stretch.soundKey, "timeStretch");
  // Rewind reuses the summon-rise signature with its own sound.
  const rewind = getAbilityVfx("rewind");
  assert.equal(rewind.type, "summonRise");
  assert.equal(rewind.soundKey, "rewind");
  assert.ok(rewind.stream.shape);
});

test("impacts are styled per damage type with a physical fallback", () => {
  const kinds = ["physical", "magic", "fire", "true"].map((kind) => getImpactVfx(kind));
  for (const style of kinds) {
    assert.ok(style.flash && style.ring && style.spark, `${style.kind} has full colors`);
    assert.ok(style.sparkCount > 0);
    assert.ok(["chips", "motes", "embers"].includes(style.motion));
  }
  // Ring colors are the read-at-a-glance signal — they must differ per type.
  assert.equal(new Set(kinds.map((style) => style.ring)).size, kinds.length);
  assert.equal(getImpactVfx("fire").motion, "embers");
  assert.equal(getImpactVfx("magic").motion, "motes");
  // Unknown kinds fall back to physical rather than throwing.
  assert.equal(getImpactVfx("shadow-flame").kind, "physical");
  // Throw Cigar lands as fire.
  assert.equal(getAbilityVfx("throw-cigar").impactKind, "fire");
});

test("status VFX resolve to compact persistent badges above units", () => {
  assert.deepEqual(getStatusVfx({ type: "poison" }), {
    type: "poison",
    label: "POI",
    color: "#78d46b",
    glow: "#315f29",
    ring: "bubble"
  });

  assert.deepEqual(getUnitStatusVfx([
    { type: "slow", duration: 2 },
    { type: "poison", duration: "permanent" },
    { type: "slow", duration: 1 },
    { type: "unknown" }
  ]).map((vfx) => vfx.type), ["slow", "poison"]);
});
