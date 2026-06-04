import { createCardPiece } from "./card-piece.mjs";
import { el } from "./dom.mjs";

export function createBattlefieldLayer(battlefield, handlers) {
  const modeClass = battlefield.mode && battlefield.mode !== "idle" ? ` is-targeting is-${battlefield.mode}-mode` : "";
  const layer = el("section", `battlefield-layer${modeClass}`, { "aria-label": "Battlefield" });
  if (battlefield.statusLabel) {
    layer.append(createBattlefieldStatus(battlefield, handlers));
  }
  battlefield.rows.forEach((row) => layer.append(createMonsterRow(row, handlers)));
  return layer;
}

function createBattlefieldStatus(battlefield, handlers) {
  const status = el("div", "battlefield-status");
  status.append(el("span", "battlefield-status-label", battlefield.statusLabel));
  if (battlefield.cancelActionLabel) {
    const cancel = el(
      "button",
      "scene-button battlefield-cancel-action",
      { type: "button" },
      battlefield.cancelActionLabel,
    );
    cancel.addEventListener("click", () => handlers.onCancelPendingAction?.());
    status.append(cancel);
  }
  return status;
}

function createMonsterRow(row, handlers) {
  const rowElement = el(
    "section",
    `monster-row-layer monster-row-layer--${row.side}${row.isTargetRow ? " is-target-row" : ""}`,
  );
  rowElement.append(el("div", "scene-zone-label", row.side === "player" ? "Your Monsters" : "Enemy Monsters"));
  const slots = el("div", "scene-monster-slots");

  row.slots.forEach((slotView) => {
    const slotClasses = [
      "scene-monster-slot",
      slotView.monster ? "is-filled" : "",
      slotView.isSelected ? "is-selected" : "",
      slotView.isTargeted ? "is-targeted" : "",
      slotView.isValidTarget ? "is-valid-target" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const slot = el("div", slotClasses, {
      role: "button",
      tabindex: "0",
      "aria-label": slotView.ariaLabel,
      "data-player-id": slotView.playerId,
      "data-slot-index": String(slotView.slotIndex),
    });
    slot.addEventListener("click", () =>
      handlers.onMonsterSlot?.({ playerId: slotView.playerId, slotIndex: slotView.slotIndex }),
    );
    slot.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handlers.onMonsterSlot?.({ playerId: slotView.playerId, slotIndex: slotView.slotIndex });
    });
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("is-drop-ready");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("is-drop-ready"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("is-drop-ready");
      const draggedCard = readDraggedCard(event);
      if (draggedCard) {
        handlers.onDropMonsterSlot?.({
          playerId: slotView.playerId,
          slotIndex: slotView.slotIndex,
          draggedCard,
        });
      }
    });

    if (slotView.monster) {
      slot.append(
        createCardPiece(slotView.monster, {
          compactStats: `${slotView.monster.strengthLabel} / ${slotView.monster.hpLabel}`,
        }),
      );
      if (slotView.actionCue) {
        slot.append(el("span", "slot-action-cue", slotView.actionCue));
      }
      slot.append(createAttachedAccessoryTray(slotView, handlers));
    } else if (slotView.isValidTarget && slotView.actionCue) {
      slot.append(el("span", "slot-action-cue", slotView.actionCue));
    } else {
      slot.append(el("span", "slot-empty", "Empty"));
    }
    slots.append(slot);
  });

  rowElement.append(slots);
  return rowElement;
}

function createAttachedAccessoryTray(slotView, handlers) {
  const attachments = slotView.monster.attachments ?? [];
  const trayClasses = [
    "attached-accessories",
    attachments.length ? "" : "attached-accessories--empty",
    attachments.length > 1 ? "attached-accessories--stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return el(
    "div",
    trayClasses,
    {
      "aria-label": `${slotView.monster.name} equipped accessories`,
      "data-accessory-count": String(attachments.length),
    },
    attachments.map((attachment) => {
      const accessory = el(
        "button",
        "attached-accessory",
        {
          type: "button",
          "data-card-instance-id": attachment.instanceId,
          "aria-label": attachedAccessoryLabel(attachment),
          title: attachment.rulesText || attachment.name,
        },
        [
          el("span", "attached-accessory-name", attachment.name),
        ],
      );
      accessory.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onAttachedAccessory?.({
          playerId: slotView.playerId,
          slotIndex: slotView.slotIndex,
          attachment,
        });
      });
      return accessory;
    }),
  );
}

function attachedAccessoryLabel(attachment) {
  return attachment.rulesText ? `${attachment.name}. ${attachment.rulesText}` : attachment.name;
}

function readDraggedCard(event) {
  try {
    const raw = event.dataTransfer.getData("application/json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
