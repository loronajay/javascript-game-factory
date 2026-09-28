// The row of the player's own farm pets to choose from. One picker, shared by
// every screen and both events, so "your pet" is the same choice everywhere.

import { speciesStyle } from "../pets.js";

export function createPetPicker(root, { onSelect } = {}) {
  let pets = [];
  let selectedId = null;
  root.setAttribute("role", "radiogroup");

  function sync() {
    for (const card of root.querySelectorAll("[data-pet-id]")) card.setAttribute("aria-checked", String(card.dataset.petId === selectedId));
  }

  return {
    setPets(next, preferredId = null) {
      pets = next;
      root.replaceChildren(...pets.map((pet) => {
        const style = speciesStyle(pet.speciesId);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "pet-card";
        card.dataset.petId = pet.instanceId;
        card.setAttribute("role", "radio");
        const title = document.createElement("strong");
        const dot = document.createElement("i");
        dot.className = "pet-dot";
        dot.style.color = style.color;
        dot.style.background = style.color;
        title.append(dot, document.createTextNode(pet.name));
        const meta = document.createElement("small");
        meta.textContent = `${style.title} · SPD ${Math.round(pet.stats.speed)} · STR ${Math.round(pet.stats.strength)}`;
        card.append(title, meta);
        card.addEventListener("click", () => this.select(pet.instanceId));
        return card;
      }));
      this.select(pets.some((pet) => pet.instanceId === preferredId) ? preferredId : pets[0]?.instanceId ?? null);
    },
    select(id) {
      selectedId = id;
      sync();
      const pet = this.selected;
      if (pet) onSelect?.(pet);
    },
    get selected() {
      return pets.find((pet) => pet.instanceId === selectedId) ?? null;
    },
  };
}
