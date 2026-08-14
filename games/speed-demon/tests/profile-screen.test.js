import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  AVATAR_VISIBLE_ROWS,
  CARD_ROWS,
  STAGE_AVATAR,
  STAGE_CARD,
  STAGE_CARS,
  STAGE_NAME,
  avatarRows,
  backspaceProfile,
  cancelProfileScreen,
  CAR_VISIBLE_ROWS,
  carCells,
  carRows,
  confirmProfileScreen,
  createProfileScreen,
  focusProfileScreen,
  moveProfileScreen,
  profileCapturesText,
  profileScreenView,
  scrollProfileAvatars,
  scrollProfileCars,
  selectedAvatar,
  selectedCar,
  typeIntoProfile,
} from "../scripts/ui/profile.js";
import { MAX_FAVOURITES, createProfile, isFavourite } from "../scripts/profile/profile.js";
import { emptyGarage, savePreset } from "../scripts/garage/garage.js";
import { allAvatars, avatarById } from "../scripts/profile/avatars.js";
import { allBoards } from "../scripts/ui/boards.js";
import { allModels } from "../scripts/assets/car-atlas.js";
import {
  PROFILE_LAYOUT,
  avatarCellRect,
  avatarScrollRect,
  carCellRect,
  carScrollRect,
  hitProfile,
  profileRowRect,
} from "../scripts/render/profile.js";
import { WORLD } from "../scripts/render/scene.js";

suite("profile screen — the card, the pickers, and what they draw");

const profile = () => createProfile({ name: "Ren" });
const viewOf = (screen, p = profile(), options = {}) => profileScreenView(screen, p, options);

/**
 * A garage with paint in it. The picker's cells are the garage's paints now, so
 * almost nothing about this screen can be checked against an empty one.
 */
function paintedGarage() {
  const [first, second] = allModels();
  let garage = savePreset(emptyGarage(), { modelId: first.id, name: "Lime", livery: { paint: { hue: 110, saturation: 0.8 } } });
  garage = savePreset(garage, { modelId: first.id, name: "Indigo", livery: { paint: { hue: 250, saturation: 0.8 } } });
  garage = savePreset(garage, { modelId: second.id, name: "Gold", livery: { paint: { hue: 45, saturation: 0.9 } } });
  return garage;
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

test("the screen opens on the card, on the face already worn", () => {
  const worn = allAvatars()[10];
  const screen = createProfileScreen(createProfile({ avatarId: worn.id }));
  assertEqual(screen.stage, STAGE_CARD);
  assertEqual(selectedAvatar(screen).id, worn.id, "the picker opens away from the current face");
});

test("each card row opens its own stage, and ESC walks back to the card", () => {
  let screen = createProfileScreen(profile());
  CARD_ROWS.forEach((row, index) => {
    const opened = confirmProfileScreen({ ...screen, row: index }, profile());
    assertEqual(opened.screen.stage, row.id, `${row.id} did not open`);
    const backed = cancelProfileScreen(opened.screen);
    assertEqual(backed.screen.stage, STAGE_CARD);
    assertEqual(backed.exit, false, "backing out of a picker must not leave the screen");
  });
  assertEqual(cancelProfileScreen(screen).exit, true, "ESC on the card leaves");
  screen = null;
});

test("the keyboard is captured only while a name is being typed", () => {
  // `B`, `N`, `L`, `P` and `F` are stereo keys everywhere else in the cabinet,
  // so a field that did not suppress them would pause the music mid-name.
  const card = createProfileScreen(profile());
  assert(!profileCapturesText(card));
  const typing = confirmProfileScreen(card, profile()).screen;
  assert(profileCapturesText(typing));
});

test("typing edits the field, and only ENTER commits it", () => {
  const start = createProfile({ name: "Ren" });
  let screen = confirmProfileScreen(createProfileScreen(start), start).screen;
  screen = backspaceProfile(backspaceProfile(backspaceProfile(screen)));
  for (const char of "Mako") screen = typeIntoProfile(screen, char);
  assertEqual(screen.entry.value, "Mako");

  const abandoned = cancelProfileScreen(screen);
  assertEqual(abandoned.screen.entry, null, "the field is thrown away with the stage");

  const kept = confirmProfileScreen(screen, start);
  assertEqual(kept.profile.name, "Mako");
  assertEqual(kept.screen.stage, STAGE_CARD);
});

test("typing does nothing outside the name stage", () => {
  const card = createProfileScreen(profile());
  assertEqual(typeIntoProfile(card, "x"), card);
  assertEqual(backspaceProfile(card), card);
});

test("picking a face closes the picker; pinning a car does not", () => {
  // One choice against five: closing after each pin would mean four more trips
  // through the card to fill the list.
  const start = profile();
  let screen = { ...createProfileScreen(start), stage: STAGE_AVATAR };
  screen = moveProfileScreen(screen, "right");
  const picked = confirmProfileScreen(screen, start);
  assertEqual(picked.screen.stage, STAGE_CARD);
  assertEqual(picked.profile.avatarId, selectedAvatar(screen).id);

  const garage = paintedGarage();
  const cars = { ...createProfileScreen(start, garage), stage: STAGE_CARS };
  const pinned = confirmProfileScreen(cars, start, { garage });
  assertEqual(pinned.screen.stage, STAGE_CARS, "the roster stays open");
  assert(isFavourite(pinned.profile, selectedCar(cars, garage)));
  // …and pressing it again takes the pin off.
  assertEqual(confirmProfileScreen(pinned.screen, pinned.profile, { garage }).profile.favourites.length, 0);
});

test("the picker offers the paints in the garage, not just the bare bodies", () => {
  // The complaint this screen answers: a player with a garage full of paint
  // could pin nothing but factory silver, because the bodies are neutral and a
  // favourite was a model id.
  const garage = paintedGarage();
  const [first] = allModels();
  const cells = carCells(first.id, garage);
  assertEqual(cells.length, 3, "Factory plus the two paints saved for it");
  assertEqual(cells[0].factory, true, "Factory is still the first cell");
  assert(cells.slice(1).every((cell) => cell.presetId), "a saved paint has to carry its id");

  // …and pinning one puts *that paint* on the card.
  const screen = { ...createProfileScreen(profile(), garage), stage: STAGE_CARS, car: { row: 0, column: 1, scroll: 0 } };
  const { profile: next } = confirmProfileScreen(screen, profile(), { garage });
  assertEqual(next.favourites[0].modelId, first.id);
  assertEqual(next.favourites[0].presetId, cells[1].presetId);
  assertEqual(next.favourites[0].livery.paint.hue, cells[1].livery.paint.hue);
});

test("the same car in two paints is two pins", () => {
  // A pin is a car as painted, so pinning the lime one must not read as having
  // already pinned the indigo one.
  const garage = paintedGarage();
  let screen = { ...createProfileScreen(profile(), garage), stage: STAGE_CARS, car: { row: 0, column: 1, scroll: 0 } };
  let next = confirmProfileScreen(screen, profile(), { garage }).profile;
  screen = moveProfileScreen(screen, "right", { garage });
  next = confirmProfileScreen(screen, next, { garage }).profile;
  assertEqual(next.favourites.length, 2);
  assertEqual(next.favourites[0].modelId, next.favourites[1].modelId);
});

test("painted cars are listed before the rest of the roster", () => {
  // Scrolling past sixteen untouched bodies to reach the four you built is the
  // whole complaint.
  const garage = paintedGarage();
  const rows = carRows(garage);
  assertEqual(rows.length, allModels().length, "every model still gets a row");
  assert(rows[0].savedCount > 0 && rows[1].savedCount > 0, "the painted cars are not at the top");
  assertEqual(rows[2].savedCount, 0);
  assertEqual(rows[2].bandLabel, "THE REST OF THE ROSTER");
});

test("the car cursor is never outside the visible window", () => {
  const garage = paintedGarage();
  let screen = { ...createProfileScreen(profile(), garage), stage: STAGE_CARS, car: { row: 0, column: 0, scroll: 0 } };
  for (let i = 0; i < carRows(garage).length + 4; i += 1) {
    screen = moveProfileScreen(screen, "down", { garage });
    const { row, scroll } = screen.car;
    assert(row >= scroll && row < scroll + CAR_VISIBLE_ROWS, `row ${row} is outside the window at ${scroll}`);
  }
  const scrolled = scrollProfileCars({ ...screen, car: { row: 0, column: 0, scroll: 0 } }, 1, { garage });
  assert(scrolled.car.row >= scrolled.car.scroll);
});

test("a cursor never leaves a grid, whatever the row length", () => {
  // The bands and the archetypes are different lengths, so a column has to land
  // somewhere real in the row it arrives in.
  const start = profile();
  let screen = { ...createProfileScreen(start), stage: STAGE_AVATAR, avatar: { row: 0, column: 0, scroll: 0 } };
  for (let i = 0; i < 40; i += 1) screen = moveProfileScreen(screen, "right");
  for (let i = 0; i < 40; i += 1) screen = moveProfileScreen(screen, "down");
  assert(selectedAvatar(screen), "the avatar cursor walked off the grid");

  const garage = paintedGarage();
  let cars = { ...createProfileScreen(start, garage), stage: STAGE_CARS };
  for (let i = 0; i < 40; i += 1) cars = moveProfileScreen(cars, "right", { garage });
  for (let i = 0; i < 40; i += 1) cars = moveProfileScreen(cars, "down", { garage });
  assert(selectedCar(cars, garage), "the car cursor walked off the grid");
});

test("the avatar cursor is never outside the visible window", () => {
  // A cursor parked off screen makes ENTER pick a face nobody can see.
  const start = profile();
  let screen = { ...createProfileScreen(start), stage: STAGE_AVATAR, avatar: { row: 0, column: 0, scroll: 0 } };
  for (let i = 0; i < avatarRows().length + 4; i += 1) {
    screen = moveProfileScreen(screen, "down");
    const { row, scroll } = screen.avatar;
    assert(row >= scroll && row < scroll + AVATAR_VISIBLE_ROWS, `row ${row} is outside the window at ${scroll}`);
  }
  // …and scrolling pulls the cursor along rather than leaving it behind.
  const scrolled = scrollProfileAvatars({ ...screen, avatar: { row: 0, column: 0, scroll: 0 } }, 1);
  assert(scrolled.avatar.row >= scrolled.avatar.scroll);
});

test("a direction is inert on the card's sideways axis and in the name field", () => {
  const card = createProfileScreen(profile());
  assertEqual(moveProfileScreen(card, "left"), card);
  const typing = confirmProfileScreen(card, profile()).screen;
  assertEqual(moveProfileScreen(typing, "down"), typing, "a direction must not move something behind the field");
});

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

test("every board gets a row, driven or not", () => {
  // The question that brings a player here is as much what they have *not* done.
  const view = viewOf(createProfileScreen(profile()));
  assertEqual(view.bests.length, allBoards().length);
  for (const best of view.bests) {
    assert(allBoards().some((board) => board.id === best.boardId), `${best.boardId} is not a real board`);
    assertEqual(best.driven, false);
    assertEqual(best.value, "—", "an undriven board must not print a time");
  }
});

test("a driven board prints its time, its car and its rank", () => {
  const board = allBoards()[0];
  const view = viewOf(createProfileScreen(profile()), profile(), {
    records: { [board.id]: { boardId: board.id, value: 12128, modelId: allModels()[0].id, trackId: "track-a" } },
    ranks: { [board.id]: 3 },
  });
  const row = view.bests.find((best) => best.boardId === board.id);
  assert(row.driven);
  assertEqual(row.value, "12.128s");
  assertEqual(row.rank, 3);
  assertEqual(row.carLabel, allModels()[0].label);
});

test("an unfetched rank is null rather than zero", () => {
  // `Number(null)` is 0, which reads as a real placing — the records module keeps
  // `toNumber` for exactly this trap.
  const view = viewOf(createProfileScreen(profile()));
  for (const best of view.bests) assertEqual(best.rank, null);
});

test("the favourites strip is always five cells wide", () => {
  // Carrying the empty slots is what stops the card reflowing as pins are added.
  const view = viewOf(createProfileScreen(profile()), createProfile({ favourites: [allModels()[0].id] }));
  assertEqual(view.favourites.length, MAX_FAVOURITES);
  assertEqual(view.favourites[0].modelId, allModels()[0].id);
  assertEqual(view.favourites[1].modelId, null);
});

test("the roster view says when the list is full, and where each pin sits", () => {
  const garage = paintedGarage();
  const full = createProfile({ favourites: allModels().slice(0, MAX_FAVOURITES).map((model) => model.id) });
  const view = viewOf({ ...createProfileScreen(full, garage), stage: STAGE_CARS }, full, { garage });
  assert(view.carPicker.full, "a refusal with no reason on screen is a dead control");
  // Only the visible window is shaped, so the pins on screen are the ones whose
  // model is in it — what matters is that each says where it sits on the card.
  const pinned = view.carPicker.rows.flatMap((row) => row.cells).filter((cell) => cell.pinned);
  assert(pinned.length > 0, "a pinned car in the window is not marked as pinned");
  for (const cell of pinned) {
    assert(cell.pin >= 1 && cell.pin <= MAX_FAVOURITES, "a pin has to know where it sits");
    assertEqual(cell.presetId, null, "a model-id pin is a factory pin");
  }
});

test("hover marks a cell without moving the cursor", () => {
  // On both pickers the cursor *is* the pick — the setup screen's rule.
  const view = viewOf({ ...createProfileScreen(profile()), stage: STAGE_AVATAR }, profile(), {
    hover: { kind: "avatar", row: 0, column: 2 },
  });
  const cells = view.avatarPicker.rows[0].cells;
  assert(cells[2].hovered);
  assert(!cells[2].selected, "hovering must not select");
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

test("every panel on the card fits on screen and nothing collides", () => {
  const rects = [
    { what: "card", ...PROFILE_LAYOUT.card },
    { what: "favourites", ...PROFILE_LAYOUT.favourites },
    { what: "bests", ...PROFILE_LAYOUT.bests },
    { what: "summary", ...PROFILE_LAYOUT.summary },
    ...CARD_ROWS.map((row, index) => ({ what: `row ${row.id}`, ...profileRowRect(index) })),
  ];
  for (const rect of rects) {
    assert(rect.x >= 0 && rect.y >= 0, `${rect.what} starts off screen`);
    assert(rect.x + rect.width <= WORLD.width, `${rect.what} runs off the right edge`);
    assert(rect.y + rect.height <= WORLD.height, `${rect.what} runs off the bottom`);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert(!overlaps(rects[i], rects[j]), `${rects[i].what} overlaps ${rects[j].what}`);
    }
  }
  assert(
    PROFILE_LAYOUT.legend.y > profileRowRect(CARD_ROWS.length - 1).y + PROFILE_LAYOUT.rows.height,
    "the legend prints over the last row",
  );
});

test("every grid cell fits on screen and nothing collides with the scroll arrows", () => {
  const cells = [];
  for (let row = 0; row < AVATAR_VISIBLE_ROWS; row += 1) {
    // The widest band decides whether the grid still fits.
    const widest = Math.max(...avatarRows().map((entry) => entry.avatars.length));
    for (let column = 0; column < widest; column += 1) {
      cells.push({ what: `face ${row}/${column}`, ...avatarCellRect(row, column) });
    }
  }
  const garage = paintedGarage();
  const carCellRects = [];
  for (let row = 0; row < CAR_VISIBLE_ROWS; row += 1) {
    // The widest row the garage can produce — Factory plus every paint a model
    // may hold — is what decides whether the strip still fits.
    const widest = Math.max(...carRows(garage).map((entry) => carCells(entry.modelId, garage).length));
    for (let column = 0; column < widest; column += 1) {
      carCellRects.push({ what: `car ${row}/${column}`, ...carCellRect(row, column) });
    }
  }
  const arrows = [
    ...[-1, 1].map((step) => ({ what: `face scroll ${step}`, ...avatarScrollRect(step) })),
    ...[-1, 1].map((step) => ({ what: `car scroll ${step}`, ...carScrollRect(step) })),
  ];

  for (const rect of [...cells, ...carCellRects, ...arrows]) {
    assert(rect.x >= 0 && rect.y >= 0, `${rect.what} starts off screen`);
    assert(rect.x + rect.width <= WORLD.width, `${rect.what} runs off the right edge`);
    assert(rect.y + rect.height <= WORLD.height, `${rect.what} runs off the bottom`);
  }
  for (const cell of [...cells, ...carCellRects]) {
    for (const arrow of arrows) {
      assert(!overlaps(cell, arrow), `${cell.what} runs under ${arrow.what}`);
    }
  }
});

test("every drawn target is clickable, and reports what the cursor would take", () => {
  // The `menuListBox` rule: the geometry drawn is the geometry the mouse reads.
  const card = viewOf(createProfileScreen(profile()));
  for (const row of card.rows) {
    const rect = profileRowRect(row.index);
    const hit = hitProfile(card, rect.x + rect.width / 2, rect.y + rect.height / 2);
    assert(hit && hit.kind === "row" && hit.index === row.index, `card row ${row.id} is not clickable`);
  }

  const faces = viewOf({ ...createProfileScreen(profile()), stage: STAGE_AVATAR });
  for (const row of faces.avatarPicker.rows) {
    for (const cell of row.cells) {
      const rect = avatarCellRect(row.screenRow, cell.column);
      const hit = hitProfile(faces, rect.x + rect.width / 2, rect.y + rect.height / 2);
      assert(hit && hit.kind === "avatar", `face ${cell.id} is not clickable`);
      assertEqual(hit.row, cell.row, "a face reported its screen position rather than its row");
      // …and focusing on that hit lands the cursor on the face that was drawn
      // there, which is what makes one click pick it.
      const focused = focusProfileScreen({ ...createProfileScreen(profile()), stage: STAGE_AVATAR }, hit);
      assertEqual(selectedAvatar(focused).id, cell.id);
      assert(avatarById(cell.id), `${cell.id} does not resolve`);
    }
  }

  const garage = paintedGarage();
  const cars = viewOf({ ...createProfileScreen(profile(), garage), stage: STAGE_CARS }, profile(), { garage });
  for (const row of cars.carPicker.rows) {
    for (const cell of row.cells) {
      const rect = carCellRect(row.screenRow, cell.column);
      const hit = hitProfile(cars, rect.x + rect.width / 2, rect.y + rect.height / 2);
      assert(hit && hit.kind === "car", `${cell.modelId} is not clickable`);
      assertEqual(hit.row, cell.row);
    }
  }
});

test("a picker drawn over the card swallows the clicks that would hit it", () => {
  // Otherwise a click on a face would also fire the row behind it, which the
  // player cannot see.
  const faces = viewOf({ ...createProfileScreen(profile()), stage: STAGE_AVATAR });
  const behind = profileRowRect(0);
  const hit = hitProfile(faces, behind.x + 4, behind.y + 4);
  assert(!hit || hit.kind !== "row", "a card row answered a click while a picker was up");

  const typing = viewOf(confirmProfileScreen(createProfileScreen(profile()), profile()).screen);
  assertEqual(hitProfile(typing, behind.x + behind.width / 2, behind.y + behind.height / 2), null);
});

test("a dead scroll arrow is not a target", () => {
  // The collection's rule: a dead arrow must not eat a click meant for a face.
  const top = viewOf({ ...createProfileScreen(profile()), stage: STAGE_AVATAR, avatar: { row: 0, column: 0, scroll: 0 } });
  const up = avatarScrollRect(-1);
  const hit = hitProfile(top, up.x + 2, up.y + 2);
  assert(!hit || hit.kind !== "scroll", "the up arrow answered while there was nothing above");
});

finish();
