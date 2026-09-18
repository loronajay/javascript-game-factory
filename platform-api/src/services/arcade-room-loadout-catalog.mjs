// The personal arcade room's server-owned layout catalog: the trust boundary
// for where a player has put their cabinets.
//
// The room is a PLATFORM surface (`/room/`), not a cabinet, but its document is
// exactly the shape `game_loadouts` was built for — one JSON document per
// account, self-only writes, public reads — so it registers here under the
// `arcade-room` slug beside the four cabinet garages rather than growing a
// table and a route family of its own. `GET`/`PUT /games/arcade-room/garage`
// is the owner's path; `GET /games/arcade-room/loadout/:playerId` is what a
// visitor's browser reads to draw somebody else's room.
//
// UNLIKE THE CABINET GARAGES, THE PUBLIC READ IS THE WHOLE DOCUMENT. A car
// garage hides everything but the active car because an opponent only needs
// the one being driven. A room exists to be walked through, so the public
// loadout is the layout itself — there is nothing in it a visitor should not
// see, and no "active entry" to resolve to.
//
// WHAT IS VALIDATED, AND WHAT IS NOT. The server bounds the document (item
// count, id shapes, finite coordinates inside a generous box) and nothing more.
// It does not know the room's exact walls or the cabinets' footprints: the
// client already clamps every drag against those and refuses overlaps, and a
// mirror of the footprint table here would be a second copy to drift for a
// payload that touches no simulation and no economy. Cabinet ids are checked
// for NAMESPACE (`cabinet.<game>.<variant>`), the same rule as Shark Hall.
//
// THE EMPTY LAYOUT IS THE DEFAULT ON PURPOSE. A player with no row gets
// `items: []`, and the client's own normalizer fills in the starter cabinets at
// their starter positions. Keeping those coordinates out of this file means a
// starter-layout retune is a client change, not a two-repo deploy.
//
// VERSION 2 ADDED SURFACES AND DECOR (2026-09-17). `surfaces` names the floor,
// wall, ceiling and trim finish by catalog id; `decor` is the list of placed
// neon, signs, posters, rugs, lights and props. The same policy applies: ids
// are checked for NAMESPACE (`floor.<name>`, `decor.<category>.<variant>`),
// numbers are bounded, and the client's catalog decides what an id means. A
// surface id that fails the pattern is stored as "" (client default); a decor
// row that cannot be made valid is dropped. A decor row also carries `scale`
// (2026-09-17), the player's resize of a sign, poster, rug or prop, and `spin`
// (2026-09-17), a wall item's turn in its wall's plane (an upright or slanted
// neon strip), kept to one turn like `rotationY`. The `decor` key is emitted only
// when the client sent one, because the client seeds its starter neon exactly
// when the key is ABSENT — a version 2 row with `decor: []` is a room the
// player deliberately stripped, and must come back stripped.
//
// A DECOR ROW MAY CARRY THE PLAYER'S OWN WORDS OR PICTURE (2026-09-17). `text`
// is a custom sign's line, kept as printable text capped at 24; `image` is a
// custom poster's picture and is accepted ONLY as a URL under this platform's
// Cloudinary upload path, because every visitor's browser fetches whatever is
// stored here — an arbitrary URL would let one player point everyone who walks
// into their room at any host they like. `aspect` (width ÷ height) travels
// with the picture so the client can shape the frame before it loads, and is
// meaningless (stored as 1) without one. The client's catalog decides which
// items honour these; here they are shape-checked and passed through.
//
// `music.defaultTrackId` (2026-09-17) is the house record: the jukebox track
// the room starts playing for anyone who walks in. Same policy again — it is
// checked for SHAPE (`<game-slug>.<track-slug>`), and the client's jukebox
// catalog decides whether it is a record that exists; one that is not is
// silence on the client, never an error here.
export const ARCADE_ROOM_GAME_SLUG = "arcade-room";
const LAYOUT_VERSION = 3;
/** Plenty for a room that seats two cabinets today; a bound, not a plan. */
const MAX_ITEMS = 32;
/** A wall of neon strips and a floor of props; a bound, not a plan. */
const MAX_DECOR = 96;
/** The room is 20×20; ±12 leaves margin for a wider room without accepting nonsense. */
const COORDINATE_LIMIT = 12;
/** Decor height: the floor to a generous ceiling. */
const HEIGHT_LIMIT = 8;
/** The longest stretchable item the client offers is 10 m. */
const LENGTH_LIMIT = 20;
/** The biggest resize the client offers is ×3. */
const SCALE_LIMIT = 5;
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
/** `cabinet.<game-slug>.<variant>` — the namespace every catalog cabinet id lives in. */
const CABINET_ID_PATTERN = /^cabinet\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `decor.<category>.<variant>` — every decor id, whatever the client's catalog holds. */
const DECOR_ID_PATTERN = /^decor\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SURFACE_KINDS = ["floor", "wall", "ceiling", "trim"];
const DECOR_MOUNTS = new Set(["floor", "wall", "ceiling"]);
const WALL_SIDES = new Set(["north", "south", "east", "west"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/;
/** A custom sign's line: one short line of neon. */
const TEXT_LIMIT = 24;
/** A poster picture: this platform's Cloudinary uploads and nothing else. */
const IMAGE_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/[A-Za-z0-9_./-]+$/;
const IMAGE_URL_LIMIT = 400;
/** Width ÷ height of a poster picture; outside this it is a banner, not a poster. */
const ASPECT_LIMITS = { min: 0.25, max: 4 };
/** `<game-slug>.<track-slug>` — the namespace every jukebox track id lives in. */
const TRACK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_AVATAR_ID = "avatar.hero-m";
const AVATAR_IDS = new Set([
    "avatar.hero-f", "avatar.hero-m",
    "avatar.ogre-heavy", "avatar.ogre-light", "avatar.ogre-mage", "avatar.ogre",
    "avatar.skeleton-heavy", "avatar.skeleton-light", "avatar.skeleton-mage", "avatar.skeleton-reaper",
    "avatar.villager-f", "avatar.villager-m",
]);
function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
/** Printable single-line text: control characters become spaces, runs of space collapse. */
function cleanLine(value, maxLength) {
    if (typeof value !== "string")
        return "";
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function boundedNumber(value, limit) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    return Number(Math.min(limit, Math.max(-limit, value)).toFixed(4));
}
/**
 * Rotation is kept on a single turn. A client that snaps by 15° and lets the
 * player spin a cabinet forty times would otherwise store an ever-growing
 * angle for the same facing.
 */
function normalizeRotation(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    const turn = Math.PI * 2;
    const wrapped = ((value % turn) + turn) % turn;
    return Number(wrapped.toFixed(4));
}
function surfaceIdPattern(kind) {
    return new RegExp(`^${kind}\\.[a-z0-9]+(?:-[a-z0-9]+)*$`);
}
export function defaultArcadeRoomGarage() {
    // Missing rows predate removable cabinet instances. Version 2 tells the client
    // to seed its starter floor; only an explicitly saved v3 document may stay empty.
    return { version: 2, avatarId: DEFAULT_AVATAR_ID, surfaces: { floor: "", wall: "", ceiling: "", trim: "" }, music: { defaultTrackId: "" }, items: [] };
}
function normalizeMusic(value) {
    const source = value && typeof value === "object" ? value : {};
    const trackId = cleanText(source.defaultTrackId, 80);
    return { defaultTrackId: TRACK_ID_PATTERN.test(trackId) ? trackId : "" };
}
function normalizeSurfaces(value) {
    const source = value && typeof value === "object" ? value : {};
    const surfaces = {};
    for (const kind of SURFACE_KINDS) {
        const id = cleanText(source[kind], 80);
        surfaces[kind] = surfaceIdPattern(kind).test(id) ? id : "";
    }
    return surfaces;
}
function normalizeDecorRow(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const instanceId = cleanText(source.instanceId, 40);
    const itemId = cleanText(source.itemId, 80);
    if (!INSTANCE_ID_PATTERN.test(instanceId) || !DECOR_ID_PATTERN.test(itemId))
        return null;
    const x = boundedNumber(source.x, COORDINATE_LIMIT);
    const z = boundedNumber(source.z, COORDINATE_LIMIT);
    const rotationY = normalizeRotation(source.rotationY);
    if (x === null || z === null || rotationY === null)
        return null;
    const rawY = boundedNumber(source.y, HEIGHT_LIMIT);
    const y = rawY === null ? 0 : Math.max(0, rawY);
    const mount = typeof source.mount === "string" && DECOR_MOUNTS.has(source.mount) ? source.mount : "floor";
    const wall = mount === "wall" && typeof source.wall === "string" && WALL_SIDES.has(source.wall) ? source.wall : "";
    if (mount === "wall" && !wall)
        return null;
    const color = typeof source.color === "string" && HEX_COLOR.test(source.color.toLowerCase()) ? source.color.toLowerCase() : "";
    const rawLength = boundedNumber(source.length, LENGTH_LIMIT);
    const length = rawLength === null ? 0 : Math.max(0, rawLength);
    // A missing or non-positive scale is size 1 — a stored 0 would make the client draw nothing.
    const rawScale = boundedNumber(source.scale, SCALE_LIMIT);
    const scale = rawScale === null || rawScale <= 0 ? 1 : rawScale;
    // A missing or junk spin is level; the client decides which items may hold one at all.
    const spin = normalizeRotation(source.spin) ?? 0;
    const text = cleanLine(source.text, TEXT_LIMIT);
    const rawImage = typeof source.image === "string" ? source.image.trim() : "";
    const image = rawImage.length <= IMAGE_URL_LIMIT && IMAGE_URL_PATTERN.test(rawImage) ? rawImage : "";
    const rawAspect = typeof source.aspect === "number" && Number.isFinite(source.aspect) ? source.aspect : 1;
    const aspect = image ? Number(Math.min(ASPECT_LIMITS.max, Math.max(ASPECT_LIMITS.min, rawAspect)).toFixed(3)) : 1;
    return { instanceId, itemId, x, y, z, rotationY, mount, wall, color, length, scale, spin, text, image, aspect };
}
/**
 * Coerce any stored or submitted document into a layout.
 *
 * Run on the way IN and on the way OUT. An item that cannot be made valid is
 * DROPPED rather than failing the save: one malformed row must not cost the
 * player the rest of the room. Duplicate instance ids keep their first
 * occurrence, because the client keys everything by that id.
 */
export function normalizeArcadeRoomGarage(value) {
    const input = value && typeof value === "object" ? value : {};
    const rawItems = Array.isArray(input.items) ? input.items.slice(0, MAX_ITEMS) : [];
    const seen = new Set();
    const items = [];
    const surfaces = normalizeSurfaces(input.surfaces);
    const music = normalizeMusic(input.music);
    for (const raw of rawItems) {
        const source = raw && typeof raw === "object" ? raw : {};
        const instanceId = cleanText(source.instanceId, 40);
        const cabinetId = cleanText(source.cabinetId, 80);
        const x = boundedNumber(source.x, COORDINATE_LIMIT);
        const z = boundedNumber(source.z, COORDINATE_LIMIT);
        const rotationY = normalizeRotation(source.rotationY);
        if (!INSTANCE_ID_PATTERN.test(instanceId) || !CABINET_ID_PATTERN.test(cabinetId))
            continue;
        if (x === null || z === null || rotationY === null)
            continue;
        if (seen.has(instanceId))
            continue;
        seen.add(instanceId);
        // A hidden cabinet is still a placed cabinet — it keeps its spot and stays in the
        // document so the client never re-seeds it as a starter. Only a real `true` hides.
        items.push({ instanceId, cabinetId, x, z, rotationY, hidden: source.hidden === true });
    }
    const version = input.version === LAYOUT_VERSION ? LAYOUT_VERSION : 2;
    const submittedAvatarId = cleanText(input.avatarId, 80);
    const avatarId = AVATAR_IDS.has(submittedAvatarId) ? submittedAvatarId : DEFAULT_AVATAR_ID;
    const garage = { version, avatarId, surfaces, music, items };
    if (Array.isArray(input.decor)) {
        const decor = [];
        for (const raw of input.decor.slice(0, MAX_DECOR)) {
            const row = normalizeDecorRow(raw);
            if (!row || seen.has(row.instanceId))
                continue;
            seen.add(row.instanceId);
            decor.push(row);
        }
        garage.decor = decor;
    }
    return garage;
}
/** What a visitor draws: the layout itself. See the note at the top of this file. */
export function arcadeRoomLoadoutFromGarage(garage) {
    return { layout: normalizeArcadeRoomGarage(garage) };
}
export const ARCADE_ROOM_LOADOUT_CATALOG = Object.freeze({
    // Both starter cabinets are granted to everyone; the day a cabinet has to be
    // earned, the owned-id test goes beside the namespace check above.
    requiresEntitlements: false,
    normalizeGarage: normalizeArcadeRoomGarage,
    loadoutFromGarage: arcadeRoomLoadoutFromGarage,
});
