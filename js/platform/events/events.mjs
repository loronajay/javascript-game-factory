const EVENT_STATUSES = new Set([
  "scheduled",
  "live",
  "completed",
  "cancelled",
]);

const DEFAULT_EVENTS = Object.freeze([
  {
    id: "event-1",
    slug: "lovers-lost-weekend",
    title: "Lovers Lost Weekend",
    summary: "A full weekend run for duos on the neon floor.",
    body: "Qualifiers open Friday night, partner brackets tighten on Saturday, and finals close the floor on Sunday.",
    startsAt: "2026-05-02T19:00:00Z",
    endsAt: "2026-05-04T03:00:00Z",
    relatedGames: ["lovers-lost"],
    bulletinIds: ["bulletin-1"],
    status: "scheduled",
  },
  {
    id: "event-2",
    slug: "battleshits-ship-night",
    title: "Battleshits Ship Night",
    summary: "Late-night fleet tuning with fast rematch brackets.",
    body: "Commanders can tune boards, trade room codes, and push rematch sets after the main grid cools down.",
    startsAt: "2026-05-08T03:00:00Z",
    endsAt: "2026-05-08T06:00:00Z",
    relatedGames: ["battleshits"],
    bulletinIds: ["bulletin-2"],
    status: "scheduled",
  },
  {
    id: "event-3",
    slug: "ops-cancelled",
    title: "Ops Cancelled",
    summary: "This should stay off the public calendar.",
    body: "",
    startsAt: "2026-05-10T03:00:00Z",
    endsAt: "2026-05-10T06:00:00Z",
    relatedGames: [],
    bulletinIds: [],
    status: "cancelled",
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

function normalizeStringList(value, maxLength = 80) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function compareStartAsc(left, right) {
  const leftTime = Date.parse(left.startsAt || "") || 0;
  const rightTime = Date.parse(right.startsAt || "") || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.title.localeCompare(right.title);
}

export function normalizeEventItem(event = {}, index = 0) {
  const id = sanitizeSingleLine(event?.id, 80) || `event-${index + 1}`;
  const slug = sanitizeSingleLine(event?.slug, 80) || id;
  const title = sanitizeSingleLine(event?.title, 96) || `Event ${index + 1}`;
  const status = sanitizeSingleLine(event?.status, 24).toLowerCase();

  return {
    id,
    slug,
    title,
    summary: sanitizeTextBlock(event?.summary, 220),
    body: sanitizeTextBlock(event?.body, 1600),
    startsAt: sanitizeSingleLine(event?.startsAt, 40),
    endsAt: sanitizeSingleLine(event?.endsAt, 40),
    relatedGames: normalizeStringList(event?.relatedGames),
    bulletinIds: normalizeStringList(event?.bulletinIds),
    status: EVENT_STATUSES.has(status) ? status : "scheduled",
  };
}

export function buildPublicEventFeed(source = DEFAULT_EVENTS) {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeEventItem(entry, index))
    .filter((entry) => entry.status !== "cancelled")
    .sort(compareStartAsc);
}

export function resolvePublicEventBySlug(source = DEFAULT_EVENTS, slug = "") {
  const normalizedSlug = sanitizeSingleLine(slug, 80);
  if (!normalizedSlug) return null;

  return buildPublicEventFeed(source).find((entry) => entry.slug === normalizedSlug) || null;
}
