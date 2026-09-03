// The cosmetic layer: the catalog, the loadout, ownership, and the editor.
//
// The rules checked here are the ones that make a cosmetic system survive
// content being added, renamed and removed for years:
//
//   A COSMETIC IS PRESENTATION. Not one payload may carry a value the sim reads.
//   This is checked structurally, over every item, so it cannot be forgotten.
//
//   AN ID READ BACK IS UNTRUSTED. Unknown, wrong-slot and unowned ids all fall
//   back rather than throwing, because the alternative is a cabinet that cannot
//   ever rename a cosmetic.
//
//   READABILITY IS MEASURED, NOT DECLARED. Every ball set's declared block is
//   compared against one computed from its actual colours.
//
//   PREVIEW IS NOT SAVE. The editor's three states are asserted end to end
//   against a fake store, which is also the proof the store is a real seam.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, assertEqual, asyncTest, finish, suite, test } from "./harness.js";
import { CATALOG, allItemIds, findItem, itemsForSlot, itemsOfType, presetsOfType } from "../scripts/cosmetics/catalog.js";
import { BALL_SETS, ballColorIn, readabilityOf } from "../scripts/cosmetics/ball-sets.js";
import { luminance } from "../scripts/cosmetics/color.js";
import { EMPTY_INVENTORY, DEVELOPMENT_INVENTORY, createInventory } from "../scripts/cosmetics/inventory.js";
import {
  DEFAULT_LOADOUT,
  MAX_SAVED_LOADOUTS,
  activeLoadout,
  addEntry,
  applyPreset,
  defaultGarage,
  defaultLoadout,
  equip,
  loadoutsEqual,
  normalizeGarage,
  normalizeLoadout,
  removeEntry,
  resolveLoadout,
  serializeGarage,
} from "../scripts/cosmetics/loadout.js";
import { createTableEditor } from "../scripts/cosmetics/editor.js";
import { HALL_SLOTS, TABLE_SLOTS, RARITIES, UNLOCK_SOURCES, slotAccepts, slotsFor, typesFor } from "../scripts/cosmetics/types.js";

suite("cosmetics — catalog, loadout, ownership, editor");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(gameRoot, relative), "utf8");

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("every catalog id is unique", () => {
  const ids = allItemIds();
  const seen = new Set();
  for (const id of ids) {
    assert(!seen.has(id), `duplicate catalog id: ${id}`);
    seen.add(id);
  }
  assertEqual(seen.size, CATALOG.length);
});

test("every item is fully described: type, name, rarity and a real source", () => {
  for (const item of CATALOG) {
    assert(typeof item.id === "string" && item.id.length > 2, `${item.id} has no usable id`);
    assert(typeof item.name === "string" && item.name.length > 0, `${item.id} has no name`);
    assert(RARITIES.includes(item.rarity), `${item.id} has rarity "${item.rarity}"`);
    assert(UNLOCK_SOURCES.includes(item.source.kind), `${item.id} comes from "${item.source.kind}"`);
    // Derived, never authored: anything that is not development-granted will one
    // day need a server to confirm it, and deriving it means a new reward cannot
    // forget to ask.
    assertEqual(item.entitlement, item.source.kind !== "development", `${item.id}'s entitlement flag disagrees with its source`);
  }
});

test("no cosmetic carries a value the simulation reads", () => {
  // THE PRODUCT RULE, AS A STRUCTURAL CHECK. A cosmetic may not name a radius, a
  // mass, a friction, a restitution or any other quantity `sim/` reads — not in
  // a table payload, not in a hall payload, not nested. A cloth is a colour; it
  // is never a faster cloth.
  const banned = /radius|mass|friction|restitution|gravity|damping|elastic|velocity|inertia|acceleration/i;
  const walk = (value, path) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert(!banned.test(key), `${path}.${key} is a simulation value in a cosmetic`);
      walk(child, `${path}.${key}`);
    }
  };
  for (const item of CATALOG) {
    walk(item.presentation, `${item.id}.presentation`);
    walk(item.slots, `${item.id}.slots`);
  }
});

test("no hall cosmetic reaches a table slot", () => {
  // The structural half of "the room cannot touch the table": every hall item's
  // payload is checked against every table slot name, so a `hall-*` entry cannot
  // grow a `cloth` or a `balls` key and be quietly picked up by the table view.
  const tableKeys = new Set(TABLE_SLOTS.map((slot) => slot.key));
  for (const item of CATALOG.filter((entry) => entry.type.startsWith("hall-"))) {
    for (const key of Object.keys(item.presentation ?? {})) {
      assert(!tableKeys.has(key), `${item.id} names the table slot "${key}"`);
    }
  }
  // And the resolved payloads are two separate objects sharing nothing.
  const resolved = resolveLoadout(defaultLoadout());
  for (const key of Object.keys(resolved.hall)) {
    assert(!Object.hasOwn(resolved.table, key), `"${key}" is in both domains of a resolved loadout`);
  }
});

test("no cloth is dark enough to render as grey slate", () => {
  // The cabinet shipped this bug once: a dielectric in three.js has a specular
  // floor around 0.04 linear, so a cloth albedo below it lets the pendant's
  // white sheen outweigh the cloth's own colour and the table renders pale
  // grey-blue. The floor is held here so a new "midnight black" cloth fails the
  // suite instead of failing in a browser.
  for (const item of itemsOfType("table-cloth")) {
    const value = luminance(item.presentation.color);
    assert(value >= 0.1, `${item.id} has luminance ${value.toFixed(3)} and will render as slate`);
  }
});

test("every wood finish is a different timber, not the same one in another tint", () => {
  // "If five wood finishes look like five brown hex codes, the feature has
  // failed." A finish must declare a grain style and its own drawing numbers, so
  // the renderer has something to differentiate beyond colour.
  const styles = new Set();
  for (const item of itemsOfType(["table-rail-finish", "table-apron-finish"])) {
    const p = item.presentation;
    assert(typeof p.grainStyle === "string" && p.grainStyle.length > 0, `${item.id} has no grain style`);
    assert(Array.isArray(p.grain) && p.grain.length === 3, `${item.id} needs a three-stop grain`);
    assert(Number.isFinite(p.strokes) && Number.isFinite(p.amplitude), `${item.id} has no grain character`);
    styles.add(p.grainStyle);
  }
  assert(styles.size >= 4, `only ${styles.size} grain styles across the whole timber catalog`);
});

test("the catalog ships at least the content the editor was scoped for", () => {
  // Counts, not names: the point is that no category is a stub with one entry in
  // it, which is the state a cosmetic system quietly ships in.
  const atLeast = {
    "table-cloth": 5,
    "table-rail-finish": 5,
    "table-apron-finish": 3,
    "table-hardware": 4,
    "table-cushion": 3,
    "table-pocket-liner": 3,
    "table-sight": 4,
    "table-decal": 6,
    "ball-set": 4,
    "table-preset": 5,
  };
  for (const [type, minimum] of Object.entries(atLeast)) {
    const count = itemsOfType(type).length;
    assert(count >= minimum, `only ${count} of ${type}, wanted ${minimum}`);
  }
});

// ---------------------------------------------------------------------------
// Slots and presets
// ---------------------------------------------------------------------------

test("every slot has at least one item that fits it", () => {
  for (const domain of ["table", "hall"]) {
    for (const slot of slotsFor(domain)) {
      assert(itemsForSlot(slot).length > 0, `${domain}.${slot.key} accepts nothing in the catalog`);
    }
  }
});

test("every equipment default exists and fits its slot", () => {
  for (const domain of ["table", "hall"]) {
    for (const slot of slotsFor(domain)) {
      const id = DEFAULT_LOADOUT[domain][slot.key];
      if (id === null) {
        assert(!slot.required, `${domain}.${slot.key} is required but defaults to nothing`);
        continue;
      }
      const item = findItem(id);
      assert(item, `the default for ${domain}.${slot.key} is "${id}", which is not in the catalog`);
      assert(slotAccepts(slot, item.type), `the default for ${domain}.${slot.key} is a ${item.type}`);
    }
  }
});

test("every preset references valid item ids", () => {
  for (const preset of CATALOG.filter((item) => item.slots)) {
    for (const [key, id] of Object.entries(preset.slots)) {
      if (id === null) continue;
      assert(findItem(id), `${preset.id} assigns "${id}" to ${key}, which is not in the catalog`);
    }
  }
});

test("every preset assigns compatible item types to real slots", () => {
  for (const preset of CATALOG.filter((item) => item.slots)) {
    const domain = preset.type === "table-preset" ? "table" : "hall";
    const slots = slotsFor(domain);
    for (const [key, id] of Object.entries(preset.slots)) {
      const slot = slots.find((entry) => entry.key === key);
      assert(slot, `${preset.id} assigns a slot "${key}" that does not exist on the ${domain}`);
      if (id === null) {
        assert(!slot.required, `${preset.id} empties the required slot ${key}`);
        continue;
      }
      assert(slotAccepts(slot, findItem(id).type), `${preset.id} puts a ${findItem(id).type} in ${key}, which takes ${typesFor(slot).join("/")}`);
    }
  }
});

test("a preset resolves to a loadout with every slot filled legally", () => {
  for (const preset of presetsOfType("table-preset")) {
    const loadout = applyPreset(defaultLoadout(), preset.id);
    for (const slot of TABLE_SLOTS) {
      const id = loadout.table[slot.key];
      if (id === null) {
        assert(!slot.required, `${preset.id} left ${slot.key} empty`);
        continue;
      }
      assert(slotAccepts(slot, findItem(id).type), `${preset.id} resolved ${slot.key} to the wrong type`);
    }
  }
});

test("a table preset leaves the room alone, and a room preset leaves the table alone", () => {
  const start = defaultLoadout();
  const tabled = applyPreset(start, "preset.table.casino");
  assert(loadoutsEqual({ ...start, table: tabled.table }, tabled), "a table preset touched the hall");

  const roomed = applyPreset(start, "preset.hall.after-hours");
  for (const slot of TABLE_SLOTS) assertEqual(roomed.table[slot.key], start.table[slot.key], "a room preset touched the table");
});

// ---------------------------------------------------------------------------
// Ball sets
// ---------------------------------------------------------------------------

test("every ball set's declared readability matches the measurement", () => {
  for (const [name, set] of Object.entries(BALL_SETS)) {
    const measured = readabilityOf(set);
    for (const [flag, value] of Object.entries(measured)) {
      assertEqual(set.readability[flag], value, `${name} declares ${flag}=${set.readability[flag]} but measures ${value}`);
    }
  }
});

test("every shipped ball set is actually readable", () => {
  // The product rule: cue, 8, solids, stripes and the number must all be
  // obviously identifiable. A set that is attractive and ambiguous is rejected,
  // and this is where it is rejected.
  for (const item of itemsOfType("ball-set")) {
    const flags = item.presentation.readability;
    for (const [flag, value] of Object.entries(flags)) {
      assert(value === true, `${item.id} fails readability: ${flag}`);
    }
  }
});

test("a ball's hue follows the numbering convention in every set", () => {
  for (const set of Object.values(BALL_SETS)) {
    assertEqual(ballColorIn(set, 0), set.cue);
    assertEqual(ballColorIn(set, 8), set.eight);
    for (let n = 1; n <= 7; n++) {
      assertEqual(ballColorIn(set, n), set.solids[n - 1], `solid ${n}`);
      assertEqual(ballColorIn(set, n + 8), set.solids[n - 1], `stripe ${n + 8} must share solid ${n}'s hue`);
    }
  }
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

test("the development inventory owns the whole catalog, and says so", () => {
  assert(DEVELOPMENT_INVENTORY.isDevelopmentGrant, "the grant must be visible, not implied");
  for (const id of allItemIds()) assert(DEVELOPMENT_INVENTORY.isOwned(id), `${id} is not owned under the development grant`);
  assertEqual(DEVELOPMENT_INVENTORY.ownedIds().length, CATALOG.length);
});

test("the locked path is real, not simulated by leaving it out", () => {
  // The reason this matters: if locked state were unwritten, progression would
  // be a rewrite rather than a configuration change. So an empty inventory must
  // actually refuse, and a partial one must actually be partial.
  assertEqual(EMPTY_INVENTORY.isOwned("table.cloth.shark-navy"), false);
  const partial = createInventory({ owned: ["table.cloth.burgundy"] });
  assertEqual(partial.isOwned("table.cloth.burgundy"), true);
  assertEqual(partial.isOwned("table.cloth.gold-dust"), false);
  assertEqual(partial.isOwned("table.cloth.not-a-real-cloth"), false, "an unknown id is never owned");
});

test("an unowned item cannot be equipped through any door", () => {
  const options = { isOwned: (id) => id !== "table.cloth.gold-dust" };
  const forced = equip(defaultLoadout(), "table", "cloth", "table.cloth.gold-dust", options);
  assert(forced.table.cloth !== "table.cloth.gold-dust", "equip let an unowned cloth through");
  const stored = normalizeLoadout({ table: { cloth: "table.cloth.gold-dust" } }, options);
  assert(stored.table.cloth !== "table.cloth.gold-dust", "a stored unowned id was honoured");
});

test("awards require an entitlement even though the grant currently covers them", () => {
  const awards = itemsOfType(["trophy", "plaque", "framed-award", "championship-display"]);
  assert(awards.length >= 4, "the four award types must all exist");
  for (const award of awards) {
    assert(award.entitlement, `${award.id} is equippable purely because it exists in the catalog`);
    assert(award.source.kind !== "development", `${award.id} is development-sourced, so it will never be gated`);
  }
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

test("a loadout naming items this build removed falls back safely", () => {
  const stale = {
    version: 1,
    table: { cloth: "table.cloth.retired-in-2027", balls: "balls.deleted", decal: "table.decal.gone" },
    hall: { walls: "hall.wall.demolished", rug: "hall.rug.vanished" },
  };
  const migrated = normalizeLoadout(stale);
  assertEqual(migrated.table.cloth, DEFAULT_LOADOUT.table.cloth, "a required slot must land on the default");
  assertEqual(migrated.table.balls, DEFAULT_LOADOUT.table.balls);
  assertEqual(migrated.table.decal, null, "an optional slot must land on empty");
  assertEqual(migrated.hall.rug, null);
});

test("an id in the wrong slot is refused rather than drawn", () => {
  const crossed = normalizeLoadout({ table: { cloth: "balls.classic", balls: "table.cloth.burgundy" } });
  assertEqual(crossed.table.cloth, DEFAULT_LOADOUT.table.cloth);
  assertEqual(crossed.table.balls, DEFAULT_LOADOUT.table.balls);
});

test("garbage of any shape produces a complete, usable loadout", () => {
  for (const junk of [null, undefined, 7, "cloth", [], { table: 4, hall: "nope" }, { table: { cloth: 12 } }]) {
    const loadout = normalizeLoadout(junk);
    for (const domain of ["table", "hall"]) {
      for (const slot of slotsFor(domain)) {
        const value = loadout[domain][slot.key];
        assert(value === null || typeof value === "string", `${domain}.${slot.key} came back as ${typeof value}`);
        if (slot.required) assert(value !== null, `${domain}.${slot.key} is required and came back empty`);
      }
    }
  }
});

test("resolving hands the renderer payloads and never an id", () => {
  const resolved = resolveLoadout(applyPreset(defaultLoadout(), "preset.table.tournament-traditional"));
  assert(resolved.table.cloth.color, "a resolved cloth must carry its colour");
  assert(!("id" in resolved.table.cloth), "a payload must not carry the item id");
  assertEqual(resolved.table.decal !== null, true, "that preset equips a decal");
  assertEqual(resolveLoadout(defaultLoadout()).table.decal, null, "an empty slot resolves to null, not a stub");
});

// ---------------------------------------------------------------------------
// The garage: several saved tables
// ---------------------------------------------------------------------------

test("a garage always has at least one table", () => {
  for (const junk of [null, {}, { entries: [] }, { entries: "no" }]) {
    assert(normalizeGarage(junk).entries.length >= 1, "a garage normalized to nothing");
  }
  const one = defaultGarage();
  assertEqual(removeEntry(one, one.activeId).entries.length, 1, "the last table must not be deletable");
});

test("saved tables are capped rather than evicting somebody's work", () => {
  let garage = defaultGarage();
  for (let i = 0; i < MAX_SAVED_LOADOUTS + 4; i++) garage = addEntry(garage, { name: `T${i}`, loadout: defaultLoadout() });
  assertEqual(garage.entries.length, MAX_SAVED_LOADOUTS);
});

test("a garage round-trips through serialization unchanged", () => {
  let garage = addEntry(defaultGarage(), { name: "Casino", loadout: applyPreset(defaultLoadout(), "preset.table.casino") });
  const wire = serializeGarage(garage);
  const back = normalizeGarage(JSON.parse(JSON.stringify(wire)));
  assertEqual(back.activeId, garage.activeId);
  assert(loadoutsEqual(activeLoadout(back), activeLoadout(garage)), "the active table changed over the wire");
});

// ---------------------------------------------------------------------------
// The editor: saved, working, dirty
// ---------------------------------------------------------------------------

/** A store that records what it was asked to persist. The seam, made visible. */
function fakeStore({ available = true, initial = null } = {}) {
  const saves = [];
  return {
    available,
    status: available ? "idle" : "signed-out",
    saves,
    async load() {
      return initial;
    },
    save(garage) {
      saves.push(serializeGarage(garage));
    },
    tick() {},
  };
}

await asyncTest("the editor previews without saving anything", async () => {
  const store = fakeStore();
  const editor = createTableEditor({ store });
  await editor.load();

  assertEqual(editor.dirty, false, "a freshly loaded table is not dirty");
  editor.preview("table", "cloth", "table.cloth.gold-dust");
  assertEqual(editor.working.table.cloth, "table.cloth.gold-dust");
  assertEqual(editor.saved.table.cloth, DEFAULT_LOADOUT.table.cloth, "preview must not touch saved");
  assertEqual(editor.dirty, true);
  assertEqual(store.saves.length, 0, "a preview reached the store");
});

await asyncTest("discard restores the saved table exactly", async () => {
  const editor = createTableEditor({ store: fakeStore() });
  await editor.load();
  const before = { ...editor.saved.table };

  editor.applyPreset("preset.table.midnight");
  editor.preview("table", "decal", "table.decal.card-suits");
  assertEqual(editor.dirty, true);

  editor.discard();
  assertEqual(editor.dirty, false);
  for (const slot of TABLE_SLOTS) assertEqual(editor.working.table[slot.key], before[slot.key], slot.key);
});

await asyncTest("save persists the working ids and clears dirty", async () => {
  const store = fakeStore();
  const editor = createTableEditor({ store });
  await editor.load();

  editor.applyPreset("preset.table.rusty-rail");
  editor.save();

  assertEqual(editor.dirty, false);
  assertEqual(editor.saved.table.cloth, "table.cloth.oxblood");
  assertEqual(store.saves.length, 1, "save must reach the store exactly once");
  const written = store.saves[0].entries.find((entry) => entry.id === store.saves[0].activeId);
  assertEqual(written.table.rail, "table.rail.gunmetal", "the store got the wrong ids");
  assertEqual(written.table.balls, "balls.brass-hall");
});

await asyncTest("reset is a preview of the house table, not a save", async () => {
  const store = fakeStore();
  const editor = createTableEditor({ store });
  await editor.load();
  editor.applyPreset("preset.table.casino");
  editor.save();

  editor.reset();
  assertEqual(editor.working.table.cloth, DEFAULT_LOADOUT.table.cloth);
  assertEqual(editor.saved.table.cloth, "table.cloth.burgundy", "reset wrote over the saved table");
  assertEqual(editor.dirty, true);
  assertEqual(store.saves.length, 1, "reset reached the store");
});

await asyncTest("the editor works with no store at all, and says it cannot save", async () => {
  // Signed out is a NORMAL state: the table must still draw and preview.
  const editor = createTableEditor({ store: fakeStore({ available: false }) });
  await editor.load();
  assertEqual(editor.canSave, false);
  editor.preview("table", "cloth", "table.cloth.plum-hall");
  assertEqual(editor.working.table.cloth, "table.cloth.plum-hall", "a guest must still be able to preview");

  const storeless = createTableEditor({});
  await storeless.load();
  assertEqual(storeless.canSave, false);
  storeless.save();
  assertEqual(storeless.dirty, false, "save must still move the state with no store behind it");
});

await asyncTest("every preview announces a resolved payload the scene can take", async () => {
  const seen = [];
  const editor = createTableEditor({ store: fakeStore(), onChange: (resolved) => seen.push(resolved) });
  await editor.load();
  editor.preview("table", "balls", "balls.neon-run");

  const last = seen.at(-1);
  assertEqual(last.table.balls.readability.numbered, true);
  assert(last.hall, "the hall must come through the same announcement");
  assert(!("id" in last.table.balls), "the scene must never be handed an id");
});

await asyncTest("switching saved tables replaces the working table wholesale", async () => {
  const store = fakeStore();
  const editor = createTableEditor({ store });
  await editor.load();
  editor.applyPreset("preset.table.casino");
  assertEqual(editor.saveAs("Casino Night"), true);
  assertEqual(editor.entries.length, 2);

  const house = editor.entries.find((entry) => !entry.active);
  editor.select(house.id);
  assertEqual(editor.working.table.cloth, DEFAULT_LOADOUT.table.cloth);
  assertEqual(editor.dirty, false);
});

// ---------------------------------------------------------------------------
// Purity and layering
// ---------------------------------------------------------------------------

test("the catalog loads without a browser, a canvas or a THREE object", () => {
  // It already has — this file imported it under node — but the check is worth
  // stating: the moment the catalog needs a renderer to be read, it stops being
  // possible to validate content in CI, and every rule above becomes optional.
  assertEqual(typeof globalThis.document, "undefined", "a test leaked a DOM stub");
  assertEqual(typeof globalThis.THREE, "undefined");
  assert(CATALOG.length > 0);
  for (const item of CATALOG) {
    const payload = JSON.stringify(item);
    assert(!payload.includes("[object"), `${item.id} carries a non-serializable value`);
  }
});

test("the editor's two layouts are both real, and share one tray", () => {
  // "Do not simply stack the desktop layout vertically." The phone layout is a
  // media query over the same markup: one tray, two shapes. This checks the
  // narrow layout actually re-composes rather than merely shrinking, and that
  // the save affordance is repositioned for a thumb rather than left in the bar.
  const css = read("styles/editor.css");
  assert(/@media \(max-width: 720px\)/.test(css), "there is no phone layout");
  assert(/@media \(max-height: 460px\)/.test(css), "there is no landscape-phone layout");
  const phone = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert(/#editorSave[\s\S]{0,400}position: fixed/.test(phone), "the phone layout must bring Save within reach");
  assert(/touch-action: none/.test(css), "one-finger orbit needs touch-action on the drag surface");

  const html = read("index.html");
  assertEqual((html.match(/id="editorGrid"/g) || []).length, 1, "the tray must not be forked per layout");
  assertEqual((html.match(/id="editorTabs"/g) || []).length, 1);
});

test("the editor is reachable from the main menu, not buried in settings", () => {
  const html = read("index.html");
  const main = html.slice(html.indexOf('id="menuMain"'), html.indexOf('id="menuPlayPanel"'));
  assert(main.includes('id="menuTable"'), "My Table is not a main-menu destination");
});

finish();
