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
const BALL_TRAIL_IDS = Object.freeze([
  "none", "red-neon", "orange-flare", "gold-rush", "lime-shock",
  "emerald-glow", "mint-frost", "cyan-pulse", "sky-blue", "electric-blue",
  "indigo-drive", "violet-haze", "purple-plasma", "magenta-pop", "hot-pink",
  "diamond-white", "perfect-line", "championship-gold", "bracket-fire", "cosmic-ribbon",
  "royal-confetti",
]);
const STRIKE_BURST_IDS = Object.freeze([
  "classic", "ember", "red-supernova", "gold-star", "lime-pop",
  "emerald-impact", "mint-crackle", "cyan-flash", "sky-shatter", "electric-blue",
  "indigo-ring", "violet-bloom", "purple-nova", "magenta-blast", "hot-pink-pop",
  "diamond-spark", "pin-crown", "finals-fireworks", "cosmic-cup", "victory-ribbon",
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
    const founding = skinId === "canon";
    const entitlementId = founding ? undefined : `skin:${bowlerSlug}:${skinId}`;
    for (const type of ["skin", "victory-pose", "defeat-pose"]) {
      register({ id: `${type}:${bowlerSlug}:${skinId}`, type, characterSlug: bowlerSlug, founding, entitlementId });
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
  // Mastery levels 29 and 30. Deliberately registered WITHOUT a characterSlug:
  // the id is scoped to the bowler who earned it, but the slot it fills is the
  // one global title slot, and the global-slot check below matches on type
  // alone. Giving it a characterSlug would make it look like a per-bowler slot
  // value and it would never validate.
  for (const suffix of ["nameplate", "master"]) {
    const id = `title:${bowlerSlug}:${suffix}`;
    register({ id, type: "title", founding: false, entitlementId: id });
  }
}
for (const roomSlug of ROOM_SLUGS) {
  register({ id: `room:${roomSlug}`, type: "room", founding: roomSlug === "default", entitlementId: `room:${roomSlug}` });
}
for (const trailId of BALL_TRAIL_IDS) {
  const id = `ball-trail:${trailId}`;
  register({ id, type: "ball-trail", founding: trailId === "none", entitlementId: id });
}
for (const burstId of STRIKE_BURST_IDS) {
  const id = `strike-burst:${burstId}`;
  register({ id, type: "strike-burst", founding: burstId === "classic", entitlementId: id });
}
for (const [id, type, founding] of [
  ["title:rookie", "title", true],
  ["title:pin-chaser", "title", false],
  ["title:comeback-kid", "title", false],
  ["title:yam-champion", "title", false],
  ["badge:founding-bowler", "badge", true],
  ["badge:perfect-game", "badge", false],
  ["badge:split-decision", "badge", false],
  // Earned on the bowler mastery ladder at levels 13, 21 and 28. An id this
  // registry does not carry is stripped rather than refused, so leaving these
  // out silently reverted a badge the player had earned the moment they saved.
  ["badge:laser-focus", "badge", false],
  ["badge:precision-bowler", "badge", false],
  ["badge:lane-legend", "badge", false],
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
        if (item?.type === type && item.characterSlug === bowlerSlug && ownsItem(item, owned)) {
          slots[slotName] = item.id;
        } else if (slotName === "skin" && Object.hasOwn(value as object, slotName)) {
          slots.skin = `skin:${bowlerSlug}:canon`;
        }
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
  if (ownsBowler(featuredSlug, owned)) {
    garage.featured = {
      bowlerSlug: featuredSlug,
      skinId: ownsItem(featuredSkin, owned) ? skinId : "canon",
    };
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
