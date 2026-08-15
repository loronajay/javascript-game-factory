import { $, escapeHtml } from "./dom.mjs";

// The title splash picker: a per-device cosmetic with no reach into a match.
// It owns its own dialog, grid and selection state so nothing outside has to
// know the splash exists.
export function createMenuSplashPicker({ menuSplash, audio }) {
  let selectedSlug = menuSplash.loadMenuSplashSlug();

  function apply(slug, persist = false) {
    selectedSlug = persist
      ? menuSplash.saveMenuSplashSlug(slug)
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

  function build() {
    const grid = $("menu-splash-grid");
    for (const splash of menuSplash.MENU_SPLASHES) {
      const card = document.createElement("button");
      card.className = "menu-splash-card";
      card.type = "button";
      card.setAttribute("data-splash-slug", splash.slug);
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${splash.thumbnailSrc}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(splash.name)}</span>`;
      card.addEventListener("click", () => {
        apply(splash.slug, true);
        $("menu-splash-dialog").close();
      });
      grid.appendChild(card);
    }
    apply(selectedSlug);

    $("menu-splash-button").addEventListener("click", () => {
      $("menu-splash-dialog").showModal();
      audio.play("popup");
    });
    $("menu-splash-close").addEventListener("click", () => $("menu-splash-dialog").close());
  }

  return { build, getSelectedSlug: () => selectedSlug };
}
