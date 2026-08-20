import {
  ANGLE_IDS,
  assetUrlFor,
  directionForDegrees,
  normalizeDegrees,
  viewerSelectionForSearch,
} from "./sprite-viewer-state.mjs";

const selection = viewerSelectionForSearch(window.location.search);
const characterRoot = `../assets/characters/${encodeURIComponent(selection.characterId)}/`;
const manifest = await fetch(`${characterRoot}character.json`).then((response) => {
  if (!response.ok) throw new Error(`Unable to load character manifest (${response.status})`);
  return response.json();
});
const actions = manifest.actions;
let selectedAction = actions[selection.action] ? selection.action : Object.keys(actions)[0];
const assetRevision = manifest.assetVersion ?? 1;

const stage = document.querySelector("#stage");
const sprite = document.querySelector("#spriteA");
const yawInput = document.querySelector("#yaw");
const autoRotate = document.querySelector("#autoRotate");
const actionLabel = document.querySelector("#actionLabel");
const angleLabel = document.querySelector("#angleLabel");
const angleStops = document.querySelector("#angleStops");
const actionRow = document.querySelector(".action-row");
const eyebrow = document.querySelector(".eyebrow");
const hint = document.querySelector(".hint");
const heading = document.querySelector("h1");

const ANGLE_LABELS = {
  front: "Front",
  "front-right": "Front 3/4 Right",
  right: "Right Profile",
  "rear-right": "Rear 3/4 Right",
  rear: "Direct Back",
  "rear-left": "Rear 3/4 Left",
  left: "Left Profile",
  "front-left": "Front 3/4 Left",
};

let yaw = 0;
let lastAutoStep = performance.now();
let drag = null;

function actionName(action) {
  return action.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetUrl(relativePath) {
  return assetUrlFor(characterRoot, relativePath, assetRevision);
}

heading.textContent = manifest.displayName;
eyebrow.textContent = "Yam Boxing · Reusable sprite review tool";
hint.textContent = "Drag, use ←/→, or choose an exact 45° stop. Add future actions to the character manifest and they appear here automatically.";

for (const spriteSet of Object.values(actions)) {
  for (const path of Object.values(spriteSet)) {
    const image = new Image();
    image.src = assetUrl(path);
  }
}

actionRow.innerHTML = "";
for (const action of Object.keys(actions)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action";
  button.textContent = actionName(action);
  button.classList.toggle("active", action === selectedAction);
  button.addEventListener("click", () => {
    selectedAction = action;
    actionRow.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  });
  actionRow.append(button);
}
actionRow.hidden = Object.keys(actions).length < 2;

ANGLE_IDS.forEach((direction, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = ANGLE_LABELS[direction];
  button.dataset.degrees = String(index * 45);
  button.addEventListener("click", () => {
    yaw = index * 45;
    yawInput.value = String(yaw);
  });
  angleStops.append(button);
});

yawInput.addEventListener("input", () => { yaw = Number(yawInput.value); });
stage.addEventListener("pointerdown", (event) => {
  drag = { id: event.pointerId, x: event.clientX, yaw };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (drag?.id !== event.pointerId) return;
  yaw = normalizeDegrees(Math.round((drag.yaw + (event.clientX - drag.x) * 0.65) / 45) * 45);
  yawInput.value = String(yaw);
});
const endDrag = (event) => {
  if (drag?.id === event.pointerId) drag = null;
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

window.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  yaw = normalizeDegrees(yaw + (event.key === "ArrowRight" ? 45 : -45));
  yawInput.value = String(yaw);
});

function update(time) {
  if (autoRotate.checked && !drag && time - lastAutoStep >= 450) {
    yaw = (yaw + 45) % 360;
    yawInput.value = String(yaw);
    lastAutoStep = time;
  }
  const direction = directionForDegrees(yaw);
  const source = assetUrl(actions[selectedAction][direction]);
  if (sprite.dataset.source !== source) {
    sprite.src = source;
    sprite.dataset.source = source;
  }
  angleLabel.textContent = `${ANGLE_LABELS[direction]} · ${yaw}°`;
  actionLabel.textContent = actionName(selectedAction);
  requestAnimationFrame(update);
}

requestAnimationFrame(update);
