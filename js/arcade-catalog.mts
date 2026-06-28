export type ArcadeGameSlug = string | { slug: string; path: string };

export const ARCADE_GAME_SLUGS: ReadonlyArray<ArcadeGameSlug> = Object.freeze([
  "lovers-lost",
  "battleshits",
  "echo-duel",
  "bird-duty",
  "circuit-siege",
  "illuminauts",
  "sumorai",
  "cockpit-swarm",
  "build-buddy",
  "mini-tactics",
  "tactical-arena",
  // slug is the public identity; path is the actual games/ subfolder (umbrella folder differs from game name)
  { slug: "creature-battler", path: "creature-battle" },
]);

export const GRID_PAGE_SIZE = 9;

export interface ArcadeGameEntry {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  players: string;
  status: string;
  order: number;
  featured: boolean;
  theme: string;
  accentColor: string;
  href: string;
  previewImage?: string;
  cardClasses: string[];
  isPlaceholder?: boolean;
}

function titleFromSlug(slug: unknown): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeGameEntry(slug: string, config: any = {}, path: string | null = null): ArcadeGameEntry {
  const folderPath = path || slug;
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
    href: `games/${folderPath}/index.html`,
    previewImage: config.previewImage || `grid-previews/${slug}.png`,
    cardClasses: Array.isArray(config.card_classes) ? [...config.card_classes] : [],
  };
}

export function sortArcadeGames(games: ArcadeGameEntry[]): ArcadeGameEntry[] {
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

export function paginateArcadeGames(games: ArcadeGameEntry[], pageSize = GRID_PAGE_SIZE): ArcadeGameEntry[][] {
  const size = Math.max(1, pageSize | 0);
  const pages: ArcadeGameEntry[][] = [];

  for (let index = 0; index < games.length; index += size) {
    pages.push(games.slice(index, index + size));
  }

  return pages;
}

export function fillArcadePageSlots(games: ArcadeGameEntry[], pageSize = GRID_PAGE_SIZE): ArcadeGameEntry[] {
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

export async function loadArcadeCatalog(
  fetcher: typeof fetch = fetch,
  slugs: ReadonlyArray<ArcadeGameSlug> = ARCADE_GAME_SLUGS,
): Promise<ArcadeGameEntry[]> {
  const entries = await Promise.all(
    slugs.map(async (entry) => {
      const slug = typeof entry === "string" ? entry : entry.slug;
      const path = typeof entry === "string" ? null : (entry.path || null);
      const folderPath = path || slug;
      try {
        const response = await fetcher(`games/${folderPath}/game.json`);
        if (!response || response.ok === false) {
          throw new Error(`Unable to load metadata for ${slug}`);
        }

        const config = await response.json();
        return normalizeGameEntry(slug, config, path);
      } catch (error) {
        return normalizeGameEntry(slug, {}, path);
      }
    })
  );

  return sortArcadeGames(entries);
}
