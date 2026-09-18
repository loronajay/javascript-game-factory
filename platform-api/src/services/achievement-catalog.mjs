// The platform achievement registry — which games have achievements, what
// they are, and how a submitted run is judged against them.
//
// This is the achievement counterpart to services/leaderboard-catalog. A game
// is one entry in GAMES: its definitions, a `normalizeRun` that turns an
// untrusted payload into a validated run summary (or rejects it), and a pure
// `detect` that maps a run plus the player's current collection to the ids it
// earns. Nothing else changes to add a game: the routes, the insert path and
// the profile read are all driven from here, and the tables (migration 048)
// are generic on game_slug.
//
// ## Ownership split
//
// The game owns the facts (what happened in a run) and the conditions (what
// those facts earn). The platform owns the collection: persistence, identity,
// idempotency, masking of secrets, and the profile read. A game module in this
// folder is the game's conditions hosted where the platform can enforce them;
// it is not the platform learning the game's rules.
//
// ## Trust boundary (read this before adding a game)
//
// A run arrives from a browser, so every field is attacker-controlled. The
// registry gives a game two defences and no third:
//
//   1. `normalizeRun` rejects the impossible — counts that do not add up,
//      times past the game's own cutoff, modes that do not exist. It refuses
//      forgeries, not suspicious-but-possible runs.
//   2. `detect` is the ONLY path to an unlock. A client never names an
//      achievement id; it describes a run and the server decides. There is no
//      "claim id X" endpoint to spoof.
//
// What this does NOT do is prove the run happened. A perfect run can be
// typed by hand as JSON that passes every plausibility check. That is the
// same standing as game_run_records today (see db/run-records: stored as a
// claim, verified later), and the honest fix is the same — a game whose
// results are already server-authoritative (a factory-network-server match)
// can later submit from the server with a shared secret, and a client-sim
// game can ship its input log for deterministic replay. Both slot in as a
// stronger `normalizeRun` without changing the data model or the routes.
//
// ## Ids are permanent
//
// An achievement id is stored on every ownership row. Renaming one orphans
// every unlock of it on every account. Names and descriptions are free to
// change; ids, and the `gameSlug` they hang under, are not.
//
// ## Tree semantics
//
// `parentId` is presentation: it says where an achievement hangs in the
// game's tree, not what must be owned first. A first run that scores past
// the top score tier unlocks the whole branch at once, because each
// condition is evaluated on its own. A game that wants a genuine
// prerequisite expresses it in `detect` against `ownedIds`.
import { LOVERS_LOST_ACHIEVEMENTS } from "./lovers-lost-achievement-catalog.mjs";
const GAMES = Object.freeze([
    LOVERS_LOST_ACHIEVEMENTS,
]);
const BY_SLUG = new Map(GAMES.map((game) => [game.gameSlug, game]));
function cleanText(value, maxLength = 60) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
export function listAchievementGames() {
    return GAMES.map((game) => ({ gameSlug: game.gameSlug, title: game.title, total: game.definitions.length }));
}
export function isAchievementGameSlug(value) {
    return BY_SLUG.has(cleanText(value).toLowerCase());
}
export function getAchievementGame(value) {
    return BY_SLUG.get(cleanText(value).toLowerCase()) ?? null;
}
export function getAchievementDefinition(gameSlug, achievementId) {
    const game = getAchievementGame(gameSlug);
    const id = cleanText(achievementId, 80);
    return game?.definitions.find((definition) => definition.id === id) ?? null;
}
/**
 * The public shape of one definition. A locked secret is masked here and
 * nowhere else, so every read — the game registry, the profile, the unlock
 * response — hides the same fields the same way. `unlockedAt` is null when
 * the player does not own it (or when no player is in question).
 */
export function presentAchievement(definition, unlockedAt) {
    const unlocked = typeof unlockedAt === "string" && unlockedAt.length > 0;
    const masked = definition.secret === true && !unlocked;
    return {
        id: definition.id,
        name: masked ? "???" : definition.name,
        description: masked ? "Secret achievement" : definition.description,
        category: definition.category,
        secret: definition.secret === true,
        parentId: definition.parentId ?? null,
        tier: definition.tier ?? null,
        points: definition.points ?? 0,
        icon: masked ? null : (definition.icon ?? null),
        unlocked,
        unlockedAt: unlocked ? unlockedAt : null,
    };
}
/**
 * Runs a game's detector to a fixed point. A cumulative achievement ("own
 * both sides") can become true only because of ids earned by the same run,
 * so detection repeats with the growing set until nothing new appears. The
 * catalog is finite, so this terminates; the bound is a guard against a
 * detector that misbehaves, not part of the contract.
 */
export function evaluateAchievementRun(game, run, ownedIds) {
    const known = new Set(game.definitions.map((definition) => definition.id));
    const owned = new Set();
    for (const id of ownedIds)
        if (known.has(id))
            owned.add(id);
    const earned = [];
    for (let pass = 0; pass < game.definitions.length + 1; pass += 1) {
        const found = game.detect({ run, ownedIds: owned }).filter((id) => known.has(id) && !owned.has(id));
        if (found.length === 0)
            break;
        for (const id of found) {
            owned.add(id);
            earned.push(id);
        }
    }
    // Report in catalog order regardless of the pass that found each one, so a
    // branch unlocked at once reads bottom-up on the client.
    const order = new Map(game.definitions.map((definition, index) => [definition.id, index]));
    return earned.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
