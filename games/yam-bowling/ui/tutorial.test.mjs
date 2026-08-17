import test from "node:test";
import assert from "node:assert/strict";

import { createTutorialCoach, TUTORIAL_STEPS } from "./tutorial.mjs";

// The coach only ever reads the session and paints a card, so the stub is small:
// a handful of nodes and a scene the test drives by hand, exactly the way the
// real match runtime drives it.
function element() {
  const node = {
    hidden: true,
    textContent: "",
    className: "",
    listeners: {},
    classList: {
      set: new Set(),
      add(name) { this.set.add(name); },
      remove(name) { this.set.delete(name); },
      contains(name) { return this.set.has(name); },
    },
    addEventListener(type, handler) { this.listeners[type] = handler; },
  };
  return node;
}

function harness() {
  const ids = [
    "tutorial-coach", "tutorial-step", "tutorial-title", "tutorial-copy", "tutorial-hint",
    "tutorial-skip", "tutorial-complete", "tutorial-play", "tutorial-exit", "pause-overlay",
    "position-control", "aim-control", "throw-button", "spin-meter", "power-meter",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, element()]));
  const session = {
    setup: {
      modeId: "classic",
      playType: "local",
      cpuLevelId: "champion",
      activeSlot: 1,
      characterSlugs: ["nia-brooks", "daisy-monroe"],
      skinIds: ["canon", "canon"],
    },
    scene: { phase: "ready", liveShot: { position: 0, aim: 0.1 } },
    match: { status: "playing", activePlayer: 0, frameIndex: 0 },
    matchFacts: { rolls: [] },
    paused: false,
    tutorialMatch: false,
  };
  const started = [];
  const left = [];
  const coach = createTutorialCoach({
    session,
    matchRuntime: { startMatch: () => started.push(structuredClone(session.setup)) },
    getElement: (id) => nodes[id],
    onLeave: (destination) => left.push(destination),
    audio: { play: () => {} },
  });
  return { nodes, session, started, left, coach };
}

// Walk the coach to the step named, driving the session the way a real match
// would. Returns the coach so a test can keep going from there.
function advanceTo(harnessed, stepId) {
  const { session, coach } = harnessed;
  const script = ["line", "spin", "hook", "power", "watch", "spare"];
  const target = script.indexOf(stepId);
  const drive = {
    spin: () => { session.scene.liveShot.position = 0.2; },
    hook: () => { session.scene.phase = "spin"; },
    power: () => { session.scene.phase = "charging"; },
    watch: () => { session.scene.phase = "approach"; },
    spare: () => { session.matchFacts.rolls.push({ frameIndex: 0, rollIndex: 0 }); },
  };
  for (let index = 1; index <= target; index += 1) {
    drive[script[index]]();
    coach.observe();
  }
  return coach;
}

test("the script teaches the shot in the order the shot is taken", () => {
  assert.deepEqual(TUTORIAL_STEPS.map((step) => step.id), ["line", "spin", "hook", "power", "watch", "spare"]);
  for (const step of TUTORIAL_STEPS) {
    assert.equal(typeof step.title, "string");
    assert.ok(step.title.length > 0, `${step.id} needs a title`);
    assert.ok(step.copy.length > 0, `${step.id} needs copy`);
    assert.equal(typeof step.isDone, "function");
  }
});

// The press that stops the spin needle is the same press that charges power, so
// a player told only to "press again" taps it and bowls a dead shot before the
// power step is ever shown. The hold has to be taught on the press itself.
test("the hold is taught on the press that starts the power build, not after it", () => {
  const byId = Object.fromEntries(TUTORIAL_STEPS.map((step) => [step.id, step]));
  const hook = `${byId.hook.copy} ${byId.hook.hint}`.toLowerCase();
  assert.match(hook, /hold/, "the hook step must tell the player to hold the press, not tap it");
  assert.doesNotMatch(byId.hook.copy.toLowerCase(), /press again\b(?!.*hold)/);
  assert.match(
    `${byId.spin.copy} ${byId.spin.hint}`.toLowerCase(),
    /hold/,
    "the step before it must warn that the next press is held",
  );
});

test("starting the tutorial bowls a real match on its own setup and restores the player's", () => {
  const { session, started, coach, nodes } = harness();
  coach.bind();

  assert.equal(coach.start(), true);
  assert.equal(started.length, 1);
  assert.deepEqual(
    { modeId: started[0].modeId, playType: started[0].playType, cpuLevelId: started[0].cpuLevelId },
    { modeId: "quick", playType: "cpu", cpuLevelId: "rookie" },
  );
  assert.equal(session.tutorialMatch, true);
  assert.equal(nodes["tutorial-coach"].hidden, false);
  assert.equal(coach.currentStep().id, "line");

  coach.exit();
  assert.equal(session.tutorialMatch, false);
  assert.equal(session.setup.modeId, "classic");
  assert.equal(session.setup.playType, "local");
  assert.equal(session.setup.cpuLevelId, "champion");
  assert.deepEqual(session.setup.characterSlugs, ["nia-brooks", "daisy-monroe"]);
  assert.equal(nodes["tutorial-coach"].hidden, true);
});

test("the coach is inert until it is started", () => {
  const { coach, nodes, session } = harness();
  session.scene.phase = "charging";
  coach.observe();
  assert.equal(coach.isActive(), false);
  assert.equal(nodes["tutorial-coach"].hidden, true);
});

test("each step is cleared by the player doing the thing, not by a timer", () => {
  const harnessed = harness();
  const { session, coach } = harnessed;
  coach.start();

  assert.equal(coach.currentStep().id, "line");
  coach.observe();
  assert.equal(coach.currentStep().id, "line", "a step must not clear itself while the player has done nothing");

  session.scene.liveShot.aim = 0.3;
  coach.observe();
  assert.equal(coach.currentStep().id, "spin");

  session.scene.phase = "spin";
  coach.observe();
  assert.equal(coach.currentStep().id, "hook");

  session.scene.phase = "charging";
  coach.observe();
  assert.equal(coach.currentStep().id, "power");

  session.scene.phase = "approach";
  coach.observe();
  assert.equal(coach.currentStep().id, "watch");

  session.matchFacts.rolls.push({ frameIndex: 0, rollIndex: 0 });
  coach.observe();
  assert.equal(coach.currentStep().id, "spare");
});

test("a player who throws immediately skips the line step rather than getting stuck behind it", () => {
  const { session, coach } = harness();
  coach.start();
  session.scene.phase = "spin";
  coach.observe();
  assert.equal(coach.currentStep().id, "hook");
});

test("the step highlights the control it is talking about, and only that one", () => {
  const harnessed = harness();
  const { nodes, coach } = harnessed;
  coach.start();
  assert.equal(nodes["position-control"].classList.contains("is-coached"), true);
  assert.equal(nodes["throw-button"].classList.contains("is-coached"), false);

  advanceTo(harnessed, "spin");
  assert.equal(nodes["position-control"].classList.contains("is-coached"), false);
  assert.equal(nodes["throw-button"].classList.contains("is-coached"), true);
});

test("finishing the frame pauses the lane and shows the completion card", () => {
  const harnessed = harness();
  const { session, nodes, coach } = harnessed;
  coach.start();
  advanceTo(harnessed, "spare");
  assert.equal(nodes["tutorial-complete"].hidden, true);

  session.matchFacts.rolls.push({ frameIndex: 0, rollIndex: 1 });
  coach.observe();

  assert.equal(nodes["tutorial-complete"].hidden, false);
  assert.equal(nodes["tutorial-coach"].hidden, true);
  // The lane is paused rather than left running, so the CPU opponent never takes
  // a turn the lesson did not ask for.
  assert.equal(session.paused, true);
  assert.equal(coach.isActive(), true);
});

test("a strike ends the lesson on one roll instead of waiting for a second", () => {
  const harnessed = harness();
  const { session, nodes, coach } = harnessed;
  coach.start();
  advanceTo(harnessed, "spare");

  session.match.activePlayer = 1;
  coach.observe();

  assert.equal(nodes["tutorial-complete"].hidden, false);
  assert.equal(session.paused, true);
});

test("every way out restores the session and hands navigation back to the caller", () => {
  for (const [button, destination] of [["tutorial-skip", "title"], ["tutorial-exit", "title"], ["tutorial-play", "setup"]]) {
    const { session, nodes, left, coach } = harness();
    coach.bind();
    coach.start();
    // The tab was backgrounded mid-roll, which is the cabinet's own auto-pause.
    session.paused = true;
    nodes["pause-overlay"].hidden = false;

    nodes[button].listeners.click();

    assert.deepEqual(left, [destination]);
    assert.equal(coach.isActive(), false);
    assert.equal(session.tutorialMatch, false);
    assert.equal(session.paused, false);
    assert.equal(session.setup.modeId, "classic");
    assert.equal(nodes["tutorial-coach"].hidden, true);
    assert.equal(nodes["tutorial-complete"].hidden, true);
    assert.equal(nodes["pause-overlay"].hidden, true, "leaving must not strand the player behind a pause card");
  }
});

test("the coach paints the live step into the card", () => {
  const harnessed = harness();
  const { nodes, coach } = harnessed;
  coach.start();
  assert.equal(nodes["tutorial-step"].textContent, "Step 1 of 6");
  assert.equal(nodes["tutorial-title"].textContent, TUTORIAL_STEPS[0].title);
  assert.equal(nodes["tutorial-copy"].textContent, TUTORIAL_STEPS[0].copy);

  advanceTo(harnessed, "power");
  assert.equal(nodes["tutorial-step"].textContent, "Step 4 of 6");
  assert.equal(nodes["tutorial-title"].textContent, TUTORIAL_STEPS[3].title);
});
