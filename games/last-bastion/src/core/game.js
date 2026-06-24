import {
  CAMPAIGN,
  getMissionById,
  getNextMission,
  getStartingMission,
} from '../data/missions.js';
import { UNIT_TYPES } from '../data/units.js';
import {
  WORLD,
  getPathById,
  isDeployable,
  isOnRouteCorridor,
  isWorldWalkable,
} from '../data/map.js';
import { getBattlefieldById } from '../data/maps.js';
import {
  assignAttackOrder,
  assignGuardOrder,
  assignHoldOrder,
  assignMoveOrder,
  assignRetreatOrder,
  createUnit,
  updateBattle,
} from '../systems/battle.js';
import { InputController } from './input.js';
import { Navigator } from './navigation.js';
import { easeOutCubic, lerp } from './math.js';
import { Hud } from '../ui/hud.js';
import { drawUnitToken, getUnitVisualRadius } from '../render/unit-renderer.js';
import { AudioManager } from '../systems/audio.js';

const FIXED_STEP = 1 / 60;
const MAX_FRAME = 0.1;
const UNIT_SPACING = 48;

export function calculateBattlefieldView(width, height, dpr, compact = false, world = WORLD) {
  // Wide screens have enough landscape to keep persistent controls beside the map.
  // That preserves the full vertical battlefield instead of shrinking it for HUD rows.
  const reservedTop = compact ? 70 * dpr : 0;
  const reservedBottom = compact ? 92 * dpr : 0;
  const reservedLeft = compact ? 0 : 210 * dpr;
  const reservedRight = compact ? 0 : 230 * dpr;
  const availableWidth = Math.max(1, width - reservedLeft - reservedRight);
  const availableHeight = Math.max(1, height - reservedTop - reservedBottom);
  const scale = Math.min(availableWidth / world.width, availableHeight / world.height);
  return {
    dpr,
    scale,
    offsetX: reservedLeft + (availableWidth - world.width * scale) / 2,
    offsetY: reservedTop + (availableHeight - world.height * scale) / 2,
    width,
    height,
    reservedTop,
    reservedBottom,
    reservedLeft,
    reservedRight,
  };
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.input = new InputController(canvas);
    this.audio = new AudioManager();
    this.mission = getStartingMission();
    this.map = getBattlefieldById(this.mission.mapId);
    this.navigator = new Navigator(20, this.map);
    this.hud = new Hud(this);
    this.unlockedMissionIds = this.loadCampaignProgress();
    this.view = { dpr: 1, scale: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 };
    this.units = [];
    this.effects = [];
    this.spawnQueue = [];
    this.elapsed = 0;
    this.currentWave = 0;
    this.gold = 0;
    this.baseHp = 100;
    this.baseMaxHp = 100;
    this.speed = 1;
    this.manualPaused = false;
    this.intelOpen = false;
    this.started = false;
    this.finished = false;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.stats = { enemiesDefeated: 0 };
    this.interaction = { mode: 'idle', placementType: null };
    this.selectedUnitId = null;
    this.hoverWorld = { x: 0, y: 0, inside: false };

    this.input.onPress = (pointer) => this.handleBattlefieldPress(pointer);
    this.input.onMove = (pointer) => this.updateHover(pointer);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started && !this.finished) {
        this.cancelInteraction();
        this.manualPaused = true;
        this.audio.pauseMusic();
      }
    });

    this.resize();
    this.reset(false);
    requestAnimationFrame((time) => this.frame(time));
    this.showMainMenu();
  }

  get paused() {
    return !this.started || this.finished || this.manualPaused || this.intelOpen || this.interaction.mode !== 'idle';
  }

  loadCampaignProgress() {
    const startingMission = getStartingMission();
    const defaultProgress = startingMission ? [startingMission.id] : [];
    try {
      const saved = JSON.parse(window.localStorage.getItem('last-bastion-campaign') ?? '[]');
      if (!Array.isArray(saved)) return defaultProgress;
      const knownStages = saved.filter((id) => getMissionById(id));
      return [...new Set([...defaultProgress, ...knownStages])];
    } catch {
      return defaultProgress;
    }
  }

  saveCampaignProgress() {
    try {
      window.localStorage.setItem('last-bastion-campaign', JSON.stringify(this.unlockedMissionIds));
    } catch {
      // Campaign progress is optional when browser storage is unavailable.
    }
  }

  isMissionUnlocked(missionId) {
    return this.unlockedMissionIds.includes(missionId);
  }

  unlockMission(missionId) {
    if (!missionId || this.isMissionUnlocked(missionId)) return;
    this.unlockedMissionIds.push(missionId);
    this.saveCampaignProgress();
  }

  openCampaign() {
    this.audio.stopMusic();
    this.reset(false);
    this.hud.showCampaign(
      CAMPAIGN,
      this.unlockedMissionIds,
      (missionId) => this.selectMission(missionId),
      () => this.showMainMenu(),
    );
  }

  showMainMenu() {
    this.audio.stopMusic();
    this.reset(false);
    this.hud.showMainMenu((modeId) => {
      if (modeId === 'campaign') this.openCampaign();
    });
  }

  selectMission(missionId) {
    const mission = getMissionById(missionId);
    if (!mission || !this.isMissionUnlocked(mission.id)) {
      this.hud.toast('Secure the previous stage to unlock this operation');
      return;
    }
    this.mission = mission;
    this.map = getBattlefieldById(mission.mapId);
    this.navigator = new Navigator(20, this.map);
    this.resize();
    this.reset(true);
  }

  reset(showBriefing = false) {
    this.units = [];
    this.effects = [];
    this.spawnQueue = [];
    this.elapsed = 0;
    this.currentWave = 0;
    this.gold = this.mission.startingGold;
    this.baseMaxHp = this.mission.baseHp;
    this.baseHp = this.baseMaxHp;
    this.speed = 1;
    this.manualPaused = false;
    this.intelOpen = false;
    this.started = false;
    this.finished = false;
    this.stats = { enemiesDefeated: 0 };
    this.interaction = { mode: 'idle', placementType: null };
    this.selectedUnitId = null;
    if (showBriefing) {
      this.hud.showBriefing(this.mission, () => {
        this.started = true;
        this.manualPaused = false;
      });
    } else {
      this.hud.update();
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const compact = window.matchMedia('(max-width: 959px)').matches;
    this.view = calculateBattlefieldView(this.canvas.width, this.canvas.height, dpr, compact, this.map.world);
  }

  frame(time) {
    const frameTime = Math.min(MAX_FRAME, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (!this.paused) {
      this.accumulator += frameTime * this.speed;
      while (this.accumulator >= FIXED_STEP) {
        this.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
    } else {
      this.accumulator = 0;
    }
    const alpha = this.accumulator / FIXED_STEP;
    this.render(alpha);
    this.hud.update();
    this.input.endFrame();
    requestAnimationFrame((next) => this.frame(next));
  }

  update(dt) {
    this.elapsed += dt;
    this.scheduleWaves();
    this.processSpawnQueue();
    updateBattle(this, dt);

    if (this.baseHp <= 0) this.endMission(false);
    else if (
      this.currentWave >= this.mission.waves.length
      && this.spawnQueue.length === 0
      && !this.units.some((unit) => unit.side === 'enemy')
    ) {
      this.endMission(true);
    }
  }

  scheduleWaves() {
    while (this.currentWave < this.mission.waves.length) {
      const wave = this.mission.waves[this.currentWave];
      if (this.elapsed < wave.at) break;
      for (const spec of wave.units) this.spawnQueue.push({ ...spec, at: wave.at + spec.delay });
      this.currentWave += 1;
    }
  }

  processSpawnQueue() {
    for (let i = this.spawnQueue.length - 1; i >= 0; i -= 1) {
      const spawn = this.spawnQueue[i];
      if (this.elapsed < spawn.at) continue;
      const path = getPathById(spawn.path, this.map);
      const origin = path.points[0];
      const jitter = ((i % 3) - 1) * 14;
      this.units.push(createUnit({
        side: 'enemy',
        type: spawn.type,
        pathId: spawn.path,
        x: origin.x + jitter,
        y: origin.y,
        hpScale: this.mission.enemyHpScale ?? 1,
        damageScale: this.mission.enemyDamageScale ?? 1,
        map: this.map,
      }));
      this.effects.push({ type: 'spawn', x: origin.x, y: origin.y, life: 0.4, maxLife: 0.4, side: 'enemy' });
      this.spawnQueue.splice(i, 1);
    }
  }

  beginPlacement(typeId) {
    if (!this.started || this.finished) return;
    const data = UNIT_TYPES[typeId];
    if (this.gold < data.cost) {
      this.hud.toast(`Need ${data.cost - Math.floor(this.gold)} more gold`);
      return;
    }
    this.selectedUnitId = null;
    this.interaction = { mode: 'placing', placementType: typeId };
  }

  openCommand(unit) {
    if (!unit || unit.side !== 'player' || unit.dead) return;
    if (UNIT_TYPES[unit.type].stationary) {
      this.hud.toast(`${UNIT_TYPES[unit.type].name} is fixed in place`);
      return;
    }
    this.selectedUnitId = unit.id;
    this.interaction = { mode: 'command', placementType: null };
  }

  beginMoveCommand() {
    if (!this.getSelectedUnit()) return;
    this.interaction.mode = 'move';
  }

  beginGuardCommand() {
    if (!this.getSelectedUnit()) return;
    this.interaction.mode = 'guard';
  }

  beginAttackCommand() {
    if (!this.getSelectedUnit()) return;
    this.interaction.mode = 'attack';
  }

  issueHoldCommand() {
    const unit = this.getSelectedUnit();
    if (!unit) return;
    assignHoldOrder(unit);
    this.cancelInteraction();
  }

  issueRetreatCommand() {
    const unit = this.getSelectedUnit();
    if (!unit) return;
    assignRetreatOrder(this, unit);
    this.cancelInteraction();
  }

  cancelInteraction() {
    this.interaction = { mode: 'idle', placementType: null };
    this.selectedUnitId = null;
  }

  getSelectedUnit() {
    return this.units.find((unit) => unit.id === this.selectedUnitId && !unit.dead) ?? null;
  }

  togglePause() {
    if (!this.started || this.finished) return;
    if (this.interaction.mode !== 'idle' || this.intelOpen) {
      this.hud.toast('Finish or cancel the tactical command first');
      return;
    }
    this.manualPaused = !this.manualPaused;
    if (this.manualPaused) this.audio.pauseMusic();
    else this.audio.resumeMusic();
  }

  playSound(soundId) {
    this.audio.play(soundId);
  }

  startMission() {
    this.started = true;
    this.manualPaused = false;
    this.audio.startBattleMusic();
  }

  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
  }

  handleBattlefieldPress(pointer) {
    if (!this.started || this.finished || this.intelOpen) return;
    const world = this.screenToWorld(pointer.x, pointer.y);
    if (!world.inside) return;

    switch (this.interaction.mode) {
      case 'placing':
        this.placeUnit(world);
        break;
      case 'move':
        this.commitMove(world);
        break;
      case 'guard':
        this.commitGuard(world);
        break;
      case 'attack':
        this.commitAttack(world);
        break;
      case 'command': {
        const clickedFriendly = this.findUnitAt(world, 'player');
        if (clickedFriendly) this.openCommand(clickedFriendly);
        break;
      }
      default: {
        const friendly = this.findUnitAt(world, 'player');
        if (friendly) this.openCommand(friendly);
        break;
      }
    }
  }

  placeUnit(world) {
    const typeId = this.interaction.placementType;
    const data = UNIT_TYPES[typeId];
    if (!data) return;
    if (!this.isPlacementValid(typeId, world)) {
      this.hud.toast(data.placement === 'route'
        ? 'Place Shock Mines on a route scar inside the defensive territory'
        : 'Place inside the highlighted defensive territory');
      return;
    }
    if (this.isPointOccupied(world, data.radius + UNIT_SPACING * 0.35)) {
      this.hud.toast('That deployment point is occupied');
      return;
    }
    if (this.gold < data.cost) {
      this.hud.toast(`Need ${data.cost - Math.floor(this.gold)} more gold`);
      this.cancelInteraction();
      return;
    }

    this.gold -= data.cost;
    const unit = createUnit({ side: 'player', type: typeId, x: world.x, y: world.y, map: this.map });
    this.units.push(unit);
    this.effects.push({ type: 'spawn', x: unit.x, y: unit.y, life: 0.35, maxLife: 0.35, side: 'player' });
    this.cancelInteraction();
  }

  isPlacementValid(typeId, point) {
    const data = UNIT_TYPES[typeId];
    if (!data || !isDeployable(point.x, point.y, data.radius, this.map)) return false;
    return data.placement !== 'route' || isOnRouteCorridor(point, data.radius, this.map);
  }

  commitMove(world) {
    const unit = this.getSelectedUnit();
    if (!unit) {
      this.cancelInteraction();
      return;
    }
    if (!isWorldWalkable(world.x, world.y, UNIT_TYPES[unit.type].radius, this.map, { allowRouteCorridor: false })) {
      this.hud.toast('Destination is blocked by terrain');
      return;
    }
    const path = this.navigator.findPath(unit, world);
    if (!path.length) {
      this.hud.toast('No valid route to that location');
      return;
    }
    assignMoveOrder(unit, path);
    this.cancelInteraction();
  }

  commitGuard(world) {
    const unit = this.getSelectedUnit();
    if (!unit) {
      this.cancelInteraction();
      return;
    }
    const ally = this.findUnitAt(world, 'player', unit.id);
    if (!ally) {
      this.hud.toast('Select another friendly unit to guard');
      return;
    }
    assignGuardOrder(unit, ally);
    this.cancelInteraction();
  }

  commitAttack(world) {
    const unit = this.getSelectedUnit();
    if (!unit) {
      this.cancelInteraction();
      return;
    }
    const enemy = this.findUnitAt(world, 'enemy');
    if (!enemy) {
      this.hud.toast('Select an enemy unit to attack');
      return;
    }
    assignAttackOrder(unit, enemy);
    this.cancelInteraction();
  }

  findUnitAt(world, side = null, excludeId = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const unit of this.units) {
      if (unit.dead || (side && unit.side !== side) || unit.id === excludeId) continue;
      const touchPadding = Math.max(18, (24 * this.view.dpr) / this.view.scale);
      const radius = UNIT_TYPES[unit.type].radius + touchPadding;
      const dx = world.x - unit.x;
      const dy = world.y - unit.y;
      const distance = dx * dx + dy * dy;
      if (distance <= radius * radius && distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    }
    return best;
  }

  isPointOccupied(point, distance) {
    const distanceSq = distance * distance;
    return this.units.some((unit) => {
      if (unit.dead) return false;
      const dx = unit.x - point.x;
      const dy = unit.y - point.y;
      return dx * dx + dy * dy < distanceSq;
    });
  }

  updateHover(pointer) {
    this.hoverWorld = this.screenToWorld(pointer.x, pointer.y);
  }

  screenToWorld(x, y) {
    const worldX = (x - this.view.offsetX) / this.view.scale;
    const worldY = (y - this.view.offsetY) / this.view.scale;
    return {
      x: worldX,
      y: worldY,
      inside: worldX >= 0 && worldX <= this.map.world.width && worldY >= 0 && worldY <= this.map.world.height,
    };
  }

  worldToScreen(point) {
    return {
      x: this.view.offsetX + point.x * this.view.scale,
      y: this.view.offsetY + point.y * this.view.scale,
    };
  }

  endMission(won) {
    if (this.finished) return;
    this.finished = true;
    this.audio.stopMusic();
    this.cancelInteraction();
    const nextMission = won ? getNextMission(this.mission.id) : null;
    if (won && nextMission) this.unlockMission(nextMission.id);
    setTimeout(() => {
      this.hud.showResult(won, this.stats, {
        primaryLabel: won && nextMission ? 'Continue Campaign' : won ? 'Campaign Map' : 'Retry Stage',
        onPrimary: () => {
          if (won && nextMission) this.selectMission(nextMission.id);
          else if (won) this.openCampaign();
          else this.reset(true);
        },
        onCampaign: () => this.openCampaign(),
      });
    }, 250);
  }

  render(alpha) {
    const ctx = this.ctx;
    const { width, height, offsetX, offsetY, scale } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawScreenBackground(ctx);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    this.drawMapSurface(ctx);
    if (this.map.renderRoutes) this.drawRouteTraces(ctx);
    this.drawDeployZone(ctx);
    this.drawThreatEntrances(ctx);
    this.drawTerrain(ctx);
    this.drawBase(ctx);
    this.drawOrderPreview(ctx);
    this.drawUnits(ctx, alpha);
    this.drawEffects(ctx);
    this.drawPlacementPreview(ctx);
    ctx.restore();

    if (this.manualPaused && this.started && !this.finished) this.drawManualPause(ctx);
  }

  drawScreenBackground(ctx) {
    const gradient = ctx.createRadialGradient(
      this.view.width / 2,
      this.view.height / 2,
      20,
      this.view.width / 2,
      this.view.height / 2,
      Math.max(this.view.width, this.view.height),
    );
    gradient.addColorStop(0, this.map.palette.screenCenter);
    gradient.addColorStop(0.48, '#0a1025');
    gradient.addColorStop(1, '#02030a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.view.width, this.view.height);

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = this.map.palette.sky;
    for (let index = 0; index < 28; index += 1) {
      const x = (index * 173 + 41) % this.view.width;
      const y = (index * 97 + 31) % this.view.height;
      const size = index % 5 === 0 ? 2.2 : 1;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  drawMapSurface(ctx) {
    const { world, palette } = this.map;
    const gradient = ctx.createLinearGradient(0, 0, 0, world.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.54, palette.middle);
    gradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, world.width, world.height);

    const aura = ctx.createRadialGradient(world.width * 0.5, world.height * 0.18, 28, world.width * 0.5, world.height * 0.36, world.width * 0.72);
    aura.addColorStop(0, `${palette.sky}55`);
    aura.addColorStop(0.52, `${palette.sky}12`);
    aura.addColorStop(1, '#00000000');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let y = 42; y < world.height; y += 68) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y + ((y / 68) % 2 ? 18 : -18));
      ctx.stroke();
    }
    for (let x = 38; x < world.width; x += 92) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 26, world.height);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = `${palette.accent}66`;
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, world.width - 6, world.height - 6);
  }

  drawRouteTraces(ctx) {
    const { palette } = this.map;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(5, 4, 14, .62)';
    ctx.lineWidth = 46;
    for (const { a, b } of this.map.routeSegments) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = `${palette.routeGlow}38`;
    ctx.lineWidth = 16;
    for (const { a, b } of this.map.routeSegments) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.routeGlow;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.setLineDash([3, 16]);
    for (const { a, b } of this.map.routeSegments) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.restore();
  }

  drawThreatEntrances(ctx) {
    const starts = new Map();
    for (const path of this.map.enemyPaths) {
      const start = path.points[0];
      starts.set(`${start.x},${start.y}`, start);
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pulse = 0.5 + (Math.sin(this.elapsed * 3.4) + 1) * 0.24;
    for (const start of starts.values()) {
      ctx.save();
      ctx.translate(start.x, start.y - 12);
      ctx.strokeStyle = this.map.palette.danger;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 8, 26 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = `${this.map.palette.danger}55`;
      ctx.strokeStyle = '#ffd4d8';
      for (let offset = 0; offset < 3; offset += 1) {
        const y = offset * 10;
        ctx.beginPath();
        ctx.moveTo(-11, y + 7);
        ctx.lineTo(0, y - 2);
        ctx.lineTo(11, y + 7);
        ctx.lineTo(7, y + 11);
        ctx.lineTo(0, y + 5);
        ctx.lineTo(-7, y + 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawDeployZone(ctx) {
    if (this.interaction.mode !== 'placing') return;
    ctx.save();
    ctx.fillStyle = `${this.map.palette.accent}1c`;
    ctx.strokeStyle = this.map.palette.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.roundRect(
      this.map.deployZone.minX,
      this.map.deployZone.minY,
      this.map.deployZone.maxX - this.map.deployZone.minX,
      this.map.deployZone.maxY - this.map.deployZone.minY,
      34,
    );
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawTerrain(ctx) {
    const { palette } = this.map;
    for (const terrain of this.map.terrain) {
      const polygon = terrain.polygon;
      const minY = Math.min(...polygon.map((point) => point.y));
      const maxY = Math.max(...polygon.map((point) => point.y));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
      ctx.closePath();
      ctx.shadowColor = 'rgba(0,0,0,.58)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 15;
      const terrainGradient = ctx.createLinearGradient(0, minY, 0, maxY);
      terrainGradient.addColorStop(0, terrain.type === 'ruin' ? palette.ruin : palette.terrainEdge);
      terrainGradient.addColorStop(0.24, terrain.type === 'mesa' ? palette.terrain : palette.terrain);
      terrainGradient.addColorStop(1, '#101128');
      ctx.fillStyle = terrainGradient;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = `${palette.terrainEdge}bb`;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = '#070716';
      ctx.lineWidth = 2;
      for (let y = minY + 12; y < maxY; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.map.world.width, y - 26);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }
  }

  drawBase(ctx) {
    const ratio = this.baseHp / this.baseMaxHp;
    const { palette } = this.map;
    ctx.save();
    ctx.translate(this.map.base.x, this.map.base.y);
    const liveColor = ratio > 0.4 ? palette.accent : palette.danger;
    ctx.shadowColor = `${liveColor}cc`;
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#17132f';
    ctx.strokeStyle = liveColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 73, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = Math.PI / 4 * i - Math.PI / 8;
      const radius = i % 2 === 0 ? 62 : 54;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffecbd';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = liveColor;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawOrderPreview(ctx) {
    const unit = this.getSelectedUnit();
    if (!unit) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(151, 245, 241, .72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 9]);
    ctx.beginPath();
    ctx.arc(unit.x, unit.y, UNIT_TYPES[unit.type].radius + 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.interaction.mode === 'move' && this.hoverWorld.inside) {
      const path = this.navigator.findPath(unit, this.hoverWorld);
      if (path.length) {
        ctx.strokeStyle = 'rgba(136, 238, 232, .58)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        for (const point of path) ctx.lineTo(point.x, point.y);
        ctx.stroke();
        const last = path[path.length - 1];
        ctx.fillStyle = 'rgba(136, 238, 232, .22)';
        ctx.strokeStyle = '#8ef0e8';
        ctx.beginPath();
        ctx.arc(last.x, last.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (this.interaction.mode === 'guard') {
      for (const ally of this.units) {
        if (ally.side !== 'player' || ally.id === unit.id || ally.dead) continue;
        ctx.strokeStyle = 'rgba(143, 225, 255, .44)';
        ctx.beginPath();
        ctx.arc(ally.x, ally.y, UNIT_TYPES[ally.type].radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (this.interaction.mode === 'attack') {
      for (const enemy of this.units) {
        if (enemy.side !== 'enemy' || enemy.dead) continue;
        ctx.strokeStyle = 'rgba(255, 135, 118, .52)';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, UNIT_TYPES[enemy.type].radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawUnits(ctx, alpha) {
    const ordered = [...this.units].sort((a, b) => a.y - b.y);
    for (const unit of ordered) {
      const data = UNIT_TYPES[unit.type];
      const x = lerp(unit.prevX, unit.x, alpha);
      const y = lerp(unit.prevY, unit.y, alpha);
      const r = getUnitVisualRadius(data.radius, this.view.scale / this.view.dpr);
      const friendly = unit.side === 'player';
      const selected = unit.id === this.selectedUnitId;

      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = 'rgba(0, 0, 0, .46)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0, 0, 0, .34)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.72, r * 0.9, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.save();
      ctx.rotate((unit.facing ?? (friendly ? Math.PI / 2 : -Math.PI / 2)) + Math.PI / 2);
      drawUnitToken(ctx, {
        type: unit.type,
        side: unit.side,
        radius: r,
        flashing: unit.flash > 0,
        selected,
      });
      if (unit.state === 'attacking') {
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, -2, r + 8, -Math.PI * 0.9, Math.PI * 0.05);
        ctx.stroke();
      }
      ctx.restore();

      if (friendly && !data.stationary) this.drawOrderGlyph(ctx, unit, r);

      if (unit.hp >= unit.maxHp && !selected) {
        ctx.restore();
        continue;
      }
      const barW = Math.max(42, r * 2.3);
      const barH = 5;
      ctx.fillStyle = 'rgba(0,0,0,.68)';
      ctx.fillRect(-barW / 2, -r - 16, barW, barH);
      ctx.fillStyle = unit.hp / unit.maxHp > 0.4 ? '#77efaa' : '#ff7b70';
      ctx.fillRect(-barW / 2, -r - 16, barW * (unit.hp / unit.maxHp), barH);
      ctx.restore();
    }
  }

  drawOrderGlyph(ctx, unit, radius) {
    const x = radius * 0.78;
    const y = radius * 0.82;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = '#031317';
    ctx.strokeStyle = '#b9fff7';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#e7fffc';
    ctx.fillStyle = '#e7fffc';
    ctx.lineWidth = 1.8;
    if (unit.order === 'hold') {
      ctx.strokeRect(-3.5, -3.5, 7, 7);
    } else if (unit.order === 'guard') {
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4.5, -2.5);
      ctx.lineTo(3.3, 3.5);
      ctx.lineTo(0, 5.5);
      ctx.lineTo(-3.3, 3.5);
      ctx.lineTo(-4.5, -2.5);
      ctx.closePath();
      ctx.stroke();
    } else if (unit.order === 'attack') {
      ctx.beginPath();
      ctx.arc(0, 0, 3.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-3.5, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(3.5, 0);
      ctx.moveTo(0, -6);
      ctx.lineTo(0, -3.5);
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 3.5);
      ctx.stroke();
    } else if (unit.order === 'retreat') {
      ctx.beginPath();
      ctx.moveTo(4.5, -5);
      ctx.lineTo(-3.5, 0);
      ctx.lineTo(4.5, 5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-4.5, -5);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(-4.5, 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEffects(ctx) {
    for (const effect of this.effects) {
      const t = 1 - effect.life / effect.maxLife;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.globalAlpha = 1 - t;

      if (effect.type === 'projectile') {
        const dx = effect.x - effect.previousX;
        const dy = effect.y - effect.previousY;
        const angle = Math.atan2(dy, dx);
        const projectileColor = effect.side === 'player' ? '#d9ffa1' : '#ffd06d';
        ctx.save();
        ctx.rotate(angle);
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = projectileColor;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowColor = projectileColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = projectileColor;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (effect.type === 'slash') {
        const slashColor = effect.side === 'player' ? '#d9ffa1' : '#ffd06d';
        ctx.rotate(effect.angle);
        ctx.strokeStyle = slashColor;
        ctx.shadowColor = slashColor;
        ctx.shadowBlur = 10;
        ctx.lineCap = 'round';
        ctx.lineWidth = effect.style === 'smash' ? 5.5 : 3.5;
        if (effect.style === 'thrust') {
          const reach = 10 + 30 * easeOutCubic(t);
          ctx.beginPath();
          ctx.moveTo(-7, 0);
          ctx.lineTo(reach, 0);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(reach, 0, 3.4 * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        } else if (effect.style === 'smash') {
          const radius = 10 + 22 * easeOutCubic(t);
          ctx.beginPath();
          ctx.arc(18, 0, radius, -0.78, 0.78);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(18, -8);
          ctx.lineTo(18, 8);
          ctx.stroke();
        } else {
          const radius = 18 + 10 * easeOutCubic(t);
          ctx.beginPath();
          ctx.arc(4, 0, radius, -1.7 - t * 0.6, 0.7 - t * 0.6);
          ctx.stroke();
        }
      } else if (effect.type === 'hit') {
        const radius = 8 + 24 * easeOutCubic(t);
        const impactColor = effect.strong
          ? '#ffe39a'
          : effect.weak
            ? '#99b8c0'
            : effect.side === 'enemy' ? '#ffd0ba' : '#c9fff7';
        ctx.strokeStyle = impactColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.6;
        for (let index = 0; index < 6; index += 1) {
          const angle = index * Math.PI / 3 + t * 0.6;
          const inner = 8 + 14 * t;
          const outer = inner + 7 * (1 - t);
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.stroke();
        }
        if (effect.label) {
          const cssScale = Math.max(this.view.scale / this.view.dpr, 0.01);
          ctx.fillStyle = impactColor;
          ctx.font = `900 ${Math.max(16, 13 / cssScale)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(effect.label, 0, -30 - 22 * t);
        }
      } else if (effect.type === 'explosion') {
        const radius = effect.radius * easeOutCubic(t);
        const color = effect.side === 'player' ? '#d9ffa1' : '#ffd06d';
        ctx.fillStyle = color;
        ctx.globalAlpha = (1 - t) * 0.18;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let index = 0; index < 10; index += 1) {
          const angle = index * Math.PI / 5 + t * 0.8;
          const distance = radius * (0.45 + t * 0.55);
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 4 * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.type === 'spawn') {
        const radius = 8 + 34 * t;
        ctx.strokeStyle = effect.side === 'player' ? '#7de5f0' : '#ff7772';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (effect.type === 'burst') {
        ctx.fillStyle = effect.side === 'player' ? '#7de5f0' : '#ff7772';
        for (let i = 0; i < 8; i += 1) {
          const angle = i * Math.PI / 4;
          const distance = 8 + 34 * t;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 3 * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.type === 'baseHit') {
        ctx.fillStyle = 'rgba(255,100,96,.24)';
        ctx.fillRect(-this.map.world.width, -this.map.world.height, this.map.world.width * 2, this.map.world.height * 2);
      }
      ctx.restore();
    }
  }

  drawPlacementPreview(ctx) {
    if (this.interaction.mode !== 'placing' || !this.hoverWorld.inside) return;
    const data = UNIT_TYPES[this.interaction.placementType];
    if (!data) return;
    const valid = this.isPlacementValid(this.interaction.placementType, this.hoverWorld)
      && !this.isPointOccupied(this.hoverWorld, data.radius + UNIT_SPACING * 0.35)
      && this.gold >= data.cost;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = valid ? 'rgba(125,229,240,.18)' : 'rgba(255,123,121,.18)';
    ctx.strokeStyle = valid ? '#8deaf3' : '#ff8580';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.hoverWorld.x, this.hoverWorld.y, data.radius + 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawManualPause(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(1, 7, 10, .48)';
    ctx.fillRect(0, 0, this.view.width, this.view.height);
    ctx.fillStyle = '#eefbff';
    ctx.font = `900 ${Math.round(28 * this.view.dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', this.view.width / 2, this.view.height / 2);
    ctx.restore();
  }
}
