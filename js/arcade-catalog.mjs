export const ARCADE_GAME_SLUGS = Object.freeze([
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
    "speed-demon",
    "yam-bowling",
    "mini-hoops",
    "hide-and-seek",
    "puckd-up",
    // slug is the public identity; path is the actual games/ subfolder (umbrella folder differs from game name)
    { slug: "creature-battler", path: "creature-battle" },
]);
export const GRID_PAGE_SIZE = 9;
function normalizeStringList(value, transform) {
    if (!Array.isArray(value))
        return [];
    const normalized = [];
    for (const item of value) {
        const entry = transform(String(item ?? "").trim());
        if (entry && !normalized.includes(entry))
            normalized.push(entry);
    }
    return normalized;
}
export function normalizeCatalogCategories(value, fallback = ["Arcade"]) {
    const categories = normalizeStringList(value, (entry) => entry.slice(0, 32)).slice(0, 8);
    return categories.length ? categories : [...fallback];
}
export function normalizeCatalogDimensions(value, fallback = ["2d"]) {
    const dimensions = normalizeStringList(value, (entry) => entry.toLowerCase())
        .filter((entry) => entry === "2d" || entry === "3d");
    return dimensions.length ? dimensions : [...fallback];
}
export function normalizeCatalogPlayModes(value, fallback = ["solo"]) {
    const modes = normalizeStringList(value, (entry) => entry.toLowerCase())
        .filter((entry) => entry === "solo" || entry === "local" || entry === "online");
    return modes.length ? modes : [...fallback];
}
export function normalizeCatalogPreviewVideo(value) {
    const path = typeof value === "string" ? value.trim() : "";
    return /^grid-previews\/[a-z0-9][a-z0-9._/-]*\.(?:webm|mp4)$/i.test(path) ? path : undefined;
}
function titleFromSlug(slug) {
    return String(slug || "")
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
export function normalizeGameEntry(slug, config = {}, path = null) {
    const folderPath = path || slug;
    return {
        slug,
        title: config.title || titleFromSlug(slug),
        tagline: config.tagline || "A new cabinet is warming up.",
        description: config.description || "",
        players: config.players || "1-2",
        status: config.status || "Prototype",
        categories: normalizeCatalogCategories(config.categories),
        dimensions: normalizeCatalogDimensions(config.dimensions),
        playModes: normalizeCatalogPlayModes(config.play_modes),
        order: Number.isFinite(config.order) ? config.order : 9999,
        featured: config.featured === true,
        theme: config.theme || "ember",
        accentColor: config.accentColor || "#ffb84d",
        href: `games/${folderPath}/index.html`,
        previewImage: config.previewImage || `grid-previews/${slug}.png`,
        previewVideo: normalizeCatalogPreviewVideo(config.previewVideo),
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
            categories: ["Arcade"],
            dimensions: ["2d"],
            playModes: ["solo"],
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
// Applies admin-authored presentation overrides on top of the catalog built from each
// cabinet's game.json.
//
// STABILITY CONTRACT. This function is the ONLY place admin data touches the grid, and it
// is deliberately narrow:
//   - It never adds a cabinet. An override for a slug that is not already in the catalog
//     is ignored, so a stale or mistyped row cannot conjure a broken card.
//   - It never changes `href`, `slug`, or `previewImage`. Where a cabinet lives and what
//     it launches come from ARCADE_GAME_SLUGS and game.json, full stop — no admin edit
//     can point a card at the wrong game or a dead path.
//   - Null/absent fields inherit. Only a value the operator explicitly set is applied.
//   - `hidden` removes a card from the grid. The game's folder, files, and direct URL are
//     untouched; this is a listing change, not a takedown.
// The result: the worst an override can do is present a cabinet oddly, and deleting the
// row restores it exactly.
export function applyCabinetOverrides(games, overrides = []) {
    if (!Array.isArray(overrides) || overrides.length === 0)
        return games;
    const bySlug = new Map();
    for (const override of overrides) {
        const slug = typeof override?.slug === "string" ? override.slug.trim() : "";
        if (slug)
            bySlug.set(slug, override);
    }
    if (bySlug.size === 0)
        return games;
    const merged = [];
    for (const game of games) {
        const override = bySlug.get(game.slug);
        if (!override) {
            merged.push(game);
            continue;
        }
        if (override.hidden === true)
            continue;
        merged.push({
            ...game,
            title: typeof override.title === "string" && override.title ? override.title : game.title,
            tagline: typeof override.tagline === "string" && override.tagline ? override.tagline : game.tagline,
            description: typeof override.description === "string" && override.description ? override.description : game.description,
            status: typeof override.statusLabel === "string" && override.statusLabel ? override.statusLabel : game.status,
            categories: normalizeCatalogCategories(override.categories, game.categories),
            dimensions: normalizeCatalogDimensions(override.dimensions, game.dimensions),
            playModes: normalizeCatalogPlayModes(override.playModes, game.playModes),
            previewVideo: normalizeCatalogPreviewVideo(override.previewVideo) || game.previewVideo,
            order: Number.isFinite(override.sortOrder) ? Number(override.sortOrder) : game.order,
            featured: typeof override.featured === "boolean" ? override.featured : game.featured,
        });
    }
    return sortArcadeGames(merged);
}
export async function loadArcadeCatalog(fetcher = fetch, slugs = ARCADE_GAME_SLUGS) {
    const entries = await Promise.all(slugs.map(async (entry) => {
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
        }
        catch (error) {
            return normalizeGameEntry(slug, {}, path);
        }
    }));
    return sortArcadeGames(entries);
}
