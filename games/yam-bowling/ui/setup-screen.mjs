import { $, setSelected } from "./dom.mjs";
import { renderSkinOptions } from "./skin-options.mjs";

// The local (hot-seat / vs CPU) setup screen: mode, play type, CPU level, the
// two bowler slots and the roster grid. It reads and writes `session.setup` and
// nothing else in the session.
export function createSetupScreen({ session, roster, animation, assets, loadout, onInspect }) {
  const { setup } = session;

  function render() {
    setup.skinIds = setup.characterSlugs.map((slug) => assets.storedSkinId(slug));
    setSelected($("mode-options"), "data-mode", setup.modeId);
    setSelected($("bowling-style-options"), "data-bowling-style", setup.bowlingStyle);
    for (const button of $("bowling-style-options").querySelectorAll("[data-bowling-style]")) {
      button.setAttribute("aria-pressed", String(button.dataset.bowlingStyle === setup.bowlingStyle));
    }
    $("bowling-style-status").textContent = setup.bowlingStyle === "3d"
      ? "A physical 3D alley. Your bowlers, outfits and match rules. Local exhibition only."
      : "The original Yam lane. Pick a match length and make it yours.";
    setSelected($("play-type-options"), "data-play-type", setup.playType);
    setSelected($("cpu-options"), "data-cpu-level", setup.cpuLevelId);
    $("cpu-options").hidden = setup.playType !== "cpu";
    $("player-two-label").textContent = setup.playType === "cpu" ? "CPU" : "Player 2";
    $("player-two-badge").textContent = setup.playType === "cpu" ? "CPU" : "P2";
    $("selecting-label").textContent = `Choosing ${setup.activeSlot === 0 ? "Player 1" : setup.playType === "cpu" ? "CPU rival" : "Player 2"}`;

    setup.characterSlugs.forEach((slug, index) => {
      const bowler = assets.bowlerBySlug(slug);
      const slot = index === 0 ? $("player-one-slot") : $("player-two-slot");
      slot.classList.toggle("is-active", setup.activeSlot === index);
      slot.querySelector("img").src = assets.characterPortrait(slug, setup.skinIds[index]);
      slot.querySelector("strong").textContent = bowler.name;
    });

    renderSkinOptions({
      containerId: "skin-options",
      slug: setup.characterSlugs[setup.activeSlot],
      selectedSkinId: setup.skinIds[setup.activeSlot],
      animation,
      assets,
      loadout,
      onEquip: (skinId) => {
        setup.skinIds[setup.activeSlot] = skinId;
        render();
      },
    });
    $("inspect-bowler-button").textContent = `Inspect ${assets.bowlerBySlug(setup.characterSlugs[setup.activeSlot]).name}`;

    for (const card of $("character-grid").querySelectorAll(".character-card")) {
      card.classList.toggle("is-selected", card.dataset.slug === setup.characterSlugs[setup.activeSlot]);
      card.classList.toggle("is-p1", card.dataset.slug === setup.characterSlugs[0]);
      card.classList.toggle("is-p2", card.dataset.slug === setup.characterSlugs[1]);
      const labels = [];
      if (card.dataset.slug === setup.characterSlugs[0]) labels.push("P1");
      if (card.dataset.slug === setup.characterSlugs[1]) labels.push(setup.playType === "cpu" ? "CPU" : "P2");
      card.querySelector("i").textContent = labels.join(" · ");
      card.setAttribute("aria-selected", String(card.classList.contains("is-selected")));
    }
  }

  function build() {
    const grid = $("character-grid");
    for (const bowler of roster) {
      const card = document.createElement("button");
      card.className = "character-card";
      card.type = "button";
      card.dataset.slug = bowler.slug;
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${assets.characterPortrait(bowler.slug)}" alt="" loading="lazy"><span>${bowler.name}</span><i></i>`;
      card.addEventListener("click", () => {
        // Picking a bowler the other slot already holds swaps the two rather
        // than putting the same bowler on both lanes.
        const other = setup.activeSlot === 0 ? 1 : 0;
        const previousSlug = setup.characterSlugs[setup.activeSlot];
        const previousSkinId = setup.skinIds[setup.activeSlot];
        if (setup.characterSlugs[other] === bowler.slug) {
          setup.characterSlugs[other] = previousSlug;
          setup.skinIds[other] = previousSkinId;
        }
        setup.characterSlugs[setup.activeSlot] = bowler.slug;
        setup.skinIds[setup.activeSlot] = assets.storedSkinId(bowler.slug);
        render();
      });
      grid.appendChild(card);
    }
  }

  function bind() {
    $("bowling-style-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-bowling-style]");
      if (!button) return;
      setup.bowlingStyle = button.dataset.bowlingStyle === "3d" ? "3d" : "arcade";
      render();
    });
    $("mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      setup.modeId = button.dataset.mode;
      render();
    });
    $("play-type-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-play-type]");
      if (!button) return;
      setup.playType = button.dataset.playType;
      render();
    });
    $("cpu-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-cpu-level]");
      if (!button) return;
      setup.cpuLevelId = button.dataset.cpuLevel;
      render();
    });
    for (const slot of document.querySelectorAll("[data-player-slot]")) {
      slot.addEventListener("click", () => {
        setup.activeSlot = Number(slot.dataset.playerSlot);
        render();
      });
    }
    $("inspect-bowler-button").addEventListener("click", (event) => {
      onInspect(setup.characterSlugs[setup.activeSlot], event.currentTarget);
    });
  }

  return { build, render, bind };
}
