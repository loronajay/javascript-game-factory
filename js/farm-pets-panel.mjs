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
import { HORSE_STAT_BLURBS, horseStats } from "./farm-horse-riding.mjs";
import { animalPaletteDisplayName } from "./farm-pet-palettes.mjs";
import { MAX_PETS, PET_NAME_MAX_LENGTH, farmHabitats } from "./farm-layout.mjs";
import { findPetCare, findPetTrait, petGrowthView, visiblePetStats } from "./farm-pet-care.mjs";
const gainedMarkup = (gained) => gained && gained >= 0.1 ? ` <span class="pet-row__gained" title="Earned by growing up">+${gained.toFixed(1)}</span>` : "";
import { petNeedStatus } from "./farm-pet-needs.mjs";
import { petOutcomeWarning } from "./farm-pet-outcomes.mjs";
import { petCareSummary } from "./farm-pet-happiness.mjs";
import { BREEDING_PRICE, BREEDING_REFUSAL_WORDS, breedingOdds, breedingRefusal, breedingRestMinutes } from "./farm-pet-breeding.mjs";
import { HORSE_SPECIES_ID } from "./farm-horse-riding.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";
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
        const care = findPetCare(species.id);
        card.title = adoptable ? `Adopt a ${species.title} for ${care?.adoptionPrice.toLocaleString() ?? "—"} tickets` : species.needs;
        card.innerHTML = `<span class="pet-card__picture" aria-hidden="true"><span class="pet-card__letter">${escapeHtml(species.title[0])}</span></span>`
            + `<span class="pet-card__title">${escapeHtml(species.title)}</span>`
            + `<span class="pet-card__note">${escapeHtml(adoptable ? `${care?.adoptionPrice.toLocaleString() ?? "—"} tickets · includes 5 ${care?.food.title ?? "food"}` : species.needs)}</span>`;
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
            setStatus(full() ? `The farm is full (${MAX_PETS} pets). Release one to adopt another.` : `Name your ${species.title} · ${care?.adoptionPrice.toLocaleString() ?? "—"} tickets, including 5 ${care?.food.title ?? "food"}.`);
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
            const growth = profile ? petGrowthView(profile, pet.speciesId) : null;
            // A horse (FARM_RIDING_PLAN.md) also shows the two riding stats; its Speed and Strength include any training.
            const riding = profile?.riding ? horseStats(profile) : null;
            const needs = profile ? petNeedStatus(profile) : null;
            const warning = profile ? petOutcomeWarning(profile, pet.speciesId) : null;
            const statMarkup = stats ? `<dl class="pet-row__stats">
        <div><dt>Gender</dt><dd>${escapeHtml(String(stats.gender))}</dd></div>
        <div><dt>Age</dt><dd>${Number(stats.ageDays).toFixed(1)} days</dd></div>
        <div><dt>Size</dt><dd>${Number(stats.size).toFixed(2)}×</dd></div>
        <div class="pet-row__need pet-row__need--${needs?.level ?? "content"}"><dt>Hunger</dt><dd>${stats.hunger}% · ${needs?.label ?? "Unknown"}</dd></div>
        <div><dt>Happiness</dt><dd>${stats.happiness}%</dd></div>
        <div><dt>Speed</dt><dd>${riding?.speed ?? stats.speed}${gainedMarkup(growth?.gained.speed)}</dd></div>
        <div><dt>Strength</dt><dd>${riding?.strength ?? stats.strength}${gainedMarkup(growth?.gained.strength)}</dd></div>
        ${riding ? `<div title="${escapeHtml(HORSE_STAT_BLURBS.stamina)}"><dt>Stamina</dt><dd>${riding.stamina}</dd></div><div title="${escapeHtml(HORSE_STAT_BLURBS.agility)}"><dt>Agility</dt><dd>${riding.agility}</dd></div>` : ""}
        ${growth ? `<div class="pet-row__growth pet-row__growth--${growth.outlook.level}"><dt>Growth</dt><dd title="Speed and Strength grow every day until old age. Potential is rolled at adoption (rarer looks roll higher more often); food, happiness, trust and treating it the way its traits like decide how much of it is reached."><span class="pet-row__potential" aria-label="${growth.stars} of 4 stars">${"★".repeat(growth.stars)}<span class="pet-row__potential-empty">${"★".repeat(4 - growth.stars)}</span></span> ${escapeHtml(growth.gradeTitle)} potential · ${escapeHtml(growth.stageTitle)} · ${escapeHtml(growth.outlook.label)}</dd></div>` : ""}
      </dl>` : `<p class="pet-row__unscoped">This pet's profile could not be loaded.</p>`;
            const care = petCareSummary(pet.speciesId, layout.decor, layout.agriculture.inventory.supplies);
            const have = (placed, title) => `<span class="pet-row__care-item${placed ? " is-placed" : ""}" title="${placed ? "On the farm" : "Not on the farm yet · build mode"}">${placed ? "✓" : "○"} ${escapeHtml(title)}</span>`;
            const careMarkup = care ? `<p class="pet-row__care"><span><strong>Eats</strong> ${escapeHtml(care.food.title)} · ${care.food.count} left</span>`
                + `<span><strong>Home</strong> ${have(care.home.placed, care.home.title)}</span>`
                + `<span><strong>Toys</strong> ${care.toys.map((toy) => have(toy.placed, toy.title)).join(" ")}</span></p>` : "";
            const traitMarkup = profile?.traits.length ? `<ul class="pet-row__traits">${profile.traits.map((id) => {
                const trait = findPetTrait(id);
                const rarity = trait && trait.rarity !== "common" ? ` · ${trait.rarity === "rare" ? "Rare" : "Uncommon"} trait` : "";
                return trait ? `<li class="pet-row__trait pet-row__trait--${trait.rarity}" title="${escapeHtml(trait.description + rarity)}">${escapeHtml(trait.title)}</li>` : "";
            }).join("")}</ul>` : "";
            const rest = breedingRestMinutes(pet, options.farmMinutes?.() ?? layout.clock.farmMinutes);
            const family = [
                pet.lineage ? `Gen ${pet.lineage.generation} · of ${escapeHtml(pet.lineage.mother.name || "?")} &amp; ${escapeHtml(pet.lineage.father.name || "?")}` : "",
                rest > 0 ? `Resting after breeding · ${(rest / DAY_MINUTES).toFixed(1)} days` : "",
            ].filter(Boolean);
            const familyMarkup = family.length ? `<p class="pet-row__family">${family.join(" · ")}</p>` : "";
            row.innerHTML = `<div class="pet-row__head"><span class="pet-row__species">${escapeHtml(species?.title ?? pet.speciesId)}${palette && palette.id !== "standard" ? ` · ${escapeHtml(animalPaletteDisplayName(palette))}` : ""}</span>`
                + `<input class="pet-row__name" type="text" maxlength="${PET_NAME_MAX_LENGTH}" value="${escapeHtml(pet.name)}" aria-label="Name of ${escapeHtml(pet.name)}">`
                + `<button class="pet-row__release" type="button" data-release="${escapeHtml(pet.instanceId)}" title="Release ${escapeHtml(pet.name)}">Release</button></div>`
                + statMarkup
                + (warning && warning.stage !== "safe" ? `<p class="pet-row__warning pet-row__warning--${warning.stage}"><strong>${escapeHtml(warning.label)}:</strong> ${escapeHtml(warning.message)}</p>` : "")
                + familyMarkup
                + traitMarkup
                + careMarkup;
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
            const breeding = breedBlock(pet);
            if (breeding)
                row.append(breeding);
            return row;
        }));
    }
    const percent = (chance) => `${Math.round(chance * 100)}%`;
    /** What pairing her with this male would pass on, in one line. */
    function oddsLine(mother, father) {
        if (!mother.profile || !father.profile)
            return "";
        const odds = breedingOdds(mother.speciesId, mother.profile, father.profile);
        const looks = [...new Set([mother.profile.paletteId, father.profile.paletteId])].map((id) => {
            const palette = findAnimalPalette(mother.speciesId, id);
            const chance = odds.palettes.find((row) => row.paletteId === id)?.chance ?? 0;
            return palette ? `${animalPaletteDisplayName(palette)} ${percent(chance)}` : "";
        }).filter(Boolean).join(" · ");
        const potential = odds.grade.mother + odds.grade.father;
        return `Keeps one trait from each parent, then rolls 1–3 of its own. Looks: ${looks}.`
            + (potential > 0 ? ` A parent's potential: ${percent(potential)}.` : "");
    }
    function breedBlock(pet) {
        if (!layout || pet.profile?.gender !== "female" || pet.speciesId === HORSE_SPECIES_ID)
            return null;
        const block = document.createElement("div");
        block.className = "livestock-breed livestock-breed--pick pet-row__breed";
        const males = layout.pets.filter((other) => other.speciesId === pet.speciesId && other.profile?.gender === "male");
        if (!males.length) {
            block.textContent = `No ${findAnimal(pet.speciesId)?.title.toLowerCase() ?? "male"} ♂ on the farm to pair her with.`;
            return block;
        }
        const clock = options.farmMinutes?.() ?? layout.clock.farmMinutes;
        const refusalOf = (father) => breedingRefusal(pet, father, clock, layout.pets.length, MAX_PETS);
        const label = document.createElement("span");
        label.className = "livestock-breed__label";
        label.textContent = "Pair with";
        const select = document.createElement("select");
        select.className = "livestock-breed__mate";
        for (const male of males) {
            const option = document.createElement("option");
            option.value = male.instanceId;
            const refusal = refusalOf(male);
            option.textContent = refusal ? `${male.name} — ${BREEDING_REFUSAL_WORDS[refusal]}` : `${male.name} ♂`;
            select.append(option);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "livestock-breed__go";
        button.textContent = `Breed · ${BREEDING_PRICE.toLocaleString()}`;
        button.title = `Breed for ${BREEDING_PRICE.toLocaleString()} tickets`;
        const note = document.createElement("p");
        note.className = "pet-row__breed-note";
        const refresh = () => {
            const father = males.find((male) => male.instanceId === select.value) ?? males[0];
            const refusal = refusalOf(father);
            button.disabled = Boolean(refusal);
            note.textContent = refusal ? BREEDING_REFUSAL_WORDS[refusal] : oddsLine(pet, father);
        };
        select.addEventListener("change", refresh);
        select.addEventListener("keydown", (event) => event.stopPropagation());
        button.addEventListener("click", async () => {
            button.disabled = true;
            setStatus(await actions.breed(pet.instanceId, select.value));
        });
        refresh();
        block.append(label, select, button, note);
        return block;
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
