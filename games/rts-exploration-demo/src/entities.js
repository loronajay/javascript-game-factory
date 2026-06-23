import { CONFIG } from './config.js';
import { distanceSq } from './utils.js';

// Owns long-lived, non-unit world entities. Deposits and major neutral
// objectives can join this layer without being forced through UnitManager.
export class WorldEntityManager {
  constructor(map) {
    this.map = map;
    this.entities = [];
    this.byId = new Map();
  }

  spawnFromLandmarks(landmarks = this.map.landmarks) {
    for (const landmark of landmarks) {
      if (landmark.kind === 'nexus') this.addNexus(landmark);
    }
  }

  addNexus(landmark) {
    if (!Number.isInteger(landmark.team)) return null;
    const id = `nexus_team_${landmark.team}`;
    if (this.byId.has(id)) return this.byId.get(id);
    const center = this.map.tileCenter(landmark.tileX, landmark.tileY);
    const entity = {
      id,
      kind: 'nexus',
      team: landmark.team,
      tileX: landmark.tileX,
      tileY: landmark.tileY,
      x: center.x,
      y: center.y,
      radius: CONFIG.nexusRadius,
      selectionRadius: CONFIG.nexusSelectionRadius,
      hp: CONFIG.nexusMaxHp,
      maxHp: CONFIG.nexusMaxHp,
      active: true,
      blocksMovement: true,
      discovered: landmark.team === 1,
    };
    this.entities.push(entity);
    this.byId.set(entity.id, entity);
    this.map.addStaticCollider(entity);
    return entity;
  }

  getById(id) {
    return this.byId.get(id) ?? null;
  }

  damage(id, amount) {
    const entity = this.getById(id);
    if (!entity || entity.hp <= 0) return false;
    entity.hp = Math.max(0, entity.hp - amount);
    return true;
  }

  hitTestAttackable(worldX, worldY, attackingTeam) {
    let best = null;
    let bestD2 = Infinity;
    for (const entity of this.entities) {
      if (entity.hp <= 0 || entity.team === attackingTeam) continue;
      const d2 = distanceSq(worldX, worldY, entity.x, entity.y);
      if (d2 <= entity.selectionRadius * entity.selectionRadius && d2 < bestD2) {
        best = entity;
        bestD2 = d2;
      }
    }
    return best;
  }

  updateDiscovery(fog) {
    for (const entity of this.entities) {
      if (entity.discovered) continue;
      if (fog.isVisible(entity.tileX, entity.tileY)) entity.discovered = true;
    }
  }
}
