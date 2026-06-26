import test from "node:test";
import assert from "node:assert/strict";

import { getAbilityVfx, getStatusVfx, getUnitStatusVfx, retuneVfx } from "../src/ui/vfxCatalog.js";

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
