import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { DEFAULT_CAR, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { FINISHED } from "../scripts/sim/race.js";
import { MODE_CIRCUIT, raceOptionsFor, modeById, objectiveOption } from "../scripts/sim/modes.js";
import { replayRun } from "../scripts/sim/input-log.js";
import { buildRival, entryFaceSrc } from "../scripts/rival/lineup.js";
import { RIVALS } from "../scripts/rival/rivals.js";
import { avatarById } from "../scripts/profile/avatars.js";
import { modelById } from "../scripts/assets/car-atlas.js";
import { trackById } from "../scripts/ui/track-layout.js";
import { circuitTrackById } from "../scripts/circuit/tracks.js";
import { boardIdFor } from "../scripts/records/records.js";
import { buildRuntimeDefinition } from "../scripts/runtime/definitions.js";
import { EVENTS, FIRST_EVENT_ID, eventById, splashSrc } from "../scripts/campaign/events.js";
import { VOICE_UNKNOWN, allContacts, speakerById } from "../scripts/campaign/contacts.js";
import {
  MAP_IMAGE,
  MAP_NODES,
  NODE_BOSS,
  NODE_RIVAL,
  mapNodeById,
  mapRect,
  pointOnMap,
} from "../scripts/campaign/map.js";
import {
  STATUS_CLEARED,
  STATUS_LOCKED,
  STATUS_OPEN,
  completeEvent,
  createProgress,
  eventStatus,
  progressSummary,
} from "../scripts/campaign/progress.js";
import {
  CAMPAIGN_LAYOUT,
  CAMPAIGN_LOCKED,
  CAMPAIGN_RACE,
  STAGE_BRIEFING,
  STAGE_MAP,
  STATUS_SOON,
  campaignEvent,
  campaignFaceSrcs,
  campaignMapRect,
  campaignNode,
  campaignView,
  cancelCampaign,
  confirmCampaign,
  createCampaign,
  focusCampaign,
  moveCampaign,
} from "../scripts/ui/campaign.js";
import { hitCampaign } from "../scripts/render/campaign.js";

suite("campaign — the event catalog, the career, and the map");

const gate = createGate(GATE_6_SPEED);
const cleared = () => {
  let progress = createProgress();
  for (const event of EVENTS) {
    progress = completeEvent(progress, event.id, { won: true }).progress;
  }
  return progress;
};

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("every event stands on a painted node, and no two share one", () => {
  // The map paints every stop and every route between them. An event moves into
  // a place that already exists rather than positioning itself, so a `nodeId`
  // that names nothing is an event nobody can reach — and two events on one
  // base would draw two tokens in the same spot.
  const claimed = new Set();
  for (const event of EVENTS) {
    assert(mapNodeById(event.nodeId), `${event.id} stands on the unknown node ${event.nodeId}`);
    assert(!claimed.has(event.nodeId), `${event.nodeId} carries more than one event`);
    claimed.add(event.nodeId);
  }
});

test("the painted nodes are inside the art and none of them collide", () => {
  // Measured off the shipped PNG rather than typed, so this is the check that a
  // re-measure actually landed on the bases: a percentage outside 0-100 is off
  // the picture, and two within a token of each other means the pass merged two
  // icons or split one.
  const rect = mapRect({ x: 0, y: 0, width: 1280, height: 720 });
  const radius = CAMPAIGN_LAYOUT.token.radius;
  const ids = new Set();
  for (const node of MAP_NODES) {
    assert(!ids.has(node.id), `${node.id} is not a unique node id`);
    ids.add(node.id);
    assert(node.point.x > 0 && node.point.x < 100, `${node.id} is off the map horizontally`);
    assert(node.point.y > 0 && node.point.y < 100, `${node.id} is off the map vertically`);
  }
  for (const a of MAP_NODES) {
    for (const b of MAP_NODES) {
      if (a.id >= b.id) continue;
      const pa = pointOnMap(rect, a.point);
      const pb = pointOnMap(rect, b.point);
      assert(Math.hypot(pa.x - pb.x, pa.y - pb.y) > radius, `${a.id} and ${b.id} are the same base`);
    }
  }
});

test("the detail strip clears every painted stop", () => {
  // The southernmost base is START, which is exactly where the player stands on
  // a fresh career — so a strip deep enough to be comfortable covers the one
  // node that matters. This is the check, rather than noticing it on screen.
  const view = campaignView(createCampaign(), createProgress());
  const strip = CAMPAIGN_LAYOUT.detail;
  for (const node of view.nodes) {
    assert(
      node.y + node.radius < strip.y,
      `${node.id} is under the detail strip (${(node.y + node.radius).toFixed(0)} vs ${strip.y})`,
    );
  }
  assert(strip.y + strip.height <= CAMPAIGN_LAYOUT.screen.height, "the strip runs off the bottom");
});

test("the map is fitted whole, never cropped", () => {
  // A cover fit crops, and a cropped map moves every authored percentage off
  // the base it was measured against — the tokens would drift toward the edges
  // with nothing on screen to explain it.
  const rect = campaignMapRect();
  const screen = CAMPAIGN_LAYOUT.screen;
  assert(rect.width <= screen.width + 0.5 && rect.height <= screen.height + 0.5, "the map is cropped");
  assertEqual(
    Math.round((rect.width / rect.height) * 1000),
    Math.round((MAP_IMAGE.width / MAP_IMAGE.height) * 1000),
    "the map is stretched",
  );
});

test("every event names a track, a mode and an objective the game actually has", () => {
  for (const event of EVENTS) {
    assert(trackById(event.trackId) ?? circuitTrackById(event.trackId), `${event.id} names an unknown track`);
    const mode = modeById(event.modeId);
    assert(mode, `${event.id} names an unknown mode`);
    // Through the catalog rather than by string match, because a stale id
    // silently falls back to the mode's default — which would mean an event
    // quietly racing a different distance from the one it advertises.
    assertEqual(objectiveOption(mode, event.objectiveId).id, event.objectiveId, `${event.id}'s objective`);
    assert(mode.rival || mode.runtime === "circuit", `${event.id} has no opponent runtime`);
  }
});

test("an event's run files to a board a solo run can also reach", () => {
  // A campaign race is a rival race, and a rival race is physically identical
  // to a solo one over the same distance — same lane, no lateral axis. Boards
  // of its own would split one ladder in two.
  for (const event of EVENTS) {
    const boardId = boardIdFor(event.modeId, event.objectiveId);
    if (event.modeId === MODE_CIRCUIT) assertEqual(boardId, null, `${event.id} reached a drag board`);
    else assert(boardId?.startsWith("distance:"), `${event.id} files to ${boardId}`);
  }
});

test("the authored circuit mission builds the same serializable circuit definition", () => {
  const event = EVENTS.find((entry) => entry.modeId === MODE_CIRCUIT);
  assert(event, "the campaign has no circuit mission");
  const definition = buildRuntimeDefinition({
    modeId: event.modeId,
    objectiveId: event.objectiveId,
    trackId: event.trackId,
    participants: [
      { playerId: "local", control: "local", modelId: "kaido-gts", livery: {} },
      { playerId: event.opponent.id, control: "cpu", modelId: event.opponent.modelId, livery: event.opponent.livery },
    ],
    source: { kind: "campaign", id: event.id },
  });
  assertEqual(definition.runtime, "circuit");
  assertEqual(definition.trackId, "japan-noir");
  assertEqual(definition.rules.laps, 3);
  assertEqual(definition.source.kind, "campaign");
  assertEqual(Object.keys(definition.participants[0]).sort().join(), "control,livery,modelId,playerId");
});

test("a campaign circuit mission clearly blocks a selected model with no atlas", () => {
  const event = EVENTS.find((entry) => entry.modeId === MODE_CIRCUIT);
  const campaign = createCampaign({ eventId: event.id });
  const view = campaignView(campaign, cleared(), { circuitModelId: "shutter-z" });
  assertEqual(view.detail.circuitUnavailable, true);
  assert(view.detail.hint.includes("ATLAS UNAVAILABLE"));
});

test("the painted base decides whether a roster face is spent on the race", () => {
  // The ten are rationed: a rival the player has already beaten twice is not a
  // rival any more, so they are saved for the bases the *artwork* marks out as
  // rival and boss stops. A plain race base fields an anonymous local, whose
  // hands ride on the event rather than on a roster row.
  const rosterIds = new Set(RIVALS.map((rival) => rival.id));
  const spent = new Set();
  for (const event of EVENTS) {
    assert(event.opponent, `${event.id} has no opponent`);
    assert(modelById(event.opponent.modelId), `${event.id}'s opponent drives an unknown car`);

    const node = mapNodeById(event.nodeId);
    const painted = node.kind === NODE_RIVAL || node.kind === NODE_BOSS;
    const roster = rosterIds.has(event.opponent.id);
    assertEqual(roster, painted, `${event.id} is on a ${node.kind} base and fields ${event.opponent.id}`);

    if (roster) {
      // No profile of its own: the hands come from `rivals.js`, so a retune of
      // the ladder moves the campaign with it rather than leaving a driver who
      // drives differently depending on which screen you met them from.
      assert(!event.opponent.profile, `${event.id} overrides the roster's hands for ${event.opponent.id}`);
      assert(!spent.has(event.opponent.id), `${event.opponent.id} is spent twice`);
      spent.add(event.opponent.id);
    } else {
      assert(event.opponent.profile, `${event.id}'s opponent has no hands`);
    }
  }
});

test("every driver and every voice has a face the game can actually load", () => {
  // A face is cheap now and a roster face is not — the generic avatar roster is
  // what lets a nameless local and an unnamed contact look like people without
  // spending one of the ten. A stale avatar id resolves to null and degrades to
  // an initial on a plate, which is silent, so this is the only warning there
  // is that a row points at nothing.
  for (const event of EVENTS) {
    if (event.opponent.profile) {
      // A local's portrait comes from the avatar manifest. Roster drivers keep
      // their own and are covered by the rival asset test.
      assert(avatarById(event.opponent.avatarId), `${event.id}'s opponent wears the unknown face ${event.opponent.avatarId}`);
    }
    assert(entryFaceSrc(event.opponent), `${event.id}'s opponent has no portrait at all`);

    for (const beat of event.brief) {
      const speaker = speakerById(beat.speaker);
      assert(speaker, `${event.id} is spoken by the unknown ${beat.speaker}`);
      assert(speaker.name && speaker.role, `${beat.speaker} has no plate to draw`);
    }
  }

  // `VOICE_UNKNOWN` has no face **on purpose** — the number you found does not
  // come with a photograph — so a null here is the characterisation rather than
  // a missing asset. Everyone else has one.
  for (const contact of allContacts()) {
    const speaker = speakerById(contact.id);
    if (contact.id === VOICE_UNKNOWN) assertEqual(speaker.faceSrc, null, "the unknown voice must stay faceless");
    else assert(speaker.faceSrc, `${contact.id} has no portrait`);
  }
});

test("nothing the campaign draws asks for a full-size master", () => {
  // The map's strip draws a face at 62px and the briefing at 88; a card is
  // 768px and a master is 1254. `tests/modules.test.js` sweeps the source for a
  // `.src`, and this is the same claim checked through the values themselves.
  for (const src of campaignFaceSrcs()) {
    assert(src.includes("/thumbs/"), `${src} is not a thumb`);
    assert(!src.endsWith(".png"), `${src} is a master`);
  }
  // One per driver plus one per distinct voice, and no duplicates — this is
  // requested as a set on the way into the screen, so a list that grew with
  // every beat would be re-requesting the same contact nine times.
  assertEqual(campaignFaceSrcs().length, new Set(campaignFaceSrcs()).size);
});

test("every event is reachable from the first one", () => {
  const reached = new Set([FIRST_EVENT_ID]);
  // Fixed point rather than one pass: an event can be opened by an event that
  // was itself opened.
  for (let pass = 0; pass < EVENTS.length; pass += 1) {
    for (const event of EVENTS) {
      if (!reached.has(event.id)) continue;
      for (const next of event.unlocks) reached.add(next);
    }
  }
  for (const event of EVENTS) {
    assert(reached.has(event.id), `${event.id} can never be opened`);
    for (const required of event.requires) {
      assert(eventById(required), `${event.id} requires the unknown ${required}`);
    }
    for (const next of event.unlocks) {
      assert(eventById(next), `${event.id} unlocks the unknown ${next}`);
    }
  }
});

test("a briefing fits the box it is drawn in", () => {
  // The box is a fixed height on purpose — one that grew to fit its copy would
  // land on the artwork — so an over-long beat is caught here rather than by
  // somebody noticing it on screen. `render/campaign.js` clips at the same
  // number, so this failing is the only warning there is.
  for (const event of EVENTS) {
    assert(event.brief?.length > 0, `${event.id} has no briefing`);
    for (const beat of event.brief) {
      assert(beat.speaker, `a beat in ${event.id} has no speaker`);
      assert(
        beat.text.length <= CAMPAIGN_LAYOUT.briefing.maxLines,
        `a beat in ${event.id} is ${beat.text.length} lines`,
      );
    }
  }
  assert(splashSrc(EVENTS[0]).endsWith(".png"));
});

test("the briefing's furniture all fits inside its fixed box", () => {
  // The box does not grow to fit its copy — one that did would land on the
  // artwork — so everything drawn in it has to be checked against it instead.
  // The speaker's plate arriving on the left is what made this worth sweeping:
  // it pushed the dialogue down past where the hint sits.
  const { box, face, text, firstLine, lineHeight, maxLines, hint, dossier, title } = CAMPAIGN_LAYOUT.briefing;

  assert(face.y + face.size < box.height, "the speaker's plate runs out of the bottom of the box");
  assert(text.x > face.x + face.size, "the dialogue is drawn over the speaker's plate");
  const lastLine = firstLine + (maxLines - 1) * lineHeight;
  assert(lastLine < hint, `a ${maxLines}-line beat (${lastLine}) prints through the hint (${hint})`);
  assert(hint < box.height, "the hint is drawn below the box");

  // And the dossier is clear of the title beside it and the box beneath it. The
  // title is a baseline rather than a rect, so the separation that matters is
  // the column: the dossier lives in the right-hand third, which is also why the
  // splash art is composed around an empty middle.
  assert(dossier.x > title.x + CAMPAIGN_LAYOUT.screen.width / 2, "the dossier is drawn into the title's column");
  assert(dossier.y + dossier.height < box.y, "the dossier overlaps the dialogue box");
  assert(dossier.x + dossier.width <= CAMPAIGN_LAYOUT.screen.width, "the dossier runs off the screen");
  assert(dossier.face < dossier.width, "the dossier's face is wider than the card holding it");
  assert(box.y + box.height <= CAMPAIGN_LAYOUT.screen.height, "the dialogue box runs off the bottom");
});

// ---------------------------------------------------------------------------
// The career
// ---------------------------------------------------------------------------

test("a fresh career opens the first event and nothing else", () => {
  const progress = createProgress();
  assertEqual(eventStatus(progress, FIRST_EVENT_ID), STATUS_OPEN);
  for (const event of EVENTS.slice(1)) {
    assertEqual(eventStatus(progress, event.id), STATUS_LOCKED, `${event.id} starts locked`);
  }
  assertEqual(progressSummary(progress).cleared, 0);
});

test("losing counts the attempt and opens nothing", () => {
  // A career that hard-gates on a driver somebody cannot beat is a wall. An
  // event is retried freely; only a win moves the map.
  const first = eventById(FIRST_EVENT_ID);
  const { progress, unlocked, cleared: won } = completeEvent(createProgress(), FIRST_EVENT_ID, {
    won: false,
    value: 13000,
  });
  assertEqual(won, false);
  assertEqual(unlocked.length, 0);
  assertEqual(eventStatus(progress, first.unlocks[0]), STATUS_LOCKED);
  // The attempt is still on the board — the number is the player's whatever the
  // other lane did.
  assertEqual(progress.completed[FIRST_EVENT_ID].attempts, 1);
  assertEqual(progress.completed[FIRST_EVENT_ID].wins, 0);
  assertEqual(progress.completed[FIRST_EVENT_ID].bestValue, 13000);
});

test("winning clears the node and opens what it leads to, once", () => {
  const first = eventById(FIRST_EVENT_ID);
  const won = completeEvent(createProgress(), FIRST_EVENT_ID, { won: true, value: 12500 });
  assertEqual(won.cleared, true);
  assertEqual(won.firstClear, true);
  assertEqual(won.unlocked.join(), first.unlocks.join());
  assertEqual(eventStatus(won.progress, FIRST_EVENT_ID), STATUS_CLEARED);
  assertEqual(eventStatus(won.progress, first.unlocks[0]), STATUS_OPEN);

  // A second win re-opens nothing: `unlocked` is what the results screen prints,
  // and printing "NEW EVENT" on every replay is how a career stops meaning
  // anything.
  const again = completeEvent(won.progress, FIRST_EVENT_ID, { won: true, value: 12100 });
  assertEqual(again.firstClear, false);
  assertEqual(again.unlocked.length, 0);
  assertEqual(again.progress.completed[FIRST_EVENT_ID].wins, 2);
  assertEqual(again.progress.completed[FIRST_EVENT_ID].attempts, 2);
});

test("the best attempt is kept by the board's own direction", () => {
  const lower = (candidate, previous) => candidate < previous;
  let progress = completeEvent(createProgress(), FIRST_EVENT_ID, { won: true, value: 12500, better: lower }).progress;
  progress = completeEvent(progress, FIRST_EVENT_ID, { won: true, value: 12800, better: lower }).progress;
  assertEqual(progress.completed[FIRST_EVENT_ID].bestValue, 12500, "a slower run must not replace it");
  progress = completeEvent(progress, FIRST_EVENT_ID, { won: true, value: 12200, better: lower }).progress;
  assertEqual(progress.completed[FIRST_EVENT_ID].bestValue, 12200);
});

test("a saved career survives a round trip, and repairs itself", () => {
  const saved = JSON.parse(JSON.stringify(cleared()));
  // A row for an event that no longer exists is dropped rather than carried
  // along in every save from now on.
  saved.completed["ch9-deleted"] = { wins: 1, attempts: 1, bestValue: 1, at: 1 };
  saved.unlocked.push("ch9-deleted");
  // And an unlock the save forgot is restored from what has been cleared.
  saved.unlocked = [FIRST_EVENT_ID];

  const progress = createProgress(saved);
  assert(!Object.hasOwn(progress.completed, "ch9-deleted"));
  assert(!progress.unlocked.includes("ch9-deleted"));
  for (const event of EVENTS) {
    assertEqual(eventStatus(progress, event.id), STATUS_CLEARED, `${event.id} stays cleared`);
  }
});

test("a malformed count normalizes to zero rather than surviving as one", () => {
  // `Number(null)` is 0 and 0 is a legal attempt count, which is the same trap
  // `records.js` keeps `toNumber` for.
  const progress = createProgress({
    completed: { [FIRST_EVENT_ID]: { wins: null, attempts: "3", bestValue: "12000", at: null } },
  });
  assertEqual(progress.completed[FIRST_EVENT_ID].wins, 0);
  assertEqual(progress.completed[FIRST_EVENT_ID].attempts, 0);
  assertEqual(progress.completed[FIRST_EVENT_ID].bestValue, null);
});

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

test("the map opens on the first event's node and moves across the picture", () => {
  const progress = cleared();
  let campaign = createCampaign();
  assertEqual(campaign.stage, STAGE_MAP);
  assertEqual(campaignNode(campaign).id, eventById(FIRST_EVENT_ID).nodeId);
  assertEqual(campaignEvent(campaign).id, FIRST_EVENT_ID);

  const view = campaignView(campaign, progress);
  const first = view.nodes[0];
  assert(view.nodes[1].x > first.x, "the fixture assumes the route runs east");

  campaign = moveCampaign(campaign, "right");
  assertEqual(campaignNode(campaign).id, view.nodes[1].id);
  campaign = moveCampaign(campaign, "left");
  assertEqual(campaignNode(campaign).id, first.id);
  // Nothing wraps: on a picture this size a wrapped cursor is a cursor you lose.
  assertEqual(moveCampaign(campaign, "left").cursor, campaign.cursor);
});

test("a painted node with no event written for it reads as coming soon", () => {
  // The whole campaign is on the artwork the moment the screen opens, so an
  // unwritten stop cannot be silently ignored — and calling it "locked" would
  // promise a race that does not exist.
  const written = new Set(EVENTS.map((event) => event.nodeId));
  const unwritten = MAP_NODES.findIndex((node) => !written.has(node.id));
  assert(unwritten >= 0, "the fixture assumes the map is ahead of the catalog");

  const campaign = focusCampaign(createCampaign(), unwritten);
  const view = campaignView(campaign, cleared());
  assertEqual(view.nodes[unwritten].status, STATUS_SOON);
  assertEqual(campaignEvent(campaign), null);
  // It still names its district: geography stays visible, the race does not.
  assert(view.detail.region.length > 0);
  assertEqual(view.detail.opponent, null);
  // And it refuses to open rather than starting an empty briefing.
  assertEqual(confirmCampaign(campaign, cleared()).command, CAMPAIGN_LOCKED);
});

test("a locked node refuses to open, an open one starts its briefing", () => {
  const fresh = createProgress();
  let campaign = createCampaign();

  // Walk onto the second node, which a fresh career has not opened.
  campaign = moveCampaign(campaign, "right");
  assertEqual(eventStatus(fresh, campaignEvent(campaign).id), STATUS_LOCKED);
  const refused = confirmCampaign(campaign, fresh);
  assertEqual(refused.command, CAMPAIGN_LOCKED);
  assertEqual(refused.campaign.stage, STAGE_MAP);

  campaign = focusCampaign(campaign, 0);
  const opened = confirmCampaign(campaign, fresh);
  assertEqual(opened.command, "none");
  assertEqual(opened.campaign.stage, STAGE_BRIEFING);
});

test("the briefing turns its pages and then asks for the race", () => {
  const fresh = createProgress();
  const beats = eventById(FIRST_EVENT_ID).brief.length;
  let campaign = confirmCampaign(createCampaign(), fresh).campaign;

  for (let page = 1; page < beats; page += 1) {
    const view = campaignView(campaign, fresh);
    assertEqual(view.briefing.index, page);
    assertEqual(view.briefing.last, false);
    campaign = confirmCampaign(campaign, fresh).campaign;
  }

  const view = campaignView(campaign, fresh);
  assertEqual(view.briefing.index, beats);
  assertEqual(view.briefing.last, true);

  const done = confirmCampaign(campaign, fresh);
  assertEqual(done.command, CAMPAIGN_RACE);
  assertEqual(done.event.id, FIRST_EVENT_ID);
  // And it leaves the screen on the map, so backing out of the race lands
  // somewhere that makes sense rather than on a briefing that has been read.
  assertEqual(done.campaign.stage, STAGE_MAP);
});

test("ESC steps out of a briefing before it steps out of the screen", () => {
  const fresh = createProgress();
  const briefing = confirmCampaign(createCampaign(), fresh).campaign;
  const back = cancelCampaign(briefing);
  assertEqual(back.exit, false);
  assertEqual(back.campaign.stage, STAGE_MAP);
  assertEqual(cancelCampaign(back.campaign).exit, true);
});

test("a locked node says nothing about what it is", () => {
  const view = campaignView(moveCampaign(createCampaign(), "right"), createProgress());
  assertEqual(view.detail.locked, true);
  assertEqual(view.detail.opponent, null, "a locked node must not name its driver");
  assertEqual(view.detail.where, "", "a locked node must not name its race");
  const node = view.nodes.find((entry) => entry.status === STATUS_LOCKED);
  assert(node, "the fixture assumes a locked node");
});

test("a click lands on the node that was drawn, and nowhere else", () => {
  const view = campaignView(createCampaign(), cleared());
  for (const node of view.nodes) {
    const hit = hitCampaign(view, node.x, node.y);
    assertEqual(hit?.index, node.index, `${node.id} is not clickable at its own centre`);
  }
  // The detail panel is read rather than chosen — highlighting something a
  // click cannot act on is how a dead control gets drawn.
  assertEqual(hitCampaign(view, CAMPAIGN_LAYOUT.detail.x + 10, CAMPAIGN_LAYOUT.detail.y + 10), null);
  // And a briefing has no targets at all: the whole screen is ENTER.
  const briefing = campaignView(confirmCampaign(createCampaign(), cleared()).campaign, cleared());
  assertEqual(hitCampaign(briefing, view.nodes[0].x, view.nodes[0].y), null);
});

// ---------------------------------------------------------------------------
// Difficulty, measured
// ---------------------------------------------------------------------------

test("every drag event's opponent is beatable, and the opening one is a gift", () => {
  // The rival ladder's rule, applied to the campaign: difficulty is looser
  // hands, never a better car — so an event's difficulty is a measured
  // finishing time rather than an eyeballed one. A flawless human quarter is
  // 12.04s; the first thing a campaign has to do is let somebody win.
  const options = (event) => ({
    car: DEFAULT_CAR,
    gate,
    countdownSeconds: 3,
    ...raceOptionsFor(event.modeId, event.objectiveId),
  });

  const dragEvents = EVENTS.filter((event) => modeById(event.modeId).runtime === "drag");
  const times = dragEvents.map((event) => {
    const built = buildRival(event.opponent, options(event), event.seed);
    assert(built, `${event.id}'s opponent could not be built`);
    const replayed = replayRun(options(event), { events: built.log.events });
    assertEqual(replayed.race.phase, FINISHED, `${event.id}'s opponent never finished`);
    return { id: event.id, objectiveId: event.objectiveId, seconds: replayed.race.finishTime };
  });

  const quarters = times.filter((entry) => entry.objectiveId === "quarter");
  assert(quarters.length >= 2, "the fixture assumes two quarter-mile events");
  assert(quarters[0].seconds > 13.6, `the opener is ${quarters[0].seconds.toFixed(2)}s — too quick for a first race`);

  // The chapter gets harder, which is the only progression claim it makes —
  // and it is made **per distance** rather than across the whole route. The
  // three distances braid rather than ramp: an eighth is a launch and one
  // shift, a half is decided in the top two gears, and comparing a time from
  // one against a time from the other says nothing at all. That is also what
  // frees a bonus stop to be a change of question instead of a step up.
  const byDistance = new Map();
  for (const entry of times) {
    if (!byDistance.has(entry.objectiveId)) byDistance.set(entry.objectiveId, []);
    byDistance.get(entry.objectiveId).push(entry);
  }
  for (const [objectiveId, rungs] of byDistance) {
    for (let index = 1; index < rungs.length; index += 1) {
      assert(
        rungs[index].seconds < rungs[index - 1].seconds,
        `over the ${objectiveId}, ${rungs[index].id} (${rungs[index].seconds.toFixed(2)}s) is not quicker ` +
          `than ${rungs[index - 1].id} (${rungs[index - 1].seconds.toFixed(2)}s)`,
      );
    }
  }

  // Nobody in chapter one is beyond a clean run. Measured against the roster's
  // own best over the same distance rather than against one hardcoded number,
  // because the ladder's top rung is itself held above a flawless human lap —
  // so a campaign driver inside it is inside the human range by construction.
  const ceiling = { eighth: 8.2, quarter: 12.04, half: 19.4 };
  for (const entry of times) {
    assert(
      entry.seconds > ceiling[entry.objectiveId],
      `${entry.id} at ${entry.seconds.toFixed(2)}s is quicker than a flawless human ${entry.objectiveId}`,
    );
  }
});

test("an event plays the same way every time it is attempted", () => {
  // The seed is authored, which is what makes the difficulty above assertable
  // rather than eyeballed — and what stops a retry being a different race.
  const event = EVENTS[0];
  const options = { car: DEFAULT_CAR, gate, countdownSeconds: 3, ...raceOptionsFor(event.modeId, event.objectiveId) };
  const once = buildRival(event.opponent, options, event.seed);
  const twice = buildRival(event.opponent, options, event.seed);
  assertEqual(JSON.stringify(once.log.events), JSON.stringify(twice.log.events));
  assert(TICK_SECONDS > 0);
});

finish();
