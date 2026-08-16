(function exposeRenderer(root) {
  const W = 1024;
  const H = 1536;
  const PIN_HEIGHT_FRONT = 74;
  const PIN_RACK_VISUAL_FRONT_Z = 0.875;
  const PIN_RACK_DEPTH_SCALE = 0.58;
  const PIN_GROUND_LENGTH = 0.44;
  const BALL_COLORS = [
    ["#ff3842", "#5d0207"], ["#33a5ff", "#031e78"], ["#bd55ff", "#33006c"], ["#53e26f", "#054c18"],
    ["#ffad33", "#8d2100"], ["#ffe06b", "#815600"], ["#f8f8ff", "#9aa0b5"], ["#22252c", "#000000"],
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth01 = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function interpolatePath(points, z) {
    let upperIndex = points.findIndex((point) => point.z >= z);
    if (upperIndex < 0) upperIndex = points.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const lower = points[lowerIndex];
    const upper = points[upperIndex];
    const progress = upper.z === lower.z ? 0 : (z - lower.z) / (upper.z - lower.z);
    return {
      left: lower.left + (upper.left - lower.left) * progress,
      right: lower.right + (upper.right - lower.right) * progress,
    };
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${source}`));
      image.src = source;
    });
  }

  class YamBowlingRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.canvas.width = W;
      this.canvas.height = H;
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high";
      this.assets = { lane: null, pin: null, character: [] };
      this.laneSlug = "";
      this.requestedLaneSlug = "";
      this.laneLoadId = 0;
      this.characterSlug = "";
      this.skinId = "";
      this.characterLoadId = 0;
      this.ready = false;
      this.debug = false;
      this.shake = 0;
    }

    async load(laneSlug = root.YamLaneCore.DEFAULT_LANE_SLUG) {
      const lane = root.YamLaneCore.getLane(laneSlug);
      this.requestedLaneSlug = lane.slug;
      const loadId = ++this.laneLoadId;
      const [laneImage, pinImage] = await Promise.all([
        loadImage(lane.src),
        loadImage("assets/pins/1.webp"),
      ]);
      this.assets.pin = pinImage;
      if (loadId === this.laneLoadId) {
        this.assets.lane = laneImage;
        this.laneSlug = lane.slug;
      }
      await this.setCharacter("daisy-monroe");
      this.ready = true;
    }

    // Lanes are pure backdrop, so a swap never touches the rack or the projection.
    // The skip test is against the lane last *asked* for, not the one last painted:
    // leaving an online house back to a local pick can ask for a lane whose art is
    // still in flight, and comparing against the painted one would drop that hop
    // and leave the screen showing a lane the match no longer believes it is on.
    async setLane(laneSlug) {
      const lane = root.YamLaneCore.getLane(laneSlug);
      if (lane.slug === this.requestedLaneSlug) return;
      this.requestedLaneSlug = lane.slug;
      const loadId = ++this.laneLoadId;
      const image = await loadImage(lane.src);
      if (loadId !== this.laneLoadId) return;
      this.assets.lane = image;
      this.laneSlug = lane.slug;
    }

    async setCharacter(slug, skinId = "canon") {
      const resolvedSkinId = root.YamBowlingCore.normalizeSkinId(skinId);
      if (!slug || (slug === this.characterSlug && resolvedSkinId === this.skinId)) return;
      const loadId = ++this.characterLoadId;
      const frames = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          loadImage(root.YamBowlingCore.getFrameAssetPath({ slug }, index + 1, resolvedSkinId)),
        ),
      );
      if (loadId !== this.characterLoadId) return;
      this.characterSlug = slug;
      this.skinId = resolvedSkinId;
      this.assets.character = frames;
    }

    project(x, z) {
      const lane = root.YamLaneCore.getLane(this.laneSlug);
      const clampedZ = clamp(z, 0, 1);
      const deckBlend = smooth01((clampedZ - 0.45) / (PIN_RACK_VISUAL_FRONT_Z - 0.45));
      const y = 1185 - 955 * clampedZ + lane.pinDeckOffsetY * deckBlend;
      const { left, right } = interpolatePath(lane.laneEdges, clampedZ);
      const center = (left + right) / 2;
      const half = (right - left) / 2;
      return { x: center + x * half, y, half, left, right };
    }

    ballSizeAt(z) {
      return 76 - clamp(z, 0, 1) * 51;
    }

    depthScaleAt(z) {
      return 430 - 330 * Math.pow(clamp(z, 0, 1), 0.82);
    }

    // The painted trough is the lane plane carried past the boards, so a ball in
    // the gutter is projected by the same measured edges as a ball on the wood.
    // Anything with a lane x -- ball, trail particle, debug marker -- goes
    // through `project`, which is what keeps them on one centerline.
    projectGutter(side, z) {
      return this.project((side < 0 ? -1 : 1) * root.YamPhysics.GUTTER_CENTER_X, z);
    }

    pinZ(pin) {
      return root.YamPhysics.RACK_FRONT_Z + pin.y / root.YamPhysics.Z_SCALE;
    }

    pinRenderZ(pin) {
      const homeZ = root.YamPhysics.RACK_FRONT_Z + pin.homeY / root.YamPhysics.Z_SCALE;
      const movementZ = (pin.y - pin.homeY) / root.YamPhysics.Z_SCALE;
      return PIN_RACK_VISUAL_FRONT_Z
        + (homeZ - root.YamPhysics.RACK_FRONT_Z) * PIN_RACK_DEPTH_SCALE
        + movementZ;
    }

    drawAimGuide(scene) {
      if (!["ready", "spin", "charging"].includes(scene.phase)) return;
      const shot = scene.liveShot;
      const ctx = this.ctx;
      ctx.save();
      const breakpointZ = root.YamPhysics.hookBreakpointForPower(shot.power);
      const strokePath = (startZ, endZ, color, dash, width) => {
        ctx.beginPath();
        for (let i = 0; i <= 18; i += 1) {
          const z = startZ + i / 18 * (endZ - startZ);
          const point = this.project(root.YamPhysics.trajectoryX(z, shot), z);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      strokePath(0.02, breakpointZ, "rgba(255,255,255,.58)", [14, 14], 3);
      ctx.shadowColor = "rgba(255, 201, 75, .55)";
      ctx.shadowBlur = 8;
      strokePath(breakpointZ, 0.92, "rgba(255,214,102,.95)", [], 4);
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      const breakpoint = this.project(root.YamPhysics.trajectoryX(breakpointZ, shot), breakpointZ);
      ctx.beginPath();
      ctx.arc(breakpoint.x, breakpoint.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(79, 180, 255, .95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, .9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const target = this.project(root.YamPhysics.trajectoryX(0.86, shot), 0.86);
      ctx.beginPath();
      ctx.arc(target.x, target.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,214,102,.96)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    pinMetrics(pin) {
      const z = this.pinRenderZ(pin);
      const point = this.project(pin.x, z);
      const frontHalf = this.depthScaleAt(PIN_RACK_VISUAL_FRONT_Z);
      const scale = clamp(this.depthScaleAt(z) / frontHalf, 0.58, 1.55);
      const height = PIN_HEIGHT_FRONT * scale;
      const width = height * (this.assets.pin.width / this.assets.pin.height);
      return { z, point, height, width };
    }

    pinGroundVector(pin, metrics) {
      let dx = pin.fallAxisX || 0.9;
      let dy = pin.fallAxisY || 0.35;
      const magnitude = Math.hypot(dx, dy) || 1;
      dx /= magnitude;
      dy /= magnitude;
      const endZ = metrics.z + dy * PIN_GROUND_LENGTH / root.YamPhysics.Z_SCALE;
      const end = this.project(pin.x + dx * PIN_GROUND_LENGTH, endZ);
      return { x: end.x - metrics.point.x, y: end.y - metrics.point.y };
    }

    drawPin(pin) {
      const metrics = this.pinMetrics(pin);
      const ctx = this.ctx;
      let alpha = 1;
      if (metrics.z > 0.94) alpha *= 1 - smooth01((metrics.z - 0.94) / 0.05);
      if (Math.abs(pin.x) > 0.82) alpha *= 1 - smooth01((Math.abs(pin.x) - 0.82) / 0.2);
      if (alpha <= 0.01) return;

      const fall = pin.standing ? 0 : smooth01(pin.fall);
      const ground = this.pinGroundVector(pin, metrics);
      const angle = Math.atan2(ground.x, -ground.y) * fall;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(metrics.point.x, metrics.point.y);
      ctx.fillStyle = `rgba(0,0,0,${(0.4 - metrics.z * 0.12) * alpha})`;
      ctx.beginPath();
      ctx.ellipse(
        ground.x * fall * 0.45,
        ground.y * fall * 0.45 + 2,
        metrics.width * (0.38 + fall * 0.62),
        metrics.height * (0.045 + fall * 0.07),
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.rotate(angle);
      ctx.shadowColor = "rgba(0,0,0,.48)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 2;
      ctx.drawImage(this.assets.pin, -metrics.width / 2, -metrics.height, metrics.width, metrics.height);
      ctx.restore();
    }

    drawPins(pins, filter = () => true) {
      pins
        .filter(filter)
        .slice()
        .sort((a, b) => this.pinZ(b) - this.pinZ(a))
        .forEach((pin) => this.drawPin(pin));
    }

    drawBallAt(x, z, ballIndex, rotation = 0, guttered = false) {
      const ctx = this.ctx;
      const ground = this.project(x, z);
      const size = this.ballSizeAt(z);
      const [light, dark] = BALL_COLORS[ballIndex % BALL_COLORS.length];
      // A captured ball sits visibly lower than one riding on the boards. Its
      // normalized x remains fixed, so perspective carries it along the rail.
      const cy = ground.y - size * (guttered ? 0.24 : 0.43);
      const radius = size / 2;
      ctx.save();
      ctx.translate(ground.x, cy);

      // The shadow lies on the lane, so it must not spin with the ball.
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath();
      ctx.ellipse(0, size * 0.48, size * 0.48, size * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body and specular highlight: the light source is fixed, so these stay upright too.
      const gradient = ctx.createRadialGradient(-size * 0.18, -size * 0.2, size * 0.04, 0, 0, size * 0.54);
      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(0.14, light);
      gradient.addColorStop(1, dark);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Only the surface detail rolls, clipped to the ball so a hole can never spill past its edge.
      ctx.save();
      ctx.clip();
      ctx.rotate(rotation);
      ctx.fillStyle = "rgba(0,0,0,.7)";
      for (const [hx, hy] of [[-0.08, -0.08], [0.05, -0.11], [-0.02, 0.02]]) {
        ctx.beginPath();
        ctx.arc(hx * size, hy * size, Math.max(1.5, size * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Inset the rim stroke so its width sits inside the fill instead of ringing the lane behind it.
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, radius - 1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Equipped visual effects are painted from particle state the tick loop
    // already advanced. The renderer never emits, ages, or clears a particle --
    // it only projects one. `YamEffects` owns the fade curve so both sides agree
    // on when a particle is gone.
    drawParticles(particles, { glow = false } = {}) {
      if (!particles.length) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const particle of particles) {
        const alpha = root.YamEffects.particleAlpha(particle);
        if (alpha <= 0) continue;
        const point = this.project(particle.x, clamp(particle.z, 0, 1));
        // Scaled by the same perspective the ball uses, so a particle far down
        // the lane shrinks with it instead of floating at a fixed size.
        const radius = Math.max(1, (76 - clamp(particle.z, 0, 1) * 51) * 0.12 * particle.size);
        ctx.globalAlpha = alpha * (glow ? 0.85 : 0.6);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y - radius, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // The reduced-motion replacement for the strike spray: one soft ring at the
    // deck that fades, with nothing flying outward.
    drawStrikeFlash(effectsState) {
      const life = effectsState.flash;
      if (life <= 0) return;
      const ctx = this.ctx;
      const progress = 1 - life / root.YamEffects.FLASH_LIFE;
      const point = this.project(0, root.YamPhysics.RACK_FRONT_Z);
      const radius = 60 + progress * 90;
      ctx.save();
      ctx.globalAlpha = clamp(life / root.YamEffects.FLASH_LIFE, 0, 1) * 0.5;
      ctx.strokeStyle = "#fff6d5";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(point.x, point.y - radius * 0.4, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayer(scene) {
      const frames = this.assets.character;
      if (!frames.length) return;
      let frame = 0;
      if (scene.phase === "approach" || scene.phase === "deck" || scene.phase === "resolve") {
        frame = clamp(Math.floor(scene.throwElapsed / 0.14), 0, 4);
      }
      const image = frames[frame] || frames[0];
      const height = 665;
      const width = height * image.width / image.height;
      this.ctx.save();
      this.ctx.translate(W / 2 + scene.liveShot.position * 420, 1460);
      this.ctx.drawImage(image, -width / 2, -height, width, height);
      this.ctx.restore();
    }

    debugDraw(scene) {
      if (!this.debug) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineWidth = 3;
      for (const pin of scene.pins) {
        const metrics = this.pinMetrics(pin);
        ctx.strokeStyle = "#45ff7a";
        ctx.beginPath();
        ctx.arc(metrics.point.x, metrics.point.y, Math.max(5, metrics.width * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (scene.simulation?.ball?.active) {
        const ball = scene.simulation.ball;
        const z = root.YamPhysics.RACK_FRONT_Z + ball.y / root.YamPhysics.Z_SCALE;
        const point = this.project(ball.x, z);
        ctx.strokeStyle = "#ff3b4c";
        ctx.beginPath();
        ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    render(scene, effectsState = null) {
      if (!this.ready) return;
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (this.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        this.shake *= 0.86;
      }
      ctx.drawImage(this.assets.lane, 0, 0, W, H);
      this.drawAimGuide(scene);

      let ballZ = null;
      let ballX = null;
      if (scene.phase === "approach") {
        ballZ = scene.ballZ;
        ballX = scene.gutterSide
          ? scene.gutterSide * root.YamPhysics.GUTTER_CENTER_X
          : root.YamPhysics.trajectoryX(ballZ, scene.shot);
      } else if (scene.simulation?.ball?.active) {
        ballZ = root.YamPhysics.RACK_FRONT_Z + scene.simulation.ball.y / root.YamPhysics.Z_SCALE;
        ballX = scene.simulation.ball.x;
      }

      if (ballZ == null) {
        this.drawPins(scene.pins);
      } else {
        this.drawPins(scene.pins, (pin) => this.pinZ(pin) >= ballZ);
        if (effectsState) this.drawParticles(effectsState.trail);
        const guttered = scene.phase === "approach"
          ? Boolean(scene.gutterSide)
          : Boolean(scene.simulation?.ball?.gutterSide);
        this.drawBallAt(ballX, clamp(ballZ, 0, 1), scene.shot.ballIndex, scene.throwElapsed * 9, guttered);
        this.drawPins(scene.pins, (pin) => this.pinZ(pin) < ballZ);
      }
      if (effectsState) {
        this.drawParticles(effectsState.burst, { glow: true });
        this.drawStrikeFlash(effectsState);
      }
      this.drawPlayer(scene);
      this.debugDraw(scene);
      ctx.restore();
    }
  }

  root.YamBowlingRenderer = YamBowlingRenderer;
})(typeof globalThis !== "undefined" ? globalThis : this);
