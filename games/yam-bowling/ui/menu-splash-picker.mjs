import { $, escapeHtml } from "./dom.mjs";

// The title splash picker: a per-device cosmetic with no reach into a match.
// It owns its own dialog, grid and selection state so nothing outside has to
// know the splash exists.
//
// The chosen splash is the loadout's global `menuSplash` slot, so the title
// screen and the presentation loadout can never disagree about it.
export function createMenuSplashPicker({ menuSplash, loadout, audio, onEquip = () => {} }) {
  let selectedSlug = loadout.getMenuSplashSlug();

  function apply(slug, persist = false) {
    selectedSlug = persist
      ? loadout.setMenuSplashSlug(slug)
      : menuSplash.getMenuSplash(slug).slug;
    const splash = menuSplash.getMenuSplash(selectedSlug);
    const art = $("menu-splash-art");
    art.src = splash.src;
    art.alt = splash.alt;
    $("menu-splash-button").title = `Current menu art: ${splash.name}`;

    for (const card of $("menu-splash-grid").querySelectorAll("[data-splash-slug]")) {
      const selected = card.dataset.splashSlug === selectedSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }
  }

  function renderOwnedCards() {
    const grid = $("menu-splash-grid");
    grid.replaceChildren();
    // Owned splashes only. Character-linked art follows live circuit progress,
    // so rebuilding on open makes a newly introduced rival available without a
    // page reload while unearned bowlers remain hidden.
    const ownedSlugs = new Set(loadout.listOwned("menu-splash").map((item) => item.id.split(":")[1]));
    for (const splash of menuSplash.MENU_SPLASHES.filter((option) => ownedSlugs.has(option.slug))) {
      const card = document.createElement("button");
      card.className = "menu-splash-card";
      card.type = "button";
      card.setAttribute("data-splash-slug", splash.slug);
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${splash.thumbnailSrc}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(splash.name)}</span>`;
      card.addEventListener("click", () => {
        apply(splash.slug, true);
        $("menu-splash-dialog").close();
        // The pick is a loadout global slot. Persist it to the Factory garage
        // now, because the next profile-screen sync replaces the whole local
        // record with the server copy and would otherwise discard it.
        onEquip(selectedSlug);
      });
      grid.appendChild(card);
    }
    apply(selectedSlug);
  }

  function build() {
    renderOwnedCards();

    $("menu-splash-button").addEventListener("click", () => {
      renderOwnedCards();
      $("menu-splash-dialog").showModal();
      audio.play("popup");
    });
    $("menu-splash-close").addEventListener("click", () => $("menu-splash-dialog").close());
  }

  function refresh() {
    selectedSlug = loadout.getMenuSplashSlug();
    renderOwnedCards();
  }

  return { build, getSelectedSlug: () => selectedSlug, refresh };
}
