export const EVENT_STATUS_VALUES = ["scheduled", "live", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUS_VALUES)[number];
const EVENT_STATUSES = new Set<string>(EVENT_STATUS_VALUES);

function isEventStatus(value: string): value is EventStatus {
  return EVENT_STATUSES.has(value);
}

export interface GameEvent {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  startsAt: string;
  endsAt: string;
  relatedGames: string[];
  bulletinIds: string[];
  status: EventStatus;
}

const DEFAULT_EVENTS: readonly GameEvent[] = Object.freeze([
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

function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function normalizeStringList(value: unknown, maxLength = 80): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function compareStartAsc(left: GameEvent, right: GameEvent): number {
  const leftTime = Date.parse(left.startsAt || "") || 0;
  const rightTime = Date.parse(right.startsAt || "") || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.title.localeCompare(right.title);
}

export function normalizeEventItem(event: unknown = {}, index = 0): GameEvent {
  const source = (event && typeof event === "object" ? event : {}) as Record<string, unknown>;
  const id = sanitizeSingleLine(source.id, 80) || `event-${index + 1}`;
  const slug = sanitizeSingleLine(source.slug, 80) || id;
  const title = sanitizeSingleLine(source.title, 96) || `Event ${index + 1}`;
  const status = sanitizeSingleLine(source.status, 24).toLowerCase();

  return {
    id,
    slug,
    title,
    summary: sanitizeTextBlock(source.summary, 220),
    body: sanitizeTextBlock(source.body, 1600),
    startsAt: sanitizeSingleLine(source.startsAt, 40),
    endsAt: sanitizeSingleLine(source.endsAt, 40),
    relatedGames: normalizeStringList(source.relatedGames),
    bulletinIds: normalizeStringList(source.bulletinIds),
    status: isEventStatus(status) ? status : "scheduled",
  };
}

export function buildPublicEventFeed(source: unknown = DEFAULT_EVENTS): GameEvent[] {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeEventItem(entry, index))
    .filter((entry) => entry.status !== "cancelled")
    .sort(compareStartAsc);
}

export function resolvePublicEventBySlug(source: unknown = DEFAULT_EVENTS, slug: unknown = ""): GameEvent | null {
  const normalizedSlug = sanitizeSingleLine(slug, 80);
  if (!normalizedSlug) return null;

  return buildPublicEventFeed(source).find((entry) => entry.slug === normalizedSlug) || null;
}
