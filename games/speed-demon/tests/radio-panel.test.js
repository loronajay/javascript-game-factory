import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";

import {
  MARQUEE_TICKS,
  RADIO_LAYOUT,
  STRIP_HOLD_SECONDS,
  VOLUME_SEGMENTS,
  buttonRect,
  formatClock,
  hitRadio,
  listWindow,
  marqueeOffset,
  marqueePhase,
  radioView,
  rowRect,
  stripAlpha,
  visibleRows,
} from "../scripts/ui/radio-panel.js";
import {
  LOOP_OFF,
  LOOP_ONE,
  createRadio,
  moveCursor,
  nextTrack,
  playPause,
} from "../scripts/radio/playlist.js";
import {
  LIBRARY_IDLE,
  LIBRARY_LOCKED,
  LIBRARY_READY,
} from "../scripts/radio/library-status.js";

suite("radio panel — the head unit's geometry and readout");

const listOf = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    title: `Track ${i}`,
    artist: i % 2 === 0 ? "Someone" : null,
    folder: "album",
    extension: "mp3",
  }));

const ready = (folderName = "Music") => ({
  status: LIBRARY_READY,
  folderName,
  message: null,
  supported: true,
});

const silent = { elapsed: 0, duration: 0, ready: false };

// --- clock ------------------------------------------------------------------

test("the clock reads as a clock", () => {
  assertEqual(formatClock(0), "0:00");
  assertEqual(formatClock(9), "0:09");
  assertEqual(formatClock(65), "1:05");
  assertEqual(formatClock(3661), "1:01:01");
});

test("a clock the element has not worked out yet does not print NaN", () => {
  assertEqual(formatClock(NaN), "0:00");
  assertEqual(formatClock(-1), "0:00");
});

// --- the playlist window ----------------------------------------------------

test("a short folder is shown whole, from the top", () => {
  assertEqual(listWindow(4, 3, 7), 0);
});

test("a long folder scrolls with the cursor kept off both edges", () => {
  const visible = 7;
  const first = listWindow(100, 50, visible);
  assert(first < 50 && 50 < first + visible, "the cursor fell outside its own window");
  assert(50 - first >= 2 && first + visible - 50 >= 2, "the cursor is pinned to an edge");
});

test("the window never runs past either end of the folder", () => {
  assertEqual(listWindow(100, 0, 7), 0);
  assertEqual(listWindow(100, 99, 7), 93);
});

test("the list box has room for the rows it claims to show", () => {
  const list = RADIO_LAYOUT.list;
  const rows = visibleRows();
  assert(rows >= 5, `only ${rows} rows fit — the playlist is not worth scrolling`);
  const last = rowRect(rows - 1);
  assert(last.y + last.height <= list.y + list.height, "the last row spills out of the list panel");
});

// --- the transport row ------------------------------------------------------

test("the five buttons fill their row exactly", () => {
  const box = RADIO_LAYOUT.buttons;
  const first = buttonRect(0);
  const last = buttonRect(4);
  assertEqual(first.x, box.x);
  assertClose(last.x + last.width, box.x + box.width, 0.001);
});

test("no two buttons overlap", () => {
  for (let i = 0; i < 4; i += 1) {
    assert(buttonRect(i).x + buttonRect(i).width <= buttonRect(i + 1).x + 0.001, `button ${i} runs into ${i + 1}`);
  }
});

test("every button names the key that works it", () => {
  // These keys are live on every screen and the faceplate is the only place the
  // game tells the player about them.
  const view = radioView(createRadio({ tracks: listOf(3) }), silent, ready(), {});
  for (const button of view.buttons) {
    assert(button.key, `${button.id} has no key caption`);
  }
  assertEqual(new Set(view.buttons.map((b) => b.key)).size, view.buttons.length, "two buttons share a key");
});

test("the transport is dead with no tracks, except the repeat mode", () => {
  const view = radioView(createRadio(), silent, { ...ready(), status: LIBRARY_IDLE }, {});
  const enabled = view.buttons.filter((button) => button.enabled).map((button) => button.id);
  assertDeepEqual(enabled, ["loop"], "a button was live with nothing to play");
});

test("the play button says what pressing it will do", () => {
  const stopped = radioView(createRadio({ tracks: listOf(2) }), silent, ready(), {});
  const going = radioView(playPause(createRadio({ tracks: listOf(2) })), silent, ready(), {});
  assert(stopped.buttons[1].label.includes("PLAY"));
  assert(going.buttons[1].label.includes("PAUSE"));
});

// --- the display ------------------------------------------------------------

test("the display names the track, its place in the folder, and the clock", () => {
  const radio = nextTrack(createRadio({ tracks: listOf(12) }));
  const view = radioView(radio, { elapsed: 65, duration: 200, ready: true }, ready(), {});
  assertEqual(view.track.title, "Track 1");
  assertEqual(view.track.position, 2);
  assertEqual(view.total, 12);
  assertEqual(view.clock.elapsed, "1:05");
  assertEqual(view.clock.duration, "3:20");
  assertClose(view.clock.progress, 0.325, 0.001);
});

test("an unknown duration shows as unknown rather than as zero", () => {
  const view = radioView(createRadio({ tracks: listOf(2) }), silent, ready(), {});
  assertEqual(view.clock.duration, "--:--");
  assertEqual(view.clock.progress, 0);
});

test("each empty state says what to press, not just what is wrong", () => {
  for (const status of [LIBRARY_IDLE, LIBRARY_LOCKED]) {
    const view = radioView(createRadio(), silent, { ...ready(), status }, {});
    assertEqual(view.hasTracks, false);
    assert(view.lines.headline, `${status} has no headline`);
    assert(view.lines.prompt, `${status} does not tell the player what to press`);
  }
});

test("a folder with no audio in it says so rather than looking broken", () => {
  const view = radioView(createRadio(), silent, ready("Photos"), {});
  assert(view.lines.headline.includes("NO AUDIO"));
});

test("the volume readout is a whole number of percent", () => {
  const view = radioView(createRadio({ tracks: listOf(1), volume: 0.35 }), silent, ready(), {});
  assertEqual(view.volumePercent, 35);
  assertEqual(view.volumeSegments.length, VOLUME_SEGMENTS);
  assertEqual(view.volumeSegments.filter(Boolean).length, 4);
});

test("silence lights no segments and full volume lights them all", () => {
  const none = radioView(createRadio({ tracks: listOf(1), volume: 0 }), silent, ready(), {});
  const all = radioView(createRadio({ tracks: listOf(1), volume: 1 }), silent, ready(), {});
  assertEqual(none.volumeSegments.filter(Boolean).length, 0);
  assertEqual(all.volumeSegments.filter(Boolean).length, VOLUME_SEGMENTS);
});

test("the repeat lamp knows the difference between off and repeat-one", () => {
  const off = radioView(createRadio({ tracks: listOf(1), loop: LOOP_OFF }), silent, ready(), {});
  const one = radioView(createRadio({ tracks: listOf(1), loop: LOOP_ONE }), silent, ready(), {});
  assertEqual(off.looping, false);
  assertEqual(one.looping, true);
  assertEqual(one.repeatingOne, true);
});

// --- the list ---------------------------------------------------------------

test("the playing row is marked whether or not the cursor is on it", () => {
  // Browsing a long folder must never lose track of what is actually in the deck.
  let radio = createRadio({ tracks: listOf(20) });
  radio = moveCursor(moveCursor(radio, "down"), "down");
  const view = radioView(radio, silent, ready(), {});
  const current = view.list.rows.filter((row) => row.current);
  const highlighted = view.list.rows.filter((row) => row.highlighted);
  assertEqual(current.length, 1);
  assertEqual(highlighted.length, 1);
  assert(current[0].index !== highlighted[0].index, "the test did not actually move the cursor away");
});

test("the list reports its own scroll position only when there is something to scroll", () => {
  const short = radioView(createRadio({ tracks: listOf(3) }), silent, ready(), {});
  const long = radioView(createRadio({ tracks: listOf(300) }), silent, ready(), {});
  assertEqual(short.list.scrollable, false);
  assertEqual(long.list.scrollable, true);
  assertEqual(long.list.rows.length, visibleRows());
});

test("row numbers are the track's place in the whole folder, not in the window", () => {
  const radio = { ...createRadio({ tracks: listOf(300) }), cursor: 120 };
  const view = radioView(radio, silent, ready(), {});
  assertEqual(view.list.rows.find((row) => row.highlighted).number, "121");
});

// --- motion -----------------------------------------------------------------

test("a title that fits does not scroll", () => {
  for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
    assertEqual(marqueeOffset(phase, 0), 0);
  }
});

test("a long title scrolls all the way and comes back, dwelling at both ends", () => {
  const overflow = 200;
  assertEqual(marqueeOffset(0, overflow), 0, "should dwell at the start");
  assertEqual(marqueeOffset(0.55, overflow), -overflow, "should dwell at the end");
  assertEqual(marqueeOffset(0.99, overflow), 0, "should come back to the start");
  const mid = marqueeOffset(0.31, overflow);
  assert(mid < 0 && mid > -overflow, "the middle of the sweep is not moving");
});

test("the marquee never scrolls past what it has to show", () => {
  const overflow = 120;
  for (let i = 0; i <= 100; i += 1) {
    const offset = marqueeOffset(i / 100, overflow);
    assert(offset <= 0 && offset >= -overflow, `phase ${i / 100} scrolled to ${offset}`);
  }
});

test("the marquee phase wraps cleanly on the tick clock", () => {
  assertEqual(marqueePhase(0), 0);
  assertEqual(marqueePhase(MARQUEE_TICKS), 0);
  assertClose(marqueePhase(MARQUEE_TICKS / 2), 0.5, 1e-9);
});

// --- the mouse ---------------------------------------------------------------

const centreOf = (box) => [box.x + box.width / 2, box.y + box.height / 2];
const populated = (count = 20) => radioView(createRadio({ tracks: listOf(count) }), silent, ready(), {});

test("every drawn button is clickable, and reports the button it looks like", () => {
  // A canvas faceplate with five drawn buttons on it is a promise. This is the
  // test that the promise is kept for all five.
  const view = populated();
  view.buttons.forEach((button, index) => {
    const [x, y] = centreOf(buttonRect(index));
    assertDeepEqual(hitRadio(view, x, y), { kind: "button", id: button.id }, `${button.id} is not clickable`);
  });
});

test("a disabled button is not clickable, so a dead folder cannot be pressed", () => {
  const empty = radioView(createRadio(), silent, { ...ready(), status: LIBRARY_IDLE }, {});
  const [x, y] = centreOf(buttonRect(0)); // PREV, disabled with no tracks
  assertEqual(hitRadio(empty, x, y), null);
});

test("clicking a playlist row names the track in the whole folder, not in the window", () => {
  const view = radioView({ ...createRadio({ tracks: listOf(300) }), cursor: 120 }, silent, ready(), {});
  const row = view.list.rows[2];
  const [x, y] = centreOf(rowRect(row.offset));
  assertDeepEqual(hitRadio(view, x, y), { kind: "row", index: row.index });
  assert(row.index > 100, "the test did not actually scroll the window");
});

test("the volume bar reports the level at the point it was clicked", () => {
  const view = populated();
  const bar = RADIO_LAYOUT.volume;
  const y = bar.y + 28;
  assertClose(hitRadio(view, bar.x + 1, y).value, 0, 0.02);
  assertClose(hitRadio(view, bar.x + bar.width / 2, y).value, 0.5, 0.02);
  assertClose(hitRadio(view, bar.x + bar.width - 1, y).value, 1, 0.02);
});

test("the volume bar's own label is not part of the bar", () => {
  // The percentage sits above it and the key hint below; dragging either would
  // yank the volume to whatever end of the strip the pointer happened to be on.
  const view = populated();
  const bar = RADIO_LAYOUT.volume;
  assertEqual(hitRadio(view, bar.x + 10, bar.y + 2), null, "the label row grabbed the drag");
  assertEqual(hitRadio(view, bar.x + 10, bar.y + bar.height - 2), null, "the hint row grabbed the drag");
});

test("the folder slot is clickable", () => {
  const [x, y] = centreOf(RADIO_LAYOUT.folder);
  assertDeepEqual(hitRadio(populated(), x, y), { kind: "folder" });
});

test("with no folder the display itself is the way in", () => {
  // That is where the player is already looking when it says NO FOLDER SET.
  const empty = radioView(createRadio(), silent, { ...ready(), status: LIBRARY_IDLE }, {});
  const [x, y] = centreOf(RADIO_LAYOUT.display);
  assertDeepEqual(hitRadio(empty, x, y), { kind: "folder" });
});

test("the display is not a folder button once there is music in it", () => {
  const [x, y] = centreOf(RADIO_LAYOUT.display);
  assertEqual(hitRadio(populated(), x, y), null, "clicking the now-playing readout re-opened the picker");
});

test("empty space hits nothing, and a nonsense point does not throw", () => {
  const view = populated();
  assertEqual(hitRadio(view, 5, 700), null);
  assertEqual(hitRadio(view, NaN, NaN), null);
  assertEqual(hitRadio(view, undefined, undefined), null);
});

test("no two targets claim the same pixel", () => {
  // Overlapping hit boxes are how you get a click that plays a track *and*
  // reopens the folder picker.
  const view = populated();
  const boxes = [
    ...view.buttons.map((_, i) => buttonRect(i)),
    ...view.list.rows.map((row) => rowRect(row.offset)),
    RADIO_LAYOUT.folder,
    { x: RADIO_LAYOUT.volume.x, y: RADIO_LAYOUT.volume.y + 16, width: RADIO_LAYOUT.volume.width, height: 26 },
  ];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const hit = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert(!hit, `two click targets overlap at ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    }
  }
});

test("the hover the renderer draws is the target a click would hit", () => {
  // Same function, one resolved from the finished view — so what lights up under
  // the pointer is provably what pressing there does.
  const [x, y] = centreOf(buttonRect(2));
  const view = radioView(createRadio({ tracks: listOf(5) }), silent, ready(), { pointer: { x, y } });
  assertDeepEqual(view.hover, { kind: "button", id: "next" });
});

test("no pointer means no hover, rather than a hover at the origin", () => {
  assertEqual(populated().hover, null);
});

test("the now-playing strip holds, then fades, then is gone", () => {
  assertEqual(stripAlpha(0), 1);
  assertEqual(stripAlpha(STRIP_HOLD_SECONDS), 1);
  const fading = stripAlpha(STRIP_HOLD_SECONDS + 0.4);
  assert(fading > 0 && fading < 1, `mid-fade alpha was ${fading}`);
  assertEqual(stripAlpha(60), 0);
  assertEqual(stripAlpha(Infinity), 0, "a session with no radio activity must not draw the strip");
});

finish();
