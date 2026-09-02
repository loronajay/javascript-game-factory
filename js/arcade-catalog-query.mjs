export function parsePlayerRange(value) {
    const matches = String(value ?? "").match(/\d+/g)?.map(Number) || [];
    if (!matches.length)
        return { min: 0, max: 0 };
    return { min: matches[0], max: matches[1] ?? matches[0] };
}
function includesSearch(game, search) {
    const haystack = [
        game.title,
        game.tagline,
        game.description,
        game.categories.join(" "),
        game.dimensions.join(" "),
    ].join(" ").toLocaleLowerCase();
    return search.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}
export function filterArcadeCatalog(games, query = {}) {
    const search = String(query.search || "").trim().toLocaleLowerCase();
    const category = String(query.category || "").trim().toLocaleLowerCase();
    const playerCount = Number.parseInt(String(query.players || ""), 10);
    const filtered = games.filter((game) => {
        if (search && !includesSearch(game, search))
            return false;
        if (category && !game.categories.some((entry) => entry.toLocaleLowerCase() === category))
            return false;
        if (query.dimension && !game.dimensions.includes(query.dimension))
            return false;
        if (query.mode === "multiplayer") {
            const range = parsePlayerRange(game.players);
            if (range.max < 2 || !game.playModes.some((mode) => mode === "local" || mode === "online"))
                return false;
        }
        else if (query.mode && !game.playModes.includes(query.mode)) {
            return false;
        }
        if (Number.isFinite(playerCount)) {
            const range = parsePlayerRange(game.players);
            if (playerCount < range.min || playerCount > range.max)
                return false;
        }
        return true;
    });
    return [...filtered].sort((left, right) => {
        if (query.sort === "title")
            return left.title.localeCompare(right.title) || left.slug.localeCompare(right.slug);
        return left.order - right.order || left.title.localeCompare(right.title) || left.slug.localeCompare(right.slug);
    });
}
export function buildCatalogFacets(games) {
    const categoryCounts = new Map();
    for (const game of games) {
        for (const category of game.categories) {
            categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        }
    }
    return {
        categories: [...categoryCounts.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([value, count]) => ({ value, count })),
        dimensions: ["2d", "3d"].map((value) => ({
            value,
            count: games.filter((game) => game.dimensions.includes(value)).length,
        })),
    };
}
