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

import { modelsByGroup, modelById } from "../assets/car-atlas.js";
import { boardUnit, formatValue, recordFor } from "../records/records.js";
import { presetsForModel } from "../garage/garage.js";
import { MAX_FAVOURITES, MAX_NAME_LENGTH, NAME_ALPHABET, displayName, favouritesFull, isFavourite, setAvatar, setName, toggleFavourite } from "../profile/profile.js";
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

/** The roster as the car grid walks it: a row per archetype. */
export function carRows() {
  return modelsByGroup().map((group) => ({
    groupId: group.id,
    groupLabel: group.label,
    models: group.models,
  }));
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
export function createProfileScreen(profile) {
  const at = avatarPosition(profile?.avatarId);
  return {
    stage: STAGE_CARD,
    row: 0,
    avatar: { ...at, scroll: windowFor(at.row, 0, avatarRows().length) },
    car: { row: 0, column: 0 },
    // Null unless the name is being typed. A field that exists while nothing is
    // being edited is a field something can type into by accident.
    entry: null,
  };
}

/** Keeps `scroll` such that `row` is on screen, and never past the last page. */
function windowFor(row, scroll, rows) {
  const last = Math.max(0, rows - AVATAR_VISIBLE_ROWS);
  const held = clamp(scroll, last);
  if (row < held) return row;
  if (row > held + AVATAR_VISIBLE_ROWS - 1) return clamp(row - AVATAR_VISIBLE_ROWS + 1, last);
  return held;
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

function moveCars(screen, direction) {
  const rows = carRows();
  let { row, column } = screen.car;
  if (direction === "up") row -= 1;
  else if (direction === "down") row += 1;
  else if (direction === "left") column -= 1;
  else if (direction === "right") column += 1;
  else return screen;

  row = clamp(row, rows.length - 1);
  column = clamp(column, rows[row].models.length - 1);
  return { ...screen, car: { row, column } };
}

/**
 * Walks whichever cursor is live. Nothing wraps: both grids are deep enough
 * that a wrapping cursor is one you lose, which is the collection's argument.
 *
 * The name stage has no cursor at all — every key there is a character — so a
 * direction is deliberately inert rather than quietly moving something behind
 * the field.
 */
export function moveProfileScreen(screen, direction) {
  switch (screen.stage) {
    case STAGE_CARD: {
      if (direction !== "up" && direction !== "down") return screen;
      const step = direction === "up" ? -1 : 1;
      return { ...screen, row: clamp(screen.row + step, CARD_ROWS.length - 1) };
    }
    case STAGE_AVATAR:
      return moveAvatar(screen, direction);
    case STAGE_CARS:
      return moveCars(screen, direction);
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

/** The car the roster cursor is on. */
export function selectedCar(screen) {
  const rows = carRows();
  const row = rows[clamp(screen.car.row, rows.length - 1)];
  return row.models[clamp(screen.car.column, row.models.length - 1)] ?? null;
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
export function confirmProfileScreen(screen, profile) {
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
      const car = selectedCar(screen);
      // A no-op when the list is full and this car is not on it. The view says
      // so, which is what stops the refusal reading as a dead control — see
      // `toggleFavourite`.
      return { screen, profile: car ? toggleFavourite(profile, car.id) : profile };
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
export function focusProfileScreen(screen, target) {
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
    const rows = carRows();
    const row = clamp(target.row, rows.length - 1);
    return { ...screen, car: { row, column: clamp(target.column, rows[row].models.length - 1) } };
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
      const model = modelById(profile.favourites[index] ?? "");
      return model
        ? {
            index,
            modelId: model.id,
            label: model.label,
            model,
            // Whichever paint they have saved for it first, so a pinned car
            // shows in the player's own colours rather than factory silver.
            livery: garage ? (presetsForModel(garage, model.id)[0]?.livery ?? null) : null,
          }
        : { index, modelId: null, label: "", model: null, livery: null };
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

    carPicker: {
      // The ceiling is on the view rather than left to the renderer to count,
      // because the screen has to say *why* a press did nothing.
      full: favouritesFull(profile),
      pinned: profile.favourites.length,
      limit: MAX_FAVOURITES,
      rows: carRows().map((row, rowIndex) => ({
        groupLabel: row.groupLabel,
        row: rowIndex,
        cells: row.models.map((model, column) => ({
          modelId: model.id,
          label: model.label,
          model,
          row: rowIndex,
          column,
          selected: screen.car.row === rowIndex && screen.car.column === column,
          hovered: isHover("car", rowIndex, column),
          pinned: isFavourite(profile, model.id),
          // Where it sits on the card, so a cell can wear its number rather than
          // the player counting the strip to find out.
          pin: profile.favourites.indexOf(model.id) + 1,
        })),
      })),
    },

    entry: screen.entry ? entryView(screen.entry) : null,
  };
}
