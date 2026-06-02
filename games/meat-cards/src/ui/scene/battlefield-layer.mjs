import { createCardPiece } from "./card-piece.mjs";
import { el } from "./dom.mjs";

export function createBattlefieldLayer(battlefield, handlers) {
  const layer = el("section", "battlefield-layer", { "aria-label": "Battlefield" });
  battlefield.rows.forEach((row) => layer.append(createMonsterRow(row, handlers)));
  return layer;
}

function createMonsterRow(row, handlers) {
  const rowElement = el("section", `monster-row-layer monster-row-layer--${row.side}`);
  rowElement.append(el("div", "scene-zone-label", row.side === "player" ? "Your Monsters" : "Enemy Monsters"));
  const slots = el("div", "scene-monster-slots");

  row.slots.forEach((slotView) => {
    const slot = el("div", slotView.monster ? "scene-monster-slot is-filled" : "scene-monster-slot", {
      role: "button",
      tabindex: "0",
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
        createAttachedAccessoryTray(slotView, handlers),
      );
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
  return el(
    "div",
    attachments.length ? "attached-accessories" : "attached-accessories attached-accessories--empty",
    attachments.map((attachment) => {
      const accessory = el(
        "button",
        "attached-accessory",
        {
          type: "button",
          "data-card-instance-id": attachment.instanceId,
          title: attachment.rulesText || attachment.name,
        },
        [
          el("span", "attached-accessory-name", attachment.name),
          attachment.rulesText ? el("span", "attached-accessory-rules", attachment.rulesText) : null,
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

function readDraggedCard(event) {
  try {
    const raw = event.dataTransfer.getData("application/json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
