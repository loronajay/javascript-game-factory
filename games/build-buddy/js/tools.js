import { GRID, TOOL_DEFS } from './constants.js';
import { rectsOverlap, pointInRect } from './utils.js';
import { activeCapFor, isToolEnabled, resolveBuilderRules } from './stage-rules.js';

let nextToolId = 1;

// A tool's id is how two online clients agree they are talking about the same
// object: a placement is named by the Builder's command id (so the Builder's
// prediction and the Runner's authoritative copy share it), and a stage's kit is
// named by its slot. The counter id is only for placements nobody else needs to
// recognise — local co-op and practice.
export function makeTool(toolType, x, y, id = null) {
  const def = TOOL_DEFS[toolType];
  return {
    id: typeof id === 'string' && id ? id : `tool_${nextToolId++}`,
    toolType,
    kind: def.kind,
    x,
    y,
    w: def.width,
    h: def.height,
    bounceVy: def.bounceVy ?? 0,
    active: true,
    activated: false,
    usedForRespawn: false,
    inUse: false,
    // > 0 while this tool's state is a local Builder prediction the Runner has
    // not confirmed yet; world syncs leave it alone until then (see Game).
    pendingSnapshots: 0,
  };
}

export function toolRectFor(toolType, x, y) {
  const def = TOOL_DEFS[toolType];
  return { x, y, w: def.width, h: def.height };
}

function horizontalOverlapAmount(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
}

export class ToolRegistry {
  constructor(stage) {
    this.stage = stage;
    this.rules = resolveBuilderRules(stage);
    this.tools = stage.preplacedTools.map((t, index) => makeTool(t.toolType, t.x, t.y, `kit_${index + 1}`));
    this.toolUseCount = 0;
  }

  toolEnabled(toolType) {
    return isToolEnabled(this.stage, toolType);
  }

  activeCapFor(toolType) {
    const def = TOOL_DEFS[toolType];
    return activeCapFor(this.stage, toolType, def?.maxActive ?? 0);
  }

  totalActiveToolCap() {
    return this.rules.totalActiveToolCap;
  }

  placedCollisionObjects() {
    return this.tools.filter(t => t.active);
  }

  platforms() {
    return this.tools.filter(t => t.active && t.kind === 'platform');
  }

  springs() {
    return this.tools.filter(t => t.active && t.kind === 'spring');
  }

  checkpoint() {
    return this.tools.find(t => t.active && t.kind === 'checkpoint');
  }

  countTotalNonCheckpoint() {
    return this.tools.filter(t => t.active && t.kind !== 'checkpoint').length;
  }

  countType(toolType) {
    return this.tools.filter(t => t.active && t.toolType === toolType).length;
  }

  findAt(x, y) {
    for (let i = this.tools.length - 1; i >= 0; i--) {
      const t = this.tools[i];
      if (t.active && pointInRect(x, y, t)) return t;
    }
    return null;
  }

  add(toolType, x, y, runner, { id = null } = {}) {
    const placement = this.normalizePlacement(toolType, x, y);
    const validation = this.validatePlacement(toolType, placement.x, placement.y, runner);
    if (!validation.valid) return validation;
    if (id && this.tools.some((tool) => tool.id === id)) return { valid: false, reason: 'Duplicate placement' };
    const tool = makeTool(toolType, validation.x ?? placement.x, validation.y ?? placement.y, id);
    this.tools.push(tool);
    this.toolUseCount += 1;
    return { valid: true, tool };
  }

  deleteAt(x, y) {
    const tool = this.findAt(x, y);
    if (!tool) return { deleted: false, reason: 'No tool under cursor' };
    if (tool.kind === 'checkpoint' && !this.rules.checkpoint.canDeleteAfterPlaced) return { deleted: false, reason: 'Checkpoint is permanent' };
    if (tool.inUse) return { deleted: false, reason: 'Tool is in use' };
    tool.active = false;
    return { deleted: true, tool };
  }

  recallAll() {
    const recalledTools = this.tools.filter((tool) => (
      tool.active && tool.kind !== 'checkpoint' && !tool.inUse
    ));
    for (const tool of recalledTools) tool.active = false;
    const inUseCount = this.tools.filter((tool) => (
      tool.active && tool.kind !== 'checkpoint' && tool.inUse
    )).length;
    return {
      recalled: recalledTools.length > 0,
      count: recalledTools.length,
      tools: recalledTools,
      inUseCount,
      reason: recalledTools.length > 0
        ? null
        : (inUseCount > 0 ? 'Runner is using the remaining tool' : 'No reusable tools to return'),
    };
  }

  markInUse(runner) {
    for (const tool of this.tools) tool.inUse = false;
    const rr = runner.rect();
    for (const tool of this.tools) {
      if (!tool.active) continue;
      const expanded = { x: tool.x - 2, y: tool.y - 2, w: tool.w + 4, h: tool.h + 4 };
      if (rectsOverlap(rr, expanded)) tool.inUse = true;
    }
  }

  normalizePlacement(toolType, x, y) {
    // Most tools are top-left grid anchored. Checkpoints are different: they are
    // tall standing objects that need to sit on a support surface. If we top-left
    // snap a 70px-tall checkpoint to a 40px grid, its feet often land 10-30px off
    // the floor. Snap checkpoint Y to the nearest valid support top instead.
    if (toolType !== 'checkpoint') return { x, y };

    const rect = toolRectFor(toolType, x, y);
    const support = this.findCheckpointSupport(rect);
    if (!support) return { x, y };

    return {
      x,
      y: support.y - rect.h,
    };
  }

  validatePlacement(toolType, x, y, runner) {
    const def = TOOL_DEFS[toolType];
    if (!def) return { valid: false, reason: 'Unknown tool' };
    if (!this.toolEnabled(toolType)) return { valid: false, reason: `${def.label} disabled by stage rules` };

    const placement = this.normalizePlacement(toolType, x, y);
    const rect = toolRectFor(toolType, placement.x, placement.y);

    if (toolType === 'checkpoint' && !this.rules.checkpoint.canReplaceAfterPlaced && this.countType('checkpoint') >= 1) {
      return { valid: false, reason: 'Checkpoint already placed' };
    }
    if (toolType !== 'checkpoint' && this.countTotalNonCheckpoint() >= this.totalActiveToolCap()) {
      return { valid: false, reason: `${this.totalActiveToolCap()} active tool cap reached` };
    }
    const activeCap = this.activeCapFor(toolType);
    if (this.countType(toolType) >= activeCap) {
      return { valid: false, reason: `${def.label} cap reached (${activeCap})` };
    }
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > this.stage.width || rect.y + rect.h > this.stage.height) {
      return { valid: false, reason: 'Outside stage bounds' };
    }
    if (rectsOverlap(rect, runner.safetyNoBuildRect())) {
      return { valid: false, reason: 'Inside runner safety zone' };
    }
    for (const solid of this.stage.solids) {
      if (rectsOverlap(rect, solid)) return { valid: false, reason: 'Overlaps solid terrain' };
    }
    for (const climb of this.stage.climbables) {
      if (rectsOverlap(rect, climb)) return { valid: false, reason: 'Overlaps climbable terrain' };
    }
    for (const hazard of this.stage.hazards) {
      if (rectsOverlap(rect, hazard)) return { valid: false, reason: 'Overlaps hazard' };
    }
    for (const ball of this.stage.movingHazards ?? []) {
      if (rectsOverlap(rect, ball.lane)) return { valid: false, reason: 'Overlaps spike ball lane' };
    }
    for (const zone of this.stage.noBuildZones) {
      if (rectsOverlap(rect, zone)) return { valid: false, reason: 'Inside no-build zone' };
    }
    for (const zone of this.stage.blockedPlacementZones) {
      if (rectsOverlap(rect, zone)) return { valid: false, reason: 'Inside blocked zone' };
    }
    for (const tool of this.tools) {
      if (tool.active && rectsOverlap(rect, tool)) return { valid: false, reason: 'Overlaps placed tool' };
    }

    if (toolType === 'checkpoint' && this.rules.checkpoint.requiredFloorSupport && !this.hasSupportBelow(rect)) {
      return { valid: false, reason: 'Checkpoint needs floor support' };
    }

    return { valid: true, reason: 'Valid placement', x: rect.x, y: rect.y };
  }

  supportSurfaces() {
    return [...this.stage.solids, ...this.stage.oneWays, ...this.platforms()];
  }

  findCheckpointSupport(rect) {
    const snapTolerance = GRID.size + 8;
    const minHorizontalSupport = Math.min(28, rect.w * 0.55);
    const centerX = rect.x + rect.w / 2;
    let best = null;

    for (const support of this.supportSurfaces()) {
      const horizontalOverlap = horizontalOverlapAmount(rect, support);
      const centerSupported = centerX >= support.x && centerX <= support.x + support.w;
      if (horizontalOverlap < minHorizontalSupport && !centerSupported) continue;

      const bottomDelta = support.y - (rect.y + rect.h);
      if (Math.abs(bottomDelta) > snapTolerance) continue;

      if (!best || Math.abs(bottomDelta) < Math.abs(best.delta)) {
        best = { y: support.y, delta: bottomDelta };
      }
    }

    return best;
  }

  hasSupportBelow(rect) {
    const footProbe = {
      x: rect.x + 4,
      y: rect.y + rect.h,
      w: rect.w - 8,
      h: 4,
    };
    const minHorizontalSupport = Math.min(28, rect.w * 0.55);

    return this.supportSurfaces().some(s => {
      const yAligned = Math.abs(s.y - footProbe.y) <= 2;
      const enoughOverlap = horizontalOverlapAmount(footProbe, s) >= minHorizontalSupport;
      return yAligned && enoughOverlap;
    });
  }
}

export class BuilderController {
  constructor(stage, registry) {
    this.stage = stage;
    this.registry = registry;
    this.selectedTool = 'platform';
    this.hover = { x: 0, y: 0, valid: false, reason: '' };
    this.message = '';
    this.messageTime = 0;
    this.audioEvents = [];
  }

  consumeAudioEvents() {
    return this.audioEvents.splice(0);
  }

  updateHover(input, camera, runner) {
    this.selectedTool = input.selectedTool;
    if (!this.registry.toolEnabled(this.selectedTool)) {
      const firstEnabled = ['platform', 'springYellow', 'springGreen', 'springBlue', 'checkpoint'].find(t => this.registry.toolEnabled(t));
      if (firstEnabled) this.selectedTool = firstEnabled;
    }
    const world = camera.screenToWorld(input.mouse.x, input.mouse.y);
    const rawX = Math.round(world.x / GRID.size) * GRID.size;
    const rawY = Math.round(world.y / GRID.size) * GRID.size;
    const placement = this.registry.normalizePlacement(this.selectedTool, rawX, rawY);
    this.hover.x = placement.x;
    this.hover.y = placement.y;
    const validation = this.registry.validatePlacement(this.selectedTool, this.hover.x, this.hover.y, runner);
    this.hover.valid = validation.valid;
    this.hover.reason = validation.reason;
    if (Number.isFinite(validation.x) && Number.isFinite(validation.y)) {
      this.hover.x = validation.x;
      this.hover.y = validation.y;
    }
  }

  update(dt, input, camera, runner) {
    this.updateHover(input, camera, runner);

    const world = camera.screenToWorld(input.mouse.x, input.mouse.y);
    if (input.consumePlace()) {
      const res = this.registry.add(this.selectedTool, this.hover.x, this.hover.y, runner);
      this.announce('place', res, this.selectedTool);
      this.audioEvents.push({ type: res.valid ? 'toolAction' : 'error' });
    }
    if (input.consumeDelete()) {
      const res = this.registry.deleteAt(world.x, world.y);
      this.announce('delete', res);
      this.audioEvents.push({ type: res.deleted ? 'toolAction' : 'error' });
    }
    if (input.consumeRecall()) {
      const res = this.registry.recallAll();
      this.announce('recall', res);
      this.audioEvents.push({ type: res.recalled ? 'toolAction' : 'error' });
    }

    this.messageTime = Math.max(0, this.messageTime - dt);
  }

  // Toast the outcome of a registry action. Shared by the local click path
  // above and the online path, where the controller applies the command itself.
  announce(action, res, toolType = this.selectedTool) {
    if (action === 'recall') {
      const suffix = res.inUseCount > 0 ? ` (${res.inUseCount} still in use)` : '';
      this.toast(res.recalled ? `${res.count} tool${res.count === 1 ? '' : 's'} returned${suffix}` : res.reason);
    } else if (action === 'delete') {
      this.toast(res.deleted ? 'Tool deleted' : res.reason);
    } else {
      this.toast(res.valid ? `${TOOL_DEFS[toolType]?.label ?? 'Tool'} placed` : res.reason);
    }
  }

  toast(msg) {
    this.message = msg;
    this.messageTime = 1.4;
  }
}
