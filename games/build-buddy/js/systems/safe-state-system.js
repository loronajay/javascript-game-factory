import { PHYS } from '../constants.js';
import { rectsOverlap } from '../utils.js';

function horizontalOverlap(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
}

export class SafeStateSystem {
  constructor(stage, runner) {
    this.stage = stage;
    this.runner = runner;
    this.states = [];
    this.timer = 0;
  }

  reset() {
    this.states = [];
    this.timer = PHYS.safeStateInterval;
  }

  update(dt, registry) {
    this.timer -= dt;
    if (this.timer > 0) return;
    if (!this.isCurrentStateSafe(registry)) return;

    const support = this.findSupportAt(this.runner.x, this.runner.y, registry);
    if (!support) return;

    this.states.push({
      x: this.runner.x,
      y: this.runner.y,
      facingDirection: this.runner.facing,
      timestamp: performance.now(),
      sourceType: support.id?.startsWith('tool_') ? 'builderPlatform' : 'stageFloor',
      supportId: support.id ?? null,
      supportKind: support.kind ?? 'floor',
    });
    this.states = this.states.slice(-3);
    this.timer = PHYS.safeStateInterval;
  }

  candidates() {
    return [this.states[this.states.length - 2], this.states[this.states.length - 3]].filter(Boolean);
  }

  findValidCandidate(registry) {
    return this.candidates().find((state) => this.isStateStillValid(state, registry)) ?? null;
  }

  isCurrentStateSafe(registry) {
    const r = this.runner;
    if (!r.grounded || r.dead || r.climbing || r.vy !== 0) return false;
    return this.isStateStillValid({ x: r.x, y: r.y, supportId: r.onGroundId }, registry);
  }

  isStateStillValid(state, registry) {
    if (!state) return false;
    const r = this.runner;
    const body = { x: state.x, y: state.y, w: r.w, h: r.h };
    const hurt = { x: body.x + 7, y: body.y + 6, w: body.w - 14, h: body.h - 12 };

    if (body.x < 0 || body.x + body.w > this.stage.width) return false;
    if (body.y < 0 || body.y + body.h > this.stage.deathY - 48) return false;

    const support = this.findSupportAt(state.x, state.y, registry);
    if (!support) return false;
    if (state.supportId?.startsWith?.('tool_') && support.id !== state.supportId) return false;

    for (const hazard of this.stage.hazards) {
      const padded = {
        x: hazard.x + 4,
        y: hazard.y + 2,
        w: Math.max(0, hazard.w - 8),
        h: Math.max(0, hazard.h - 4),
      };
      if (rectsOverlap(hurt, padded)) return false;
    }

    for (const zone of this.stage.blockedPlacementZones) if (rectsOverlap(body, zone)) return false;

    const headroom = { x: body.x + 3, y: body.y - 4, w: body.w - 6, h: 4 };
    for (const solid of this.blockingSolids(registry)) {
      if (solid.id === support.id) continue;
      if (rectsOverlap(headroom, solid)) return false;
      if (rectsOverlap(body, solid) && Math.abs((body.y + body.h) - solid.y) > 3) return false;
    }

    const floorProbe = { x: body.x + 6, y: body.y + body.h, w: body.w - 12, h: 24 };
    const supported = this.supportSurfaces(registry).some((surface) => rectsOverlap(floorProbe, surface));
    if (!supported) return false;

    return true;
  }

  findSupportAt(x, y, registry) {
    const r = this.runner;
    const foot = { x: x + 6, y: y + r.h - 1, w: r.w - 12, h: 6 };
    let best = null;
    for (const surface of this.supportSurfaces(registry)) {
      const yAligned = Math.abs(surface.y - (y + r.h)) <= 6;
      const enoughX = horizontalOverlap(foot, surface) >= Math.min(18, foot.w * 0.55);
      if (!yAligned || !enoughX) continue;
      if (!best || surface.y < best.y) best = surface;
    }
    return best;
  }

  supportSurfaces(registry) {
    return [
      ...this.stage.solids,
      ...this.stage.climbables.map((w) => w.topStand).filter(Boolean),
      ...this.stage.oneWays,
      ...registry.platforms(),
    ];
  }

  blockingSolids() {
    return [
      ...this.stage.solids,
      ...this.stage.climbables.map((w) => w.topStand).filter(Boolean),
    ];
  }
}
