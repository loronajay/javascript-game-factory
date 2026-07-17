import { createUnit, findUnit } from "../core/state.js";
import { getInitialMp, getUnitType } from "../core/unitCatalog.js";
import {
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_BASICS_ID,
  TUTORIAL_CATALOG,
  completeTutorial,
  recordTutorialCommand,
} from "../tutorials/basics.js";

export function hasTutorialPresentation(update = {}) {
  return Boolean(
    update.prompt
      || update.dialogue
      || update.completed
      || update.spotlight
      || update.selectUnitId
      || update.beforeDialogueAction
      || update.afterDialogueAction,
  );
}

const noopClassList = { add() {}, remove() {} };

export function createTutorialPresentationController({
  runtime,
  interaction,
  dialogue,
  menu = null,
  storage = globalThis.localStorage,
  clock = globalThis,
  body = { classList: noopClassList },
  isCpu = () => false,
  setMessage = () => {},
  render = () => {},
  maybeStartCpuTurn = () => {},
  // Test seams: real implementations live below; pass overrides to observe them.
  applyAction = null,
  onFinish = null,
} = {}) {
  const applyPresentationAction = applyAction ?? applyTutorialAction;
  const finishPresentation = onFinish ?? finishTutorial;
  let pendingPrompt = null;
  let pendingDialogue = null;
  let pendingComplete = false;
  let pendingSpotlight = null;
  let pendingSelectUnitId = null;
  let pendingBeforeDialogueAction = null;
  let pendingAfterDialogueAction = null;
  let presentationTimer = 0;

  function clearTimer() {
    if (!presentationTimer) return;
    clock.clearTimeout(presentationTimer);
    presentationTimer = 0;
  }

  function clearSpotlight() {
    body.classList.remove("tutorial-spotlight-hp", "tutorial-spotlight-mp");
  }

  function showSpotlight(spotlight) {
    clearSpotlight();
    if (spotlight === "hp" || spotlight === "mp") {
      body.classList.add(`tutorial-spotlight-${spotlight}`);
    }
  }

  function consumePrompt(fallback = "") {
    const prompt = pendingPrompt;
    pendingPrompt = null;
    return prompt || fallback;
  }

  function showPromptForLocalTurn() {
    if (!pendingPrompt || dialogue.isOpen() || isCpu(runtime.state?.currentPlayer)) return;
    setMessage(consumePrompt(""));
  }

  function applySelection() {
    if (!pendingSelectUnitId) return;
    interaction.selectedId = pendingSelectUnitId;
    interaction.mode = null;
    interaction.footworkPath = [];
    interaction.volleyShotOrigin = null;
    pendingSelectUnitId = null;
    render();
  }

  function consumeBeforeDialogueAction() {
    const action = pendingBeforeDialogueAction;
    pendingBeforeDialogueAction = null;
    return action;
  }

  function consumeAfterDialogueAction() {
    const action = pendingAfterDialogueAction;
    pendingAfterDialogueAction = null;
    return action;
  }

  function scheduleFlush() {
    clearTimer();
    presentationTimer = clock.setTimeout(() => {
      presentationTimer = 0;
      flush();
    }, 0);
  }

  function queue(update = {}) {
    if (!runtime.tutorial) return;
    if (update.prompt) pendingPrompt = update.prompt;
    if (update.dialogue) pendingDialogue = update.dialogue;
    if (update.completed) pendingComplete = true;
    if (update.spotlight) pendingSpotlight = update.spotlight;
    if (update.selectUnitId) pendingSelectUnitId = update.selectUnitId;
    if (update.beforeDialogueAction) pendingBeforeDialogueAction = update.beforeDialogueAction;
    if (update.afterDialogueAction) pendingAfterDialogueAction = update.afterDialogueAction;
    scheduleFlush();
  }

  function flush() {
    if (!runtime.tutorial || runtime.resolving || runtime.cpuThinking || dialogue.isOpen()) return;

    const beforeAction = consumeBeforeDialogueAction();
    if (beforeAction) applyPresentationAction(beforeAction);
    applySelection();

    const spotlight = pendingSpotlight;
    pendingSpotlight = null;
    if (spotlight) showSpotlight(spotlight);

    if (pendingDialogue) {
      const script = pendingDialogue;
      pendingDialogue = null;
      dialogue.show(script).then(() => {
        clearSpotlight();
        const afterAction = consumeAfterDialogueAction();
        if (afterAction) applyPresentationAction(afterAction);
        showPromptForLocalTurn();
        maybeStartCpuTurn();
        flush();
      });
      return;
    }

    if (spotlight) clock.setTimeout(clearSpotlight, 1700);
    showPromptForLocalTurn();

    if (pendingComplete) {
      pendingComplete = false;
      finishPresentation();
      return;
    }

    maybeStartCpuTurn();
  }

  // --- Built-in presentation actions (scripted mid-match state mutation) ---

  function applyTutorialAction(action) {
    if (!action) return;
    if (action.type === "revealUnit") {
      revealTutorialUnit(action.unitId, action.position);
      if (Number.isInteger(action.currentPlayer)) runtime.state.currentPlayer = action.currentPlayer;
      runtime.state.activation = null;
      render();
      return;
    }
    if (action.type === "formationSwap") {
      for (const unitId of action.hideUnitIds ?? []) hideTutorialUnit(unitId);
      for (const spawn of action.revealUnits ?? []) revealTutorialUnit(spawn.unitId, spawn.position, spawn.hp, spawn.mp, spawn.spent);
      for (const spawn of action.spawnUnits ?? []) spawnTutorialUnit(spawn);
      if (Number.isInteger(action.currentPlayer)) runtime.state.currentPlayer = action.currentPlayer;
      runtime.state.activation = null;
      render();
      if (action.dialogue || action.prompt) queue({ dialogue: action.dialogue, prompt: action.prompt });
    }
  }

  // Introduces a brand-new unit mid-match for a scripted formation swap (the RAGE
  // tutorial's second enemy Magician "arriving" for its new formation) rather than
  // revealing one already present in the squad — buildRoster caps a squad at the
  // four corner-block cells, so a fresh unit can't just ride in the initial squads.
  function spawnTutorialUnit({ id, type, player, position, hp = null, mp = null, skin = null, spent = false }) {
    if (findUnit(runtime.state, id)) return;
    const unit = createUnit({ id, type, player, x: position.x, y: position.y, skin });
    if (Number.isFinite(hp)) unit.hp = hp;
    if (Number.isFinite(mp)) unit.mp = mp;
    unit.spent = Boolean(spent);
    runtime.state.units.push(unit);
  }

  function revealTutorialUnit(unitId, position = null, hp = null, mp = null, spent = false) {
    const unit = findUnit(runtime.state, unitId);
    if (!unit) return;
    const definition = getUnitType(unit.type);
    if (position) unit.position = { ...position };
    unit.hp = Number.isFinite(hp) ? hp : definition.stats.maxHp;
    unit.mp = Number.isFinite(mp) ? mp : getInitialMp(definition);
    unit.spent = Boolean(spent);
    unit.defending = false;
    if (unitId === TUTORIAL_ARTS_PLAYER_MYSTIC_ID) {
      setMessage("The Mystic joins the field. Activate her and use Pray to heal the Archer.");
    }
  }

  // Kills a unit outside combat for a scripted formation swap (e.g. the RAGE tutorial's
  // trapped Magician "disappearing" once Nuke resolves). Mirrors revealTutorialUnit in
  // reverse; hp<=0 already excludes it from rendering and turn order everywhere else.
  function hideTutorialUnit(unitId) {
    const unit = findUnit(runtime.state, unitId);
    if (!unit) return;
    unit.hp = 0;
    unit.spent = true;
    unit.defending = false;
  }

  // --- Built-in completion presentation ---

  function finishTutorial() {
    interaction.resolving = true;
    interaction.selectedId = null;
    interaction.mode = null;
    interaction.footworkPath = [];
    interaction.volleyShotOrigin = null;
    render();

    const progress = completeTutorial(storage, runtime.tutorial.id ?? TUTORIAL_BASICS_ID);
    setMessage(consumePrompt("Tutorial complete."));
    menu?.showTutorialComplete({
      title: tutorialCompleteTitle(runtime.tutorial.id),
      tutorialId: runtime.tutorial.id,
      rewardChoices: progress.rewardChoices,
      selectedRewardSkin: progress.selectedRewardSkin,
      rewardGranted: progress.rewardGranted,
      allTutorialsComplete: progress.allTutorialsComplete,
    });
  }

  function tutorialCompleteTitle(tutorialId) {
    const entry = TUTORIAL_CATALOG.find((candidate) => candidate.id === tutorialId);
    return entry ? `${entry.title} Complete` : "Tutorial Complete";
  }

  // --- Command bookkeeping ---

  function record(command, result, previousPlayer) {
    if (!runtime.tutorial) return;
    const update = recordTutorialCommand(runtime.tutorial, {
      command,
      events: result.events ?? [],
      match: runtime.state,
      previousPlayer,
    });
    // Some scripted moments (the RAGE tutorial's Nuke wiping every real enemy
    // commander) trigger a genuine victory the tutorial isn't ready to end on yet.
    // This must revert synchronously, before the caller's announceTurnChange() reads
    // state.phase, or a results screen flashes in ahead of the follow-up dialogue.
    if (update.revertVictory && runtime.state.phase === "complete") {
      runtime.state.phase = "playing";
      runtime.state.winner = null;
      runtime.state.activation = null;
    }
    queue(update);
  }

  function reset() {
    clearTimer();
    pendingPrompt = null;
    pendingDialogue = null;
    pendingComplete = false;
    pendingSpotlight = null;
    pendingSelectUnitId = null;
    pendingBeforeDialogueAction = null;
    pendingAfterDialogueAction = null;
    clearSpotlight();
  }

  return {
    consumePrompt,
    flush,
    hasPendingDialogue: () => Boolean(pendingDialogue),
    queue,
    record,
    reset,
    scheduleFlush,
    shouldDelayCpu: () => Boolean(
      pendingDialogue || pendingSpotlight || pendingBeforeDialogueAction,
    ),
  };
}
