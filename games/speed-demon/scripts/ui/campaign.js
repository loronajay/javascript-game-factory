// The campaign screen — pure.
//
// Two things live behind one screen: the **map**, and the **briefing** that
// plays over a mission splash before the tree. They are one screen rather than
// two for the reason the tutorial is not a screen: every screen that owns a
// cursor has to belong to exactly one input path in `init-game.js`, to one case
// in the debug handle's `move()`, and to one branch of the renderer, and a
// briefing that owns nothing but ENTER would be a screen paying all of that for
// a key press. So the stage is state, exactly as the setup screen's pane is.
//
// **The map is the painted art and this module places tokens on it.** Node
// positions are authored percentages measured off `assets/campaign-map.png`
// (see `campaign/map.js`); this turns them into screen points through the
// map's drawn rect. Nothing here invents a layout, and nothing draws a route —
// the routes are painted.
//
// Geometry is here rather than in the renderer for the same reason
// `setup-menu.js` holds the setup screen's: where a token sits decides what a
// click lands on, and that is a rule a test should be able to reach without a
// canvas.

import { modeById, objectiveOption } from "../sim/modes.js";
import { trackById } from "./track-layout.js";
import { EVENTS, eventById } from "../campaign/events.js";
import { speakerById } from "../campaign/contacts.js";
import { entryFaceSrc } from "../rival/lineup.js";
import { MAP_NODES, mapRect, pointOnMap } from "../campaign/map.js";
import { STATUS_CLEARED, STATUS_LOCKED, eventStatus, progressSummary } from "../campaign/progress.js";

export const STAGE_MAP = "map";
export const STAGE_BRIEFING = "briefing";

/**
 * A painted node with no event written for it yet.
 *
 * Distinct from `locked`, and the difference is honest rather than cosmetic:
 * locked means "you have not earned this", soon means "this is not written".
 * The whole campaign is on the artwork the moment the screen opens, so
 * pretending an unwritten stop is a locked one would promise something that
 * does not exist.
 */
export const STATUS_SOON = "soon";

/** What `confirmCampaign` asks the composition root for. */
export const CAMPAIGN_NONE = "none";
/** The briefing is over: build the race this event describes. */
export const CAMPAIGN_RACE = "race";
/** The token is on a node that cannot be raced. Buzz, do not advance. */
export const CAMPAIGN_LOCKED = "locked";

/**
 * The screen, and where the map and the panels go on it.
 *
 * The world is 1280x720; it is written here rather than imported because `ui/`
 * does not depend on `render/` — the same reason `track-layout.js` carries its
 * own numbers.
 *
 * The map fills the screen. The detail panel is a **bottom strip** rather than
 * a sidebar: the artwork's right-hand side is Kuroda's district and its top
 * left is the wordmark and the legend, so a column down either side would cover
 * the two things the map uses to orient the player.
 *
 * **And it has to clear the lowest painted base.** The southernmost stop is
 * START, at 83.37% of the image — which is exactly where the player is standing
 * on a fresh career, so a strip deep enough to be comfortable covered the one
 * node that mattered. It is sized to fit under it instead, which is checked by
 * `tests/campaign.test.js` rather than by looking at it.
 */
export const CAMPAIGN_LAYOUT = {
  screen: { x: 0, y: 0, width: 1280, height: 720 },
  detail: { x: 24, y: 626, width: 1232, height: 86 },
  // A token is drawn *around* the painted base rather than over it — the base is
  // the art and covering it would be painting over the map to say where the map
  // is. This is the radius of the ring that marks one.
  token: { radius: 22 },
  // The face on the detail strip, in the column that names the other driver.
  // Square, because every face in the cabinet is — the avatar manifest's note
  // about there being no crop rectangle, which is what lets one cell size serve
  // a roster portrait and a generic avatar without per-face data.
  detailFace: { size: 62, gap: 12 },
  briefing: {
    // Sixteen pixels taller than it was, and lower, because the speaker's name
    // and role now sit above the dialogue where the dialogue used to start. The
    // box is still a **fixed** height — one that grew to fit its copy would land
    // on the artwork — so a four-line beat is checked by `tests/campaign.test.js`
    // against `hint`, not by somebody noticing the overlap on screen.
    box: { x: 120, y: 440, width: 1040, height: 212 },
    title: { x: 120, y: 388 },
    lineHeight: 30,
    maxLines: 4,
    /** Where the first line of dialogue sits, from the top of the box. */
    firstLine: 84,
    /** The page counter's and the hint's baselines, likewise. */
    hint: 194,
    /**
     * The speaker's plate, inside the box on its left.
     *
     * The dialogue indents past it rather than wrapping around it: a fixed
     * indent is one number, and text that flows around a portrait is a
     * line-breaking problem in a box whose height is deliberately fixed.
     */
    face: { x: 22, y: 22, size: 88 },
    text: { x: 132 },
    /**
     * The dossier: who is in the other lane, over the splash and above the box.
     *
     * On the right because the splash art is composed around an empty middle
     * and the title already owns the left — and *above* the dialogue rather
     * than beside it because the briefing reads top to bottom: this is the race,
     * that is somebody talking about it.
     */
    dossier: { x: 858, y: 176, width: 302, height: 236, face: 96 },
  },
};

/** The map's drawn rect on this screen. One derivation, shared by everything. */
export function campaignMapRect() {
  return mapRect(CAMPAIGN_LAYOUT.screen);
}

export function createCampaign({ eventId = null } = {}) {
  const nodeId = eventId ? eventById(eventId)?.nodeId : null;
  const index = Math.max(0, MAP_NODES.findIndex((node) => node.id === nodeId));
  return { stage: STAGE_MAP, cursor: index, line: 0 };
}

/** The painted node the token is on. */
export function campaignNode(campaign) {
  return MAP_NODES[campaign.cursor] ?? MAP_NODES[0] ?? null;
}

/** The event written for the node the token is on, or null if none is yet. */
export function campaignEvent(campaign) {
  const node = campaignNode(campaign);
  return node ? (EVENTS.find((event) => event.nodeId === node.id) ?? null) : null;
}

function eventForNode(nodeId) {
  return EVENTS.find((event) => event.nodeId === nodeId) ?? null;
}

function nodeStatus(node, progress) {
  const event = eventForNode(node.id);
  return event ? eventStatus(progress, event.id) : STATUS_SOON;
}

function nodeCentre(node) {
  return pointOnMap(campaignMapRect(), node.point);
}

/**
 * Walks the token to the nearest painted node in the direction pressed.
 *
 * Directional, because the map is a map: the route bends back on itself and
 * forks three ways at the docks, so a cursor that walked the authored list
 * would jump across the city. Nothing wraps — on a picture this size a wrapped
 * cursor is a cursor you lose.
 */
export function moveCampaign(campaign, direction) {
  if (campaign.stage !== STAGE_MAP) return campaign;

  const from = nodeCentre(campaignNode(campaign));
  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const other = axis === "x" ? "y" : "x";

  let best = null;
  MAP_NODES.forEach((node, index) => {
    if (index === campaign.cursor) return;
    const to = nodeCentre(node);
    if ((to[axis] - from[axis]) * sign <= 0) return; // behind the token on this axis
    const across = Math.abs(to[other] - from[other]);
    // Nearest first, then straightest: plain distance decides it and drift
    // across the pressed axis only breaks a tie. Weighting the drift heavily
    // instead skips a node up and to the right in favour of a distant one dead
    // ahead, which on a map reads as the token teleporting.
    const cost = Math.hypot(to.x - from.x, to.y - from.y) + across;
    if (!best || cost < best.cost) best = { index, cost };
  });

  return best ? { ...campaign, cursor: best.index } : campaign;
}

/** Puts the token on a node by index — what a click does. */
export function focusCampaign(campaign, index) {
  if (campaign.stage !== STAGE_MAP) return campaign;
  if (!Number.isInteger(index) || index < 0 || index >= MAP_NODES.length) return campaign;
  return { ...campaign, cursor: index };
}

/**
 * ENTER. On the map it opens the briefing for a stop that can actually be
 * raced; in a briefing it turns the page, and off the end of the last one it
 * asks for the race.
 */
export function confirmCampaign(campaign, progress) {
  const event = campaignEvent(campaign);

  if (campaign.stage === STAGE_MAP) {
    if (!event || eventStatus(progress, event.id) === STATUS_LOCKED) {
      return { campaign, command: CAMPAIGN_LOCKED };
    }
    return { campaign: { ...campaign, stage: STAGE_BRIEFING, line: 0 }, command: CAMPAIGN_NONE };
  }

  if (!event) return { campaign: { ...campaign, stage: STAGE_MAP, line: 0 }, command: CAMPAIGN_NONE };

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
  const rect = campaignMapRect();
  const nodes = MAP_NODES.map((node, index) => {
    const event = eventForNode(node.id);
    const status = nodeStatus(node, progress);
    return {
      id: node.id,
      index,
      kind: node.kind,
      region: node.region,
      // A boss plate is painted on the map already, so the token never repeats
      // it — this is only here for the detail strip.
      label: node.label ?? null,
      eventId: event?.id ?? null,
      title: event?.title ?? null,
      status,
      ...pointOnMap(rect, node.point),
      radius: CAMPAIGN_LAYOUT.token.radius,
      selected: index === campaign.cursor,
      hovered: hover?.kind === "node" && hover.index === index,
    };
  });

  return {
    stage: campaign.stage,
    map: rect,
    summary: progressSummary(progress),
    nodes,
    detail: detailFor(campaignNode(campaign), campaignEvent(campaign), progress),
    briefing: campaign.stage === STAGE_BRIEFING ? briefingFor(campaignEvent(campaign), campaign.line) : null,
    hover,
  };
}

function detailFor(node, event, progress) {
  if (!node) return null;
  const status = nodeStatus(node, progress);
  const record = event ? progress.completed[event.id] ?? null : null;
  const mode = event ? modeById(event.modeId) : null;
  const objective = mode ? objectiveOption(mode, event.objectiveId) : null;
  const hidden = status === STATUS_LOCKED || status === STATUS_SOON;

  return {
    nodeId: node.id,
    eventId: event?.id ?? null,
    kind: node.kind,
    // A stop nobody has reached still names its **place**: geography stays
    // visible, the race does not. That is the Tactical Arena map's rule and it
    // is what keeps a locked node worth looking at.
    region: node.region,
    title: hidden ? (node.label ?? node.region) : event.title,
    where: hidden ? "" : event.where,
    status,
    locked: status === STATUS_LOCKED,
    soon: status === STATUS_SOON,
    cleared: status === STATUS_CLEARED,
    trackLabel: hidden ? "" : trackById(event.trackId)?.label ?? "",
    objectiveLabel: hidden ? "" : objective?.label ?? "",
    opponent: !hidden && event.opponent ? opponentFor(event.opponent) : null,
    attempts: record?.attempts ?? 0,
    wins: record?.wins ?? 0,
    hint: status === STATUS_SOON
      ? "NOT OPEN YET"
      : status === STATUS_LOCKED
        ? "WIN YOUR WAY HERE"
        : "ENTER to take it",
  };
}

/**
 * The driver in the other lane, as both surfaces that name one want them.
 *
 * One shaping rather than two because the strip and the dossier are the same
 * claim at two sizes, and the day one gains a field the other should have it.
 * `faceSrc` is the **thumb**: the larger of the two cells is 96px, where a
 * card-sized portrait is eight times the pixels nobody can see.
 */
function opponentFor(entry) {
  return {
    id: entry.id,
    name: entry.name,
    tier: entry.tier,
    blurb: entry.blurb,
    accent: entry.accent,
    // The plate a face falls back to. Normal rather than exceptional — it is
    // what a portrait still in flight draws, on every first frame.
    initial: entry.initial ?? "?",
    faceSrc: entryFaceSrc(entry),
  };
}

function briefingFor(event, line) {
  if (!event) return null;
  const beats = event.brief ?? [];
  const index = Math.min(Math.max(line, 0), Math.max(0, beats.length - 1));
  const beat = beats[index] ?? { speaker: "", text: [] };
  const last = index >= beats.length - 1;
  const mode = modeById(event.modeId);
  return {
    id: event.id,
    title: event.title,
    where: event.where,
    splash: event.splash,
    // Resolved here rather than in the renderer, which would otherwise have to
    // consult a catalog to draw a name — the rule every view model in the
    // cabinet follows. Null is survivable: an unresolved id draws no plate.
    speaker: speakerById(beat.speaker),
    // The dossier. It repeats what the detail strip said a moment ago, which is
    // the point: the map is browsed and the briefing is committed to, and the
    // last thing a player should have to do before a race is remember who they
    // agreed to drive against.
    opponent: event.opponent
      ? {
        ...opponentFor(event.opponent),
        trackLabel: trackById(event.trackId)?.label ?? "",
        objectiveLabel: mode ? objectiveOption(mode, event.objectiveId)?.label ?? "" : "",
      }
      : null,
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

/**
 * Every face the campaign screen can put on screen, as paths.
 *
 * Asked for as a set when the map opens rather than per frame, because the
 * strip changes face on every cursor move and a request driven off the drawn
 * view would fire on a key repeat. These are thumbs — the whole chapter is
 * roughly the cost of one card — which is the same trade the rival strip makes
 * when it loads all ten portraits at boot.
 *
 * Here rather than in the composition root because it is a walk over the
 * catalog, and the root's job is to load what it is handed rather than to know
 * that a beat has a speaker.
 */
export function campaignFaceSrcs() {
  const srcs = new Set();
  for (const event of EVENTS) {
    const opponent = event.opponent ? entryFaceSrc(event.opponent) : null;
    if (opponent) srcs.add(opponent);
    for (const beat of event.brief ?? []) {
      const face = speakerById(beat.speaker)?.faceSrc;
      if (face) srcs.add(face);
    }
  }
  return [...srcs];
}

export { eventById };
