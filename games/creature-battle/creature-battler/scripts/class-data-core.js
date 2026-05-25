// class-data-core.js — Empty registries and helpers for per-route class data.
// Route files call registerClassData() to populate CLASS_SKILLS, CLASS_PASSIVES, and CLASS_ROUTES.
// Nothing executes here beyond setting up the containers and helpers.

// ── Registries ────────────────────────────────────────────────────────────────

const CLASS_SKILLS   = [];
const CLASS_PASSIVES = [];
const CLASS_ROUTES   = [];

// ── Registration helper ───────────────────────────────────────────────────────

function registerClassData(skills, passives, route) {
  CLASS_SKILLS.push(...skills);
  CLASS_PASSIVES.push(...passives);
  CLASS_ROUTES.push(route);
}

// ── Route stubs — all 16 routes for browse display ───────────────────────────
// Routes with a full CLASS_ROUTES entry are playable; others show as Coming Soon.

const ROUTE_STUBS = [
  { id: 'strength',              name: 'Strength',              tiers: ['Apprentice','Squire','Knight','Hero','Kingslayer'] },
  { id: 'defense',               name: 'Defense',               tiers: ['Beefcake','Brolic','Garrison','Vigorous','Aegis'] },
  { id: 'intelligence',          name: 'Intelligence',          tiers: ['Adept','Magician','Wizard','Sorcerer','Warlock'] },
  { id: 'spirit',                name: 'Spirit',                tiers: ['Tactician','Strategist','Rulebender','Rulebreaker','Mastermind'] },
  { id: 'speed',                 name: 'Speed',                 tiers: ['Scout','Strider','Acrobat','Phantom','Timebreaker'] },
  { id: 'strength_defense',      name: 'Strength / Defense',    tiers: ['Bruiser','Brawler','Combatant','Duelist','Barbarian'] },
  { id: 'strength_intelligence', name: 'Strength / Intelligence',tiers: ['Prodigy','Protagonist','Paladin','Defender','White Knight'] },
  { id: 'strength_spirit',       name: 'Strength / Spirit',     tiers: ['Guard','Resistor','Warder','Blessing','Manna'] },
  { id: 'strength_speed',        name: 'Strength / Speed',      tiers: ['Scrapper','Skirmisher','Ravager','Blitzer','Stormbreaker'] },
  { id: 'defense_intelligence',  name: 'Defense / Intelligence', tiers: ['Opportunist','Calculator','Conductor','Manipulator','Chameleon'] },
  { id: 'defense_spirit',        name: 'Defense / Spirit',      tiers: ['Protector','Frontliner','Tank','Sentry','Fortress'] },
  { id: 'defense_speed',         name: 'Defense / Speed',       tiers: ['Lookout','Keeper','Interceptor','Bulwark','Iron Mirage'] },
  { id: 'intelligence_spirit',   name: 'Intelligence / Spirit', tiers: ['Anointed','Healer','Priest','Holy','Angel'] },
  { id: 'intelligence_speed',    name: 'Intelligence / Speed',  tiers: ['Spark','Analyst','Savant','Chronist','Spellweaver'] },
  { id: 'spirit_speed',          name: 'Spirit / Speed',        tiers: ['Seeker','Pilgrim','Oracle','Ethereal','Ascendant'] },
  { id: 'no_allocation',         name: 'No Manual Allocation',  tiers: ['Thrill-Seeker','Daredevil','Challenger','Contender','Legend'] },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

function getClassRoute(routeId) {
  return CLASS_ROUTES.find(r => r.id === routeId) || null;
}

function getClassSkill(skillId) {
  return CLASS_SKILLS.find(s => s.id === skillId) || null;
}

function getClassPassive(passiveId) {
  return CLASS_PASSIVES.find(p => p.id === passiveId) || null;
}

function getRouteStub(routeId) {
  return ROUTE_STUBS.find(r => r.id === routeId) || null;
}
