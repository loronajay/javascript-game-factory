// Achievements page view-model: turns a player's collection (the API's
// per-game summaries) into a renderable tree. Pure — no DOM, no fetch.
//
// The tree is read off `parentId`. Roots (no parent) that are not the meta
// capstone lead the game's section; every other root-less definition with
// category "meta" is rendered last as the capstone the branches converge on.
// Layout is left to CSS: a node's children render as a wrapping row of
// columns, so the "tree" is a responsive set of vertical chains rather than a
// pixel-positioned diagram.
function cleanText(value, max = 200) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function buildAchievementTree(game) {
    const list = Array.isArray(game?.achievements) ? game.achievements : [];
    const byId = new Map();
    for (const achievement of list) {
        if (!achievement?.id)
            continue;
        byId.set(achievement.id, { achievement, children: [], depth: 0 });
    }
    const roots = [];
    const capstones = [];
    for (const node of byId.values()) {
        const parentId = node.achievement.parentId;
        const parent = parentId ? byId.get(parentId) : null;
        if (parent && parent !== node)
            parent.children.push(node);
        else if (node.achievement.category === "meta")
            capstones.push(node);
        else
            roots.push(node);
    }
    // Depth is a rendering hint only; assign it once the tree is complete.
    const walk = (node, depth) => {
        node.depth = depth;
        node.children.forEach((child) => walk(child, depth + 1));
    };
    roots.forEach((node) => walk(node, 0));
    capstones.forEach((node) => walk(node, 0));
    return { roots, capstones, order: list.map((achievement) => achievement.id) };
}
export function buildAchievementGameModel(game) {
    const list = Array.isArray(game?.achievements) ? game.achievements : [];
    const unlocked = list.filter((achievement) => achievement.unlocked).length;
    const total = list.length;
    return {
        gameSlug: cleanText(game?.gameSlug, 60),
        title: cleanText(game?.title, 80) || cleanText(game?.gameSlug, 60),
        unlocked,
        total,
        percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
        points: list.filter((a) => a.unlocked).reduce((sum, a) => sum + (Number(a.points) || 0), 0),
        pointsTotal: list.reduce((sum, a) => sum + (Number(a.points) || 0), 0),
        ...buildAchievementTree(game),
    };
}
export function buildAchievementsPageModel(collection, options) {
    const playerId = cleanText(options.playerId, 120);
    const name = cleanText(options.playerName, 80);
    if (!playerId) {
        return {
            state: "signed-out", playerId: "", isOwner: false, unlocked: 0, total: 0, games: [],
            heading: "Trophy Case",
            subheading: options.signedOut
                ? "Sign in to see your achievements, or open a player's profile to browse theirs."
                : "No player selected.",
        };
    }
    if (!collection) {
        return {
            state: "error", playerId, isOwner: options.isOwner, unlocked: 0, total: 0, games: [],
            heading: options.isOwner ? "Your Trophy Case" : `${name || "Player"}'s Trophy Case`,
            subheading: "Achievements could not be loaded right now.",
        };
    }
    const games = (Array.isArray(collection.games) ? collection.games : []).map(buildAchievementGameModel);
    const unlocked = games.reduce((sum, game) => sum + game.unlocked, 0);
    const total = games.reduce((sum, game) => sum + game.total, 0);
    return {
        state: games.length > 0 ? "ready" : "empty",
        playerId,
        isOwner: options.isOwner,
        unlocked,
        total,
        games,
        heading: options.isOwner ? "Your Trophy Case" : `${name || "Player"}'s Trophy Case`,
        subheading: total > 0 ? `${unlocked} of ${total} achievements unlocked across ${games.length} cabinet${games.length === 1 ? "" : "s"}.` : "No cabinets have registered achievements yet.",
    };
}
export function formatUnlockDate(value) {
    if (!value)
        return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
/** Two-letter glyph for an achievement with no icon; the platform's placeholder art. */
export function achievementGlyph(achievement) {
    if (achievement.secret && !achievement.unlocked)
        return "?";
    const words = cleanText(achievement.name, 80).split(/\s+/).filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word[0].toUpperCase()).join("");
    return initials || "★";
}
