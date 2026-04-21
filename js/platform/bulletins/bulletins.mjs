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
    slug: "spring-jam-call",
    title: "Spring Jam Call",
    summary: "Cabinet teams can lock in their weekend pairings now.",
    body: "Warm-up runs open Friday night. Submit pairings before the first bracket sweep so the floor boards can stay synced.",
    status: "published",
    audience: "public",
    publishedAt: "2026-04-19T19:00:00Z",
    createdBy: "system",
  },
  {
    id: "bulletin-2",
    slug: "late-night-ladder",
    title: "Late Night Ladder",
    summary: "Ranking snapshots now post during the midnight ladder window.",
    body: "Factory pilots can keep pushing after sunset. Ladder recaps land on the board once the queue closes for the night.",
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
