// The campaign screen — pure.
//
// Two things live behind one screen: the **node map**, and the **briefing** that
// plays over a mission splash before the tree. They are one screen rather than
// two for the reason the tutorial is not a screen: every screen that owns a
// cursor has to belong to exactly one input path in `init-game.js`, to one case
// in the debug handle's `move()`, and to one branch of the renderer, and a
// briefing that owns nothing but ENTER would be a screen paying all of that for
// a key press. So the stage is state, exactly as the setup screen's pane is.
//
// Geometry is here rather than in the renderer for the same reason
// `setup-menu.js` holds the setup screen's: where a node sits decides what a
// click lands on, and that is a rule a test should be able to reach without a
// canvas. `render/campaign.js` reads these numbers and `hitCampaign` resolves a
// click against the same view the renderer drew.

import { modeById, objectiveOption } from "../sim/modes.js";
import { trackById } from "./track-layout.js";
import { EVENTS, chapterByNumber, eventById } from "../campaign/events.js";
import { STATUS_CLEARED, STATUS_LOCKED, eventStatus, progressSummary } from "../campaign/progress.js";

export const STAGE_MAP = "map";
export const STAGE_BRIEFING = "briefing";

/** What `confirmCampaign` asks the composition root for. */
export const CAMPAIGN_NONE = "none";
/** The briefing is over: build the race this event describes. */
export const CAMPAIGN_RACE = "race";
/** The cursor is on a node that is not open yet. Buzz, do not advance. */
export const CAMPAIGN_LOCKED = "locked";

/**
 * The map's discrete grid, and the box it is laid out inside.
 *
 * A node declares a {col,row} and the trails fall out of the graph — the
 * Tactical Arena map's arrangement, because a player of this arcade has already
 * learned to read one. Nothing is hand-placed in pixels, so adding an event is
 * a free cell rather than a layout change.
 */
export const CAMPAIGN_GRID = { cols: 5, rows: 5 };

export const CAMPAIGN_LAYOUT = {
  map: { x: 96, y: 150, width: 800, height: 420 },
  node: { radius: 30 },
  header: { x: 96, y: 92 },
  detail: { x: 928, y: 150, width: 256, height: 420 },
  hint: { y: 640 },
  briefing: {
    box: { x: 120, y: 452, width: 1040, height: 196 },
    title: { x: 120, y: 388 },
    lineHeight: 30,
    maxLines: 4,
  },
};

/** How far a trail bows off the straight line, so a road reads as a road. */
const TRAIL_BEND = 26;

export function createCampaign({ eventId = null } = {}) {
  const index = Math.max(0, EVENTS.findIndex((event) => event.id === eventId));
  return { stage: STAGE_MAP, cursor: index, line: 0 };
}

/** The event the cursor is on. Never null while the catalog has a row in it. */
export function campaignEvent(campaign) {
  return EVENTS[campaign.cursor] ?? EVENTS[0] ?? null;
}

function nodeCentre(cell) {
  const { map } = CAMPAIGN_LAYOUT;
  const cols = Math.max(1, CAMPAIGN_GRID.cols - 1);
  const rows = Math.max(1, CAMPAIGN_GRID.rows - 1);
  const col = Math.min(Math.max(cell?.col ?? 0, 0), cols);
  const row = Math.min(Math.max(cell?.row ?? 0, 0), rows);
  return {
    x: map.x + (col / cols) * map.width,
    y: map.y + (row / rows) * map.height,
  };
}

/**
 * Walks the cursor to the nearest node in the direction pressed.
 *
 * Directional rather than a walk along the authored list, because the map is a
 * map: a node drawn up and to the right must be reachable by pressing up or
 * right, or the picture and the controls disagree. Nothing wraps — on a map
 * with a handful of nodes a wrapped cursor is a cursor you lose.
 */
export function moveCampaign(campaign, direction) {
  if (campaign.stage !== STAGE_MAP) return campaign;

  const from = nodeCentre(EVENTS[campaign.cursor]?.cell);
  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const sign = direction === "left" || direction === "up" ? -1 : 1;

  let best = null;
  EVENTS.forEach((event, index) => {
    if (index === campaign.cursor) return;
    const to = nodeCentre(event.cell);
    const along = (to[axis] - from[axis]) * sign;
    if (along <= 0) return; // behind the cursor on this axis
    const across = Math.abs(to[axis === "x" ? "y" : "x"] - from[axis === "x" ? "y" : "x"]);
    // **Nearest first, then straightest.** Plain distance decides it and drift
    // across the pressed axis only breaks a tie — the other way round (weighting
    // the drift heavily) skips a node drawn up and to the right in favour of a
    // distant one dead ahead, which on a map reads as the cursor jumping.
    const cost = Math.hypot(to.x - from.x, to.y - from.y) + across;
    if (!best || cost < best.cost) best = { index, cost };
  });

  return best ? { ...campaign, cursor: best.index } : campaign;
}

/** Puts the cursor on a node by index — what a click does. */
export function focusCampaign(campaign, index) {
  if (campaign.stage !== STAGE_MAP) return campaign;
  if (!Number.isInteger(index) || index < 0 || index >= EVENTS.length) return campaign;
  return { ...campaign, cursor: index };
}

/**
 * ENTER. On the map it opens the briefing for an event that is actually open;
 * in a briefing it turns the page, and off the end of the last one it asks for
 * the race.
 */
export function confirmCampaign(campaign, progress) {
  const event = campaignEvent(campaign);
  if (!event) return { campaign, command: CAMPAIGN_NONE };

  if (campaign.stage === STAGE_MAP) {
    if (eventStatus(progress, event.id) === STATUS_LOCKED) {
      return { campaign, command: CAMPAIGN_LOCKED };
    }
    return { campaign: { ...campaign, stage: STAGE_BRIEFING, line: 0 }, command: CAMPAIGN_NONE };
  }

  const beats = event.brief ?? [];
  if (campaign.line + 1 < beats.length) {
    return { campaign: { ...campaign, line: campaign.line + 1 }, command: CAMPAIGN_NONE };
  }
  return { campaign: { ...campaign, stage: STAGE_MAP, line: 0 }, command: CAMPAIGN_RACE, event };
}

/**
 * ESC. Out of a briefing is back to the map; off the map is out of the screen,
 * which is the shell's business rather than this module's — the same split
 * `cancelSetup` makes when it reports `exit` instead of changing screen.
 */
export function cancelCampaign(campaign) {
  if (campaign.stage === STAGE_BRIEFING) {
    return { campaign: { ...campaign, stage: STAGE_MAP, line: 0 }, exit: false };
  }
  return { campaign, exit: true };
}

/**
 * Everything both surfaces need, already shaped. The renderer looks nothing up:
 * no catalog, no progress, no geometry.
 */
export function campaignView(campaign, progress, { hover = null } = {}) {
  const nodes = EVENTS.map((event, index) => ({
    id: event.id,
    index,
    title: event.title,
    status: eventStatus(progress, event.id),
    ...nodeCentre(event.cell),
    radius: CAMPAIGN_LAYOUT.node.radius,
    selected: index === campaign.cursor,
    hovered: hover?.kind === "node" && hover.index === index,
    // The number a player counts by. Authored order, not cursor order.
    label: String(index + 1),
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const trails = [];
  for (const event of EVENTS) {
    const to = byId.get(event.id);
    for (const fromId of event.connections ?? []) {
      const from = byId.get(fromId);
      if (!from || !to) continue;
      trails.push({
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        control: bend(from, to),
        // A trail is lit once the node it leads to is open — the map shows the
        // road you have actually been given, and the rest as where it goes.
        active: to.status !== STATUS_LOCKED,
      });
    }
  }

  const event = campaignEvent(campaign);
  const chapter = chapterByNumber(event?.chapter ?? 1);

  return {
    stage: campaign.stage,
    chapter: chapter ? { ...chapter } : null,
    summary: progressSummary(progress),
    nodes,
    trails,
    detail: detailFor(event, progress),
    briefing: campaign.stage === STAGE_BRIEFING ? briefingFor(event, campaign.line) : null,
    hover,
  };
}

function bend(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // Perpendicular to the line, and the same way every time for a given pair —
  // a trail that bows differently between renders reads as the map moving.
  return {
    x: (from.x + to.x) / 2 + (-dy / length) * TRAIL_BEND,
    y: (from.y + to.y) / 2 + (dx / length) * TRAIL_BEND,
  };
}

function detailFor(event, progress) {
  if (!event) return null;
  const status = eventStatus(progress, event.id);
  const record = progress.completed[event.id] ?? null;
  const mode = modeById(event.modeId);
  const objective = mode ? objectiveOption(mode, event.objectiveId) : null;

  return {
    id: event.id,
    title: event.title,
    where: event.where,
    status,
    locked: status === STATUS_LOCKED,
    cleared: status === STATUS_CLEARED,
    trackLabel: trackById(event.trackId)?.label ?? "",
    objectiveLabel: objective?.label ?? "",
    // A locked node says nothing about what it is. Who you would be racing is
    // part of the reveal, and the panel prints "?????" over the title for the
    // same reason.
    opponent: event.opponent && status !== STATUS_LOCKED
      ? {
        name: event.opponent.name,
        tier: event.opponent.tier,
        blurb: event.opponent.blurb,
        accent: event.opponent.accent,
        initial: event.opponent.initial,
      }
      : null,
    attempts: record?.attempts ?? 0,
    wins: record?.wins ?? 0,
  };
}

function briefingFor(event, line) {
  if (!event) return null;
  const beats = event.brief ?? [];
  const index = Math.min(Math.max(line, 0), Math.max(0, beats.length - 1));
  const beat = beats[index] ?? { speaker: "", text: [] };
  const last = index >= beats.length - 1;
  return {
    id: event.id,
    title: event.title,
    where: event.where,
    splash: event.splash,
    speaker: beat.speaker,
    // Clipped to what the box holds. The box is a fixed height on purpose — a
    // panel that grows to fit its copy is a panel that lands on the artwork —
    // so an over-long beat is caught by `tests/campaign.test.js` rather than by
    // somebody noticing it on screen.
    lines: (beat.text ?? []).slice(0, CAMPAIGN_LAYOUT.briefing.maxLines),
    index: index + 1,
    total: beats.length,
    last,
    hint: last ? "ENTER to drive" : "ENTER to continue",
  };
}

/** Every event, for the tests that check the catalog against the game. */
export function allEvents() {
  return EVENTS.map((event) => ({ ...event }));
}

export { eventById };
