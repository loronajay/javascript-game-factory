import { svgElement } from "./svgHelpers.js";
import { gridToScreen } from "./isometric.js";
import { getEffectiveStats, isDefending } from "../core/unitCatalog.js";
import { positionKey } from "../rules/movement.js";
import { getUnitStatusVfx } from "./vfxCatalog.js";

// ---------------------------------------------------------------------------
// Carved-figurine model (the template every unit follows)
// ---------------------------------------------------------------------------
// Each unit is a small standing miniature, not a flat coin emblem. It is built
// in "figure space": (0,0) is the figure's standing spot on the plinth, the
// piece rises into NEGATIVE y (head near y=-50), and stays within x = ±22.
// Light comes from the upper-LEFT, so highlights sit on the upper-left of each
// form and `.fig-shade` overlays go on the lower-right.
//
// The look is achieved with shared CSS material classes (see style.css), NOT
// inline colors, so the same path geometry recolors per team:
//   .fig-body     ivory/bone gradient + dark outline (the carved body)
//   .fig-shade    translucent dark overlay (sculpts the shadowed right side)
//   .fig-light    translucent light overlay (the lit upper-left edge)
//   .fig-cloak    team color (cloak / tabard / sash / hat band — team identity)
//   .fig-cloak-dk shaded fold of the team cloth
//   .fig-steel    polished metal gradient (blades, shields, mace heads)
//   .fig-gold     brass / wood gradient (hilts, staves, bow limbs, halos)
//   .fig-dark     deep recess (visor slits, hood hollows, grips)
//   .fig-line     thin engraved seam line (no fill)
//   .fig-glow     team-tinted magical glow (orbs / sparks) — uses #softGlow
//
// To add a unit: register a builder in FIGURE_BUILDERS that appends layers in
// back-to-front order. Reuse the helpers below and keep within the figure-space
// bounds above. See UNIT_AUTHORING_GUIDE.md for the worked walkthrough.

const E = svgElement;

// Display scale for the figurine inside its token. Drawn at native figure-space
// size, then shrunk so a tall piece stays comfortably within its tile.
const FIGURE_SCALE = 0.82;

// A team plume / crest helper (small fan above a helmet or hat tip).
function plume(x, y, h = 11, w = 4) {
  return E("path", {
    class: "fig-cloak",
    d: `M ${x - 1.5} ${y} Q ${x - w} ${y - h * 0.7} ${x - w * 0.5} ${y - h} Q ${x} ${y - h * 1.25} ${x + w * 0.5} ${y - h} Q ${x + w} ${y - h * 0.7} ${x + 1.5} ${y} Z`
  });
}

function buildSwordsman(g) {
  g.append(
    // cape behind
    E("path", { class: "fig-cloak", d: "M -8 -29 Q -21 -8 -15 10 L 15 10 Q 21 -8 8 -29 Q 0 -32 -8 -29 Z" }),
    E("path", { class: "fig-cloak-dk", d: "M 0 -30 Q 18 -7 13 10 L 0 10 Z" }),
    // armored body (breastplate + faulds)
    E("path", { class: "fig-body", d: "M -13 -27 Q -15 -14 -11 -4 L -12 9 L 12 9 L 11 -4 Q 15 -14 13 -27 Q 0 -31 -13 -27 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -30 L 13 -27 Q 15 -14 11 -4 L 12 9 L 0 9 Z" }),
    E("path", { class: "fig-light", d: "M -13 -27 Q -15 -14 -11 -4 L -12 9 L -9 9 L -8 -5 Q -11 -14 -9 -26 Z" }),
    E("line", { class: "fig-line", x1: -12, y1: 1, x2: 12, y2: 1 }),
    // team tabard down the chest
    E("path", { class: "fig-cloak", d: "M -4 -22 L -5 9 L 5 9 L 4 -22 Q 0 -24 -4 -22 Z" }),
    E("line", { class: "fig-line", x1: 0, y1: -20, x2: 0, y2: 9 }),
    // pauldrons
    E("ellipse", { class: "fig-body", cx: -13, cy: -26, rx: 5.5, ry: 4.2 }),
    E("ellipse", { class: "fig-body", cx: 13, cy: -26, rx: 5.5, ry: 4.2 }),
    E("ellipse", { class: "fig-shade", cx: 14, cy: -25, rx: 3, ry: 3 }),
    // helmet
    E("path", { class: "fig-body", d: "M -8 -33 Q -8 -46 0 -46 Q 8 -46 8 -33 L 6.5 -28 Q 0 -25 -6.5 -28 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -46 Q 8 -46 8 -33 L 6.5 -28 Q 3 -26 0 -27 Z" }),
    E("rect", { class: "fig-dark", x: -7, y: -37, width: 14, height: 2.6, rx: 1.2 }),
    E("line", { class: "fig-line", x1: 0, y1: -33, x2: 0, y2: -28 }),
    plume(0, -46, 12, 4),
    // greatsword planted point-down over the tabard
    E("circle", { class: "fig-gold", cx: 0, cy: -30, r: 2.6 }),
    E("rect", { class: "fig-dark", x: -1.6, y: -29, width: 3.2, height: 7 }),
    E("path", { class: "fig-gold", d: "M -9 -23 L 9 -23 L 7 -20 L -7 -20 Z" }),
    E("path", { class: "fig-steel", d: "M -2.6 -19 L 2.6 -19 L 1.5 6 L 0 10 L -1.5 6 Z" }),
    E("line", { class: "fig-line", x1: 0, y1: -18, x2: 0, y2: 5 }),
    E("ellipse", { class: "fig-body", cx: -3.4, cy: -25, rx: 2.4, ry: 2 }),
    E("ellipse", { class: "fig-body", cx: 3.4, cy: -25, rx: 2.4, ry: 2 })
  );
}

function buildArcher(g) {
  g.append(
    // short cloak off the left shoulder
    E("path", { class: "fig-cloak", d: "M -1 -29 Q -16 -12 -12 10 L 5 10 Q 7 -10 5 -29 Z" }),
    E("path", { class: "fig-cloak-dk", d: "M -1 -29 Q -7 -8 -5 10 L 5 10 Q 7 -10 5 -29 Z" }),
    // slim tunic body + legs
    E("path", { class: "fig-body", d: "M -9 -27 Q -11 -14 -9 -3 L -10 10 L -1 10 L -1 -2 L 1 -2 L 1 10 L 10 10 L 9 -3 Q 11 -14 9 -27 Q 0 -30 -9 -27 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -29 L 9 -27 Q 11 -14 9 -3 L 10 10 L 1 10 L 1 -2 L 0 -2 Z" }),
    E("path", { class: "fig-light", d: "M -9 -27 Q -11 -14 -9 -3 L -10 10 L -7 10 L -6 -3 Q -8 -14 -6 -26 Z" }),
    // team belt + sash
    E("path", { class: "fig-cloak", d: "M -10 -7 L 10 -7 L 9 -3 L -9 -3 Z" }),
    E("path", { class: "fig-cloak", d: "M 4 -7 L 8 -3 L 6 8 L 2 8 Z" }),
    // quiver behind right shoulder with arrow nocks
    E("rect", { class: "fig-gold", x: 8, y: -28, width: 5, height: 14, rx: 2, transform: "rotate(14 10 -21)" }),
    E("line", { class: "fig-line", x1: 9, y1: -29, x2: 11, y2: -34 }),
    E("line", { class: "fig-line", x1: 11, y1: -28, x2: 13, y2: -33 }),
    // hood
    E("path", { class: "fig-body", d: "M -9 -28 Q -10 -44 0 -46 Q 10 -44 9 -28 Q 4 -32 0 -32 Q -4 -32 -9 -28 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -46 Q 10 -44 9 -28 Q 5 -31 0 -31 Z" }),
    E("path", { class: "fig-dark", d: "M -5 -36 Q 0 -31 5 -36 Q 4 -29 0 -29 Q -4 -29 -5 -36 Z" }),
    E("ellipse", { class: "fig-light", cx: -2.2, cy: -34.5, rx: 0.9, ry: 1 }),
    E("ellipse", { class: "fig-light", cx: 2.2, cy: -34.5, rx: 0.9, ry: 1 }),
    // tall recurve bow drawn on the left + nocked arrow
    E("path", { class: "fig-gold", d: "M -14 -36 Q -27 -14 -15 13 L -12 11 Q -22 -13 -11 -34 Z" }),
    E("line", { class: "fig-line", x1: -13, y1: -35, x2: -13, y2: 12 }),
    E("path", { class: "fig-steel", d: "M -13 -10 L 6 -10 L 6 -11.6 L -13 -11.6 Z" }),
    E("path", { class: "fig-steel", d: "M 6 -10.8 L 1.5 -13.5 L 1.5 -8 Z" }),
    E("ellipse", { class: "fig-body", cx: -3, cy: -10.5, rx: 2.4, ry: 2.2 })
  );
}

function buildMystic(g) {
  g.append(
    // gold halo behind the head
    E("circle", { class: "fig-halo", cx: 0, cy: -37, r: 10, fill: "none" }),
    // long robe
    E("path", { class: "fig-body", d: "M -7 -29 Q -17 -8 -16 10 Q 0 14 16 10 Q 17 -8 7 -29 Q 0 -32 -7 -29 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -30 Q 17 -8 16 10 Q 8 12.5 0 12.8 Z" }),
    E("path", { class: "fig-light", d: "M -7 -29 Q -17 -8 -16 10 Q -12 11.5 -9 11.8 Q -12 -6 -3 -28 Z" }),
    E("path", { class: "fig-line", d: "M -6 -18 Q -8 0 -7 11" }),
    E("path", { class: "fig-line", d: "M 6 -18 Q 8 0 7 11" }),
    // team stole down the front
    E("path", { class: "fig-cloak", d: "M -6 -28 L -4 8 L -1 8 L -2 -28 Z" }),
    E("path", { class: "fig-cloak", d: "M 6 -28 L 4 8 L 1 8 L 2 -28 Z" }),
    E("path", { class: "fig-cloak", d: "M -6 -28 Q 0 -24 6 -28 L 5 -24 Q 0 -20 -5 -24 Z" }),
    // cowled head
    E("path", { class: "fig-body", d: "M -7 -30 Q -8 -44 0 -45 Q 8 -44 7 -30 Q 0 -33 -7 -30 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -45 Q 8 -44 7 -30 Q 4 -32 0 -32 Z" }),
    E("path", { class: "fig-dark", d: "M -4.5 -37 Q 0 -32 4.5 -37 Q 3.5 -30 0 -30 Q -3.5 -30 -4.5 -37 Z" }),
    // staff with a glowing star finial on the right
    E("circle", { class: "fig-glow", cx: 13, cy: -36, r: 6 }),
    E("rect", { class: "fig-gold", x: 11.4, y: -34, width: 3.2, height: 46, rx: 1.4 }),
    E("path", { class: "fig-gold", d: "M 13 -44 L 15 -38 L 21 -37.5 L 16.5 -33.5 L 18 -27.5 L 13 -31 L 8 -27.5 L 9.5 -33.5 L 5 -37.5 L 11 -38 Z" }),
    E("ellipse", { class: "fig-body", cx: 9.5, cy: -16, rx: 2.4, ry: 2.4 })
  );
}

function buildMagician(g) {
  g.append(
    // robe
    E("path", { class: "fig-body", d: "M -7 -28 Q -17 -8 -16 10 Q 0 14 16 10 Q 17 -8 7 -28 Q 0 -31 -7 -28 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -29 Q 17 -8 16 10 Q 8 12.5 0 12.8 Z" }),
    E("path", { class: "fig-light", d: "M -7 -28 Q -17 -8 -16 10 Q -12 11.5 -9 11.8 Q -12 -6 -3 -27 Z" }),
    // star-studded team hem trim
    E("path", { class: "fig-cloak", d: "M -16 7 Q 0 12 16 7 L 16 11 Q 0 15 -16 11 Z" }),
    E("circle", { class: "fig-gold", cx: -9, cy: 7.5, r: 1.4 }),
    E("circle", { class: "fig-gold", cx: 0, cy: 9, r: 1.4 }),
    E("circle", { class: "fig-gold", cx: 9, cy: 7.5, r: 1.4 }),
    // team sash
    E("path", { class: "fig-cloak", d: "M -8 -22 L 9 -10 L 7 -6 L -9 -18 Z" }),
    // head + beard
    E("path", { class: "fig-body", d: "M -6 -30 Q -6 -38 0 -38 Q 6 -38 6 -30 Q 3 -27 0 -27 Q -3 -27 -6 -30 Z" }),
    E("path", { class: "fig-light", d: "M -6 -30 Q -6 -38 0 -38 L -2 -37 Q -4 -33 -3.5 -28 Z" }),
    E("ellipse", { class: "fig-dark", cx: -2, cy: -32.5, rx: 0.8, ry: 0.9 }),
    E("ellipse", { class: "fig-dark", cx: 2, cy: -32.5, rx: 0.8, ry: 0.9 }),
    E("path", { class: "fig-body", d: "M -4 -28 Q 0 -18 4 -28 Q 2 -24 0 -24 Q -2 -24 -4 -28 Z" }),
    // tall pointed wizard hat with team band + gold star
    E("ellipse", { class: "fig-body", cx: 0, cy: -38, rx: 12, ry: 3.4 }),
    E("path", { class: "fig-body", d: "M -10 -38 Q -6 -52 3 -60 Q 0 -50 2 -40 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -42 Q 1 -52 3 -60 Q 2 -49 2 -40 Z" }),
    E("path", { class: "fig-cloak", d: "M -10 -38 Q 0 -35 10 -38 L 9 -42 Q 0 -39 -9 -42 Z" }),
    E("path", { class: "fig-gold", d: "M -3 -46 L -1.6 -43.5 L 1 -43.5 L -1 -42 L -0.2 -39.5 L -2.4 -41 L -4.6 -39.5 L -3.8 -42 L -5.8 -43.5 L -3.2 -43.5 Z" }),
    // raised wand with a spark
    E("rect", { class: "fig-gold", x: 7, y: -36, width: 2.6, height: 20, rx: 1.2, transform: "rotate(28 8 -26)" }),
    E("circle", { class: "fig-glow", cx: 15, cy: -39, r: 5.5 }),
    E("path", { class: "fig-gold", d: "M 15 -44 L 16.4 -40.5 L 20 -39 L 16.4 -37.5 L 15 -34 L 13.6 -37.5 L 10 -39 L 13.6 -40.5 Z" }),
    E("ellipse", { class: "fig-body", cx: 7, cy: -14, rx: 2.4, ry: 2.4 })
  );
}

function buildPaladin(g) {
  g.append(
    // broad cape
    E("path", { class: "fig-cloak", d: "M -9 -29 Q -23 -7 -17 11 L 17 11 Q 23 -7 9 -29 Q 0 -32 -9 -29 Z" }),
    E("path", { class: "fig-cloak-dk", d: "M 0 -30 Q 20 -6 14 11 L 0 11 Z" }),
    // heavy armored body
    E("path", { class: "fig-body", d: "M -12 -27 Q -14 -13 -10 -3 L -11 10 L 11 10 L 10 -3 Q 14 -13 12 -27 Q 0 -31 -12 -27 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -30 L 12 -27 Q 14 -13 10 -3 L 11 10 L 0 10 Z" }),
    E("path", { class: "fig-light", d: "M -12 -27 Q -14 -13 -10 -3 L -11 10 L -8 10 L -7 -3 Q -10 -13 -8 -26 Z" }),
    // team tabard with a holy cross
    E("path", { class: "fig-cloak", d: "M -4 -22 L -5 10 L 5 10 L 4 -22 Q 0 -24 -4 -22 Z" }),
    E("path", { class: "fig-gold", d: "M -1.4 -19 L 1.4 -19 L 1.4 -12 L 5 -12 L 5 -9 L 1.4 -9 L 1.4 3 L -1.4 3 L -1.4 -9 L -5 -9 L -5 -12 L -1.4 -12 Z" }),
    // pauldrons
    E("ellipse", { class: "fig-body", cx: -12, cy: -25, rx: 6, ry: 4.6 }),
    E("ellipse", { class: "fig-body", cx: 12, cy: -25, rx: 6, ry: 4.6 }),
    E("ellipse", { class: "fig-shade", cx: 13, cy: -24, rx: 3.2, ry: 3 }),
    // winged / haloed helm
    E("circle", { class: "fig-halo", cx: 0, cy: -40, r: 8.5, fill: "none" }),
    E("path", { class: "fig-body", d: "M -8 -33 Q -8 -47 0 -47 Q 8 -47 8 -33 L 6.5 -28 Q 0 -25 -6.5 -28 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -47 Q 8 -47 8 -33 L 6.5 -28 Q 3 -26 0 -27 Z" }),
    E("rect", { class: "fig-dark", x: -6.5, y: -38, width: 13, height: 2.4, rx: 1.1 }),
    E("path", { class: "fig-body", d: "M -8 -41 Q -18 -45 -20 -36 Q -13 -37 -8 -33 Z" }),
    E("path", { class: "fig-light", d: "M -8 -41 Q -15 -43.5 -18 -38 Q -13 -38 -9 -35 Z" }),
    E("path", { class: "fig-body", d: "M 8 -41 Q 18 -45 20 -36 Q 13 -37 8 -33 Z" }),
    // mace raised on the right
    E("rect", { class: "fig-gold", x: 14, y: -30, width: 2.8, height: 22, rx: 1.2 }),
    E("circle", { class: "fig-steel", cx: 15.4, cy: -34, r: 5 }),
    E("circle", { class: "fig-light", cx: 13.5, cy: -36, r: 1.6 }),
    // big tower shield on the left arm
    E("path", { class: "fig-steel", d: "M -22 -25 L -7 -29 L -7 8 Q -14.5 16 -22 8 Z" }),
    E("path", { class: "fig-light", d: "M -22 -25 L -16 -26.5 L -16 8 Q -19 9 -22 7 Z" }),
    E("path", { class: "fig-gold", d: "M -16 -22 L -13 -22 L -13 -10 L -8 -10 L -8 -7 L -13 -7 L -13 4 L -16 4 L -16 -7 L -21 -7 L -21 -10 L -16 -10 Z" })
  );
}

function buildNecromancer(g) {
  g.append(
    // tattered hooded cloak with a jagged hem
    E("path", { class: "fig-cloak", d: "M -7 -29 Q -18 -8 -16 11 L -11 8 L -7 11 L -2 8 L 2 11 L 7 8 L 11 11 L 16 8 Q 18 -8 7 -29 Q 0 -32 -7 -29 Z" }),
    E("path", { class: "fig-cloak-dk", d: "M 0 -30 Q 18 -8 16 8 Q 8 10 0 10 Z" }),
    // robe body, hunched forward
    E("path", { class: "fig-body", d: "M -7 -27 Q -15 -8 -13 9 Q 0 12 13 9 Q 15 -8 7 -27 Q 0 -30 -7 -27 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -28 Q 15 -8 13 9 Q 7 10.5 0 10.8 Z" }),
    E("path", { class: "fig-light", d: "M -7 -27 Q -15 -8 -13 9 Q -10 10 -7 10.5 Q -11 -7 -3 -26 Z" }),
    // team stole down the front
    E("path", { class: "fig-cloak", d: "M -6 -27 L -4 8 L -1 8 L -2 -27 Z" }),
    E("path", { class: "fig-cloak", d: "M 6 -27 L 4 8 L 1 8 L 2 -27 Z" }),
    // bone clasp + a small skull sigil on the chest
    E("path", { class: "fig-body", d: "M -3 -20 Q -3 -25 0 -25 Q 3 -25 3 -20 Q 3 -17 0 -16 Q -3 -17 -3 -20 Z" }),
    E("ellipse", { class: "fig-dark", cx: -1.3, cy: -20.5, rx: 0.8, ry: 1 }),
    E("ellipse", { class: "fig-dark", cx: 1.3, cy: -20.5, rx: 0.8, ry: 1 }),
    // deep cowl with a shadowed hollow and two cold glowing eyes
    E("path", { class: "fig-body", d: "M -8 -29 Q -10 -45 0 -47 Q 10 -45 8 -29 Q 4 -33 0 -33 Q -4 -33 -8 -29 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -47 Q 10 -45 8 -29 Q 4 -32 0 -32 Z" }),
    E("path", { class: "fig-dark", d: "M -6 -38 Q 0 -33 6 -38 Q 5 -29 0 -29 Q -5 -29 -6 -38 Z" }),
    E("ellipse", { class: "fig-glow", cx: -2.4, cy: -36, rx: 1.4, ry: 1.6 }),
    E("ellipse", { class: "fig-glow", cx: 2.4, cy: -36, rx: 1.4, ry: 1.6 }),
    // gnarled necromancer staff: a brass rod, a glowing dark orb, and a forked bone crown
    E("rect", { class: "fig-gold", x: 13, y: -36, width: 3.2, height: 48, rx: 1.5 }),
    E("circle", { class: "fig-glow", cx: 14.6, cy: -40, r: 8 }),
    E("circle", { class: "fig-dark", cx: 14.6, cy: -40, r: 4.3 }),
    E("ellipse", { class: "fig-light", cx: 13.1, cy: -41.6, rx: 1.3, ry: 1.6 }),
    E("path", { class: "fig-gold", d: "M 14.6 -44 L 10.4 -50.5 L 12 -50.9 L 14.6 -46.6 L 17.2 -50.9 L 18.8 -50.5 Z" }),
    E("ellipse", { class: "fig-body", cx: 10, cy: -14, rx: 2.4, ry: 2.4 })
  );
}

function buildGhoul(g) {
  g.append(
    // ragged team loincloth at the hips — the summon's team identity
    E("path", { class: "fig-cloak", d: "M -8 -6 L 8 -6 L 9 0 L 6 8 L 4 3 L 1 9 L -2 3 L -4 8 L -9 0 Z" }),
    E("path", { class: "fig-cloak-dk", d: "M 0 -6 L 8 -6 L 9 0 L 6 8 L 4 3 L 1 9 L 0 6 Z" }),
    // hunched skeletal torso with a bare ribcage
    E("path", { class: "fig-body", d: "M -8 -24 Q -11 -14 -8 -2 L -7 4 L 7 4 L 8 -2 Q 11 -14 8 -24 Q 0 -27 -8 -24 Z" }),
    E("path", { class: "fig-shade", d: "M 0 -26 L 8 -24 Q 11 -14 8 -2 L 7 4 L 0 4 Z" }),
    E("path", { class: "fig-light", d: "M -8 -24 Q -11 -14 -8 -2 L -7 4 L -5 4 L -5 -2 Q -8 -14 -6 -23 Z" }),
    E("line", { class: "fig-line", x1: -6, y1: -18, x2: 6, y2: -18 }),
    E("line", { class: "fig-line", x1: -6, y1: -14, x2: 6, y2: -14 }),
    E("line", { class: "fig-line", x1: -5, y1: -10, x2: 5, y2: -10 }),
    E("line", { class: "fig-line", x1: 0, y1: -22, x2: 0, y2: -7 }),
    // long bony clawed arms reaching forward
    E("path", { class: "fig-body", d: "M -8 -20 Q -16 -14 -15 -2 L -12 -3 Q -13 -12 -6 -17 Z" }),
    E("path", { class: "fig-body", d: "M 8 -20 Q 16 -14 15 -2 L 12 -3 Q 13 -12 6 -17 Z" }),
    E("path", { class: "fig-dark", d: "M -16 -3 L -13 -2 M -15 -1 L -12 -1 M -16 1 L -13 1" }),
    E("path", { class: "fig-dark", d: "M 16 -3 L 13 -2 M 15 -1 L 12 -1 M 16 1 L 13 1" }),
    // tilted skull with hollow sockets and a gaunt jaw
    E("path", { class: "fig-body", d: "M -7 -28 Q -8 -38 0 -39 Q 8 -38 7 -28 Q 5 -24 0 -24 Q -5 -24 -7 -28 Z" }),
    E("path", { class: "fig-light", d: "M -7 -28 Q -8 -38 0 -39 L -2 -38 Q -5 -33 -4.5 -27 Z" }),
    E("ellipse", { class: "fig-dark", cx: -2.6, cy: -31, rx: 2, ry: 2.4 }),
    E("ellipse", { class: "fig-dark", cx: 2.6, cy: -31, rx: 2, ry: 2.4 }),
    E("path", { class: "fig-dark", d: "M -0.2 -28 L -1.4 -25 L 1 -25 Z" }),
    E("line", { class: "fig-line", x1: -4, y1: -25.5, x2: 4, y2: -25.5 }),
    E("line", { class: "fig-line", x1: -2.4, y1: -24, x2: -2.4, y2: -26 }),
    E("line", { class: "fig-line", x1: 0, y1: -24, x2: 0, y2: -26 }),
    E("line", { class: "fig-line", x1: 2.4, y1: -24, x2: 2.4, y2: -26 })
  );
}

// Register one builder per unit type. The builder receives an empty
// <g class="figure"> and appends layered figurine paths (back to front).
const FIGURE_BUILDERS = new Map([
  ["swordsman", buildSwordsman],
  ["archer", buildArcher],
  ["mystic", buildMystic],
  ["magician", buildMagician],
  ["paladin", buildPaladin],
  ["necromancer", buildNecromancer],
  ["ghoul", buildGhoul]
]);

export function createUnitFigurine(type) {
  const figure = E("g", { class: "figure" });
  FIGURE_BUILDERS.get(type)?.(figure);
  return figure;
}

// Each status wears a literal little icon, not a 3-letter coin: poison = a
// cluster of bubbles, silence = a "..." chat box, stun = a lightning bolt,
// blind = sunglasses, slow = a boot with a down arrow. Shapes are drawn in a
// ±8 box centred on (0,0) and sit on a dark themed disc for board contrast.
// Keyed by status TYPE (not catalog data) so the catalog/test contract is
// untouched — the icon comes from the renderer, the color/glow from STATUS_VFX.
const STATUS_ICON_BUILDERS = {
  poison(g) {
    g.append(
      svgElement("circle", { class: "ic-bubble", cx: -2.6, cy: 3, r: 4 }),
      svgElement("circle", { class: "ic-bubble", cx: 3, cy: 0.4, r: 2.7 }),
      svgElement("circle", { class: "ic-bubble", cx: -0.2, cy: -3.8, r: 1.8 }),
      svgElement("circle", { class: "ic-shine", cx: -3.9, cy: 1.5, r: 1.1 })
    );
  },
  silence(g) {
    g.append(
      svgElement("path", {
        class: "ic-bubble-box",
        d: "M -7 -6 Q -7 -7.4 -5.6 -7.4 H 5.6 Q 7 -7.4 7 -6 V 0 Q 7 1.4 5.6 1.4 H -1.6 L -4.4 5.4 L -4.4 1.4 H -5.6 Q -7 1.4 -7 0 Z"
      }),
      svgElement("circle", { class: "ic-dot", cx: -3, cy: -3, r: 1 }),
      svgElement("circle", { class: "ic-dot", cx: 0, cy: -3, r: 1 }),
      svgElement("circle", { class: "ic-dot", cx: 3, cy: -3, r: 1 })
    );
  },
  stun(g) {
    g.append(
      svgElement("path", { class: "ic-bolt", d: "M 1.5 -8 L -4.5 1.6 L -0.6 1.6 L -2.6 8 L 6 -2.2 L 1.6 -2.2 L 4 -8 Z" })
    );
  },
  blind(g) {
    g.append(
      svgElement("path", { class: "ic-temple", d: "M -7.6 -3.6 L -6 -1 M 7.6 -3.6 L 6 -1" }),
      svgElement("path", { class: "ic-bridge", d: "M -1.4 -0.6 Q 0 -2.2 1.4 -0.6" }),
      svgElement("rect", { class: "ic-lens", x: -7, y: -1.2, width: 5.6, height: 5, rx: 2.4 }),
      svgElement("rect", { class: "ic-lens", x: 1.4, y: -1.2, width: 5.6, height: 5, rx: 2.4 })
    );
  },
  slow(g) {
    g.append(
      svgElement("path", { class: "ic-boot", d: "M -5 -6 L -1.2 -6 L -1.2 1.4 L 4.8 1.4 Q 7 1.4 7 3.8 L 7 6 L -5 6 Z" }),
      svgElement("path", { class: "ic-down", d: "M 2.6 -7 L 2.6 -1.4 M 0.4 -3.4 L 2.6 -1.4 L 4.8 -3.4" })
    );
  }
};

function createStatusBadges(unit) {
  const visuals = getUnitStatusVfx(unit.statuses);
  if (!visuals.length) return null;
  const spacing = 20;
  const group = svgElement("g", { class: "status-stack", transform: `translate(${-((visuals.length - 1) * (spacing / 2))} -58)` });
  visuals.forEach((visual, index) => {
    const badge = svgElement("g", {
      class: `status-badge status-${visual.type}`,
      transform: `translate(${index * spacing} 0)`,
      style: `--status:${visual.color};--status-glow:${visual.glow};`
    });
    badge.append(svgElement("circle", { class: "status-disc", cx: 0, cy: 0, r: 10 }));
    const icon = svgElement("g", { class: "status-icon" });
    (STATUS_ICON_BUILDERS[visual.type] ?? (() => {}))(icon);
    badge.append(icon);
    group.append(badge);
  });
  return group;
}

export function createUnitFigure(metrics, unit, { isTarget = false, selectedId = null, onUnitClick, state = null }) {
  const point = gridToScreen(metrics, unit.position.x, unit.position.y);
  const stats = getEffectiveStats(unit, state);
  const classes = ["unit", `player-${unit.player}`, "idle"];
  if (unit.spent) classes.push("spent");
  if (isDefending(unit)) classes.push("defending");
  if (unit.id === selectedId) classes.push("active");
  if (isTarget) classes.push("targetable");

  const token = svgElement("g", {
    class: classes.join(" "),
    "data-id": unit.id,
    "data-key": positionKey(unit.position),
    transform: `translate(${point.x} ${point.y + metrics.tileHeight * 0.45})`
  });

  const body = svgElement("g", { class: "body-group" });
  body.append(
    svgElement("ellipse", { class: "base-side", cx: 0, cy: 9, rx: 24, ry: 11 }),
    svgElement("ellipse", { class: "base-top", cx: 0, cy: 4, rx: 24, ry: 11 }),
    svgElement("ellipse", { class: "base-inlay", cx: 0, cy: 4, rx: 18, ry: 8 }),
    svgElement("ellipse", { class: "rim", cx: 0, cy: 4, rx: 24, ry: 11 }),
    svgElement("circle", { class: "shield-ring", cx: 0, cy: -10, r: 33 })
  );

  // The carved miniature stands on the plinth (figure space puts its feet at
  // (0,0) and rises into -y). FIGURE_SCALE keeps the piece compact enough that a
  // tall figurine doesn't visually swamp its tile.
  const figure = createUnitFigurine(unit.type);
  figure.setAttribute("transform", `scale(${FIGURE_SCALE})`);
  body.append(figure);

  const hpBack = svgElement("rect", { class: "hp-back", x: -25, y: 28, width: 50, height: 5, rx: 2.5 });
  const hpFront = svgElement("rect", { class: "hp-front", x: -25, y: 28, width: 50 * unit.hp / stats.maxHp, height: 5, rx: 2.5 });

  const spentMark = svgElement("g", { class: "spent-mark", transform: "translate(19 -30)" });
  spentMark.append(
    svgElement("circle", { cx: 0, cy: 0, r: 8, fill: "rgba(0,0,0,.72)", stroke: "rgba(255,255,255,.5)" }),
    svgElement("path", { d: "M -4 0 L -1 3 L 5 -4", fill: "none", stroke: "#fff", "stroke-width": 2 })
  );

  const defendMark = svgElement("g", { class: "defend-mark", transform: "translate(-19 -30)" });
  defendMark.append(
    svgElement("circle", { cx: 0, cy: 0, r: 9, fill: "rgba(6,14,24,.88)", stroke: "var(--gold)", "stroke-width": 1.4 }),
    svgElement("path", { class: "defend-shield", d: "M 0 -6 L 5 -3.5 L 5 1 Q 5 5 0 7 Q -5 5 -5 1 L -5 -3.5 Z" })
  );

  body.append(hpBack, hpFront, spentMark, defendMark);
  const statusBadges = createStatusBadges(unit);
  if (statusBadges) body.append(statusBadges);

  if (isTarget) {
    const reticle = svgElement("g", { class: "target-mark" });
    reticle.append(
      svgElement("circle", { class: "target-ring", cx: 0, cy: -10, r: 28, fill: "none" }),
      svgElement("path", { class: "target-chevron", d: "M -7 -44 L 0 -36 L 7 -44" })
    );
    body.append(reticle);
  }

  // Hit area = the unit's own tile diamond (in token space). The tall figurine
  // visuals are pointer-events:none (see style.css), so the body that overhangs
  // the tiles BEHIND it lets those clicks pass through to the board — only this
  // diamond, sitting over the unit's own square, selects the piece.
  const hw = metrics.tileWidth / 2;
  const th = metrics.tileHeight;
  const hit = svgElement("polygon", {
    class: "unit-hit",
    points: `0,${-0.45 * th} ${hw},${0.05 * th} 0,${0.55 * th} ${-hw},${0.05 * th}`
  });

  token.append(svgElement("ellipse", { class: "shadow", cx: 0, cy: 18, rx: 24, ry: 8 }), body, hit);
  token.addEventListener("click", (event) => { event.stopPropagation(); onUnitClick(unit.position); });
  return token;
}
