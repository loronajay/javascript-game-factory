import {
  applyCabinetOverrides,
  loadArcadeCatalog,
  type ArcadeGameEntry,
  type ArcadeDimension,
} from "./arcade-catalog.mjs";
import {
  buildCatalogFacets,
  filterArcadeCatalog,
  type CatalogQuery,
} from "./arcade-catalog-query.mjs";
import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { initSessionNav, renderPrimaryAppNav } from "./arcade-session-nav.mjs";
import { createContentApiClient } from "./platform/api/content-api.mjs";

const track = document.getElementById("gridTrack") as HTMLElement;
const emptyState = document.getElementById("emptyState") as HTMLElement;
const results = document.getElementById("catalogResults") as HTMLElement;
const searchInput = document.getElementById("catalogSearch") as HTMLInputElement;
const categoryFilters = document.getElementById("categoryFilters") as HTMLElement;
const dimensionFilters = document.getElementById("dimensionFilters") as HTMLElement;
const modeFilter = document.getElementById("modeFilter") as HTMLButtonElement;

let catalog: ArcadeGameEntry[] = [];
let filteredCatalog: ArcadeGameEntry[] = [];
let selectedIndex = 0;
let showGamepadSelection = false;
const query: CatalogQuery = { search: "", category: "", dimension: "", mode: "", sort: "factory" };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function statusBadge(status: string): string {
  const value = status.toLocaleLowerCase();
  if (value.includes("release candidate")) return "RELEASE CANDIDATE";
  if (value.includes("prototype")) return "PLAYABLE PROTOTYPE";
  if (value.includes("beta")) return "BETA";
  return "PLAYABLE";
}

function playerLabel(players: string): string {
  const range = String(players || "1").replace("-", "–");
  return `${range} ${range === "1" ? "PLAYER" : "PLAYERS"}`;
}

function canPlayHoverVideo(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function attachHoverVideo(card: HTMLAnchorElement, frame: HTMLElement, game: ArcadeGameEntry): void {
  if (!game.previewVideo || !canPlayHoverVideo()) return;

  const video = element("video", "game-card__video");
  video.src = game.previewVideo;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.setAttribute("aria-hidden", "true");
  frame.appendChild(video);

  const play = () => {
    video.classList.add("is-active");
    void video.play().catch(() => video.classList.remove("is-active"));
  };
  const stop = () => {
    video.pause();
    video.currentTime = 0;
    video.classList.remove("is-active");
  };

  card.addEventListener("mouseenter", play);
  card.addEventListener("mouseleave", stop);
  card.addEventListener("focus", play);
  card.addEventListener("blur", stop);
  video.addEventListener("error", () => video.remove(), { once: true });
}

let sfx: any = null;

function getSFX(): any {
  if (sfx) return sfx;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const tone = (frequency: number, duration: number, volume: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    };
    sfx = {
      hover: () => tone(440, 0.03, 0.035),
      select: () => tone(880, 0.05, 0.055),
    };
  } catch {
    sfx = null;
  }
  return sfx;
}

function createCard(game: ArcadeGameEntry): HTMLAnchorElement {
  const card = element("a", ["game-card", ...game.cardClasses].join(" "));
  card.href = game.href;
  card.setAttribute("aria-description", game.description);

  const frame = element("div", "game-card__frame");
  const image = element("img", "game-card__image");
  image.src = game.previewImage || `grid-previews/${game.slug}.png`;
  image.alt = `${game.title} gameplay`;
  image.loading = "lazy";
  image.decoding = "async";
  frame.appendChild(image);

  const status = element("span", "game-card__status");
  status.textContent = statusBadge(game.status);
  frame.appendChild(status);

  const dimensions = element("span", "game-card__dimensions");
  dimensions.textContent = game.dimensions.map((value) => value.toUpperCase()).join(" + ");
  frame.appendChild(dimensions);
  attachHoverVideo(card, frame, game);

  const body = element("div", "game-card__body");
  const meta = element("div", "game-card__meta");
  const title = element("h2", "game-card__title");
  title.textContent = game.title;
  const category = element("span", "game-card__category");
  category.textContent = game.categories[0] || "Arcade";
  meta.append(title, category);

  const tagline = element("p", "game-card__tagline");
  tagline.textContent = game.tagline;

  const footer = element("div", "game-card__footer");
  const players = element("span", "game-card__players");
  players.textContent = `♙ ${playerLabel(game.players)}`;
  const open = element("span", "game-card__open");
  open.textContent = "OPEN  ›";
  footer.append(players, open);
  body.append(meta, tagline, footer);
  card.append(frame, body);

  card.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    getSFX()?.select();
    card.classList.add("is-launching");
    window.setTimeout(() => { window.location.href = card.href; }, 160);
  });
  card.addEventListener("mouseenter", () => {
    const index = visibleCards().indexOf(card);
    if (index !== -1) {
      setSelectedIndex(index);
      getSFX()?.hover();
    }
  });

  return card;
}

function visibleCards(): HTMLAnchorElement[] {
  return Array.from(track.querySelectorAll<HTMLAnchorElement>(".game-card"));
}

function setSelectedIndex(index: number): void {
  const cards = visibleCards();
  if (!cards.length) return;
  selectedIndex = ((index % cards.length) + cards.length) % cards.length;
  cards.forEach((card, cardIndex) => {
    card.classList.toggle("gamepad-selected", showGamepadSelection && cardIndex === selectedIndex);
  });
  if (showGamepadSelection) cards[selectedIndex]?.scrollIntoView({ block: "nearest" });
}

function createFilterChip(label: string, value: string, kind: "category" | "dimension"): HTMLButtonElement {
  const button = element("button", "catalog-filter-chip");
  button.type = "button";
  button.textContent = label;
  button.dataset.value = value;
  button.addEventListener("click", () => {
    if (kind === "category") query.category = value;
    else query.dimension = value as "" | ArcadeDimension;
    renderCatalog();
  });
  return button;
}

function renderFilters(): void {
  const facets = buildCatalogFacets(catalog);
  categoryFilters.replaceChildren(
    createFilterChip("All", "", "category"),
    ...facets.categories.map((facet) => createFilterChip(facet.value, facet.value, "category")),
  );
  dimensionFilters.replaceChildren(
    createFilterChip("All formats", "", "dimension"),
    ...facets.dimensions.map((facet) => createFilterChip(facet.value.toUpperCase(), facet.value, "dimension")),
  );
}

function syncFilterState(): void {
  for (const button of Array.from(categoryFilters.querySelectorAll<HTMLButtonElement>("button"))) {
    const active = button.dataset.value === (query.category || "");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of Array.from(dimensionFilters.querySelectorAll<HTMLButtonElement>("button"))) {
    const active = button.dataset.value === (query.dimension || "");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const multiplayer = query.mode === "multiplayer";
  modeFilter.classList.toggle("is-active", multiplayer);
  modeFilter.setAttribute("aria-pressed", String(multiplayer));
}

function renderCatalog(): void {
  filteredCatalog = filterArcadeCatalog(catalog, query);
  track.replaceChildren(...filteredCatalog.map(createCard));
  emptyState.hidden = filteredCatalog.length > 0;
  track.hidden = filteredCatalog.length === 0;
  results.textContent = `${filteredCatalog.length} / ${catalog.length} CABINETS`;
  selectedIndex = 0;
  syncFilterState();
  setSelectedIndex(0);
}

searchInput.addEventListener("input", () => {
  query.search = searchInput.value;
  renderCatalog();
});

modeFilter.addEventListener("click", () => {
  query.mode = query.mode === "multiplayer" ? "" : "multiplayer";
  renderCatalog();
});

window.ArcadeInput?.onAction((action) => {
  showGamepadSelection = true;
  setSelectedIndex(selectedIndex);
  if (action === "left" || action === "up") setSelectedIndex(selectedIndex - 1);
  if (action === "right" || action === "down") setSelectedIndex(selectedIndex + 1);
  if (action === "select") visibleCards()[selectedIndex]?.click();
});

// Shipped metadata always loads first. Admin rows are deliberately presentation-only:
// they can hide a known cabinet or refine its catalog copy/tags, never create a new game
// or redirect where a card launches.
const [baseCatalog, siteConfig] = await Promise.all([
  loadArcadeCatalog(),
  createContentApiClient().getSiteConfig().catch(() => null),
]);
catalog = applyCabinetOverrides(baseCatalog, siteConfig?.cabinets || []);
renderFilters();
renderCatalog();

const profilePanel = initArcadeProfilePanel();
renderPrimaryAppNav(document.getElementById("gridPrimaryNav"), {
  basePath: "",
  currentPage: "arcade",
  linkClass: "grid-stage__portal",
  sessionNavId: "gridAuthNav",
});

const session = await initSessionNav(document.getElementById("gridAuthNav"), {
  signInPath: "sign-in/index.html",
  signUpPath: "sign-up/index.html",
  homeOnLogout: "index.html",
});

if (session?.ok && session?.playerId) {
  const chip = document.getElementById("playerProfileButton");
  const panel = document.getElementById("playerProfilePanel");
  if (chip) chip.hidden = true;
  if (panel) panel.hidden = true;
} else {
  profilePanel?.render();
}
