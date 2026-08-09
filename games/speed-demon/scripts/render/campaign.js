// The campaign screen: a node map, and a briefing over the mission splash.
//
// Canvas only. Every position comes from `CAMPAIGN_LAYOUT` and every piece of
// state from the view model `ui/campaign.js` hands over — this file decides
// nothing about what is selected, what is open or what the voice says.
//
// `hitCampaign` is exported from here, beside the geometry it tests, for the
// `menuListBox` reason: the hover highlight and the click resolve from one copy
// of the numbers, or the node that lights up is not the node that opens.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop, drawSplashBackdrop, menuPanel, wrapText } from "./menus.js";
import {
  CAMPAIGN_LAYOUT,
  STAGE_BRIEFING,
} from "../ui/campaign.js";
import { STATUS_CLEARED, STATUS_LOCKED } from "../campaign/progress.js";

const INK = "#f2f5f8";
const TEXT = "#dfe6ee";
const DIM = "#8b95a2";
const ACCENT = "#ff5a2e";
const OPEN = "#57d98a";
const LOCKED = "#4a525d";

/** The backdrop the map sits on — a garage at night, like the collection's. */
export const CAMPAIGN_SPLASH = "assets/garage-3.png";

function text(ctx, value, x, y, { size = 15, colour = DIM, weight = "600", align = "left" } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function statusColour(status) {
  if (status === STATUS_LOCKED) return LOCKED;
  return status === STATUS_CLEARED ? OPEN : ACCENT;
}

export function drawCampaign(ctx, view, { splashImage = null, splashImages = null } = {}) {
  if (!view) return;
  if (view.stage === STAGE_BRIEFING) {
    drawBriefing(ctx, view, splashImages);
    return;
  }

  drawMenuBackdrop(ctx, splashImage, { alpha: 0.9, scrim: 0.55 });

  const { header } = CAMPAIGN_LAYOUT;
  text(ctx, view.chapter ? `CHAPTER ${view.chapter.number}` : "CAMPAIGN", header.x, header.y - 26, {
    size: 13, colour: ACCENT, weight: "800",
  });
  text(ctx, view.chapter?.title ?? "", header.x, header.y, { size: 34, colour: INK, weight: "800" });
  text(ctx, view.chapter?.blurb ?? "", header.x, header.y + 24, { size: 15 });
  text(
    ctx,
    `${view.summary.cleared} / ${view.summary.total} CLEARED`,
    WORLD.width - 96,
    header.y,
    { size: 15, colour: DIM, weight: "700", align: "right" },
  );

  drawTrails(ctx, view.trails);
  for (const node of view.nodes) drawNode(ctx, node);
  drawDetail(ctx, view.detail);

  text(
    ctx,
    "ARROWS move   ENTER open   ESC back",
    WORLD.width / 2,
    CAMPAIGN_LAYOUT.hint.y,
    { size: 14, colour: DIM, weight: "700", align: "center" },
  );
}

function drawTrails(ctx, trails) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const trail of trails) {
    ctx.strokeStyle = trail.active ? "rgba(87, 217, 138, 0.55)" : "rgba(74, 82, 93, 0.5)";
    // Dashed while the road ahead is still shut, so a locked branch reads as
    // somewhere the map knows about rather than somewhere you have been.
    ctx.setLineDash(trail.active ? [] : [10, 10]);
    ctx.beginPath();
    ctx.moveTo(trail.from.x, trail.from.y);
    ctx.quadraticCurveTo(trail.control.x, trail.control.y, trail.to.x, trail.to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNode(ctx, node) {
  const colour = statusColour(node.status);
  ctx.save();

  if (node.selected || node.hovered) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 9, 0, Math.PI * 2);
    ctx.strokeStyle = node.selected ? ACCENT : "rgba(242, 245, 248, 0.45)";
    ctx.lineWidth = node.selected ? 3 : 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
  ctx.fillStyle = node.status === STATUS_LOCKED ? "rgba(10, 13, 18, 0.9)" : "rgba(12, 16, 22, 0.95)";
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.stroke();

  text(ctx, node.status === STATUS_LOCKED ? "?" : node.label, node.x, node.y + 8, {
    size: 22, colour: node.status === STATUS_LOCKED ? LOCKED : INK, weight: "800", align: "center",
  });

  // A cleared node keeps its number and gains a tick beside it, rather than
  // swapping one for the other: which event this is does not stop mattering
  // because it has been won.
  if (node.status === STATUS_CLEARED) {
    text(ctx, "✓", node.x + node.radius - 4, node.y - node.radius + 12, {
      size: 16, colour: OPEN, weight: "800", align: "center",
    });
  }

  text(ctx, node.status === STATUS_LOCKED ? "LOCKED" : node.title, node.x, node.y + node.radius + 24, {
    size: 13,
    colour: node.selected ? INK : DIM,
    weight: "700",
    align: "center",
  });
  ctx.restore();
}

function drawDetail(ctx, detail) {
  const box = CAMPAIGN_LAYOUT.detail;
  menuPanel(ctx, box.x, box.y, box.width, box.height, { live: Boolean(detail && !detail.locked) });
  if (!detail) return;

  const left = box.x + 20;
  const width = box.width - 40;
  let y = box.y + 34;

  text(ctx, detail.locked ? "LOCKED" : detail.cleared ? "CLEARED" : "OPEN", left, y, {
    size: 12, colour: statusColour(detail.status), weight: "800",
  });
  y += 28;
  text(ctx, detail.locked ? "?????" : detail.title, left, y, { size: 22, colour: INK, weight: "800" });
  y += 22;
  text(ctx, detail.locked ? "" : detail.where, left, y, { size: 13 });

  y += 34;
  text(ctx, `${detail.trackLabel} · ${detail.objectiveLabel}`, left, y, {
    size: 14, colour: TEXT, weight: "700",
  });

  if (detail.opponent && !detail.locked) {
    y += 36;
    text(ctx, "IN THE OTHER LANE", left, y, { size: 11, colour: DIM, weight: "800" });
    y += 24;
    text(ctx, detail.opponent.name.toUpperCase(), left, y, {
      size: 18, colour: detail.opponent.accent, weight: "800",
    });
    y += 20;
    ctx.font = '500 13px "Segoe UI", system-ui, sans-serif';
    for (const line of wrapText(ctx, detail.opponent.blurb, width).slice(0, 5)) {
      text(ctx, line, left, y, { size: 13 });
      y += 18;
    }
  }

  if (detail.attempts > 0) {
    text(ctx, `${detail.wins}W / ${detail.attempts} RUN${detail.attempts === 1 ? "" : "S"}`, left, box.y + box.height - 20, {
      size: 13, colour: DIM, weight: "700",
    });
  }
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
 * Only a node is a target. The detail panel is read rather than chosen, and
 * highlighting something a click cannot act on is how a dead control gets
 * drawn — the leaderboard screen's rule.
 */
export function hitCampaign(view, x, y) {
  if (!view || view.stage === STAGE_BRIEFING) return null;
  for (const node of view.nodes) {
    if (Math.hypot(x - node.x, y - node.y) <= node.radius + 6) {
      return { kind: "node", index: node.index, id: node.id, status: node.status };
    }
  }
  return null;
}
