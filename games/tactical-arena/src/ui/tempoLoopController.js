import {
  TEMPO_GAUGE_MAX,
  advanceTempoBattle,
  getTempoReadiness,
  isTempoBattle,
  isTempoUnitReady,
} from "../core/tempoBattle.js";

export function tempoStructuralSignature(state, isReady = isTempoUnitReady) {
  const ready = state.units
    .filter((unit) => unit.hp > 0 && isReady(state, unit))
    .map((unit) => unit.id)
    .join(",");
  const vitals = state.units
    .map((unit) => `${unit.id}:${unit.hp}:${unit.mp}:${unit.spent ? 1 : 0}:${(unit.statuses ?? []).length}`)
    .join("|");
  return `${state.phase}#${state.activation?.unitId ?? ""}#${ready}#${vitals}`;
}

export function createTempoLoopController({
  runtime,
  menu = { active: null },
  dialogue = { isOpen: () => false },
  clock = globalThis,
  now = () => globalThis.performance?.now?.() ?? 0,
  root = globalThis.document,
  render = () => {},
  announceTurnChange = () => {},
  maybeStartTempoCpuTurn = () => {},
  playRolloverFx = () => {},
} = {}) {
  let frame = 0;
  let lastFrameAt = 0;
  let renderSignature = "";

  function stop() {
    if (frame) clock.cancelAnimationFrame(frame);
    frame = 0;
    lastFrameAt = 0;
    renderSignature = "";
    runtime.tempoCpuActing = false;
    runtime.tempoCpuAbort = false;
    runtime.tempoAnimating = 0;
    runtime.tempoBusy = false;
  }

  function updateGauges() {
    if (!isTempoBattle(runtime.state)) return;
    for (const element of root.querySelectorAll(".vital-tempo[data-tempo-unit]")) {
      const unitId = element.dataset.tempoUnit;
      const pct = Math.max(0, Math.min(100, Math.round(
        getTempoReadiness(runtime.state, unitId) / TEMPO_GAUGE_MAX * 100,
      )));
      const ready = pct >= 100;
      const fill = element.querySelector(".vital-fill");
      const number = element.querySelector(".vital-num");
      if (fill) fill.style.width = `${pct}%`;
      if (number) number.textContent = ready ? "READY" : `${pct}%`;
      element.classList.toggle("is-ready", ready);
    }
  }

  function start() {
    stop();
    lastFrameAt = now();
    const tick = (timestamp) => {
      frame = 0;
      if (!isTempoBattle(runtime.state) || menu.active !== "match") return;
      const delta = Math.min(250, Math.max(0, timestamp - lastFrameAt));
      lastFrameAt = timestamp;
      if (runtime.state.phase === "playing" && !dialogue.isOpen()) {
        const advanced = advanceTempoBattle(runtime.state, delta);
        if (advanced.state !== runtime.state) {
          runtime.state = advanced.state;
          if (advanced.events?.length) playRolloverFx(advanced.events);
          if (runtime.resolving || runtime.tempoAnimating > 0) {
            updateGauges();
          } else {
            const signature = tempoStructuralSignature(runtime.state);
            if (advanced.events?.length || signature !== renderSignature) {
              renderSignature = signature;
              render();
              announceTurnChange(null);
              maybeStartTempoCpuTurn();
            } else {
              updateGauges();
            }
          }
        }
      }
      frame = clock.requestAnimationFrame(tick);
    };
    frame = clock.requestAnimationFrame(tick);
  }

  return { start, stop, updateGauges };
}
