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
  clock = globalThis,
  body = { classList: noopClassList },
  isCpu = () => false,
  setMessage = () => {},
  render = () => {},
  maybeStartCpuTurn = () => {},
  applyAction = () => {},
  onFinish = () => {},
} = {}) {
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
    if (beforeAction) applyAction(beforeAction);
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
        if (afterAction) applyAction(afterAction);
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
      onFinish();
      return;
    }

    maybeStartCpuTurn();
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
    reset,
    scheduleFlush,
    shouldDelayCpu: () => Boolean(
      pendingDialogue || pendingSpotlight || pendingBeforeDialogueAction,
    ),
  };
}
