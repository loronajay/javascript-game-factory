import { CONFIG } from '../config.js';
import { UNIT_STATES } from './unit-states.js';

// Creates unit data objects and handles spawn-point logic.
// Does not own the units array — returns unit objects for UnitManager to store.
export class UnitFactory {
  constructor(ctx) {
    this.ctx = ctx; // { map, getDef, nextId }
    this.nextId = 1;
  }

  create(type, team, x, y, options = {}) {
    const def = this.ctx.getDef(type);
    return {
      id: this.nextId++,
      type,
      team,
      x,
      y,
      spawnX: x,
      spawnY: y,
      facing: 0,
      visualFacing: 0,

      radius: def.body.radius,
      selectionRadius: def.body.selectionRadius,

      hp: def.vitals.maxHp,
      maxHp: def.vitals.maxHp,

      selected: false,
      visible: true,
      state: UNIT_STATES.IDLE,
      lastStableState: UNIT_STATES.IDLE,

      path: [],
      pathIndex: 0,
      moveTarget: null,
      attackTarget: null,
      attackMoveTarget: null,
      cargo: null,
      harvestState: null,
      attackSlot: null,
      mobileEngagementSlot: null,
      commandAckUntil: -Infinity,
      commandAckKind: null,
      mobilePursuitRepathAt: 0,
      routeId: null,
      routeReservations: [],

      movementState: {
        lastX: x,
        lastY: y,
        blockedFor: 0,
        repathAt: 0,
        sidestepUntil: 0,
        sidestepSign: 1,
        lastProgressAt: 0,
        lastBlockedAt: -Infinity,
        lastBlockReason: null,
      },

      combatState: {
        targetId: null,
        cooldownRemaining: 0,
        windupRemaining: 0,
        recoveryRemaining: 0,
        pendingDamage: null,
        lastCombatTime: -Infinity,
        lastDamagedTime: -Infinity,
        attackAnimStart: -Infinity,
        attackAnimDuration: 0,
        impactFlashUntil: -Infinity,
        attackSequence: 0,
      },

      debug: {
        stateSince: 0,
        lastWaypoint: null,
        pathGoal: null,
        queueAnchor: null,
        blockerId: null,
        lastRepathAt: -Infinity,
        groupRoute: null,
        formationMode: null,
        formationSlot: null,
        engagementSlot: null,
        lanePriority: 0,
        chokeReservation: null,
      },

      modifiers: [],
      neutralPatrol: Array.isArray(options.patrol) && options.patrol.length >= 2
        ? {
            waypoints: options.patrol.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
            nextWaypointIndex: 0,
            lastIssuedAt: -Infinity,
          }
        : null,
    };
  }

  // Spawn a full team package (scouts + grunts) from a team spawn def.
  spawnTeamPackage(spawnDef, spawnFn) {
    const { tileX, tileY, direction } = spawnDef;
    const base = this.ctx.map.tileCenter(tileX, tileY);
    // Starting squads exit beside their Nexus instead of spawning inside its
    // collision circle. The offset is intentionally shared by both teams.
    const exitOffset = 90;
    const scoutSpacing = 28;
    for (let i = 0; i < CONFIG.startingScoutsPerPlayer; i++) {
      spawnFn('scout', spawnDef.team, base.x + direction * exitOffset, base.y + (i - 1) * scoutSpacing);
    }
    const gruntBase = {
      x: base.x + direction * (exitOffset + 42),
      y: base.y,
    };
    const gruntSpacing = 25;
    for (let i = 0; i < CONFIG.startingGruntsPerPlayer; i++) {
      spawnFn('grunt', spawnDef.team, gruntBase.x, gruntBase.y + (i - 1) * gruntSpacing);
    }
    const harvesterOffsetY = 60;
    for (let i = 0; i < CONFIG.startingHarvestersPerPlayer; i++) {
      spawnFn('harvester', spawnDef.team, base.x + direction * exitOffset, base.y + harvesterOffsetY + i * 24);
    }
  }

  // Apply the spawn section from a map def, calling spawnFn for each unit.
  applySpawnDef(spawnsDef, spawnFn) {
    if (spawnsDef.team1) this.spawnTeamPackage({ ...spawnsDef.team1, team: 1 }, spawnFn);
    if (spawnsDef.team2) this.spawnTeamPackage({ ...spawnsDef.team2, team: 2 }, spawnFn);
    for (const neutral of (spawnsDef.neutral ?? [])) {
      const center = this.ctx.map.tileCenter(neutral.tileX, neutral.tileY);
      const patrol = Array.isArray(neutral.patrol)
        ? neutral.patrol.map((waypoint) => this.ctx.map.tileCenter(waypoint.tileX, waypoint.tileY))
        : null;
      spawnFn(neutral.type, 0, center.x, center.y, { patrol });
    }
  }
}
