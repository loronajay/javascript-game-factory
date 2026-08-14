import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  VERSUS_ENTRANCE_SECONDS,
  VERSUS_SECONDS,
  createVersus,
  playerSide,
  rivalSide,
  stepVersus,
  versusDone,
  versusView,
} from "../scripts/ui/versus.js";
import { VS_FOOTER, VS_SLOTS, slotRect, splashRect } from "../scripts/render/versus.js";
import { createProfile } from "../scripts/profile/profile.js";
import { avatarById } from "../scripts/profile/avatars.js";
import { lineupFor, GHOST_ID } from "../scripts/rival/lineup.js";
import { RIVALS, rivalCardSrc } from "../scripts/rival/rivals.js";
import { WORLD } from "../scripts/render/scene.js";

suite("versus — the two drivers, before the tree");

const profile = createProfile({ name: "Ren" });
const ghost = {
  boardId: "distance:quarter",
  value: 12128,
  modelId: "toro-sv",
  events: [{ t: 0, k: "s", v: 0 }],
};

test("the player's side wears their own name and face", () => {
  const side = playerSide(profile, { stat: "PB 12.128s" });
  assertEqual(side.name, "REN");
  assertEqual(side.tag, "YOU");
  assertEqual(side.imageSrc, avatarById(profile.avatarId).cardSrc);
  assertEqual(side.stat, "PB 12.128s");
});

test("an unnamed driver still has something on the plate", () => {
  // The card is drawn before anybody has visited the profile screen.
  assertEqual(playerSide(createProfile({})).name, "DRIVER");
});

test("a roster rival brings their portrait", () => {
  const entry = lineupFor("distance:quarter").find((row) => row.id === RIVALS[0].id);
  const side = rivalSide(entry, {});
  assertEqual(side.name, entry.name.toUpperCase());
  assertEqual(side.imageSrc, rivalCardSrc(RIVALS[0]));
});

test("a ghost wears the player's own face, labelled as the ghost", () => {
  // It *is* them. A generic plate opposite their own portrait would read as a
  // third driver rather than as the run they are chasing.
  const entry = lineupFor("distance:quarter", ghost).find((row) => row.id === GHOST_ID);
  const side = rivalSide(entry, { profile });
  assertEqual(side.tag, "YOUR GHOST");
  assertEqual(side.name, "REN");
  assertEqual(side.imageSrc, avatarById(profile.avatarId).cardSrc);
});

test("a driver who is on no roster has no portrait, and that is normal", () => {
  // A campaign event fields anonymous locals rather than spending one of the ten
  // faces, so the card falls back to the initial on a plate.
  const side = rivalSide({ id: "local-1", kind: "cpu", name: "A local", initial: "L", accent: "#888" }, {});
  assertEqual(side.imageSrc, null);
  assertEqual(side.initial, "L");
});

test("there is no card at all without somebody to face", () => {
  assertEqual(rivalSide(null, {}), null);
  assertEqual(versusView(null), null);
});

test("the curtain lifts by itself, and the bar says it is going to", () => {
  let versus = createVersus({ player: playerSide(profile), opponent: null, headline: "Rival race" });
  assert(!versusDone(versus));
  assertEqual(versusView(versus).hold, 0);

  versus = stepVersus(versus, VERSUS_SECONDS / 2);
  assert(Math.abs(versusView(versus).hold - 0.5) < 0.001);
  assert(!versusDone(versus));

  versus = stepVersus(versus, VERSUS_SECONDS / 2);
  assert(versusDone(versus));
  assertEqual(versusView(versus).hold, 1, "the bar must not run past its own end");
});

test("the entrance finishes well before the hold does", () => {
  // Otherwise the two halves would still be sliding in as the card lifts.
  assert(VERSUS_ENTRANCE_SECONDS * 2 < VERSUS_SECONDS);
  const versus = stepVersus(createVersus({ player: playerSide(profile), opponent: null }), VERSUS_ENTRANCE_SECONDS);
  assertEqual(versusView(versus).entrance, 1);
});

test("the headline and subtitle are shouted, because the card is", () => {
  const view = versusView(createVersus({
    player: playerSide(profile),
    opponent: null,
    headline: "First light",
    subtitle: "Quarter mile · Grasslands",
  }));
  assertEqual(view.headline, "FIRST LIGHT");
  assertEqual(view.subtitle, "QUARTER MILE · GRASSLANDS");
});

// ---------------------------------------------------------------------------
// The slots
// ---------------------------------------------------------------------------

test("both slots land on screen, inside the frame they are measured from", () => {
  // They are fractions of the *image*, mapped through the same cover transform
  // the image is drawn with, so they cannot drift off their painted borders.
  const frame = splashRect(null);
  for (const side of ["player", "opponent"]) {
    const rect = slotRect(side, null);
    assert(rect.x >= 0 && rect.y >= 0, `the ${side} slot starts off screen`);
    assert(rect.x + rect.width <= WORLD.width, `the ${side} slot runs off the right edge`);
    assert(rect.y + rect.height <= WORLD.height, `the ${side} slot runs off the bottom`);
    assert(rect.x >= frame.x - 0.001 && rect.x + rect.width <= frame.x + frame.width + 0.001,
      `the ${side} slot is outside the artwork`);
  }
});

test("the two slots do not overlap, and the player's is the left one", () => {
  // The artwork's own red frame is on the left; a card that put the player on
  // the right would have their accent fighting the paint.
  const player = slotRect("player", null);
  const opponent = slotRect("opponent", null);
  assert(player.x + player.width < opponent.x, "the two slots overlap");
  assert(VS_SLOTS.player.x < VS_SLOTS.opponent.x);
});

test("everything under the slots is stacked, not printed through", () => {
  // The car, the stat line, the timer bar and the hint all share the ~150px
  // between the foot of the painted frame and the edge of the screen. The first
  // cut drew the bar straight through the cars, which is what this pins.
  const slot = slotRect("player", null);
  const carBottom = VS_FOOTER.car.top + VS_FOOTER.car.height;
  assert(slot.y + slot.height < VS_FOOTER.car.top, "the car overlaps the slot above it");
  assert(carBottom < VS_FOOTER.stat.y, "the stat line prints through the car");
  assert(VS_FOOTER.stat.y < VS_FOOTER.bar.y, "the timer bar prints through the stat line");
  assert(VS_FOOTER.bar.y + VS_FOOTER.bar.height < VS_FOOTER.hint.y, "the hint prints through the bar");
  assert(VS_FOOTER.hint.y < WORLD.height, "the hint is off the bottom");
});

finish();
