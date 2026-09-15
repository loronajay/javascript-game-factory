import { roundRect } from './render-utils.js';
import { artImage } from './art-assets.js';
import { characterById } from '../characters.js';
import { RunnerAnimation } from './runner-animation.js';
import { RUNNER_FRAMES } from './runner-frames.js';
import { customizedRunnerSheet } from './runner-colors.js';

export class RunnerRenderer {
  constructor(runner) {
    this.runner = runner;
    this.animation = new RunnerAnimation();
  }

  draw(ctx, { showSafetyZone = false } = {}) {
    const r = this.runner;
    ctx.save();
    if (showSafetyZone) {
      const safety = r.safetyNoBuildRect();
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([8, 7]);
      roundRect(ctx, safety.x, safety.y, safety.w, safety.h, 20, true, true);
      ctx.setLineDash([]);
    }
    const character = characterById(r.characterId);
    const atlas = RUNNER_FRAMES[character.id];
    const sourceSheet = atlas ? artImage(`${character.id}Runner`) : null;
    const sheet = sourceSheet ? customizedRunnerSheet(sourceSheet, character.id, r.cosmetics, atlas) : null;
    const facing = r.facing < 0 ? -1 : 1;
    ctx.translate(r.x + r.w / 2, r.y + r.h);
    ctx.scale(facing, 1);
    ctx.globalAlpha = r.dead ? .55 : 1;
    if (sheet) {
      // Use measured bounds, one scale per animal, and a shared foot baseline.
      // Climbing paws align with the wall rather than drifting between frames.
      const frame = atlas.frames[this.animation.frame];
      const scale = r.h / atlas.bodyHeight;
      const left = r.climbing ? r.w / 2 - frame.w * scale : -frame.anchor * scale;
      ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h,
        left, -frame.h * scale, frame.w * scale, frame.h * scale);
    } else {
      const image = artImage('animals');
      if (image) {
        const { x, y, w, h } = character.crop;
        const width = r.h * w / h;
        ctx.drawImage(image, x, y, w, h, -width * character.anchor, -r.h, width, r.h);
      }
    }
    ctx.restore();
  }
}
