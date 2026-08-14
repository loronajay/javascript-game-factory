// The driver screen: who you are, and everything the cabinet knows about you.
//
// Pure. No canvas, no DOM, no storage — this owns the stages, the cursor and the
// view model, and `render/profile.js` draws whatever it says. The same split as
// `setup-menu.js`, `collection.js`, `boards.js` and `garage-editor.js`.
//
// ## One screen, four stages
//
//   card    the driver card, and three rows: name, face, favourite cars
//   name    typing a name, with the keyboard captured
//   avatar  the faces, as a scrolling grid
//   cars    the roster, to pin five
//
// Stages rather than screens, for the campaign map's reason: a picker owns
// nothing but a cursor and ENTER, and every screen costs an input path, a
// debug-handle case and a renderer branch. ESC walks a stage back to the card
// and only then off the screen — the setup screen's pane rule.
//
// ## Everything on the right of the card is derived, not stored
//
// The bests, the ranks, the career, the paints — those belong to
// `records-store`, `progress-store` and the garage, and they are read here and
// shaped into rows. A profile stores only what the player chose. Copying a best
// into the profile document would be a second copy of a number that already has
// an authority, and the two would disagree the first time a run was set on
// another machine.

import { modelById } from "../assets/car-atlas.js";
import { boardUnit, formatValue, recordFor } from "../records/records.js";
import { emptyGarage, presetsForModel } from "../garage/garage.js";
import { collectionModels } from "./collection.js";
import { presetOptionsFor } from "./setup-menu.js";
import { MAX_FAVOURITES, MAX_NAME_LENGTH, NAME_ALPHABET, createFavourite, displayName, favouritePosition, favouritesFull, isFavourite, setAvatar, setName, toggleFavourite } from "../profile/profile.js";
import { AVATAR_GROUPS, avatarById } from "../profile/avatars.js";
import { createTextEntry, entryView, typeChar, backspace } from "./text-entry.js";
import { allBoards } from "./boards.js";
import { trackById } from "./track-layout.js";

export const STAGE_CARD = "card";
export const STAGE_NAME = "name";
export const STAGE_AVATAR = "avatar";
export const STAGE_CARS = "cars";

/** The card's rows, in order. Each opens the stage of the same name. */
export const CARD_ROWS = [
  { id: STAGE_NAME, label: "DRIVER NAME", hint: "TYPE IT, ENTER TO KEEP" },
  { id: STAGE_AVATAR, label: "DRIVER PHOTO", hint: "PICK A FACE" },
  { id: STAGE_CARS, label: "FAVOURITE CARS", hint: `PIN UP TO ${MAX_FAVOURITES}` },
];

/**
 * How many faces are on a row, and how many rows are on screen.
 *
 * Here rather than in the renderer for `COLLECTION_VISIBLE_ROWS`' reason:
 * scrolling is a rule — the cursor may never leave the window, or ENTER would
 * pick a face nobody can see — and a rule belongs where a test can reach it.
 */
export const AVATAR_COLUMNS = 8;
export const AVATAR_VISIBLE_ROWS = 4;

/** How many car rows are on screen. The collection's constant, for its reason. */
export const CAR_VISIBLE_ROWS = 5;

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/**
 * The avatar grid, as rows.
 *
 * A group's faces are chunked across as many rows as they need and the group's
 * name rides on the first of them, so the bands read as bands without the cursor
 * having to walk a heading it cannot pick. Derived from the manifest rather than
 * listed, so adding a face stays a row in `avatars.js` — the collection's
 * property.
 */
export function avatarRows() {
  const rows = [];
  for (const group of AVATAR_GROUPS) {
    for (let start = 0; start < group.avatars.length; start += AVATAR_COLUMNS) {
      rows.push({
        groupId: group.id,
        // Only the first row of a band is captioned; the rest continue it.
        groupLabel: start === 0 ? group.label : "",
        avatars: group.avatars.slice(start, start + AVATAR_COLUMNS),
      });
    }
  }
  return rows;
}

/**
 * The car picker's rows: **a row per model, and its cells are that model's
 * paints** — `Factory` first, then everything saved for it, which is the same
 * list `presetOptionsFor` builds for the setup screen and the collection rather
 * than a second one.
 *
 * This replaced a grid of the 24 bare bodies. The bodies are deliberately
 * neutral, so a picker offering only them could put nothing on the card but
 * factory silver: a player with a garage full of paint had no way to pin any of
 * it. A favourite is a car *as painted*, so the picker has to be the garage.
 *
 * **Painted models come first**, in roster order within each band. The question
 * that brings somebody here is "which of my cars goes on the card", and making
 * them scroll past sixteen untouched bodies to reach the four they built is the
 * whole complaint this screen is answering. The rest of the roster stays
 * reachable underneath, because pinning a factory car is still a legitimate
 * thing to want — and signed out it is the only thing on offer, since the garage
 * needs an account.
 */
export function carRows(garage = emptyGarage()) {
  const rows = collectionModels().map((model) => ({
    modelId: model.id,
    label: model.label,
    groupLabel: model.groupLabel,
    model,
    savedCount: presetsForModel(garage, model.id).length,
  }));
  const painted = rows.filter((row) => row.savedCount > 0);
  const rest = rows.filter((row) => row.savedCount === 0);
  return [...painted, ...rest].map((row, index) => ({
    ...row,
    row: index,
    // The first row of each band carries its caption, so the two halves read as
    // two halves — the avatar grid's arrangement.
    bandLabel: index === 0 ? (painted.length ? "YOUR PAINTED CARS" : "THE ROSTER")
      : index === painted.length && painted.length ? "THE REST OF THE ROSTER"
      : "",
  }));
}

/**
 * One model's cells: its paints, `Factory` first.
 *
 * There is deliberately no `+ New` cell, unlike the collection's rows: this
 * screen pins cars, it does not build them, and an add cell here would open the
 * editor from a picker the player is halfway through using. The garage is one
 * screen away on the mode list.
 */
export function carCells(modelId, garage = emptyGarage()) {
  return presetOptionsFor(modelId, garage).map((option, index) => ({
    modelId,
    presetId: option.id,
    name: option.name,
    livery: option.livery,
    factory: option.factory,
    column: index,
  }));
}

/** The favourite a cell would pin: a body, a paint id and the paint itself. */
function favouriteFor(cell) {
  return cell ? createFavourite({ modelId: cell.modelId, presetId: cell.presetId, livery: cell.livery }) : null;
}

function avatarPosition(avatarId) {
  const rows = avatarRows();
  for (let row = 0; row < rows.length; row += 1) {
    const column = rows[row].avatars.findIndex((avatar) => avatar.id === avatarId);
    if (column >= 0) return { row, column };
  }
  return { row: 0, column: 0 };
}

/**
 * Opens the screen on the card.
 *
 * The pickers open on what the player already has — the face they are wearing,
 * the first car — rather than at the top, so arriving somewhere and pressing a
 * direction moves *from* the current state instead of jumping away from it. The
 * collection's rule.
 */
export function createProfileScreen(profile, garage = emptyGarage()) {
  const at = avatarPosition(profile?.avatarId);
  const car = carPosition(profile?.favourites?.[0], garage);
  return {
    stage: STAGE_CARD,
    row: 0,
    avatar: { ...at, scroll: windowFor(at.row, 0, avatarRows().length) },
    car: { ...car, scroll: windowFor(car.row, 0, carRows(garage).length, CAR_VISIBLE_ROWS) },
    // Null unless the name is being typed. A field that exists while nothing is
    // being edited is a field something can type into by accident.
    entry: null,
  };
}

/** Keeps `scroll` such that `row` is on screen, and never past the last page. */
function windowFor(row, scroll, rows, visible = AVATAR_VISIBLE_ROWS) {
  const last = Math.max(0, rows - visible);
  const held = clamp(scroll, last);
  if (row < held) return row;
  if (row > held + visible - 1) return clamp(row - visible + 1, last);
  return held;
}

/**
 * Where the car cursor opens: on a pin if there is one, so arriving from a card
 * that already names a car shows that car rather than the top of the list. The
 * collection's rule, and the avatar picker's.
 */
function carPosition(favourite, garage) {
  const rows = carRows(garage);
  const row = Math.max(0, rows.findIndex((entry) => entry.modelId === favourite?.modelId));
  const cells = carCells(rows[row]?.modelId ?? "", garage);
  const column = Math.max(0, cells.findIndex((cell) => cell.presetId === (favourite?.presetId ?? null)));
  return { row, column };
}

function moveAvatar(screen, direction) {
  const rows = avatarRows();
  let { row, column } = screen.avatar;
  if (direction === "up") row -= 1;
  else if (direction === "down") row += 1;
  else if (direction === "left") column -= 1;
  else if (direction === "right") column += 1;
  else return screen;

  row = clamp(row, rows.length - 1);
  // Rows are different lengths — a band of five sits under a band of eight — so
  // a column has to land somewhere real in the row it arrives in.
  column = clamp(column, rows[row].avatars.length - 1);
  return { ...screen, avatar: { row, column, scroll: windowFor(row, screen.avatar.scroll, rows.length) } };
}

function moveCars(screen, direction, garage) {
  const rows = carRows(garage);
  let { row, column } = screen.car;
  if (direction === "up") row -= 1;
  else if (direction === "down") row += 1;
  else if (direction === "left") column -= 1;
  else if (direction === "right") column += 1;
  else return screen;

  row = clamp(row, rows.length - 1);
  // Rows are different lengths — a car with six paints sits above one with none
  // — so a column has to land somewhere real in the row it arrives in.
  column = clamp(column, carCells(rows[row].modelId, garage).length - 1);
  return {
    ...screen,
    car: { row, column, scroll: windowFor(row, screen.car.scroll, rows.length, CAR_VISIBLE_ROWS) },
  };
}

/**
 * Walks whichever cursor is live. Nothing wraps: both grids are deep enough
 * that a wrapping cursor is one you lose, which is the collection's argument.
 *
 * The name stage has no cursor at all — every key there is a character — so a
 * direction is deliberately inert rather than quietly moving something behind
 * the field.
 */
export function moveProfileScreen(screen, direction, { garage = emptyGarage() } = {}) {
  switch (screen.stage) {
    case STAGE_CARD: {
      if (direction !== "up" && direction !== "down") return screen;
      const step = direction === "up" ? -1 : 1;
      return { ...screen, row: clamp(screen.row + step, CARD_ROWS.length - 1) };
    }
    case STAGE_AVATAR:
      return moveAvatar(screen, direction);
    case STAGE_CARS:
      return moveCars(screen, direction, garage);
    default:
      return screen;
  }
}

/** The face the avatar cursor is on. */
export function selectedAvatar(screen) {
  const rows = avatarRows();
  const row = rows[clamp(screen.avatar.row, rows.length - 1)];
  return row.avatars[clamp(screen.avatar.column, row.avatars.length - 1)] ?? null;
}

/** The car — body *and* paint — the roster cursor is on. */
export function selectedCar(screen, garage = emptyGarage()) {
  const rows = carRows(garage);
  const row = rows[clamp(screen.car.row, rows.length - 1)];
  if (!row) return null;
  const cells = carCells(row.modelId, garage);
  return cells[clamp(screen.car.column, cells.length - 1)] ?? null;
}

/**
 * ENTER. Returns the next screen and the profile it produced — the profile
 * unchanged where the key only moved between stages.
 *
 * The two pickers behave differently on purpose. A face is *one* choice, so
 * picking one closes the stage: the player came here to change it and has. The
 * cars are five choices, so pinning one leaves the grid open — closing after
 * each would mean four more trips through the card to fill the list.
 */
export function confirmProfileScreen(screen, profile, { garage = emptyGarage() } = {}) {
  switch (screen.stage) {
    case STAGE_CARD: {
      const stage = CARD_ROWS[clamp(screen.row, CARD_ROWS.length - 1)].id;
      if (stage === STAGE_NAME) {
        return {
          screen: {
            ...screen,
            stage: STAGE_NAME,
            entry: createTextEntry({
              value: profile.name,
              maxLength: MAX_NAME_LENGTH,
              alphabet: NAME_ALPHABET,
              // Mixed case: a driver called "Jay" should be able to be "Jay".
              upperCase: false,
            }),
          },
          profile,
        };
      }
      return { screen: { ...screen, stage }, profile };
    }

    case STAGE_NAME:
      // Committing empties the field deliberately as well as fills it: clearing
      // a name is a choice, and the card prints DRIVER for it.
      return { screen: { ...screen, stage: STAGE_CARD, entry: null }, profile: setName(profile, screen.entry?.value ?? "") };

    case STAGE_AVATAR:
      return { screen: { ...screen, stage: STAGE_CARD }, profile: setAvatar(profile, selectedAvatar(screen)?.id) };

    case STAGE_CARS: {
      const car = favouriteFor(selectedCar(screen, garage));
      // A no-op when the list is full and this car is not on it. The view says
      // so, which is what stops the refusal reading as a dead control — see
      // `toggleFavourite`.
      return { screen, profile: car ? toggleFavourite(profile, car) : profile };
    }

    default:
      return { screen, profile };
  }
}

/**
 * ESC. A stage steps back to the card; the card leaves the screen, which is the
 * shell's business rather than this module's — hence `exit` rather than a screen
 * change, exactly as `cancelSetup` reports it.
 *
 * Backing out of the name stage throws the typing away, which is what makes
 * trying a name safe — the garage editor's rule about its working copy.
 */
export function cancelProfileScreen(screen) {
  if (screen.stage === STAGE_CARD) return { screen, exit: true };
  return { screen: { ...screen, stage: STAGE_CARD, entry: null }, exit: false };
}

/** A typed character, while the name stage is up. Inert everywhere else. */
export function typeIntoProfile(screen, char) {
  if (screen.stage !== STAGE_NAME || !screen.entry) return screen;
  return { ...screen, entry: typeChar(screen.entry, char) };
}

export function backspaceProfile(screen) {
  if (screen.stage !== STAGE_NAME || !screen.entry) return screen;
  return { ...screen, entry: backspace(screen.entry) };
}

/** Whether the keyboard has to be captured — the one impure consequence. */
export function profileCapturesText(screen) {
  return screen.stage === STAGE_NAME;
}

/**
 * Puts the cursor on something the player clicked, and reports whether the click
 * was on the live stage's own grid.
 *
 * A click carries an absolute row, so it can reach anything visible directly;
 * the window does not move, because what was clicked is by definition inside it.
 */
export function focusProfileScreen(screen, target, { garage = emptyGarage() } = {}) {
  if (!target) return screen;
  if (target.kind === "row" && Number.isFinite(target.index)) {
    return { ...screen, row: clamp(target.index, CARD_ROWS.length - 1) };
  }
  if (target.kind === "avatar" && Number.isFinite(target.row)) {
    const rows = avatarRows();
    const row = clamp(target.row, rows.length - 1);
    return { ...screen, avatar: { ...screen.avatar, row, column: clamp(target.column, rows[row].avatars.length - 1) } };
  }
  if (target.kind === "car" && Number.isFinite(target.row)) {
    const rows = carRows(garage);
    const row = clamp(target.row, rows.length - 1);
    const cells = carCells(rows[row].modelId, garage);
    return { ...screen, car: { ...screen.car, row, column: clamp(target.column, cells.length - 1) } };
  }
  return screen;
}

/** Scrolls the avatar window, pulling the cursor along — the collection's rule. */
export function scrollProfileAvatars(screen, step) {
  const rows = avatarRows();
  const last = Math.max(0, rows.length - AVATAR_VISIBLE_ROWS);
  const scroll = clamp(screen.avatar.scroll + step, last);
  if (scroll === screen.avatar.scroll) return screen;
  const row = clamp(
    screen.avatar.row < scroll ? scroll
      : screen.avatar.row > scroll + AVATAR_VISIBLE_ROWS - 1 ? scroll + AVATAR_VISIBLE_ROWS - 1
      : screen.avatar.row,
    rows.length - 1,
  );
  return {
    ...screen,
    avatar: { row, column: clamp(screen.avatar.column, rows[row].avatars.length - 1), scroll },
  };
}

/** The same, for the car list. Both arrows drag their cursor along with them. */
export function scrollProfileCars(screen, step, { garage = emptyGarage() } = {}) {
  const rows = carRows(garage);
  const last = Math.max(0, rows.length - CAR_VISIBLE_ROWS);
  const scroll = clamp(screen.car.scroll + step, last);
  if (scroll === screen.car.scroll) return screen;
  const row = clamp(
    screen.car.row < scroll ? scroll
      : screen.car.row > scroll + CAR_VISIBLE_ROWS - 1 ? scroll + CAR_VISIBLE_ROWS - 1
      : screen.car.row,
    rows.length - 1,
  );
  const cells = carCells(rows[row].modelId, garage);
  return { ...screen, car: { row, column: clamp(screen.car.column, cells.length - 1), scroll } };
}

/** Which scroll a stage's arrows drive. The two pickers both have a window. */
export function scrollProfileScreen(screen, step, options = {}) {
  if (screen.stage === STAGE_CARS) return scrollProfileCars(screen, step, options);
  return scrollProfileAvatars(screen, step);
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * The player's bests as the card prints them: every board, driven or not.
 *
 * Every board gets a row for the boards screen's reason — the question that
 * brings somebody to a profile is as much "what have I not done" as "what have
 * I done" — and the list is derived from `allBoards()` rather than written
 * again, so a board the screen shows is always one a run can reach.
 */
function bestRows(records, ranks) {
  return allBoards().map((board) => {
    const record = recordFor(records ?? {}, board.id);
    const model = record?.modelId ? modelById(record.modelId) : null;
    const track = record?.trackId ? trackById(record.trackId) : null;
    const rank = Number.isFinite(Number(ranks?.[board.id])) ? Number(ranks[board.id]) : null;
    return {
      boardId: board.id,
      modeId: board.modeId,
      label: board.label.toUpperCase(),
      // The mode is named as well as the objective, because "SPRINT" and
      // "QUARTER" only tell two different stories if you already know which
      // list they came from.
      modeLabel: board.modeId === "time-attack" ? "TIME ATTACK" : "DISTANCE",
      value: record ? formatValue(boardUnit(board.modeId), record.value) : "—",
      driven: Boolean(record),
      rank,
      carLabel: model?.label ?? "",
      trackLabel: track?.label ?? "",
    };
  });
}

/**
 * Everything the renderer needs, with no atlas, garage or record lookups of its
 * own — the shaping rule every other screen here follows.
 *
 * `hover` rides through the options rather than through the screen so pointing
 * at a face can never be mistaken for choosing one: on the two pickers the
 * cursor *is* the pick, which is the setup screen's rule.
 */
export function profileScreenView(screen, profile, {
  records = {},
  ranks = {},
  garage = null,
  campaign = null,
  synced = false,
  hover = null,
} = {}) {
  const avatar = avatarById(profile.avatarId);
  const rows = avatarRows();
  const scroll = clamp(screen.avatar.scroll, Math.max(0, rows.length - AVATAR_VISIBLE_ROWS));
  const bests = bestRows(records, ranks);
  const driven = bests.filter((row) => row.driven).length;

  const isHover = (kind, a, b) =>
    Boolean(hover && hover.kind === kind && hover.row === a && hover.column === b);

  return {
    stage: screen.stage,
    name: displayName(profile),
    // Separate from `name` because the field and the card say different things
    // about an empty name: the card prints DRIVER, the field prints nothing.
    rawName: profile.name,
    avatar,
    // Whether edits are reaching the server. The card says so rather than
    // pretending — the records screen's `SIGN IN TO RANK YOUR TIMES` rule.
    synced,
    rows: CARD_ROWS.map((row, index) => ({
      ...row,
      index,
      selected: screen.stage === STAGE_CARD && index === screen.row,
      hovered: Boolean(hover && hover.kind === "row" && hover.index === index),
      // What the row is currently set to, so the card reads as a summary rather
      // than as a menu of things you cannot see the state of.
      value: row.id === STAGE_NAME ? displayName(profile)
        : row.id === STAGE_AVATAR ? (avatar?.label ?? "—")
        : `${profile.favourites.length} OF ${MAX_FAVOURITES}`,
    })),

    // The pinned cars, in the order they were pinned. Empty slots are carried as
    // nulls rather than dropped, so the strip is always five cells wide and the
    // card does not reflow as pins are added.
    favourites: Array.from({ length: MAX_FAVOURITES }, (_, index) => {
      const pin = profile.favourites[index];
      const model = modelById(pin?.modelId ?? "");
      if (!model) return { index, modelId: null, label: "", presetName: "", model: null, livery: null };
      // The paint the player pinned, re-read from the garage where that preset
      // still exists so a re-colour shows here — see `refreshFavourites`, which
      // is what makes the same thing true of the copy on the server.
      const preset = pin.presetId ? presetsForModel(garage ?? emptyGarage(), model.id)
        .find((entry) => entry.id === pin.presetId) : null;
      return {
        index,
        modelId: model.id,
        label: model.label,
        presetName: preset?.name ?? (pin.presetId ? "Saved paint" : "Factory"),
        model,
        livery: preset?.livery ?? pin.livery,
      };
    }),

    bests,
    // The counters under the bests. Deliberately few: a profile is a card, not a
    // telemetry dump, and every one of these has to be a number a player
    // recognises about themselves.
    summary: {
      boardsDriven: driven,
      boardsTotal: bests.length,
      paints: garage?.presets?.length ?? 0,
      carsPainted: garage ? new Set(garage.presets.map((preset) => preset.modelId)).size : 0,
      eventsCleared: campaign?.eventsCleared ?? 0,
      eventsTotal: campaign?.eventsTotal ?? 0,
      races: campaign?.attempts ?? 0,
    },

    avatarPicker: {
      scroll,
      totalRows: rows.length,
      visibleRows: AVATAR_VISIBLE_ROWS,
      canScrollUp: scroll > 0,
      canScrollDown: scroll + AVATAR_VISIBLE_ROWS < rows.length,
      rows: rows.slice(scroll, scroll + AVATAR_VISIBLE_ROWS).map((row, screenRow) => {
        const absolute = scroll + screenRow;
        return {
          groupLabel: row.groupLabel,
          row: absolute,
          screenRow,
          cells: row.avatars.map((entry, column) => ({
            ...entry,
            row: absolute,
            screenRow,
            column,
            selected: screen.avatar.row === absolute && screen.avatar.column === column,
            hovered: isHover("avatar", absolute, column),
            worn: entry.id === profile.avatarId,
          })),
        };
      }),
    },

    carPicker: (() => {
      const rows = carRows(garage ?? emptyGarage());
      const carScroll = clamp(screen.car.scroll ?? 0, Math.max(0, rows.length - CAR_VISIBLE_ROWS));
      return {
        // The ceiling is on the view rather than left to the renderer to count,
        // because the screen has to say *why* a press did nothing.
        full: favouritesFull(profile),
        pinned: profile.favourites.length,
        limit: MAX_FAVOURITES,
        // How much paint there is to pin. Zero is the signed-out state as much
        // as the never-customised one, and the screen says which — the garage
        // needs an account, and a player who cannot see why the picker is all
        // factory silver will read it as the bug they just reported.
        paints: (garage?.presets?.length ?? 0),
        scroll: carScroll,
        totalRows: rows.length,
        visibleRows: CAR_VISIBLE_ROWS,
        canScrollUp: carScroll > 0,
        canScrollDown: carScroll + CAR_VISIBLE_ROWS < rows.length,
        rows: rows.slice(carScroll, carScroll + CAR_VISIBLE_ROWS).map((row, screenRow) => ({
          modelId: row.modelId,
          label: row.label,
          groupLabel: row.groupLabel,
          bandLabel: row.bandLabel,
          model: row.model,
          savedCount: row.savedCount,
          row: row.row,
          screenRow,
          cells: carCells(row.modelId, garage ?? emptyGarage()).map((cell) => ({
            ...cell,
            model: row.model,
            row: row.row,
            screenRow,
            selected: screen.car.row === row.row && screen.car.column === cell.column,
            hovered: isHover("car", row.row, cell.column),
            pinned: isFavourite(profile, cell),
            // Where it sits on the card, so a cell can wear its number rather
            // than the player counting the strip to find out.
            pin: favouritePosition(profile, cell),
          })),
        })),
      };
    })(),

    entry: screen.entry ? entryView(screen.entry) : null,
  };
}
