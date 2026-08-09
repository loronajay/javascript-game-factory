// The campaign screen: the painted map with tokens on it, and a briefing over
// the mission splash.
//
// Canvas only. Every position comes from the view model `ui/campaign.js` hands
// over — this file decides nothing about what is selected, what is open or what
// the voice says.
//
// **The map is the artwork and this draws almost nothing on top of it.** The
// node bases, the dashed routes, the region names, the boss plates and the
// legend are all painted into `assets/campaign-map.png`. What is added is the
// state the picture cannot know: which stop the player is standing on, which
// are cleared, and which are still shut. Anything more elaborate than a ring
// around a painted base is a second map arguing with the first one.
//
// `hitCampaign` is exported from here, beside the geometry it tests, for the
// `menuListBox` reason: the hover highlight and the click resolve from one copy
// of the numbers, or the node that lights up is not the node that opens.

import { WORLD } from "./scene.js";
import { drawSplashBackdrop, menuPanel, wrapText } from "./menus.js";
import { CAMPAIGN_LAYOUT, STAGE_BRIEFING, STATUS_SOON } from "../ui/campaign.js";
import { STATUS_CLEARED, STATUS_LOCKED, STATUS_OPEN } from "../campaign/progress.js";

const INK = "#f2f5f8";
const TEXT = "#dfe6ee";
const DIM = "#8b95a2";
const ACCENT = "#ff5a2e";
const OPEN = "#57d98a";
const SHUT = "#5b636e";

export function drawCampaign(ctx, view, { mapImage = null, splashImages = null } = {}) {
  if (!view) return;
  if (view.stage === STAGE_BRIEFING) {
    drawBriefing(ctx, view, splashImages);
    return;
  }

  ctx.fillStyle = "#06070a";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  // Drawn at full strength and nothing over its middle. Unlike a track aerial —
  // a bright daylight photograph the menu backdrop has to hold right back — this
  // is an authored night scene, and dimming it would be dimming the screen's
  // entire content.
  if (mapImage?.complete && mapImage.naturalWidth > 0) {
    ctx.drawImage(mapImage, view.map.x, view.map.y, view.map.width, view.map.height);
  }

  for (const node of view.nodes) drawToken(ctx, node);
  drawDetail(ctx, view, view.detail);
}

function text(ctx, value, x, y, { size = 15, colour = DIM, weight = "600", align = "left" } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

/**
 * The state of one painted stop, drawn around its base.
 *
 * **An open stop is the loudest thing on the map.** The first cut gave rings to
 * everything *except* the one you could actually drive — cleared got a green
 * ring, shut got a grey one, open got nothing — so the next race read as a
 * missing node beside a row of marked ones. It is the other way round now: open
 * gets a lit ring and a halo, and a shut stop gets a wash with no stroke at all
 * so it recedes into the artwork rather than competing with it.
 *
 * A wash rather than a badge, because the map is lit everywhere and darkening is
 * the only thing that reads as "not yet" without adding a symbol to a picture
 * that already has a legend.
 */
function drawToken(ctx, node) {
  ctx.save();

  if (node.status === STATUS_LOCKED || node.status === STATUS_SOON) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = node.status === STATUS_SOON ? "rgba(6, 7, 10, 0.74)" : "rgba(6, 7, 10, 0.6)";
    ctx.fill();
  }

  if (node.status === STATUS_OPEN) {
    // A halo first, so the ring reads against a lit city rather than dissolving
    // into whatever neon happens to be under it.
    const halo = ctx.createRadialGradient(node.x, node.y, node.radius * 0.6, node.x, node.y, node.radius + 14);
    halo.addColorStop(0, "rgba(255, 90, 46, 0.34)");
    halo.addColorStop(1, "rgba(255, 90, 46, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (node.status === STATUS_CLEARED) {
    // A cleared stop keeps its painted base and gains a ring, so the route
    // reads at a glance as how far the player has got.
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.strokeStyle = OPEN;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, "✓", node.x + node.radius + 2, node.y - node.radius + 4, {
      size: 15, colour: OPEN, weight: "800", align: "center",
    });
  }

  if (node.selected || node.hovered) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = node.selected ? ACCENT : "rgba(242, 245, 248, 0.5)";
    ctx.lineWidth = node.selected ? 3 : 2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The strip along the bottom: which stop the token is on, and what it is.
 *
 * A bottom strip rather than a sidebar because the artwork's left is its
 * wordmark and legend and its right is Kuroda's district — a column down either
 * side covers the two things a player uses to find their way around.
 */
function drawDetail(ctx, view, detail) {
  const box = CAMPAIGN_LAYOUT.detail;
  menuPanel(ctx, box.x, box.y, box.width, box.height, { live: Boolean(detail && !detail.locked && !detail.soon) });
  if (!detail) return;

  // Three columns and three lines, because the strip is only as deep as the
  // room under the southernmost painted base.
  const left = box.x + 24;
  const middle = box.x + 470;
  const right = box.x + box.width - 24;
  const statusColour = detail.soon || detail.locked ? SHUT : detail.cleared ? OPEN : ACCENT;
  const statusLabel = detail.soon ? "COMING SOON" : detail.locked ? "LOCKED" : detail.cleared ? "CLEARED" : "OPEN";

  text(ctx, `${detail.region.toUpperCase()} · ${statusLabel}`, left, box.y + 20, {
    size: 12, colour: statusColour, weight: "800",
  });
  text(ctx, detail.title.toUpperCase(), left, box.y + 46, { size: 22, colour: INK, weight: "800" });
  // The place and the race on one line: at this depth a second line of type is
  // a line of type on the water.
  // The distance, not the track: an event's `where` already names the place, and
  // printing the track label beside it says "Old Town" twice.
  const where = [detail.where, detail.objectiveLabel].filter(Boolean).join("   ·   ");
  text(ctx, where, left, box.y + 70, { size: 13 });

  if (detail.opponent) {
    text(ctx, "IN THE OTHER LANE", middle, box.y + 20, { size: 11, colour: DIM, weight: "800" });
    text(ctx, detail.opponent.name.toUpperCase(), middle, box.y + 46, {
      size: 18, colour: detail.opponent.accent, weight: "800",
    });
    ctx.font = '500 13px "Segoe UI", system-ui, sans-serif';
    text(ctx, wrapText(ctx, detail.opponent.blurb, box.width - 520)[0] ?? "", middle, box.y + 72, { size: 13 });
  }

  text(ctx, `${view.summary.cleared} / ${view.summary.total} CLEARED`, right, box.y + 20, {
    size: 13, colour: DIM, weight: "700", align: "right",
  });
  text(ctx, detail.hint, right, box.y + 46, { size: 15, colour: statusColour, weight: "800", align: "right" });
  const trail = detail.attempts > 0
    ? `${detail.wins}W / ${detail.attempts} RUN${detail.attempts === 1 ? "" : "S"}   ·   ARROWS move   ESC back`
    : "ARROWS move   ESC back";
  text(ctx, trail, right, box.y + 70, { size: 12, colour: DIM, weight: "700", align: "right" });
}

/**
 * The briefing: the mission splash full-bleed, with the voice in a box across
 * the bottom.
 *
 * Drawn near full strength, the way the menu splash is and unlike a track
 * aerial: these are authored night scenes composed around an empty middle, and
 * holding one back to a third of its brightness throws away the one moment the
 * art is actually the screen.
 */
function drawBriefing(ctx, view, splashImages) {
  const brief = view.briefing;
  const image = splashImages?.get(brief?.splash) ?? null;
  drawSplashBackdrop(ctx, image);
  if (!brief) return;

  const { box, title, lineHeight } = CAMPAIGN_LAYOUT.briefing;

  text(ctx, brief.title, title.x, title.y, { size: 34, colour: INK, weight: "800" });
  text(ctx, brief.where, title.x, title.y + 26, { size: 15 });

  menuPanel(ctx, box.x, box.y, box.width, box.height, { live: true });

  // The speaker has no portrait and no name, which is the point — a plate with
  // a label on it, not a character card.
  text(ctx, brief.speaker, box.x + 24, box.y + 34, { size: 13, colour: ACCENT, weight: "800" });
  text(ctx, `${brief.index} / ${brief.total}`, box.x + box.width - 24, box.y + 34, {
    size: 12, colour: DIM, weight: "700", align: "right",
  });

  brief.lines.forEach((line, index) => {
    text(ctx, line, box.x + 24, box.y + 72 + index * lineHeight, { size: 19, colour: TEXT, weight: "500" });
  });

  text(ctx, brief.hint, box.x + box.width - 24, box.y + box.height - 18, {
    size: 14, colour: ACCENT, weight: "800", align: "right",
  });
}

/**
 * What is under a world point, or null.
 *
 * Only a painted stop is a target. The detail strip is read rather than chosen,
 * and highlighting something a click cannot act on is how a dead control gets
 * drawn — the leaderboard screen's rule.
 */
export function hitCampaign(view, x, y) {
  if (!view || view.stage === STAGE_BRIEFING) return null;
  for (const node of view.nodes) {
    if (Math.hypot(x - node.x, y - node.y) <= node.radius) {
      return { kind: "node", index: node.index, id: node.id, status: node.status };
    }
  }
  return null;
}
