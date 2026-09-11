// The approved default decals.
//
// GENERATED FROM `assets/decals/catalog.json`, which is the source of truth and
// was reviewed by hand. The art is not touched by this cabinet: no recolouring,
// no recropping, no re-sheeting, no added badge geometry. Every entry here is a
// stable id pointing at one approved 512x512 RGBA file with its original
// transparent padding intact.
//
// A module rather than a fetch of the JSON so the catalog is importable under
// node with no network: `tests/decals.test.js` asserts this list and the JSON
// agree, that every asset exists on disk, and that no id appears twice.
//
// `group` is picker presentation only. It is not persisted and nothing renders
// from it.

export const DECALS = Object.freeze([
  { id: "decal.lightning-bolt", slug: "lightning-bolt", name: "Lightning Bolt", group: "Energy", asset: "./assets/decals/lightning-bolt.png", width: 512, height: 512 },
  { id: "decal.skull", slug: "skull", name: "Skull", group: "Menace", asset: "./assets/decals/skull.png", width: 512, height: 512 },
  { id: "decal.champion-crown", slug: "champion-crown", name: "Champion Crown", group: "Trophy", asset: "./assets/decals/champion-crown.png", width: 512, height: 512 },
  { id: "decal.target-reticle", slug: "target-reticle", name: "Target Reticle", group: "Trophy", asset: "./assets/decals/target-reticle.png", width: 512, height: 512 },
  { id: "decal.crossed-mallets", slug: "crossed-mallets", name: "Crossed Mallets", group: "Trophy", asset: "./assets/decals/crossed-mallets.png", width: 512, height: 512 },
  { id: "decal.turbine", slug: "turbine", name: "Turbine", group: "Energy", asset: "./assets/decals/turbine.png", width: 512, height: 512 },
  { id: "decal.reactor-core", slug: "reactor-core", name: "Reactor Core", group: "Energy", asset: "./assets/decals/reactor-core.png", width: 512, height: 512 },
  { id: "decal.radiation", slug: "radiation", name: "Radiation", group: "Energy", asset: "./assets/decals/radiation.png", width: 512, height: 512 },
  { id: "decal.claw-marks", slug: "claw-marks", name: "Claw Marks", group: "Menace", asset: "./assets/decals/claw-marks.png", width: 512, height: 512 },
  { id: "decal.flaming-puck", slug: "flaming-puck", name: "Flaming Puck", group: "Energy", asset: "./assets/decals/flaming-puck.png", width: 512, height: 512 },
  { id: "decal.circuit-puck", slug: "circuit-puck", name: "Circuit Puck", group: "Energy", asset: "./assets/decals/circuit-puck.png", width: 512, height: 512 },
  { id: "decal.champion-shield", slug: "champion-shield", name: "Champion Shield", group: "Trophy", asset: "./assets/decals/champion-shield.png", width: 512, height: 512 },
  { id: "decal.gold-star", slug: "gold-star", name: "Gold Star", group: "Trophy", asset: "./assets/decals/gold-star.png", width: 512, height: 512 },
  { id: "decal.number-one-laurel", slug: "number-one-laurel", name: "Number One Laurel", group: "Trophy", asset: "./assets/decals/number-one-laurel.png", width: 512, height: 512 },
  { id: "decal.checkered-flag", slug: "checkered-flag", name: "Checkered Flag", group: "Trophy", asset: "./assets/decals/checkered-flag.png", width: 512, height: 512 },
  { id: "decal.yin-yang", slug: "yin-yang", name: "Yin Yang", group: "Symbols", asset: "./assets/decals/yin-yang.png", width: 512, height: 512 },
  { id: "decal.spade", slug: "spade", name: "Spade", group: "Symbols", asset: "./assets/decals/spade.png", width: 512, height: 512 },
  { id: "decal.club", slug: "club", name: "Club", group: "Symbols", asset: "./assets/decals/club.png", width: 512, height: 512 },
  { id: "decal.wolf", slug: "wolf", name: "Wolf", group: "Menace", asset: "./assets/decals/wolf.png", width: 512, height: 512 },
  { id: "decal.smiley", slug: "smiley", name: "Smiley", group: "Arcade", asset: "./assets/decals/smiley.png", width: 512, height: 512 },
  { id: "decal.pixel-ghost", slug: "pixel-ghost", name: "Pixel Ghost", group: "Arcade", asset: "./assets/decals/pixel-ghost.png", width: 512, height: 512 },
  { id: "decal.arcade-joystick", slug: "arcade-joystick", name: "Arcade Joystick", group: "Arcade", asset: "./assets/decals/arcade-joystick.png", width: 512, height: 512 },
  { id: "decal.facet-star", slug: "facet-star", name: "Arcade Star", group: "Arcade", asset: "./assets/decals/facet-star.png", width: 512, height: 512 },
  { id: "decal.hex-cluster", slug: "hex-cluster", name: "Hex Cluster", group: "Arcade", asset: "./assets/decals/hex-cluster.png", width: 512, height: 512 },
  { id: "decal.carbon-fiber", slug: "carbon-fiber", name: "Carbon Fiber", group: "Arcade", asset: "./assets/decals/carbon-fiber.png", width: 512, height: 512 },
  { id: "decal.gear", slug: "gear", name: "Gear", group: "Arcade", asset: "./assets/decals/gear.png", width: 512, height: 512 },
  { id: "decal.glitch-x", slug: "glitch-x", name: "Glitch X", group: "Menace", asset: "./assets/decals/glitch-x.png", width: 512, height: 512 },
  { id: "decal.crossed-bars", slug: "crossed-bars", name: "Crossed Bars", group: "Arcade", asset: "./assets/decals/crossed-bars.png", width: 512, height: 512 },
  { id: "decal.cherry-blossom", slug: "cherry-blossom", name: "Cherry Blossom", group: "Scenes", asset: "./assets/decals/cherry-blossom.png", width: 512, height: 512 },
  { id: "decal.great-wave", slug: "great-wave", name: "Great Wave", group: "Scenes", asset: "./assets/decals/great-wave.png", width: 512, height: 512 },
  { id: "decal.galaxy", slug: "galaxy", name: "Galaxy", group: "Scenes", asset: "./assets/decals/galaxy.png", width: 512, height: 512 },
  { id: "decal.mountain-moon", slug: "mountain-moon", name: "Mountain Moon", group: "Scenes", asset: "./assets/decals/mountain-moon.png", width: 512, height: 512 },
  { id: "decal.desert-sunset", slug: "desert-sunset", name: "Desert Sunset", group: "Scenes", asset: "./assets/decals/desert-sunset.png", width: 512, height: 512 },
  { id: "decal.snowflake", slug: "snowflake", name: "Snowflake", group: "Symbols", asset: "./assets/decals/snowflake.png", width: 512, height: 512 },
  { id: "decal.city-skyline", slug: "city-skyline", name: "City Skyline", group: "Scenes", asset: "./assets/decals/city-skyline.png", width: 512, height: 512 },
  { id: "decal.rising-sun", slug: "rising-sun", name: "Rising Sun", group: "Scenes", asset: "./assets/decals/rising-sun.png", width: 512, height: 512 },
  { id: "decal.monster-grin", slug: "monster-grin", name: "Monster Grin", group: "Menace", asset: "./assets/decals/monster-grin.png", width: 512, height: 512 },
  { id: "decal.oni-mask", slug: "oni-mask", name: "Oni Mask", group: "Menace", asset: "./assets/decals/oni-mask.png", width: 512, height: 512 },
  { id: "decal.anarchy", slug: "anarchy", name: "Anarchy", group: "Menace", asset: "./assets/decals/anarchy.png", width: 512, height: 512 },
  { id: "decal.speed-slashes", slug: "speed-slashes", name: "Speed Slashes", group: "Energy", asset: "./assets/decals/speed-slashes.png", width: 512, height: 512 },
]);

export const DECAL_BY_ID = Object.freeze(new Map(DECALS.map((decal) => [decal.id, decal])));

export const DECAL_GROUPS = Object.freeze([...new Set(DECALS.map((decal) => decal.group))]);

/** The decal a `builtin` selection falls back to when its id is unknown. */
export const FALLBACK_DECAL_ID = DECALS[0].id;
