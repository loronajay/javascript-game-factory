const BULLETIN_STATUSES = new Set([
  "draft",
  "published",
  "archived",
]);

const BULLETIN_AUDIENCES = new Set([
  "public",
  "friends",
  "private",
]);

const DEFAULT_BULLETINS = Object.freeze([
  {
    id: "bulletin-1",
    slug: "lovers-lost-now-live",
    title: "Lovers Lost Is Now Live",
    summary: "The arcade's first story-driven runner is open for play. Step into a split-screen chase and find your way back.",
    body: "Lovers Lost is now available in the arcade grid. It's a side-scrolling runner with a split-screen twist — one player pushes forward through a world of obstacles while the other navigates a parallel path. The further apart you drift, the harder the reunion. Clear obstacles, survive the run, and see if you can close the gap before the level ends.\n\nHead to the arcade grid to launch it.",
    status: "published",
    audience: "public",
    publishedAt: "2026-04-19T19:00:00Z",
    createdBy: "system",
  },
  {
    id: "bulletin-2",
    slug: "battleshits-now-live",
    title: "Battleshits Is Now Live",
    summary: "The arcade's flagship two-player strategy game has dropped. Place your fleet, call your shots, sink your rival.",
    body: "Battleshits is now open on the arcade floor. It's a full two-player grid combat game built on the classic fleet-vs-fleet format — place your ships, take turns calling coordinates, and try to sink the enemy before they find yours. The game features a custom fleet setup phase, an emoji-powered hit and miss system, and a clean split-screen battle view.\n\nGrab a second player and find it on the arcade grid.",
    status: "published",
    audience: "public",
    publishedAt: "2026-04-21T08:00:00Z",
    createdBy: "system",
  },
  {
    id: "bulletin-3",
    slug: "ops-draft",
    title: "Ops Draft",
    summary: "Internal staging note.",
    body: "This item should not appear on the public board.",
    status: "draft",
    audience: "public",
    publishedAt: "2026-04-22T08:00:00Z",
    createdBy: "system",
  },
]);

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
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
  const id = sanitizeSingleLine(bulletin?.id, 80) || `bulletin-${index + 1}`;
  const slug = sanitizeSingleLine(bulletin?.slug, 80) || id;
  const title = sanitizeSingleLine(bulletin?.title, 96) || `Bulletin ${index + 1}`;
  const status = sanitizeSingleLine(bulletin?.status, 24).toLowerCase();
  const audience = sanitizeSingleLine(bulletin?.audience, 24).toLowerCase();

  return {
    id,
    slug,
    title,
    summary: sanitizeTextBlock(bulletin?.summary, 220),
    body: sanitizeTextBlock(bulletin?.body, 1200),
    status: BULLETIN_STATUSES.has(status) ? status : "draft",
    audience: BULLETIN_AUDIENCES.has(audience) ? audience : "public",
    publishedAt: sanitizeSingleLine(bulletin?.publishedAt, 40),
    createdBy: sanitizeSingleLine(bulletin?.createdBy, 40) || "system",
  };
}

export function buildPublicBulletinFeed(source = DEFAULT_BULLETINS) {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeBulletin(entry, index))
    .filter((entry) => entry.status === "published" && entry.audience === "public")
    .sort(comparePublishedDesc);
}
