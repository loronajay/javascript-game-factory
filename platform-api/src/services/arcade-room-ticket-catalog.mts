// Server-authoritative Arcade Room prices. The browser catalog owns models and
// placement metadata; this service is the only authority for what a purchase
// costs. Its explicit id roster is also the backend allowlist: a syntactically
// plausible id that is not shipped in the catalog can never be bought or saved.

export const ARCADE_ROOM_GAME_SLUG = "arcade-room";

const DECOR_PRICES: Readonly<Record<string, number>> = Object.freeze({
  "decor.neon.heart": 175, "decor.neon.star": 175, "decor.neon.bolt": 200,
  "decor.neon.joystick": 200, "decor.neon.ghost": 200, "decor.neon.ring": 200,
  "decor.sign.custom-script": 150, "decor.sign.open": 100, "decor.sign.arcade": 200,
  "decor.sign.play": 100, "decor.sign.insert-coin": 150, "decor.sign.game-over": 150,
  "decor.sign.high-score": 150, "decor.sign.good-vibes": 125, "decor.sign.no-quarters": 125,
  "decor.sign.marquee": 350,
  "decor.rug.runner": 100, "decor.rug.checker": 125, "decor.rug.area": 150,
  "decor.light.lantern": 100, "decor.light.pendant": 125, "decor.light.floor-lamp": 125,
  "decor.light.sconce": 150, "decor.light.string-lights": 250, "decor.light.track": 300,
  "decor.light.blacklight": 350, "decor.light.chandelier": 450, "decor.light.disco": 600,
  "decor.furniture.coffee-table": 100, "decor.furniture.high-top": 150,
  "decor.furniture.round-table": 175, "decor.furniture.armchair": 250,
  "decor.furniture.long-table": 300, "decor.furniture.lockers": 300,
  "decor.furniture.bookcase": 350, "decor.furniture.sofa": 450,
  "decor.furniture.counter": 500, "decor.furniture.booth": 550, "decor.furniture.bar": 900,
  "decor.prop.cone": 25, "decor.prop.barrel": 50, "decor.prop.crates": 75,
  "decor.prop.stanchion": 75, "decor.prop.water-cooler": 75, "decor.prop.balloons": 100,
  "decor.prop.gumball": 125, "decor.prop.lava-lamp": 175, "decor.prop.speaker-stack": 250,
  "decor.prop.change-machine": 275, "decor.prop.vending": 400, "decor.prop.dance-pad": 450,
  "decor.prop.popcorn": 450, "decor.prop.prize-wheel": 650, "decor.prop.neon-palm": 700,
  "decor.prop.foosball": 700, "decor.prop.trophy-case": 750, "decor.prop.photo-booth": 900,
  "decor.prop.pinball": 1100, "decor.prop.claw": 1200,
  "decor.wall.switch": 25, "decor.wall.vent": 25, "decor.wall.extinguisher": 50,
  "decor.wall.coat-hook": 50, "decor.wall.cork-board": 75, "decor.wall.whiteboard": 100,
  "decor.wall.speaker": 125, "decor.wall.camera": 125, "decor.wall.mirror": 150,
  "decor.wall.ac-unit": 175, "decor.wall.dartboard": 175, "decor.wall.window": 250,
  "decor.wall.trophy-shelf": 300, "decor.wall.yam-calendar": 350, "decor.wall.tv": 450,
  "decor.ceiling.vent": 25, "decor.ceiling.speaker": 100, "decor.ceiling.banner": 125,
  "decor.ceiling.hanging-sign": 200, "decor.ceiling.projector": 400,
});

function surfacePrice(id: string): number {
  if (/neon-|neon-grid|circuit/.test(id)) return 500;
  if (/marble|starfield|galaxy-carpet/.test(id)) return 350;
  if (/herringbone|terrazzo|hex|stripes|chevron|memphis|diamonds|tartan|wainscot/.test(id)) return 250;
  if (/planks|brick|cinderblock|concrete|panels|diamond-plate|hazard|steel-grid/.test(id)) return 200;
  if (/checker|carpet|tile|subway|acoustic/.test(id)) return 150;
  return 100;
}

const items = new Map<string, Readonly<{ id: string; price: number }>>();
for (const [id, price] of Object.entries(DECOR_PRICES)) items.set(id, Object.freeze({ id, price }));
for (const slug of [
  "tactical-arena", "lovers-lost", "battleshits", "sumorai", "mini-tactics", "illuminauts",
  "bird-duty", "creature-battler", "cockpit-swarm", "build-buddy", "echo-duel", "circuit-siege",
  "speed-demon", "yam-bowling", "mini-hoops", "hide-and-seek", "puckd-up", "shark-hall",
]) {
  const id = `decor.poster.${slug}`;
  items.set(id, Object.freeze({ id, price: 50 }));
}

const SURFACE_IDS = Object.freeze([
  "floor.showroom-slate", "floor.checker-black-white", "floor.checker-black-cyan", "floor.checker-purple-pink", "floor.checker-red-cream",
  "floor.galaxy-carpet", "floor.carpet-crimson", "floor.carpet-charcoal", "floor.carpet-teal", "floor.oak-planks", "floor.walnut-planks",
  "floor.whitewash-planks", "floor.polished-concrete", "floor.slate-tiles", "floor.white-tiles", "floor.hex-tiles", "floor.diamond-plate",
  "floor.neon-grid-cyan", "floor.neon-grid-pink", "floor.terrazzo", "floor.checker-black-lime", "floor.checker-black-orange",
  "floor.checker-navy-gold", "floor.checker-mint-cream", "floor.checker-large-black-white", "floor.galaxy-carpet-purple",
  "floor.galaxy-carpet-green", "floor.carpet-navy", "floor.carpet-plum", "floor.carpet-forest", "floor.carpet-sand", "floor.cherry-planks",
  "floor.ash-planks", "floor.ebony-planks", "floor.herringbone-oak", "floor.herringbone-walnut", "floor.marble-white", "floor.marble-black",
  "floor.marble-green", "floor.slate-dark", "floor.red-tiles", "floor.hex-pink", "floor.terrazzo-dark", "floor.hazard-yellow",
  "floor.steel-panels", "floor.neon-grid-purple", "floor.neon-grid-lime", "floor.circuit-cyan", "floor.starfield",
  "wall.paint-midnight", "wall.paint-charcoal", "wall.paint-crimson", "wall.paint-teal", "wall.paint-plum", "wall.paint-cream", "wall.paint-forest",
  "wall.paint-black", "wall.brick-red", "wall.brick-black", "wall.cinderblock", "wall.stripes-cyan", "wall.stripes-gold", "wall.chevron-pink",
  "wall.memphis", "wall.diamonds-teal", "wall.wainscot-oak", "wall.wainscot-navy", "wall.panels-steel", "wall.neon-grid-cyan",
  "wall.paint-navy", "wall.paint-mustard", "wall.paint-coral", "wall.paint-sky", "wall.paint-mint", "wall.paint-lavender", "wall.paint-rust",
  "wall.paint-white", "wall.brick-white", "wall.brick-tan", "wall.subway-white", "wall.subway-black", "wall.subway-teal", "wall.subway-pink",
  "wall.marble-white", "wall.marble-black", "wall.stripes-pink", "wall.stripes-cream", "wall.chevron-cyan", "wall.chevron-gold",
  "wall.diamonds-pink", "wall.diamonds-cream", "wall.memphis-dark", "wall.tartan-red", "wall.tartan-green", "wall.wainscot-cream",
  "wall.wainscot-walnut", "wall.wainscot-black", "wall.panels-copper", "wall.cinderblock-painted", "wall.hazard-yellow",
  "wall.neon-grid-pink", "wall.neon-grid-purple", "wall.circuit-cyan", "wall.circuit-pink", "wall.circuit-lime", "wall.starfield",
  "ceiling.tile-dark", "ceiling.acoustic-white", "ceiling.void-black", "ceiling.steel-grid", "ceiling.starfield", "ceiling.oak-planks",
  "ceiling.paint-cream", "ceiling.paint-midnight", "ceiling.paint-plum", "ceiling.paint-crimson", "ceiling.tile-white", "ceiling.acoustic-dark",
  "ceiling.walnut-planks", "ceiling.whitewash-planks", "ceiling.marble-white", "ceiling.copper-panels", "ceiling.diamond-plate",
  "ceiling.neon-grid-cyan", "ceiling.neon-grid-pink", "ceiling.circuit-cyan", "ceiling.starfield-violet",
  "trim.steel-navy", "trim.chrome", "trim.brass", "trim.matte-black", "trim.white", "trim.oak", "trim.neon-cyan", "trim.neon-pink",
  "trim.copper", "trim.gold", "trim.gunmetal", "trim.rose-gold", "trim.crimson", "trim.teal", "trim.cream", "trim.walnut",
  "trim.whitewash", "trim.neon-yellow", "trim.neon-lime", "trim.neon-purple", "trim.neon-red", "trim.neon-white",
]);

export const ARCADE_ROOM_STARTER_IDS: ReadonlySet<string> = new Set([
  "decor.neon.strip", "decor.sign.custom-block", "decor.poster.custom", "decor.rug.round",
  "decor.light.spot", "decor.light.tube", "decor.furniture.bench", "decor.furniture.stool",
  "decor.furniture.table", "decor.furniture.beanbag", "decor.prop.jukebox", "decor.prop.plant",
  "decor.prop.trash-can", "decor.wall.clock", "decor.wall.shelf", "decor.wall.exit-sign",
  "decor.ceiling.fan", "floor.showroom-slate", "wall.paint-midnight", "ceiling.tile-dark", "trim.steel-navy",
]);
for (const id of SURFACE_IDS) {
  if (!ARCADE_ROOM_STARTER_IDS.has(id)) items.set(id, Object.freeze({ id, price: surfacePrice(id) }));
}

export const ARCADE_ROOM_TICKET_ITEMS = Object.freeze([...items.values()]);
export const ARCADE_ROOM_CATALOG_IDS: ReadonlySet<string> = new Set([
  ...ARCADE_ROOM_STARTER_IDS,
  ...ARCADE_ROOM_TICKET_ITEMS.map((entry) => entry.id),
]);

export function findArcadeRoomTicketItem(itemId: unknown): Readonly<{ id: string; price: number }> | null {
  const id = typeof itemId === "string" ? itemId.trim() : "";
  return items.get(id) ?? null;
}
