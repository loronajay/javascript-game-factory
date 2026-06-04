import { GRID, TOOL_DEFS } from './constants.js';
import { rectsOverlap, pointInRect } from './utils.js';
import { activeCapFor, isToolEnabled, resolveBuilderRules } from './stage-rules.js';

let nextToolId = 1;

export function makeTool(toolType, x, y) {
  const def = TOOL_DEFS[toolType];
  return {
    id: `tool_${nextToolId++}`,
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
    this.tools = stage.preplacedTools.map(t => makeTool(t.toolType, t.x, t.y));
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

  add(toolType, x, y, runner) {
    const placement = this.normalizePlacement(toolType, x, y);
    const validation = this.validatePlacement(toolType, placement.x, placement.y, runner);
    if (!validation.valid) return validation;
    const tool = makeTool(toolType, validation.x ?? placement.x, validation.y ?? placement.y);
    this.tools.push(tool);
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
  }

  update(dt, input, camera, runner) {
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

    if (input.consumePlace()) {
      const res = this.registry.add(this.selectedTool, this.hover.x, this.hover.y, runner);
      this.toast(res.valid ? `${TOOL_DEFS[this.selectedTool].label} placed` : res.reason);
    }
    if (input.consumeDelete()) {
      const res = this.registry.deleteAt(world.x, world.y);
      this.toast(res.deleted ? 'Tool deleted' : res.reason);
    }

    this.messageTime = Math.max(0, this.messageTime - dt);
  }

  toast(msg) {
    this.message = msg;
    this.messageTime = 1.4;
  }
}
