// The Pets panel: adopt, name and release, for the farm's owner.
//
// DOM only — no THREE, no storage. It is handed the layout to draw, a set of
// actions to call, and a thumbnail getter `(speciesId, onReady) => url | null`
// (the offscreen renderer stays behind that seam, the room's pattern). Every
// action is one call to the composition root, which changes the layout, saves
// it and re-syncs the sim; the panel only ever redraws from what it is given.
//
// Built once, patched by id: the species cards are made on first open and
// their picture swapped in when it arrives; the pet rows are rebuilt on every
// layout change because they are few and carry live inputs.
import { adoptableAnimals, findAnimal, findAnimalPalette } from "./farm-catalog/animals.mjs";
import { MAX_PETS, PET_NAME_MAX_LENGTH, farmHabitats } from "./farm-layout.mjs";
import { PET_TRAITS, visiblePetStats } from "./farm-pet-care.mjs";
import { petNeedStatus } from "./farm-pet-needs.mjs";
import { petOutcomeWarning } from "./farm-pet-outcomes.mjs";
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
export function createPetsPanel(elements, actions, options = {}) {
    let layout = null;
    let selectedSpecies = "";
    let cardsBuilt = false;
    let open = false;
    function setStatus(text) {
        elements.status.textContent = text;
    }
    function full() {
        return (layout?.pets.length ?? 0) >= MAX_PETS;
    }
    function speciesCard(species, adoptable) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "pet-card";
        card.dataset.speciesId = species.id;
        card.disabled = !adoptable;
        card.title = adoptable ? `Adopt a ${species.title}` : species.needs;
        card.innerHTML = `<span class="pet-card__picture" aria-hidden="true"><span class="pet-card__letter">${escapeHtml(species.title[0])}</span></span>`
            + `<span class="pet-card__title">${escapeHtml(species.title)}</span>`
            + `<span class="pet-card__note">${escapeHtml(adoptable ? species.habitat : species.needs)}</span>`;
        const picture = card.querySelector(".pet-card__picture");
        const paint = (url) => {
            picture.innerHTML = `<img src="${url}" alt="">`;
        };
        const url = options.thumbnail?.(species.id, paint) ?? null;
        if (url)
            paint(url);
        card.addEventListener("click", () => {
            selectedSpecies = species.id;
            for (const other of elements.speciesGrid.querySelectorAll(".pet-card"))
                other.classList.toggle("is-selected", other.dataset.speciesId === species.id);
            elements.nameInput.placeholder = species.title;
            elements.nameInput.focus();
            setStatus(full() ? `The farm is full (${MAX_PETS} pets). Release one to adopt another.` : `Name your ${species.title} and press Enter to adopt.`);
        });
        return card;
    }
    function buildCards() {
        if (cardsBuilt || !layout)
            return;
        cardsBuilt = true;
        const habitats = farmHabitats(layout);
        const adoptable = new Set(adoptableAnimals(habitats).map((species) => species.id));
        // Adoptable first; the ones waiting for water sit at the end, greyed, saying why.
        const all = [...adoptableAnimals({ water: true })].sort((a, b) => Number(adoptable.has(b.id)) - Number(adoptable.has(a.id)));
        elements.speciesGrid.replaceChildren(...all.map((species) => speciesCard(species, adoptable.has(species.id))));
    }
    function renderPets() {
        if (!layout)
            return;
        elements.count.textContent = `${layout.pets.length} / ${MAX_PETS}`;
        if (!layout.pets.length) {
            elements.petList.innerHTML = `<p class="pets-empty">Nobody lives here yet. Pick an animal below.</p>`;
            return;
        }
        elements.petList.replaceChildren(...layout.pets.map((pet) => {
            const species = findAnimal(pet.speciesId);
            const row = document.createElement("div");
            row.className = "pet-row";
            row.dataset.instanceId = pet.instanceId;
            const profile = pet.profile;
            const palette = findAnimalPalette(pet.speciesId, profile?.paletteId);
            const stats = profile ? visiblePetStats(profile) : null;
            const needs = profile ? petNeedStatus(profile) : null;
            const warning = profile ? petOutcomeWarning(profile, pet.speciesId) : null;
            const statMarkup = stats ? `<dl class="pet-row__stats">
        <div><dt>Gender</dt><dd>${escapeHtml(String(stats.gender))}</dd></div>
        <div><dt>Age</dt><dd>${Number(stats.ageDays).toFixed(1)} days</dd></div>
        <div><dt>Size</dt><dd>${Number(stats.size).toFixed(2)}×</dd></div>
        <div class="pet-row__need pet-row__need--${needs?.level ?? "content"}"><dt>Hunger</dt><dd>${stats.hunger}% · ${needs?.label ?? "Unknown"}</dd></div>
        <div><dt>Happiness</dt><dd>${stats.happiness}%</dd></div>
        <div><dt>Speed</dt><dd>${stats.speed}</dd></div>
        <div><dt>Strength</dt><dd>${stats.strength}</dd></div>
      </dl>` : `<p class="pet-row__unscoped">This pet's profile could not be loaded.</p>`;
            const traitMarkup = profile?.traits.length ? `<ul class="pet-row__traits">${profile.traits.map((id) => {
                const trait = PET_TRAITS.find((entry) => entry.id === id);
                return trait ? `<li title="${escapeHtml(trait.description)}">${escapeHtml(trait.title)}</li>` : "";
            }).join("")}</ul>` : "";
            row.innerHTML = `<div class="pet-row__head"><span class="pet-row__species">${escapeHtml(species?.title ?? pet.speciesId)}${palette && palette.id !== "standard" ? ` · ${escapeHtml(palette.title)}` : ""}</span>`
                + `<input class="pet-row__name" type="text" maxlength="${PET_NAME_MAX_LENGTH}" value="${escapeHtml(pet.name)}" aria-label="Name of ${escapeHtml(pet.name)}">`
                + `<button class="pet-row__release" type="button" data-release="${escapeHtml(pet.instanceId)}" title="Release ${escapeHtml(pet.name)}">Release</button></div>`
                + statMarkup
                + (warning && warning.stage !== "safe" ? `<p class="pet-row__warning pet-row__warning--${warning.stage}"><strong>${escapeHtml(warning.label)}:</strong> ${escapeHtml(warning.message)}</p>` : "")
                + traitMarkup;
            const input = row.querySelector(".pet-row__name");
            const commit = async () => {
                const next = input.value.trim();
                if (next === pet.name)
                    return;
                setStatus(await actions.rename(pet.instanceId, next));
            };
            input.addEventListener("change", () => { void commit(); });
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    input.blur();
                }
                event.stopPropagation();
            });
            row.querySelector(".pet-row__release").addEventListener("click", async () => {
                setStatus(await actions.release(pet.instanceId));
            });
            return row;
        }));
    }
    async function adopt() {
        if (!selectedSpecies) {
            setStatus("Pick an animal first.");
            return;
        }
        if (full()) {
            setStatus(`The farm is full (${MAX_PETS} pets). Release one to adopt another.`);
            return;
        }
        const name = elements.nameInput.value.trim();
        elements.nameInput.value = "";
        setStatus(await actions.adopt(selectedSpecies, name));
    }
    elements.nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void adopt();
        }
        // The panel's keys are the panel's: none of them walk the player.
        event.stopPropagation();
    });
    elements.root.querySelector("[data-adopt]")?.addEventListener("click", () => { void adopt(); });
    elements.openButton.addEventListener("click", () => (open ? close() : show()));
    elements.closeButton.addEventListener("click", () => close());
    function show() {
        open = true;
        elements.root.hidden = false;
        elements.openButton.setAttribute("aria-pressed", "true");
        buildCards();
        renderPets();
        setStatus(selectedSpecies ? "" : "Pick an animal, give it a name, and it moves in.");
    }
    function close() {
        open = false;
        elements.root.hidden = true;
        elements.openButton.setAttribute("aria-pressed", "false");
    }
    return Object.freeze({
        open: show,
        close,
        isOpen: () => open,
        render(next) {
            layout = next;
            if (open)
                renderPets();
        },
        setStatus,
    });
}
