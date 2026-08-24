export const BULLETIN_STATUS_VALUES = ["draft", "published", "archived"];
const BULLETIN_STATUSES = new Set(BULLETIN_STATUS_VALUES);
export const BULLETIN_AUDIENCE_VALUES = ["public", "friends", "private"];
const BULLETIN_AUDIENCES = new Set(BULLETIN_AUDIENCE_VALUES);
function isBulletinStatus(value) {
    return BULLETIN_STATUSES.has(value);
}
function isBulletinAudience(value) {
    return BULLETIN_AUDIENCES.has(value);
}
// Shipped fallback content. Used only when the platform API cannot be reached at all —
// see arcade-bulletins.mts for the null-vs-empty rule. Once bulletins are authored in the
// admin console these are never rendered, but they stay as the offline/static-host story.
export const DEFAULT_BULLETINS = Object.freeze([
    {
        id: "bulletin-1",
        slug: "lovers-lost-now-live",
        title: "Lovers Lost Is Now Live",
        summary: "The arcade's first story-driven runner is open for play. Step into a split-screen chase and find your way back.",
        body: "Lovers Lost is now available in the arcade grid. It's a side-scrolling runner with a split-screen twist — one player pushes forward through a world of obstacles while the other navigates a parallel path. The further apart you drift, the harder the reunion. Clear obstacles, survive the run, and see if you can close the gap before the level ends.\n\nHead to the arcade grid to launch it.",
        status: "published",
        audience: "public",
        imageUrl: "",
        publishedAt: "2026-04-19T19:00:00Z",
        createdBy: "system",
        createdByName: "",
    },
    {
        id: "bulletin-2",
        slug: "battleshits-now-live",
        title: "Battleshits Is Now Live",
        summary: "The arcade's flagship two-player strategy game has dropped. Place your fleet, call your shots, sink your rival.",
        body: "Battleshits is now open on the arcade floor. It's a full two-player grid combat game built on the classic fleet-vs-fleet format — place your ships, take turns calling coordinates, and try to sink the enemy before they find yours. The game features a custom fleet setup phase, an emoji-powered hit and miss system, and a clean split-screen battle view.\n\nGrab a second player and find it on the arcade grid.",
        status: "published",
        audience: "public",
        imageUrl: "",
        publishedAt: "2026-04-21T08:00:00Z",
        createdBy: "system",
        createdByName: "",
    },
    {
        id: "bulletin-3",
        slug: "ops-draft",
        title: "Ops Draft",
        summary: "Internal staging note.",
        body: "This item should not appear on the public board.",
        status: "draft",
        audience: "public",
        imageUrl: "",
        publishedAt: "2026-04-22T08:00:00Z",
        createdBy: "system",
        createdByName: "",
    },
]);
function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
    if (typeof value !== "string")
        return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
    if (typeof value !== "string")
        return "";
    return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}
// An attachment URL is rendered straight into an `<img src>`, so only http(s) survives
// normalization. The server applies the same rule; this is the second half of it, so a
// bad value can never reach the DOM even if it arrives from a fixture or a stale cache.
function sanitizeImageUrl(value) {
    const raw = sanitizeSingleLine(value, 500);
    if (!raw)
        return "";
    try {
        const parsed = new URL(raw);
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? raw : "";
    }
    catch {
        return "";
    }
}
function comparePublishedDesc(left, right) {
    const leftTime = Date.parse(left.publishedAt || "") || 0;
    const rightTime = Date.parse(right.publishedAt || "") || 0;
    if (leftTime !== rightTime) {
        return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
}
export function normalizeBulletin(bulletin = {}, index = 0) {
    const source = (bulletin && typeof bulletin === "object" ? bulletin : {});
    const id = sanitizeSingleLine(source.id, 80) || `bulletin-${index + 1}`;
    const slug = sanitizeSingleLine(source.slug, 80) || id;
    const title = sanitizeSingleLine(source.title, 96) || `Bulletin ${index + 1}`;
    const status = sanitizeSingleLine(source.status, 24).toLowerCase();
    const audience = sanitizeSingleLine(source.audience, 24).toLowerCase();
    return {
        id,
        slug,
        title,
        summary: sanitizeTextBlock(source.summary, 220),
        // Matches the server's own body cap so a long notice is not silently truncated on
        // the way to the card, which renders the body in full.
        body: sanitizeTextBlock(source.body, 4000),
        status: isBulletinStatus(status) ? status : "draft",
        audience: isBulletinAudience(audience) ? audience : "public",
        imageUrl: sanitizeImageUrl(source.imageUrl),
        publishedAt: sanitizeSingleLine(source.publishedAt, 40),
        createdBy: sanitizeSingleLine(source.createdBy, 40) || "system",
        createdByName: sanitizeSingleLine(source.createdByName, 80),
    };
}
export function buildPublicBulletinFeed(source = DEFAULT_BULLETINS) {
    if (!Array.isArray(source))
        return [];
    return source
        .map((entry, index) => normalizeBulletin(entry, index))
        .filter((entry) => entry.status === "published" && entry.audience === "public")
        .sort(comparePublishedDesc);
}
