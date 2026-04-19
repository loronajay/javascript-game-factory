export const ARCADE_GAME_SLUGS = Object.freeze([
  "lovers-lost",
]);

export const GRID_PAGE_SIZE = 9;

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeGameEntry(slug, config = {}) {
  return {
    slug,
    title: config.title || titleFromSlug(slug),
    tagline: config.tagline || "A new cabinet is warming up.",
    description: config.description || "",
    players: config.players || "1-2",
    status: config.status || "Prototype",
    order: Number.isFinite(config.order) ? config.order : 9999,
    featured: config.featured === true,
    theme: config.theme || "ember",
    accentColor: config.accentColor || "#ffb84d",
    href: `games/${slug}/index.html`,
    previewImage: config.previewImage || `grid-previews/${slug}.png`,
    cardClasses: Array.isArray(config.card_classes) ? [...config.card_classes] : [],
  };
}

export function sortArcadeGames(games) {
  return [...games].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    const titleCompare = left.title.localeCompare(right.title);
    if (titleCompare !== 0) {
      return titleCompare;
    }

    return left.slug.localeCompare(right.slug);
  });
}

export function paginateArcadeGames(games, pageSize = GRID_PAGE_SIZE) {
  const size = Math.max(1, pageSize | 0);
  const pages = [];

  for (let index = 0; index < games.length; index += size) {
    pages.push(games.slice(index, index + size));
  }

  return pages;
}

export function fillArcadePageSlots(games, pageSize = GRID_PAGE_SIZE) {
  const size = Math.max(1, pageSize | 0);
  const slots = games.slice(0, size);

  while (slots.length < size) {
    const slotNumber = slots.length + 1;
    slots.push({
      slug: `coming-soon-${slotNumber}`,
      title: "Coming Soon",
      tagline: "Another cabinet is warming up behind the neon glass.",
      description: "",
      players: "Soon",
      status: "Coming Soon",
      order: 9000 + slotNumber,
      featured: false,
      theme: "placeholder",
      accentColor: "#8cf6d4",
      href: "#",
      cardClasses: ["game-card--placeholder"],
      isPlaceholder: true,
    });
  }

  return slots;
}

export async function loadArcadeCatalog(fetcher = fetch, slugs = ARCADE_GAME_SLUGS) {
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const response = await fetcher(`games/${slug}/game.json`);
        if (!response || response.ok === false) {
          throw new Error(`Unable to load metadata for ${slug}`);
        }

        const config = await response.json();
        return normalizeGameEntry(slug, config);
      } catch (error) {
        return normalizeGameEntry(slug);
      }
    })
  );

  return sortArcadeGames(entries);
}
