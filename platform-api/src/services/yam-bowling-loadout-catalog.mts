// Yam Bowling's server-owned presentation catalog. The cabinet owns the art and
// labels; this registry owns the trust boundary for what may be persisted and
// publicly displayed from a player's profile loadout.

export const YAM_BOWLING_GAME_SLUG = "yam-bowling";

const BOWLER_SLUGS = Object.freeze([
  "daisy-monroe", "nia-brooks", "tessa-quinn", "zuri-banks", "amara-reed",
  "claire-rowan", "lumi-vega", "cassy-cruz", "fiona-vale", "nyx-calder",
  "skye-bennett", "carmen-blaze", "piper-hart", "reina-sato", "imani-cole",
  "sabrina-wilde", "aaliyah-storm", "mina-park", "scarlett-voss", "sage-holloway",
  "hazel-ward", "roxy-chen", "naomi-okafor", "echo-sterling", "kevya-desai",
  "lillie-chen", "marisol-cruz", "rei-nakamura", "simone-carter", "talia-dodson",
]);
const STARTER_BOWLERS = new Set(BOWLER_SLUGS.slice(0, 5));
const BOWLERS = new Set(BOWLER_SLUGS);
const SKIN_IDS = Object.freeze(["canon", "swimsuit", "maid"]);
const ROOM_SLUGS = Object.freeze([
  "default", "teal-lounge", "hot-pink-hideout", "retro-arcade", "beach-house",
  "industrial-workshop", "botanical-glasshouse", "frosted-suite", "lavender-cosmic",
  "black-gothic", "circuit-red", "tower-penthouse", "champion-room",
]);

type Item = Readonly<{
  id: string;
  type: string;
  characterSlug?: string;
  founding?: boolean;
  entitlementId?: string;
}>;

const items = new Map<string, Item>();
function register(item: Item): void {
  items.set(item.id, Object.freeze(item));
}

for (const bowlerSlug of BOWLER_SLUGS) {
  for (const skinId of SKIN_IDS) {
    for (const type of ["skin", "victory-pose", "defeat-pose"]) {
      register({ id: `${type}:${bowlerSlug}:${skinId}`, type, characterSlug: bowlerSlug, founding: true });
    }
  }
  register({ id: `player-card:${bowlerSlug}`, type: "player-card", characterSlug: bowlerSlug, founding: true });
  register({ id: `profile-art:${bowlerSlug}`, type: "profile-art", characterSlug: bowlerSlug, founding: true });
  register({
    id: `menu-splash:${bowlerSlug}`,
    type: "menu-splash",
    characterSlug: bowlerSlug,
    founding: STARTER_BOWLERS.has(bowlerSlug),
    entitlementId: `bowler:${bowlerSlug}`,
  });
}
for (const roomSlug of ROOM_SLUGS) {
  register({ id: `room:${roomSlug}`, type: "room", founding: roomSlug === "default", entitlementId: `room:${roomSlug}` });
}
for (const [id, type, founding] of [
  ["ball-trail:none", "ball-trail", true],
  ["ball-trail:red-neon", "ball-trail", false],
  ["strike-burst:classic", "strike-burst", true],
  ["strike-burst:ember", "strike-burst", false],
  ["title:rookie", "title", true],
  ["title:pin-chaser", "title", false],
  ["badge:founding-bowler", "badge", true],
  ["badge:perfect-game", "badge", false],
] as const) {
  register({ id, type, founding, entitlementId: id });
}

const BOWLER_SLOTS = Object.freeze({
  skin: "skin",
  victoryPose: "victory-pose",
  defeatPose: "defeat-pose",
  playerCard: "player-card",
  menuSplash: "profile-art",
  profileArt: "profile-art",
});
const GLOBAL_SLOTS = Object.freeze({
  ballTrail: "ball-trail",
  strikeBurst: "strike-burst",
  title: "title",
  badge: "badge",
  menuSplash: "menu-splash",
  room: "room",
  profileFrame: "profile-art",
  profileBackground: "profile-art",
});

function entitlementSet(value: unknown): Set<string> {
  return value instanceof Set ? new Set([...value].filter((entry) => typeof entry === "string")) : new Set();
}

function ownsBowler(slug: unknown, owned: Set<string>): slug is string {
  return typeof slug === "string" && BOWLERS.has(slug) && (STARTER_BOWLERS.has(slug) || owned.has(`bowler:${slug}`));
}

function ownsItem(item: Item | undefined, owned: Set<string>): boolean {
  return Boolean(item && (item.founding || (item.entitlementId && owned.has(item.entitlementId))));
}

function emptyGarage() {
  return {
    version: 1,
    bowlers: {},
    global: {},
    featured: { bowlerSlug: "daisy-monroe", skinId: "canon" },
  };
}

export function normalizeYamBowlingGarage(raw: any, context: any = {}): any {
  const owned = entitlementSet(context.ownedEntitlementIds);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== 1) return emptyGarage();
  const garage: any = emptyGarage();

  if (raw.bowlers && typeof raw.bowlers === "object" && !Array.isArray(raw.bowlers)) {
    for (const [bowlerSlug, value] of Object.entries(raw.bowlers)) {
      if (!BOWLERS.has(bowlerSlug) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const slots: Record<string, string> = {};
      for (const [slotName, type] of Object.entries(BOWLER_SLOTS)) {
        const item = items.get((value as any)[slotName]);
        if (item?.type === type && item.characterSlug === bowlerSlug && ownsItem(item, owned)) slots[slotName] = item.id;
      }
      if (Object.keys(slots).length) garage.bowlers[bowlerSlug] = slots;
    }
  }

  if (raw.global && typeof raw.global === "object" && !Array.isArray(raw.global)) {
    for (const [slotName, type] of Object.entries(GLOBAL_SLOTS)) {
      const item = items.get(raw.global[slotName]);
      if (item?.type === type && ownsItem(item, owned)) garage.global[slotName] = item.id;
    }
  }

  const featuredSlug = raw.featured?.bowlerSlug;
  const skinId = SKIN_IDS.includes(raw.featured?.skinId) ? raw.featured.skinId : "canon";
  const featuredSkin = items.get(`skin:${featuredSlug}:${skinId}`);
  if (ownsBowler(featuredSlug, owned) && ownsItem(featuredSkin, owned)) {
    garage.featured = { bowlerSlug: featuredSlug, skinId };
  }
  return garage;
}

export function loadoutFromYamBowlingGarage(raw: any, context: any = {}): any {
  const garage = normalizeYamBowlingGarage(raw, context);
  return {
    featured: garage.featured,
    roomId: garage.global.room || "room:default",
    titleId: garage.global.title || "title:rookie",
    badgeId: garage.global.badge || "badge:founding-bowler",
    profileFrameId: garage.global.profileFrame || null,
    profileBackgroundId: garage.global.profileBackground || null,
  };
}

export const YAM_BOWLING_LOADOUT_CATALOG = Object.freeze({
  requiresEntitlements: true,
  normalizeGarage: normalizeYamBowlingGarage,
  loadoutFromGarage: loadoutFromYamBowlingGarage,
});
