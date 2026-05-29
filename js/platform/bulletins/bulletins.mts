export const BULLETIN_STATUS_VALUES = ["draft", "published", "archived"] as const;
export type BulletinStatus = (typeof BULLETIN_STATUS_VALUES)[number];
const BULLETIN_STATUSES = new Set<string>(BULLETIN_STATUS_VALUES);

export const BULLETIN_AUDIENCE_VALUES = ["public", "friends", "private"] as const;
export type BulletinAudience = (typeof BULLETIN_AUDIENCE_VALUES)[number];
const BULLETIN_AUDIENCES = new Set<string>(BULLETIN_AUDIENCE_VALUES);

function isBulletinStatus(value: string): value is BulletinStatus {
  return BULLETIN_STATUSES.has(value);
}

function isBulletinAudience(value: string): value is BulletinAudience {
  return BULLETIN_AUDIENCES.has(value);
}

export interface Bulletin {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: BulletinStatus;
  audience: BulletinAudience;
  publishedAt: string;
  createdBy: string;
}

const DEFAULT_BULLETINS: readonly Bulletin[] = Object.freeze([
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

function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function comparePublishedDesc(left: Bulletin, right: Bulletin): number {
  const leftTime = Date.parse(left.publishedAt || "") || 0;
  const rightTime = Date.parse(right.publishedAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.title.localeCompare(right.title);
}

export function normalizeBulletin(bulletin: unknown = {}, index = 0): Bulletin {
  const source = (bulletin && typeof bulletin === "object" ? bulletin : {}) as Record<string, unknown>;
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
    body: sanitizeTextBlock(source.body, 1200),
    status: isBulletinStatus(status) ? status : "draft",
    audience: isBulletinAudience(audience) ? audience : "public",
    publishedAt: sanitizeSingleLine(source.publishedAt, 40),
    createdBy: sanitizeSingleLine(source.createdBy, 40) || "system",
  };
}

export function buildPublicBulletinFeed(source: unknown = DEFAULT_BULLETINS): Bulletin[] {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeBulletin(entry, index))
    .filter((entry) => entry.status === "published" && entry.audience === "public")
    .sort(comparePublishedDesc);
}
