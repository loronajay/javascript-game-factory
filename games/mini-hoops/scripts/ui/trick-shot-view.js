// DOM binding for the Trick Shot Lab. It owns no layout, physics, or saved data.

import { BOARD_PIECE, CANNON_PIECE } from "../sim/trick-shot.js";

const byId = (root, id) => root.querySelector(`#${id}`);

export function createTrickShotView(root, handlers = {}) {
  let bankSignature = "";
  const nodes = {
    status: byId(root, "trickStatus"),
    hint: byId(root, "trickHint"),
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
    pitchRow: byId(root, "trickPitchRow"),
    powerRow: byId(root, "trickPowerRow"),
    delayRow: byId(root, "trickDelayRow"),
    bounceRow: byId(root, "trickBounceRow"),
  };

  const actionMap = [
    ["trickExit", "onExit"], ["trickAddBoard", "onAddBoard"], ["trickAddCannon", "onAddCannon"],
    ["trickResetBall", "onResetBall"], ["trickDeletePiece", "onDeletePiece"],
    ["trickSave", "onSave"], ["trickNew", "onNew"],
  ];
  for (const [id, handler] of actionMap) byId(root, id)?.addEventListener("click", () => handlers[handler]?.());

  const fields = [
    [nodes.depth, "depth"], [nodes.angle, "angle"], [nodes.pitch, "pitch"],
    [nodes.power, "power"], [nodes.delay, "delay"], [nodes.bounce, "bounce"],
  ];
  for (const [input, field] of fields) input?.addEventListener("input", () => handlers.onPieceChange?.(field, Number(input.value)));

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

    render({ pieces, selectedId, bank, currentId, name, status, busy }) {
      const selected = pieces.find((piece) => piece.id === selectedId) || null;
      if (nodes.status) nodes.status.textContent = status;
      if (nodes.hint) nodes.hint.textContent = busy ? "Shot in motion · reset any time" : "Drag pieces to place · drag the ball to shoot";
      if (nodes.name && document.activeElement !== nodes.name) nodes.name.value = name;
      if (nodes.empty) nodes.empty.hidden = pieces.length > 0;
      if (nodes.inspector) nodes.inspector.hidden = !selected;
      if (nodes.inspectorTitle) nodes.inspectorTitle.textContent = selected?.type === BOARD_PIECE ? "Bounce Board" : "Ball Cannon";

      if (selected) {
        nodes.depth.value = Math.round(selected.z * 100);
        nodes.angle.value = Math.round((selected.type === BOARD_PIECE ? selected.angle : selected.yaw) * 180 / Math.PI);
        if (nodes.angleLabel) nodes.angleLabel.textContent = selected.type === BOARD_PIECE ? "Rotation" : "Trajectory left / right";
        const cannon = selected.type === CANNON_PIECE;
        nodes.pitchRow.hidden = !cannon;
        nodes.powerRow.hidden = !cannon;
        nodes.delayRow.hidden = !cannon;
        nodes.bounceRow.hidden = cannon;
        if (cannon) {
          nodes.pitch.value = Math.round(selected.pitch * 180 / Math.PI);
          nodes.power.value = selected.speed;
          nodes.delay.value = selected.delay;
        } else {
          nodes.bounce.value = selected.restitution;
        }
      }

      for (const [input] of fields) if (input) input.disabled = busy;
      for (const id of ["trickAddBoard", "trickAddCannon", "trickDeletePiece"]) {
        const button = byId(root, id);
        if (button) button.disabled = busy;
      }
      renderBank(bank, currentId);
    },
  };
}
