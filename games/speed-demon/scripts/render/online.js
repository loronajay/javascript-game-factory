// The online screens: getting into a match, and what the server said about one.
//
// Canvas only. Every decision has already been made — `ui/online-menu.js` shapes
// the view and `online/session.js` holds what the server has told us, so nothing
// here resolves an id, compares a cursor to an index, or works out who won.
//
// Two surfaces:
//   - `drawOnlineScreen` replaces the world (home, the code field, searching,
//     the lobby), sitting on the splash the same way the mode list does.
//   - `drawOnlineResult` is a panel drawn *over* a live race, alongside the
//     instrument cluster, because a round result belongs to the run that just
//     happened and the strip should still be under it.

import { WORLD } from "./scene.js";
import { dimWorld, drawMenuBackdrop, menuPanel, wrapText } from "./menus.js";
// Boxes come from the ui layer, which is also what resolves a click against
// them. Two copies of this table is exactly the bug where the button you can see
// and the button you can press are in different places.
import { ONLINE_LAYOUT, RESULT_PANEL, resultButtons } from "../ui/online-menu.js";

/** A drawn button. Every click target on this screen has one of these under it. */
function drawButton(ctx, rect, label, { live = false, muted = false } = {}) {
  menuPanel(ctx, rect.x, rect.y, rect.width, rect.height, { live });
  ctx.save();
  ctx.fillStyle = muted ? MUTED : live ? ACCENT : INK;
  ctx.font = "700 18px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.restore();
}

const ACCENT = "#ff5a2e";
const INK = "#f4f1ea";
const MUTED = "rgba(244, 241, 234, 0.56)";

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function drawOnlineScreen(ctx, view, { splashImage } = {}) {
  drawMenuBackdrop(ctx, splashImage, { alpha: 0.9, scrim: 0.52 });

  ctx.save();
  // Both are set explicitly rather than assumed. `save` preserves whatever the
  // previous draw left behind, and the instrument cluster's readouts legitimately
  // centre and right-align their text — inheriting that put the headline half a
  // panel to the left of where it belongs.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "700 46px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("ONLINE VERSUS", ONLINE_LAYOUT.title.x, ONLINE_LAYOUT.title.y);

  ctx.font = "500 18px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText(subtitleFor(view), ONLINE_LAYOUT.title.x, ONLINE_LAYOUT.title.y + 30);

  if (view.pane === "home") drawHome(ctx, view);
  else if (view.pane === "join") drawJoin(ctx, view);
  else if (view.pane === "searching") drawSearching(ctx, view);
  else if (view.pane === "lobby" && view.lobby) drawLobby(ctx, view.lobby, view.hover);

  if (view.error) {
    ctx.fillStyle = "#ff6b5a";
    ctx.font = "600 18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(view.error, ONLINE_LAYOUT.footer.x, ONLINE_LAYOUT.footer.y + 26);
  }
  ctx.restore();
}

function subtitleFor(view) {
  if (view.pane === "join") return "Type the five characters you were sent · ESC to go back";
  if (view.pane === "searching") return "Looking for a driver · ESC to stop";
  if (view.pane === "lobby") return "ESC to leave the room";
  return "Best of three · two red lights in a round forfeits it · ESC to go back";
}

function drawHome(ctx, view) {
  const { panel, row } = ONLINE_LAYOUT;
  view.home.forEach((item, index) => {
    const y = panel.y + index * (row.height + row.gap);
    const live = item.highlighted || item.hovered;
    menuPanel(ctx, panel.x, y, panel.width, row.height, { live });
    ctx.fillStyle = item.highlighted ? ACCENT : INK;
    ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, panel.x + 24, y + row.height / 2);
  });

  // The detail panel explains whichever way in the cursor is on, so choosing is
  // not a blind commitment — the same contract the mode list keeps.
  const chosen = view.home.find((item) => item.highlighted);
  if (!chosen) return;
  const { detail } = ONLINE_LAYOUT;
  menuPanel(ctx, detail.x, detail.y, detail.width, 190);
  ctx.fillStyle = INK;
  ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(chosen.label, detail.x + 24, detail.y + 42);
  ctx.font = "400 17px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  wrapText(ctx, chosen.blurb, detail.width - 48).forEach((line, i) => {
    ctx.fillText(line, detail.x + 24, detail.y + 76 + i * 24);
  });
}

function drawJoin(ctx, view) {
  const { code } = ONLINE_LAYOUT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  view.join.slots.forEach((slot) => {
    const x = code.x + slot.index * (code.slot + code.gap);
    menuPanel(ctx, x, code.y, code.slot, code.height, { live: slot.caret });
    ctx.fillStyle = slot.filled ? INK : MUTED;
    ctx.font = "700 44px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(slot.char || "", x + code.slot / 2, code.y + code.height / 2);
    // The caret is a bar under the next empty slot rather than a blinking line,
    // because nothing on this screen redraws fast enough for a blink to read.
    if (slot.caret) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x + 18, code.y + code.height - 18, code.slot - 36, 3);
    }
  });

  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = "400 16px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(view.join.hint, code.x, code.y + code.height + 40);

  const hovering = view.hover?.kind;
  // The button only exists once the code is whole — an inert one the player can
  // press and watch do nothing is worse than one that is not offered yet.
  if (view.join.complete) {
    drawButton(ctx, ONLINE_LAYOUT.submit, "JOIN ROOM", { live: hovering === "join-submit" });
  } else {
    drawButton(ctx, ONLINE_LAYOUT.submit, `${view.join.value.length} / ${view.join.length}`, { muted: true });
  }
  drawButton(ctx, ONLINE_LAYOUT.back, "BACK", { live: hovering === "back" });
}

function drawSearching(ctx, view) {
  const { panel } = ONLINE_LAYOUT;
  menuPanel(ctx, panel.x, panel.y, panel.width, 160, { live: true });
  ctx.fillStyle = INK;
  ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("SEARCHING…", panel.x + 28, panel.y + 60);
  ctx.font = "400 17px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText("You will be paired with the next driver looking.", panel.x + 28, panel.y + 96);
  drawButton(ctx, ONLINE_LAYOUT.cancel, "STOP LOOKING", { live: view.hover?.kind === "cancel-search" });
}

function drawLobby(ctx, lobby, hover) {
  const { panel, detail, row } = ONLINE_LAYOUT;

  // Who is here. This driver is always the left card.
  lobby.drivers.forEach((driver, index) => {
    const y = panel.y + index * 108;
    menuPanel(ctx, panel.x, y, panel.width, 96, { live: driver.you });
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = driver.you ? ACCENT : INK;
    ctx.font = "700 24px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(driver.you ? `${driver.displayName} (you)` : driver.displayName, panel.x + 24, y + 40);
    ctx.font = "500 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    // The label, resolved by `lobbyView` — this printed the raw model id before,
    // so a card read "kaido-gts" while the row two panels over read "Kaido GTS".
    ctx.fillText(driver.modelLabel, panel.x + 24, y + 68);
    if (driver.ready) {
      ctx.fillStyle = "#7ddf87";
      ctx.font = "700 16px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("STAGED", panel.x + panel.width - 96, y + 40);
    }
  });

  if (lobby.waitingFor) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(lobby.waitingFor, panel.x + 24, panel.y + 250);
  }

  if (lobby.roomCode && lobby.isPrivate) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("ROOM CODE", panel.x + 24, panel.y + 320);
    ctx.fillStyle = ACCENT;
    ctx.font = "700 40px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(lobby.roomCode, panel.x + 24, panel.y + 366);
  }

  // What is being raced. Live for the host, dimmed but legible for the guest —
  // a race whose settings one driver cannot see is one they did not agree to.
  lobby.rows.forEach((entry, index) => {
    const y = detail.y + index * (row.height + row.gap);
    const live = entry.highlighted || entry.hovered;
    menuPanel(ctx, detail.x, y, detail.width, row.height, { live });
    ctx.textBaseline = "middle";
    ctx.globalAlpha = entry.dimmed ? 0.55 : 1;

    if (entry.button) {
      ctx.fillStyle = entry.highlighted ? ACCENT : INK;
      ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(entry.value, detail.x + detail.width / 2, y + row.height / 2);
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = "600 15px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText(entry.label, detail.x + 24, y + row.height / 2);
      ctx.fillStyle = entry.highlighted ? ACCENT : INK;
      ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "right";
      // Kept clear of the stepper arrows when there are any, so the value never
      // prints over a control the player is meant to be able to hit.
      const valueRight = entry.adjustable
        ? detail.x + detail.width - ONLINE_LAYOUT.step.inset - ONLINE_LAYOUT.step.width - 20
        : detail.x + detail.width - 24;
      ctx.fillText(entry.value, valueRight, y + row.height / 2);
      ctx.textAlign = "left";
      // Drawn at the boxes the hit test uses, so the arrow you can see and the
      // arrow you can press are the same thing.
      if (entry.adjustable) {
        const { step } = ONLINE_LAYOUT;
        ctx.fillStyle = entry.highlighted || entry.hovered ? ACCENT : MUTED;
        ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("‹", detail.x + detail.width - step.inset - step.width / 2, y + row.height / 2);
        ctx.fillText("›", detail.x + detail.width - step.inset + step.width / 2, y + row.height / 2);
        ctx.textAlign = "left";
      }
    }
    ctx.globalAlpha = 1;
  });

  ctx.fillStyle = MUTED;
  ctx.font = "400 15px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  // Under the rows rather than over them: the list grew from four to six when the
  // car rows arrived, and this note used to sit where row five now is.
  const belowRows = detail.y + lobby.rows.length * (row.height + row.gap) + 26;
  ctx.fillText(
    lobby.isHost ? "Your car is yours; the race is the room's." : "The host sets the race. Your car is yours.",
    detail.x + 24,
    belowRows,
  );

  drawButton(ctx, ONLINE_LAYOUT.back, "LEAVE ROOM", { live: hover?.kind === "back" });
  drawButton(ctx, ONLINE_LAYOUT.customise, lobby.customise.label, {
    live: hover?.kind === "customise",
    muted: !lobby.customise.enabled,
  });
}

// ---------------------------------------------------------------------------
// The result panel, drawn over the strip
// ---------------------------------------------------------------------------

export function drawOnlineResult(ctx, { headline, note, rows, score, matchResult, buttons = [] }) {
  dimWorld(ctx);
  const box = RESULT_PANEL;
  menuPanel(ctx, box.x, box.y, box.width, box.height, { live: true });

  ctx.save();
  // The panel is drawn straight over the instrument cluster's own text, which
  // centres and right-aligns; inheriting that alignment put the headline half a
  // panel off to the left. Never assume either of these.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACCENT;
  ctx.font = "700 34px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(headline, box.x + 32, box.y + 58);

  if (note) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(note, box.x + 32, box.y + 86);
  }

  // The two runs, this driver's first. Every number here was computed by the
  // server replaying both input logs — none of it is anything a client claimed.
  rows.forEach((row, index) => {
    const y = box.y + 130 + index * 84;
    ctx.fillStyle = row.you ? ACCENT : INK;
    ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(row.label, box.x + 32, y);

    ctx.fillStyle = INK;
    ctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatTime(row), box.x + box.width - 32, y);
    ctx.textAlign = "left";

    ctx.fillStyle = MUTED;
    ctx.font = "500 15px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(detailLine(row), box.x + 32, y + 26);
  });

  if (score) {
    ctx.fillStyle = MUTED;
    ctx.font = "600 17px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(scoreLine(score, rows), box.x + 32, box.y + box.height - 84);
  }
  if (matchResult?.forfeit) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 15px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Your opponent left the match.", box.x + 32, box.y + box.height - 60);
  }

  // Drawn buttons rather than a "press ENTER" hint: the rest of the cabinet is
  // fully mousable, and a result screen you can only leave with the keyboard is
  // the one place that would stop being true.
  for (const button of buttons) {
    drawButton(ctx, button.rect, button.label, { live: button.primary });
  }
  ctx.restore();
}

function formatTime(row) {
  if (row.falseStart) return "RED";
  if (!row.complete || row.finishTime === null) return "DNF";
  return `${row.finishTime.toFixed(3)}s`;
}

function detailLine(row) {
  if (row.falseStart) return "Jumped the light";
  const parts = [];
  if (row.launchGrade) parts.push(`${row.launchGrade} launch`);
  if (typeof row.reactionTime === "number") parts.push(`RT ${row.reactionTime.toFixed(3)}s`);
  const clean = (row.shifts ?? []).filter((shift) => shift.grade === "perfect").length;
  if ((row.shifts ?? []).length > 0) parts.push(`${clean}/${row.shifts.length} perfect`);
  return parts.join("  ·  ");
}

function scoreLine(score, rows) {
  const mine = score.players.find((player) => player.playerId === rows[0]?.playerId);
  const theirs = score.players.find((player) => player.playerId !== rows[0]?.playerId);
  return `ROUNDS  ${mine?.wins ?? 0} — ${theirs?.wins ?? 0}   (best of ${score.bestOf})`;
}
