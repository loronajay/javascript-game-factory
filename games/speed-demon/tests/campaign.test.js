import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { DEFAULT_CAR, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { FINISHED } from "../scripts/sim/race.js";
import { raceOptionsFor, modeById, objectiveOption } from "../scripts/sim/modes.js";
import { replayRun } from "../scripts/sim/input-log.js";
import { buildRival } from "../scripts/rival/lineup.js";
import { RIVALS } from "../scripts/rival/rivals.js";
import { modelById } from "../scripts/assets/car-atlas.js";
import { trackById } from "../scripts/ui/track-layout.js";
import { boardIdFor } from "../scripts/records/records.js";
import { EVENTS, FIRST_EVENT_ID, eventById, splashSrc } from "../scripts/campaign/events.js";
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
  campaignEvent,
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

test("every event names a track, a mode and an objective the game actually has", () => {
  for (const event of EVENTS) {
    assert(trackById(event.trackId), `${event.id} names an unknown track`);
    const mode = modeById(event.modeId);
    assert(mode, `${event.id} names an unknown mode`);
    // Through the catalog rather than by string match, because a stale id
    // silently falls back to the mode's default — which would mean an event
    // quietly racing a different distance from the one it advertises.
    assertEqual(objectiveOption(mode, event.objectiveId).id, event.objectiveId, `${event.id}'s objective`);
    assert(mode.rival, `${event.id} must build on a mode that has a second car`);
  }
});

test("an event's run files to a board a solo run can also reach", () => {
  // A campaign race is a rival race, and a rival race is physically identical
  // to a solo one over the same distance — same lane, no lateral axis. Boards
  // of its own would split one ladder in two.
  for (const event of EVENTS) {
    const boardId = boardIdFor(event.modeId, event.objectiveId);
    assert(boardId?.startsWith("distance:"), `${event.id} files to ${boardId}`);
  }
});

test("the opening opponents are nobody, and the roster is untouched", () => {
  // The ten faces are the campaign's rivals and bosses. Spending one on a
  // tutorial race wastes it, so chapter one races anonymous locals whose
  // profile rides on the event rather than on a roster row.
  const rosterIds = new Set(RIVALS.map((rival) => rival.id));
  for (const event of EVENTS) {
    assert(event.opponent, `${event.id} has no opponent`);
    assert(event.opponent.profile, `${event.id}'s opponent has no hands`);
    assert(!rosterIds.has(event.opponent.id), `${event.id} spends the roster face ${event.opponent.id}`);
    assert(modelById(event.opponent.modelId), `${event.id}'s opponent drives an unknown car`);
  }
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

test("the map opens on a node and moves toward the one drawn that way", () => {
  const progress = cleared();
  let campaign = createCampaign();
  assertEqual(campaign.stage, STAGE_MAP);
  assertEqual(campaignEvent(campaign).id, FIRST_EVENT_ID);

  const view = campaignView(campaign, progress);
  const first = view.nodes[0];
  const second = view.nodes[1];
  assert(second.x > first.x, "the fixture assumes the second node is to the right");

  campaign = moveCampaign(campaign, "right");
  assertEqual(campaignEvent(campaign).id, second.id);
  campaign = moveCampaign(campaign, "left");
  assertEqual(campaignEvent(campaign).id, first.id);
  // Nothing wraps: on a map with a handful of nodes a wrapped cursor is a
  // cursor you lose.
  assertEqual(moveCampaign(campaign, "left").cursor, campaign.cursor);
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

test("no two nodes overlap", () => {
  const view = campaignView(createCampaign(), createProgress());
  for (const a of view.nodes) {
    for (const b of view.nodes) {
      if (a.index >= b.index) continue;
      assert(
        Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius + 12,
        `${a.id} and ${b.id} are drawn on top of each other`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Difficulty, measured
// ---------------------------------------------------------------------------

test("every event's opponent is beatable, and the opening one is a gift", () => {
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

  const times = EVENTS.map((event) => {
    const built = buildRival(event.opponent, options(event), event.seed);
    assert(built, `${event.id}'s opponent could not be built`);
    const replayed = replayRun(options(event), { events: built.log.events });
    assertEqual(replayed.race.phase, FINISHED, `${event.id}'s opponent never finished`);
    return { id: event.id, objectiveId: event.objectiveId, seconds: replayed.race.finishTime };
  });

  const quarters = times.filter((entry) => entry.objectiveId === "quarter");
  assert(quarters.length >= 2, "the fixture assumes two quarter-mile events");
  assert(quarters[0].seconds > 13.6, `the opener is ${quarters[0].seconds.toFixed(2)}s — too quick for a first race`);
  // And the chapter gets harder, which is the only progression claim it makes.
  for (let index = 1; index < quarters.length; index += 1) {
    assert(
      quarters[index].seconds < quarters[index - 1].seconds,
      `${quarters[index].id} is not quicker than ${quarters[index - 1].id}`,
    );
  }
  // Nobody in chapter one is beyond a clean run.
  for (const entry of quarters) {
    assert(entry.seconds > 12.04, `${entry.id} is quicker than a flawless human lap`);
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
