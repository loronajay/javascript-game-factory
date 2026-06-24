// Use this helper for every authored stage so wave timing and spawn records stay
// immutable once play begins. A wave is simply { at, label, units }, which keeps
// balancing passes focused on readable data rather than engine code.
export function defineWaves(waves) {
  let previousTime = -Infinity;
  return Object.freeze(waves.map((wave, index) => {
    if (!Number.isFinite(wave.at) || wave.at < previousTime) {
      throw new Error(`Wave ${index + 1} must have a non-decreasing numeric start time`);
    }
    previousTime = wave.at;
    if (!Array.isArray(wave.units) || wave.units.length === 0) {
      throw new Error(`Wave ${index + 1} needs at least one spawn`);
    }
    return Object.freeze({
      ...wave,
      units: Object.freeze(wave.units.map((spawn) => Object.freeze({ ...spawn }))),
    });
  }));
}

export const CAMPAIGN = [
  {
    id: 'plateau-01',
    campaignOrder: 1,
    mapId: 'blackglass-plateau',
    title: 'Hold Blackglass Plateau',
    briefing: 'Enemy columns enter through six linked approaches that merge into two final chokepoints. Deploy inside the defensive territory, inspect the roster, then use Move, Attack, Hold, Guard, and Retreat orders. Opening any command pauses combat.',
    startingGold: 1200,
    baseHp: 100,
    enemyHpScale: 0.84,
    enemyDamageScale: 0.82,
    duration: 96,
    waves: defineWaves([
      {
        at: 5,
        label: 'Flank scouts',
        units: [
          { path: 'west-flank', type: 'striker', delay: 0 },
          { path: 'east-flank', type: 'striker', delay: 1.1 },
          { path: 'center-west', type: 'striker', delay: 2.4 },
        ],
      },
      {
        at: 22,
        label: 'Gate armor',
        units: [
          { path: 'west-gate', type: 'guard', delay: 0 },
          { path: 'east-gate', type: 'guard', delay: 0.8 },
          { path: 'center-east', type: 'striker', delay: 2.4 },
          { path: 'center-west', type: 'striker', delay: 3.5 },
        ],
      },
      {
        at: 41,
        label: 'Split breakers',
        units: [
          { path: 'west-flank', type: 'breaker', delay: 0 },
          { path: 'east-flank', type: 'breaker', delay: 0.9 },
          { path: 'west-gate', type: 'guard', delay: 2.2 },
          { path: 'east-gate', type: 'guard', delay: 3.0 },
        ],
      },
      {
        at: 61,
        label: 'Crossroads pressure',
        units: [
          { path: 'west-flank', type: 'striker', delay: 0 },
          { path: 'west-gate', type: 'guard', delay: 0.6 },
          { path: 'center-west', type: 'breaker', delay: 1.2 },
          { path: 'center-east', type: 'breaker', delay: 1.8 },
          { path: 'east-gate', type: 'guard', delay: 2.4 },
          { path: 'east-flank', type: 'striker', delay: 3.0 },
        ],
      },
      {
        at: 82,
        label: 'Final convergence',
        units: [
          { path: 'center-west', type: 'breaker', delay: 0 },
          { path: 'center-east', type: 'breaker', delay: 0.5 },
          { path: 'west-gate', type: 'guard', delay: 1.0 },
          { path: 'east-gate', type: 'guard', delay: 1.5 },
          { path: 'west-flank', type: 'striker', delay: 2.1 },
          { path: 'east-flank', type: 'striker', delay: 2.7 },
          { path: 'center-west', type: 'striker', delay: 4.5 },
          { path: 'center-east', type: 'striker', delay: 5.1 },
        ],
      },
    ]),
  },
  {
    id: 'plateau-02',
    campaignOrder: 2,
    mapId: 'cinder-pass',
    title: 'Break the Encirclement',
    briefing: 'The enemy has learned the plateau. Their armored columns arrive earlier and strike the center together. Keep a reserve near the core, then counter-punch at the crossings.',
    startingGold: 1325,
    baseHp: 100,
    enemyHpScale: 0.96,
    enemyDamageScale: 0.9,
    duration: 102,
    waves: defineWaves([
      {
        at: 5,
        label: 'Probe columns',
        units: [
          { path: 'west-breach', type: 'striker', delay: 0 },
          { path: 'east-breach', type: 'striker', delay: 0.7 },
          { path: 'west-rift', type: 'guard', delay: 1.7 },
          { path: 'east-rift', type: 'guard', delay: 2.4 },
        ],
      },
      {
        at: 22,
        label: 'Flank armor',
        units: [
          { path: 'west-rift', type: 'breaker', delay: 0 },
          { path: 'east-rift', type: 'breaker', delay: 0.8 },
          { path: 'west-breach', type: 'guard', delay: 2.1 },
          { path: 'east-breach', type: 'guard', delay: 2.9 },
        ],
      },
      {
        at: 43,
        label: 'Center crush',
        units: [
          { path: 'west-breach', type: 'breaker', delay: 0 },
          { path: 'east-breach', type: 'breaker', delay: 0.45 },
          { path: 'west-rift', type: 'guard', delay: 1.4 },
          { path: 'east-rift', type: 'guard', delay: 1.85 },
          { path: 'west-breach', type: 'striker', delay: 3.0 },
          { path: 'east-breach', type: 'striker', delay: 3.6 },
        ],
      },
      {
        at: 66,
        label: 'Closing net',
        units: [
          { path: 'west-breach', type: 'breaker', delay: 0 },
          { path: 'east-breach', type: 'breaker', delay: 0.55 },
          { path: 'west-rift', type: 'striker', delay: 1.2 },
          { path: 'east-rift', type: 'striker', delay: 1.8 },
          { path: 'west-breach', type: 'guard', delay: 2.5 },
          { path: 'east-breach', type: 'guard', delay: 3.1 },
        ],
      },
      {
        at: 88,
        label: 'Encirclement breach',
        units: [
          { path: 'west-rift', type: 'breaker', delay: 0 },
          { path: 'east-rift', type: 'breaker', delay: 0.35 },
          { path: 'west-breach', type: 'guard', delay: 0.8 },
          { path: 'east-breach', type: 'guard', delay: 1.15 },
          { path: 'west-breach', type: 'breaker', delay: 1.7 },
          { path: 'east-breach', type: 'breaker', delay: 2.05 },
          { path: 'west-rift', type: 'striker', delay: 3.1 },
          { path: 'east-rift', type: 'striker', delay: 3.55 },
        ],
      },
    ]),
  },
  {
    id: 'plateau-03',
    campaignOrder: 3,
    mapId: 'blackglass-plateau',
    title: 'The Last Bastion',
    briefing: 'This is the final push. Every approach is active and the enemy will not give you breathing room. Make the chokepoints expensive, protect damaged allies, and hold the reactor through the last contact.',
    startingGold: 1500,
    baseHp: 100,
    enemyHpScale: 1.08,
    enemyDamageScale: 0.98,
    duration: 110,
    waves: defineWaves([
      {
        at: 4,
        label: 'No warning',
        units: [
          { path: 'west-flank', type: 'striker', delay: 0 },
          { path: 'east-flank', type: 'striker', delay: 0.45 },
          { path: 'center-west', type: 'striker', delay: 1.0 },
          { path: 'center-east', type: 'striker', delay: 1.45 },
        ],
      },
      {
        at: 21,
        label: 'Steel tide',
        units: [
          { path: 'west-gate', type: 'guard', delay: 0 },
          { path: 'east-gate', type: 'guard', delay: 0.5 },
          { path: 'center-west', type: 'breaker', delay: 1.2 },
          { path: 'center-east', type: 'breaker', delay: 1.7 },
          { path: 'west-flank', type: 'guard', delay: 2.4 },
          { path: 'east-flank', type: 'guard', delay: 2.9 },
        ],
      },
      {
        at: 42,
        label: 'Twin hammer',
        units: [
          { path: 'west-flank', type: 'breaker', delay: 0 },
          { path: 'east-flank', type: 'breaker', delay: 0.35 },
          { path: 'west-gate', type: 'breaker', delay: 0.9 },
          { path: 'east-gate', type: 'breaker', delay: 1.25 },
          { path: 'center-west', type: 'striker', delay: 2.0 },
          { path: 'center-east', type: 'striker', delay: 2.35 },
        ],
      },
      {
        at: 64,
        label: 'All routes committed',
        units: [
          { path: 'west-flank', type: 'guard', delay: 0 },
          { path: 'west-gate', type: 'breaker', delay: 0.4 },
          { path: 'center-west', type: 'guard', delay: 0.8 },
          { path: 'center-east', type: 'guard', delay: 1.2 },
          { path: 'east-gate', type: 'breaker', delay: 1.6 },
          { path: 'east-flank', type: 'guard', delay: 2.0 },
          { path: 'center-west', type: 'breaker', delay: 2.7 },
          { path: 'center-east', type: 'breaker', delay: 3.1 },
        ],
      },
      {
        at: 88,
        label: 'Last contact',
        units: [
          { path: 'west-flank', type: 'breaker', delay: 0 },
          { path: 'east-flank', type: 'breaker', delay: 0.3 },
          { path: 'west-gate', type: 'guard', delay: 0.65 },
          { path: 'east-gate', type: 'guard', delay: 0.95 },
          { path: 'center-west', type: 'breaker', delay: 1.4 },
          { path: 'center-east', type: 'breaker', delay: 1.7 },
          { path: 'west-gate', type: 'striker', delay: 2.2 },
          { path: 'east-gate', type: 'striker', delay: 2.5 },
          { path: 'center-west', type: 'guard', delay: 3.0 },
          { path: 'center-east', type: 'guard', delay: 3.3 },
        ],
      },
    ]),
  },
  {
    id: 'span-04',
    campaignOrder: 4,
    mapId: 'ironwood-bridge',
    title: 'The Long Span',
    briefing: 'Three columns are crossing the flooded Ironwood approaches. They begin far apart, but every survivor reaches the same bridge. Contest the roads early or let them pile up at the span—either way, keep a reserve for the final crossing.',
    startingGold: 1425,
    baseHp: 100,
    enemyHpScale: 1.12,
    enemyDamageScale: 1.02,
    duration: 108,
    waves: defineWaves([
      {
        at: 5,
        label: 'Road probes',
        units: [
          { path: 'west-road', type: 'striker', delay: 0 },
          { path: 'east-road', type: 'striker', delay: 0.7 },
          { path: 'causeway', type: 'guard', delay: 1.6 },
        ],
      },
      {
        at: 24,
        label: 'Causeway armor',
        units: [
          { path: 'causeway', type: 'breaker', delay: 0 },
          { path: 'west-road', type: 'guard', delay: 0.9 },
          { path: 'east-road', type: 'guard', delay: 1.7 },
          { path: 'causeway', type: 'striker', delay: 2.8 },
        ],
      },
      {
        at: 47,
        label: 'Split the roads',
        units: [
          { path: 'west-road', type: 'breaker', delay: 0 },
          { path: 'east-road', type: 'breaker', delay: 0.45 },
          { path: 'west-road', type: 'striker', delay: 1.3 },
          { path: 'east-road', type: 'striker', delay: 1.85 },
          { path: 'causeway', type: 'guard', delay: 2.6 },
        ],
      },
      {
        at: 72,
        label: 'Bridge pressure',
        units: [
          { path: 'causeway', type: 'breaker', delay: 0 },
          { path: 'causeway', type: 'breaker', delay: 0.55 },
          { path: 'west-road', type: 'guard', delay: 1.1 },
          { path: 'east-road', type: 'guard', delay: 1.65 },
          { path: 'west-road', type: 'striker', delay: 2.35 },
          { path: 'east-road', type: 'striker', delay: 2.9 },
        ],
      },
      {
        at: 94,
        label: 'All across',
        units: [
          { path: 'west-road', type: 'breaker', delay: 0 },
          { path: 'causeway', type: 'guard', delay: 0.4 },
          { path: 'east-road', type: 'breaker', delay: 0.8 },
          { path: 'causeway', type: 'breaker', delay: 1.25 },
          { path: 'west-road', type: 'striker', delay: 2.0 },
          { path: 'east-road', type: 'striker', delay: 2.45 },
        ],
      },
    ]),
  },
  {
    id: 'shards-05',
    campaignOrder: 5,
    mapId: 'reactor-shards',
    title: 'Shatterpoint Relay',
    briefing: 'The relay is fractured into five approach chambers. Enemy columns will hit a different seam before the last fight converges on the core. Keep a mobile answer alive; the side you ignore is the side that becomes the emergency.',
    startingGold: 1575,
    baseHp: 100,
    enemyHpScale: 1.2,
    enemyDamageScale: 1.08,
    duration: 114,
    waves: defineWaves([
      {
        at: 4,
        label: 'Five signals',
        units: [
          { path: 'west-shard', type: 'striker', delay: 0 },
          { path: 'west-relay', type: 'guard', delay: 0.55 },
          { path: 'core-seam', type: 'striker', delay: 1.1 },
          { path: 'east-relay', type: 'guard', delay: 1.65 },
          { path: 'east-shard', type: 'striker', delay: 2.2 },
        ],
      },
      {
        at: 25,
        label: 'Relay breakers',
        units: [
          { path: 'west-relay', type: 'breaker', delay: 0 },
          { path: 'east-relay', type: 'breaker', delay: 0.45 },
          { path: 'core-seam', type: 'guard', delay: 1.0 },
          { path: 'west-shard', type: 'striker', delay: 1.8 },
          { path: 'east-shard', type: 'striker', delay: 2.3 },
        ],
      },
      {
        at: 49,
        label: 'Chamber feint',
        units: [
          { path: 'west-shard', type: 'breaker', delay: 0 },
          { path: 'east-shard', type: 'breaker', delay: 0.35 },
          { path: 'west-relay', type: 'striker', delay: 0.95 },
          { path: 'east-relay', type: 'striker', delay: 1.35 },
          { path: 'core-seam', type: 'breaker', delay: 2.05 },
          { path: 'core-seam', type: 'guard', delay: 2.6 },
        ],
      },
      {
        at: 73,
        label: 'Seam collapse',
        units: [
          { path: 'west-relay', type: 'guard', delay: 0 },
          { path: 'east-relay', type: 'guard', delay: 0.35 },
          { path: 'west-shard', type: 'striker', delay: 0.75 },
          { path: 'east-shard', type: 'striker', delay: 1.1 },
          { path: 'core-seam', type: 'breaker', delay: 1.65 },
          { path: 'core-seam', type: 'breaker', delay: 2.15 },
        ],
      },
      {
        at: 96,
        label: 'Shatterpoint',
        units: [
          { path: 'west-shard', type: 'breaker', delay: 0 },
          { path: 'west-relay', type: 'guard', delay: 0.3 },
          { path: 'core-seam', type: 'breaker', delay: 0.65 },
          { path: 'east-relay', type: 'guard', delay: 1.0 },
          { path: 'east-shard', type: 'breaker', delay: 1.35 },
          { path: 'west-relay', type: 'striker', delay: 1.95 },
          { path: 'east-relay', type: 'striker', delay: 2.35 },
        ],
      },
    ]),
  },
];

// MISSIONS stays as a compatibility alias for combat and tooling that still use
// the older name. New menu and progression code should use CAMPAIGN.
export const MISSIONS = CAMPAIGN;

export function getStartingMission() {
  return CAMPAIGN[0] ?? null;
}

export function getMissionById(id) {
  return CAMPAIGN.find((mission) => mission.id === id) ?? null;
}

export function getNextMission(id) {
  const index = CAMPAIGN.findIndex((mission) => mission.id === id);
  return index >= 0 ? CAMPAIGN[index + 1] ?? null : null;
}
