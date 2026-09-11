import { VIEW } from '../constants.js';
import { artImage, parallaxOffset } from './art-assets.js';

// Separate generated alpha layers retain depth in both horizontal and vertical courses.
export class BackgroundRenderer {
  constructor(stage, camera) {
    this.stage = stage;
    this.camera = camera;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.fillStyle = '#102b39';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const sky = artImage('sky');
    if (sky) ctx.drawImage(sky, 0, 0, VIEW.width, VIEW.height);
    this.drawLayer(ctx, 'city', .18, 1600, 820, 1);
    this.drawLayer(ctx, 'cranes', .42, 1800, 1000, .68);
    // Darken only scenery, keeping foreground collision surfaces crisp.
    ctx.fillStyle = 'rgba(5,18,27,.15)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.restore();
  }

  drawLayer(ctx, key, speed, width, height, alpha) {
    const image = artImage(key);
    if (!image) return;
    const offset = parallaxOffset(this.camera, speed, width);
    const y = VIEW.height - height + offset.y + this.stage.height * speed * .3;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Mirrored alternating tiles make the imperfect generated edges meet exactly.
    const firstTile = Math.floor(this.camera.x * speed / width);
    for (let i = 0; i < 2; i++) {
      const x = offset.x + i * width;
      ctx.save();
      if ((firstTile + i) % 2) {
        ctx.translate(x + width, y);
        ctx.scale(-1, 1);
      } else ctx.translate(x, y);
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
    }
    ctx.restore();
  }
}
