// What the other half of the table looks like when nobody is signed into it.
//
// The rivals are not a default: each one has an INTENTIONAL appearance, built
// from the same catalog and drawn through the same renderer the player's own
// equipment uses. That is what keeps the opponent half honest — there is no
// second mallet builder and no "CPU look" hiding behind the cosmetic system.
//
// The player never controls any of this. In a CPU match the far half is
// whichever rival is on the other side of the table; online it is that
// player's own saved public loadout, fetched from the platform. Two sources,
// one shape, and neither is reachable from the Garage.

import { normalizeLoadout } from "./loadout.js";

/** A rival's design keyword to the equipment it stands for. */
const RIVAL_KIT = {
  starter: { shape: "mallet.shape.minimal", material: "mallet.material.matte-polymer", hardware: "mallet.hardware.none", surface: "table.surface.factory-graphite", rails: "table.rail.factory-steel", goal: "table.goal.factory" },
  classic: { shape: "mallet.shape.classic", material: "mallet.material.anodized", hardware: "mallet.hardware.halo", surface: "table.surface.tournament-slate", rails: "table.rail.factory-steel", goal: "table.goal.factory" },
  heavy: { shape: "mallet.shape.heavy", material: "mallet.material.brushed-metal", hardware: "mallet.hardware.mechanical", surface: "table.surface.industrial-hazard", rails: "table.rail.carbon-composite", goal: "table.goal.blackout" },
  razor: { shape: "mallet.shape.razor", material: "mallet.material.black-chrome", hardware: "mallet.hardware.segmented", surface: "table.surface.synth-vector", rails: "table.rail.black-chrome", goal: "table.goal.reactor" },
  flash: { shape: "mallet.shape.arcade", material: "mallet.material.pearl", hardware: "mallet.hardware.dual-halo", surface: "table.surface.arcade-checker", rails: "table.rail.arcade-trim", goal: "table.goal.halo" },
  power: { shape: "mallet.shape.industrial", material: "mallet.material.brushed-metal", hardware: "mallet.hardware.reactor", surface: "table.surface.hex-matrix", rails: "table.rail.machined-silver", goal: "table.goal.reactor" },
  split: { shape: "mallet.shape.split-core", material: "mallet.material.acrylic", hardware: "mallet.hardware.halo", surface: "table.surface.prism-facet", rails: "table.rail.machined-silver", goal: "table.goal.halo" },
  gloss: { shape: "mallet.shape.classic", material: "mallet.material.chrome", hardware: "mallet.hardware.dual-halo", surface: "table.surface.vector-grid", rails: "table.rail.black-chrome", goal: "table.goal.halo" },
  solid: { shape: "mallet.shape.heavy", material: "mallet.material.carbon-composite", hardware: "mallet.hardware.none", surface: "table.surface.blueprint", rails: "table.rail.carbon-composite", goal: "table.goal.blackout" },
  quiet: { shape: "mallet.shape.minimal", material: "mallet.material.matte-polymer", hardware: "mallet.hardware.underglow", surface: "table.surface.precision-rings", rails: "table.rail.factory-steel", goal: "table.goal.blackout" },
  ring: { shape: "mallet.shape.turbine", material: "mallet.material.anodized", hardware: "mallet.hardware.dual-halo", surface: "table.surface.carbon-circuit", rails: "table.rail.black-chrome", goal: "table.goal.halo" },
  champion: { shape: "mallet.shape.champion", material: "mallet.material.championship", hardware: "mallet.hardware.reactor", surface: "table.surface.championship", rails: "table.rail.championship-gold", goal: "table.goal.championship" },
};

const FALLBACK = RIVAL_KIT.classic;

/**
 * A rival's equipment as an ordinary LOADOUT.
 *
 * One design, the same shape the player's equipped slot has — a rival has no
 * garage of saved alternatives, because nothing ever asks them to switch.
 * Built through `normalizeLoadout`, so a rival is subject to exactly the same
 * bounds and fallbacks a player is: a typo in the table above degrades to the
 * factory loadout rather than drawing something impossible.
 */
export function rivalLoadout(rival) {
  const kit = RIVAL_KIT[rival?.design] ?? FALLBACK;
  const primary = rival?.color || "#3f7194";
  const accent = rival?.accent || "#d8dde2";
  return normalizeLoadout({
    mallet: {
      shapePreset: kit.shape,
      material: { preset: kit.material },
      colors: { primary, accent, hardware: accent },
      hardware: { style: kit.hardware },
      decal: { type: "none" },
    },
    tableHalf: {
      surface: { preset: kit.surface, patternColor: primary },
      markings: { color: accent, opacity: 0.45 },
      rails: { preset: kit.rails },
      goal: { preset: kit.goal, color: primary, emissiveColor: primary },
      trim: { color: primary, glowIntensity: 0.45 },
    },
  });
}
