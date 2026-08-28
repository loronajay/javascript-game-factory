// DOM binding for the Trick Shot Lab. It owns no layout, physics, or saved data.

import { BOARD_PIECE, CANNON_PIECE } from "../sim/trick-shot.js";

const byId = (root, id) => root.querySelector(`#${id}`);

export function createTrickShotView(root, handlers = {}) {
  let bankSignature = "";
  const nodes = {
    status: byId(root, "trickStatus"),
    hint: byId(root, "trickHint"),
    powerGauge: byId(root, "trickPowerGauge"),
    powerFill: byId(root, "trickPowerFill"),
    powerReadout: byId(root, "trickPowerReadout"),
    powerCue: byId(root, "trickPowerCue"),
    name: byId(root, "trickShotName"),
    inspector: byId(root, "trickInspector"),
    inspectorTitle: byId(root, "trickInspectorTitle"),
    bank: byId(root, "trickBankList"),
    empty: byId(root, "trickEmptyState"),
    depth: byId(root, "trickDepth"),
    angle: byId(root, "trickAngle"),
    pitch: byId(root, "trickPitch"),
    power: byId(root, "trickPower"),
    delay: byId(root, "trickDelay"),
    bounce: byId(root, "trickBounce"),
    angleLabel: byId(root, "trickAngleLabel"),
    pitchLabel: byId(root, "trickPitchLabel"),
    pitchRow: byId(root, "trickPitchRow"),
    powerRow: byId(root, "trickPowerRow"),
    delayRow: byId(root, "trickDelayRow"),
    bounceRow: byId(root, "trickBounceRow"),
  };

  const actionMap = [
    ["trickExit", "onExit"], ["trickAddBoard", "onAddBoard"], ["trickAddCannon", "onAddCannon"],
    ["trickUndo", "onUndo"], ["trickResetBall", "onResetBall"], ["trickDeletePiece", "onDeletePiece"],
    ["trickSave", "onSave"], ["trickNew", "onNew"],
  ];
  for (const [id, handler] of actionMap) byId(root, id)?.addEventListener("click", () => handlers[handler]?.());

  const fields = [
    [nodes.depth, "depth"], [nodes.angle, "angle"], [nodes.pitch, "pitch"],
    [nodes.power, "power"], [nodes.delay, "delay"], [nodes.bounce, "bounce"],
  ];
  for (const [input, field] of fields) input?.addEventListener("input", () => handlers.onPieceChange?.(field, Number(input.value)));
  const directionButtons = [...root.querySelectorAll("[data-trick-direction]")];
  for (const button of directionButtons) {
    button.addEventListener("click", () => handlers.onPieceChange?.("angle", Number(button.dataset.trickDirection)));
  }

  function renderBank(bank, currentId) {
    if (!nodes.bank) return;
    const signature = JSON.stringify(bank.map(({ id, name, pieces, updatedAt }) => [id, name, pieces.length, updatedAt, id === currentId]));
    if (signature === bankSignature) return;
    bankSignature = signature;
    nodes.bank.replaceChildren();
    if (!bank.length) {
      const empty = document.createElement("p");
      empty.className = "trick-bank-empty";
      empty.textContent = "No saved shots yet.";
      nodes.bank.append(empty);
      return;
    }
    for (const shot of bank) {
      const row = document.createElement("div");
      row.className = `trick-bank-row${shot.id === currentId ? " is-current" : ""}`;
      const load = document.createElement("button");
      load.type = "button";
      load.className = "trick-bank-load";
      load.innerHTML = `<strong></strong><small></small>`;
      load.querySelector("strong").textContent = shot.name;
      load.querySelector("small").textContent = `${shot.pieces.length} piece${shot.pieces.length === 1 ? "" : "s"}`;
      load.addEventListener("click", () => handlers.onLoad?.(shot.id));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "trick-bank-delete";
      remove.setAttribute("aria-label", `Delete ${shot.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => handlers.onDeleteShot?.(shot.id));
      row.append(load, remove);
      nodes.bank.append(row);
    }
  }

  return {
    name: () => nodes.name?.value || "",

    render({ pieces, selectedId, bank, currentId, name, status, busy, power = 0, pulling = false, canUndo = false }) {
      const selected = pieces.find((piece) => piece.id === selectedId) || null;
      if (nodes.status) nodes.status.textContent = status;
      if (nodes.hint) nodes.hint.textContent = busy
        ? "Shot in motion · reset any time"
        : selected
          ? "Drag tool · floor diamond = depth · × = remove"
          : "Add a tool · pull the ball back · release to shoot";
      const percentage = Math.round(Math.max(0, Math.min(1, power)) * 100);
      if (nodes.powerFill) nodes.powerFill.style.width = `${percentage}%`;
      if (nodes.powerReadout) nodes.powerReadout.textContent = `${percentage}%`;
      if (nodes.powerCue) nodes.powerCue.textContent = pulling
        ? percentage >= 8 ? "RELEASE TO SHOOT" : "PULL FARTHER"
        : busy ? "SHOT IN MOTION" : "GRAB BALL + PULL BACK";
      nodes.powerGauge?.classList.toggle("is-aiming", pulling);
      if (nodes.name && document.activeElement !== nodes.name) nodes.name.value = name;
      if (nodes.empty) nodes.empty.hidden = pieces.length > 0;
      if (nodes.inspector) nodes.inspector.hidden = !selected;
      if (nodes.inspectorTitle) nodes.inspectorTitle.textContent = selected?.type === BOARD_PIECE ? "Rebound Pad" : "Ball Cannon";

      if (selected) {
        nodes.depth.value = Math.round(selected.z * 100);
        nodes.angle.value = Math.round(selected.yaw * 180 / Math.PI);
        if (nodes.angleLabel) nodes.angleLabel.textContent = "Direction around room";
        const cannon = selected.type === CANNON_PIECE;
        nodes.pitchRow.hidden = false;
        nodes.powerRow.hidden = !cannon;
        nodes.delayRow.hidden = !cannon;
        nodes.bounceRow.hidden = cannon;
        if (nodes.pitchLabel) nodes.pitchLabel.textContent = selected.type === BOARD_PIECE ? "Face tilt" : "Launch angle";
        nodes.pitch.min = cannon ? "5" : "-80";
        nodes.pitch.max = cannon ? "85" : "80";
        nodes.pitch.step = cannon ? "5" : "10";
        if (cannon) {
          nodes.pitch.value = Math.round(selected.pitch * 180 / Math.PI);
          nodes.power.value = selected.speed;
          nodes.delay.value = selected.delay;
        } else {
          nodes.pitch.value = Math.round(selected.angle * 180 / Math.PI);
          nodes.bounce.value = selected.restitution;
        }
        const direction = Math.round(selected.yaw * 180 / Math.PI);
        for (const button of directionButtons) {
          const pressed = Math.abs(Number(button.dataset.trickDirection) - direction) < 1;
          button.setAttribute("aria-pressed", String(pressed));
        }
      }

      for (const [input] of fields) if (input) input.disabled = busy;
      for (const button of directionButtons) button.disabled = busy;
      for (const id of ["trickAddBoard", "trickAddCannon", "trickDeletePiece"]) {
        const button = byId(root, id);
        if (button) button.disabled = busy;
      }
      const undo = byId(root, "trickUndo");
      if (undo) undo.disabled = busy || !canUndo;
      renderBank(bank, currentId);
    },
  };
}
