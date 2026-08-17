// The coached first frame that replaced the how-to-play card.
//
// A bowling shot is three timed inputs and a line, and a paragraph describing
// them is read once and remembered by nobody. So "How to play" bowls: it starts
// an ordinary local match and walks the player through their own first frame,
// one step at a time, each one cleared by the player actually doing the thing.
//
// This module observes and paints. It never advances a match, never simulates a
// roll and never touches persistence — it asks the session what phase the shot
// is in and shows the step that matches. The one thing it does drive is the
// start of the lesson match, and that goes through the match runtime like any
// other caller. Screen navigation is handed back out through `onLeave`, because
// the composition root already owns which screen follows which.

const READY = "ready";
const SPIN = "spin";
const CHARGING = "charging";

// The lesson, in the order the shot is taken. `isDone` is the only gate: a step
// clears when the player has done it, never on a timer, so nobody is rushed past
// the input they came here to learn.
export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: "line",
    title: "Walk your line",
    copy: "Strafe with A and D to move where you stand, then aim with the arrow keys. The sliders on the rail do the same thing.",
    hint: "Move either control to carry on.",
    highlight: Object.freeze(["position-control", "aim-control"]),
    isDone: (view) => view.lineTouched || view.phase !== READY,
  }),
  Object.freeze({
    id: "spin",
    title: "Start the spin meter",
    copy: "Press Throw — or Space — to send the needle sweeping between a hard left and a hard right hook.",
    hint: "Hit Throw when your line looks right.",
    highlight: Object.freeze(["throw-button"]),
    isDone: (view) => view.phase !== READY,
  }),
  Object.freeze({
    id: "hook",
    title: "Lock the hook",
    copy: "Press again to stop the needle. Near an edge is a big hook back toward the pocket; the middle rolls it straight.",
    hint: "Stop the needle where you want the ball to turn.",
    highlight: Object.freeze(["spin-meter", "throw-button"]),
    isDone: (view) => view.phase !== READY && view.phase !== SPIN,
  }),
  Object.freeze({
    id: "power",
    title: "Release in the gold",
    copy: "Power is building now. Let go inside the gold window for the most speed — hold past it and the ball drains power instead.",
    hint: "Release Throw or Space to bowl.",
    highlight: Object.freeze(["power-meter", "throw-button"]),
    isDone: (view) => view.phase !== READY && view.phase !== SPIN && view.phase !== CHARGING,
  }),
  Object.freeze({
    id: "watch",
    title: "Watch it turn",
    copy: "More speed skids further before the hook bites. Less speed turns earlier. That trade is the whole game.",
    hint: "",
    highlight: Object.freeze([]),
    isDone: (view) => view.rolls >= 1,
  }),
  Object.freeze({
    id: "spare",
    title: "Take the second roll",
    copy: "Anything still standing is yours to clean up. Same three inputs — line, hook, power.",
    hint: "Bowl once more to finish the lesson.",
    highlight: Object.freeze([]),
    isDone: (view) => view.rolls >= 2 || view.turnPassed,
  }),
]);

// The lesson bowls the friendliest match the cabinet has: three frames, a rookie
// opponent who never actually gets a turn, and the player in seat one.
const TUTORIAL_SETUP = Object.freeze({
  modeId: "quick",
  playType: "cpu",
  cpuLevelId: "rookie",
  activeSlot: 0,
});

export function createTutorialCoach({
  session,
  matchRuntime,
  getElement = (id) => document.getElementById(id),
  onLeave = () => {},
  audio = null,
} = {}) {
  const card = getElement("tutorial-coach");
  const complete = getElement("tutorial-complete");
  const stepLabel = getElement("tutorial-step");
  const titleLabel = getElement("tutorial-title");
  const copyLabel = getElement("tutorial-copy");
  const hintLabel = getElement("tutorial-hint");

  let active = false;
  let finished = false;
  let stepIndex = 0;
  let baseline = null;
  let savedSetup = null;
  let highlighted = [];

  const currentStep = () => TUTORIAL_STEPS[stepIndex];

  // What the coach is allowed to know about the match: the shot phase, whether
  // the player has touched their line, and how far the frame has got.
  function readView() {
    const shot = session?.scene?.liveShot || {};
    const match = session?.match || null;
    return {
      phase: session?.scene?.phase || READY,
      lineTouched: Boolean(baseline)
        && (Math.abs((shot.position ?? 0) - baseline.position) > 0.001
          || Math.abs((shot.aim ?? 0) - baseline.aim) > 0.001),
      rolls: session?.matchFacts?.rolls?.length || 0,
      turnPassed: Boolean(match)
        && (match.activePlayer !== 0 || match.frameIndex > 0 || match.status === "complete"),
    };
  }

  function clearHighlights() {
    for (const element of highlighted) element?.classList?.remove("is-coached");
    highlighted = [];
  }

  function applyHighlights(step) {
    clearHighlights();
    for (const id of step.highlight) {
      const element = getElement(id);
      if (!element) continue;
      element.classList.add("is-coached");
      highlighted.push(element);
    }
  }

  function render() {
    const step = currentStep();
    if (stepLabel) stepLabel.textContent = `Step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}`;
    if (titleLabel) titleLabel.textContent = step.title;
    if (copyLabel) copyLabel.textContent = step.copy;
    if (hintLabel) {
      hintLabel.textContent = step.hint;
      hintLabel.hidden = !step.hint;
    }
    applyHighlights(step);
    if (card) card.hidden = false;
  }

  // The frame is over, so the lesson is. Pausing is what keeps the rookie
  // opponent off the lane: the tick loop stops advancing a paused match, so the
  // lesson ends on the player's own roll rather than rolling on into a CPU turn.
  function finish() {
    finished = true;
    clearHighlights();
    if (card) card.hidden = true;
    if (complete) complete.hidden = false;
    session.paused = true;
    audio?.play?.("popup");
  }

  function observe() {
    if (!active || finished) return;
    let view = readView();
    while (stepIndex < TUTORIAL_STEPS.length - 1 && currentStep().isDone(view)) {
      stepIndex += 1;
      view = readView();
      render();
    }
    if (currentStep().isDone(view)) finish();
  }

  function start() {
    if (active) return false;
    active = true;
    finished = false;
    stepIndex = 0;
    savedSetup = { ...session.setup };
    Object.assign(session.setup, TUTORIAL_SETUP);
    session.tutorialMatch = true;
    matchRuntime.startMatch();
    // Read after the match has racked, so a control the player has not touched
    // yet compares against what the lesson actually put in front of them.
    baseline = {
      position: session.scene.liveShot.position ?? 0,
      aim: session.scene.liveShot.aim ?? 0,
    };
    if (complete) complete.hidden = true;
    render();
    return true;
  }

  function exit(destination = "title") {
    if (!active) return false;
    active = false;
    finished = false;
    clearHighlights();
    if (card) card.hidden = true;
    if (complete) complete.hidden = true;
    if (savedSetup) Object.assign(session.setup, savedSetup);
    savedSetup = null;
    baseline = null;
    session.tutorialMatch = false;
    // The lesson is unpaused on the way out, and the pause card is the visible
    // half of that state: a lesson left while the tab was backgrounded would
    // otherwise drop the player on the next screen behind a "Take five" card.
    session.paused = false;
    const pauseOverlay = getElement("pause-overlay");
    if (pauseOverlay) pauseOverlay.hidden = true;
    onLeave(destination);
    return true;
  }

  function bind() {
    getElement("tutorial-skip")?.addEventListener("click", () => exit("title"));
    getElement("tutorial-exit")?.addEventListener("click", () => exit("title"));
    getElement("tutorial-play")?.addEventListener("click", () => exit("setup"));
  }

  return {
    bind,
    start,
    exit,
    observe,
    isActive: () => active,
    currentStep,
  };
}
