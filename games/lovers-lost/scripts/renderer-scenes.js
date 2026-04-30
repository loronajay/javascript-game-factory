// Owns the parallax environment stack for the split-screen run.
// renderer.js composes this module and keeps only the high-level draw flow.

export function createSceneRenderer(ctx, {
  HALF_W,
  CANVAS_H,
  GROUND_TOP,
  TILE,
  PPU,
  BOY_LOCAL_X,
  GIRL_LOCAL_X,
}) {
  // Aligned exactly to wave start positions from obstacles.js:
  // WAVE_START_POSITIONS = [420, 1020, 1770, 2720, 3820]
  // Warmup + wave 1 share env 0. Each new wave triggers the next environment.
  const ENV_TRANSITIONS = [1020, 1770, 2720, 3820];

  const BOY_PALS = [
    { sky: '#0a0614', skyFar: '#180828', ground: '#2a1040', edge: '#4a2060' },
    { sky: '#040e08', skyFar: '#0a1a0c', ground: '#1a4020', edge: '#2a6030' },
    { sky: '#060a10', skyFar: '#0e1826', ground: '#203040', edge: '#304858' },
    { sky: '#040c10', skyFar: '#081820', ground: '#0a2e40', edge: '#1a4858' },
    { sky: '#18082e', skyFar: '#200c3a', ground: '#4a2060', edge: '#7040a0' },
  ];

  const GIRL_PALS = [
    { sky: '#1c0e04', skyFar: '#2c1a08', ground: '#5a3010', edge: '#7a4820' },
    { sky: '#06101a', skyFar: '#0c1a2e', ground: '#1a3048', edge: '#2a4860' },
    { sky: '#100402', skyFar: '#1e0804', ground: '#3a1006', edge: '#581808' },
    { sky: '#080810', skyFar: '#10141e', ground: '#252535', edge: '#353548' },
    { sky: '#18082e', skyFar: '#200c3a', ground: '#4a2060', edge: '#7040a0' },
  ];

  const NIGHT_STAR = 'rgba(255,220,255,0.6)';
  const SEAM_SPEED = PPU;

  const boyStars = _genStars(30, 1337);
  const girlStars = _genStars(30, 4242);

  const sceneData = {
    cave: { stals: _genPts(14, 1001), cols: _genPts(8, 1002) },
    forest: { far: _genPts(8, 2001), near: _genPts(12, 2002) },
    cliffs: { peaks: _genPts(6, 3001), rain: _genPts(80, 3002) },
    sunken: { cols: _genPts(7, 4001), debris: _genPts(10, 4002) },
    desert: { dunes: _genPts(6, 5001), pillars: _genPts(7, 5002) },
    tundra: { peaks: _genPts(8, 6001), shards: _genPts(10, 6002) },
    lava: { rocks: _genPts(9, 7001), cracks: _genPts(7, 7002) },
    castle: { cols: _genPts(6, 8001), torches: _genPts(5, 8002) },
  };

  const boyScenes = [_cave, _forest, _cliffs, _sunken, _nightScene];
  const girlScenes = [_desert, _tundra, _lava, _castle, _nightScene];

  return {
    drawBackground,
  };

  function drawBackground(offsetX, side, distance) {
    let envIdx = 0;
    for (const t of ENV_TRANSITIONS) {
      if (distance >= t) envIdx++;
    }
    envIdx = Math.min(envIdx, 4);

    const pals = side === 'boy' ? BOY_PALS : GIRL_PALS;
    const scenes = side === 'boy' ? boyScenes : girlScenes;
    const stars = side === 'boy' ? boyStars : girlStars;
    const playerLocX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;

    let seamX = null;
    let prevEnv = null;

    if (envIdx > 0) {
      const threshold = ENV_TRANSITIONS[envIdx - 1];
      const raw = side === 'boy'
        ? playerLocX + (threshold - distance) * SEAM_SPEED
        : playerLocX - (threshold - distance) * SEAM_SPEED;
      if (raw > 0 && raw < HALF_W) {
        seamX = raw;
        prevEnv = envIdx - 1;
      }
    }

    const signedDist = side === 'boy' ? distance : -distance;

    function drawEnvWithStars(env) {
      _drawEnv(offsetX, pals[env], scenes[env], signedDist);
      if (env === 4) _drawStars(offsetX, stars, signedDist);
    }

    if (seamX === null) {
      drawEnvWithStars(envIdx);
      return;
    }

    const [leftEnv, rightEnv] = side === 'boy'
      ? [prevEnv, envIdx]
      : [envIdx, prevEnv];

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, seamX, CANVAS_H);
    ctx.clip();
    drawEnvWithStars(leftEnv);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX + seamX, 0, HALF_W - seamX, CANVAS_H);
    ctx.clip();
    drawEnvWithStars(rightEnv);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(offsetX + seamX - 1, 0, 2, CANVAS_H);
  }

  function _drawEnv(offsetX, pal, sceneFn, distance) {
    ctx.fillStyle = pal.sky;
    ctx.fillRect(offsetX, 0, HALF_W, CANVAS_H);
    ctx.fillStyle = pal.skyFar;
    ctx.fillRect(offsetX, GROUND_TOP - 70, HALF_W, 70);
    sceneFn(offsetX, distance, 'sky');
    ctx.fillStyle = pal.ground;
    ctx.fillRect(offsetX, GROUND_TOP, HALF_W, CANVAS_H - GROUND_TOP);
    ctx.fillStyle = pal.edge;
    ctx.fillRect(offsetX, GROUND_TOP, HALF_W, 3);
    sceneFn(offsetX, distance, 'ground');
  }

  function _forTile(points, scrollPx, fn) {
    const scroll = scrollPx % TILE;
    for (const point of points) {
      const localX = (point.x - scroll + TILE * 2) % TILE;
      fn(localX, point);
      fn(localX - TILE, point);
    }
  }

  function _cave(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.7;
    const nearScroll = distance * 2.0;

    ctx.fillStyle = '#140822';
    _forTile(sceneData.cave.stals, farScroll, (localX, point) => {
      const width = 10 + point.r * 28;
      const height = 30 + point.r * 100;
      ctx.beginPath();
      ctx.moveTo(offsetX + localX, 0);
      ctx.lineTo(offsetX + localX + width / 2, height);
      ctx.lineTo(offsetX + localX + width, 0);
      ctx.closePath();
      ctx.fill();
    });

    ctx.fillStyle = '#1c0c34';
    _forTile(sceneData.cave.cols, nearScroll, (localX, point) => {
      const width = 14 + point.r * 22;
      const height = 40 + point.r * 90;
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
    });
  }

  function _forest(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.6;
    const nearScroll = distance * 1.8;

    ctx.fillStyle = '#0a1a0c';
    _forTile(sceneData.forest.far, farScroll, (localX, point) => {
      const width = 9 + point.r * 7;
      const height = 80 + point.r * 100;
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
      ctx.beginPath();
      ctx.arc(offsetX + localX + width / 2, GROUND_TOP - height, width * 1.8 + point.r * 10, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#060e07';
    _forTile(sceneData.forest.near, nearScroll, (localX, point) => {
      const width = 16 + point.r * 14;
      const height = 110 + point.r * 140;
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
      ctx.beginPath();
      ctx.arc(offsetX + localX + width / 2, GROUND_TOP - height, width * 2 + point.r * 14, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function _cliffs(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.5;

    ctx.fillStyle = '#0c1828';
    _forTile(sceneData.cliffs.peaks, farScroll, (localX, point) => {
      const width = 60 + point.r * 90;
      const height = 70 + point.r * 130;
      ctx.beginPath();
      ctx.moveTo(offsetX + localX, GROUND_TOP - 10);
      ctx.lineTo(offsetX + localX + width * 0.3, GROUND_TOP - height);
      ctx.lineTo(offsetX + localX + width * 0.6, GROUND_TOP - height * 0.65);
      ctx.lineTo(offsetX + localX + width, GROUND_TOP - 10);
      ctx.closePath();
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(100,140,180,0.3)';
    ctx.lineWidth = 1;
    const now = Date.now();
    for (const point of sceneData.cliffs.rain) {
      const rx = offsetX + (point.x % HALF_W);
      const ry = (point.r * CANVAS_H + now * 0.25) % CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(rx - 2, ry);
      ctx.lineTo(rx, ry + 14);
      ctx.stroke();
    }
  }

  function _sunken(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const scroll = distance * 1.5;

    ctx.fillStyle = '#0c2030';
    _forTile(sceneData.sunken.cols, scroll, (localX, point) => {
      const width = 14 + point.r * 18;
      const height = 50 + point.r * 130;
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
      ctx.fillRect(offsetX + localX - 4, GROUND_TOP - height, width + 8, 8);
      ctx.fillRect(offsetX + localX - 4, GROUND_TOP - height - 12, width + 8, 5);
    });

    ctx.strokeStyle = 'rgba(80,190,220,0.18)';
    ctx.lineWidth = 2;
    const shimmer = Date.now() / 400;
    for (let i = 0; i < 5; i++) {
      const y = GROUND_TOP - 6 - i * 11 + Math.sin(shimmer + i * 1.4) * 4;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + HALF_W, y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  function _desert(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.6;
    const nearScroll = distance * 1.8;

    ctx.fillStyle = '#3a1c06';
    _forTile(sceneData.desert.dunes, farScroll, (localX, point) => {
      const width = 100 + point.r * 130;
      const height = 30 + point.r * 55;
      ctx.beginPath();
      ctx.moveTo(offsetX + localX, GROUND_TOP);
      ctx.quadraticCurveTo(
        offsetX + localX + width * 0.5,
        GROUND_TOP - height,
        offsetX + localX + width,
        GROUND_TOP
      );
      ctx.closePath();
      ctx.fill();
    });

    ctx.fillStyle = '#4a2808';
    _forTile(sceneData.desert.pillars, nearScroll, (localX, point) => {
      const width = 10 + point.r * 8;
      const height = 45 + point.r * 90;
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
      ctx.fillRect(offsetX + localX - 3, GROUND_TOP - height - 10 - point.r * 12, width + 6, 10 + point.r * 12);
      ctx.fillStyle = '#1c0e04';
      ctx.fillRect(offsetX + localX + 2, GROUND_TOP - height * 0.55, width - 4, 2);
      ctx.fillStyle = '#4a2808';
    });
  }

  function _tundra(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.5;
    const nearScroll = distance * 1.5;

    ctx.fillStyle = '#0e1e30';
    _forTile(sceneData.tundra.peaks, farScroll, (localX, point) => {
      const width = 80 + point.r * 110;
      const height = 90 + point.r * 160;
      ctx.beginPath();
      ctx.moveTo(offsetX + localX, GROUND_TOP - 10);
      ctx.lineTo(offsetX + localX + width / 2, GROUND_TOP - height);
      ctx.lineTo(offsetX + localX + width, GROUND_TOP - 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(200,220,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(offsetX + localX + width * 0.28, GROUND_TOP - height * 0.68);
      ctx.lineTo(offsetX + localX + width * 0.5, GROUND_TOP - height);
      ctx.lineTo(offsetX + localX + width * 0.72, GROUND_TOP - height * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0e1e30';
    });

    ctx.fillStyle = 'rgba(140,190,235,0.55)';
    _forTile(sceneData.tundra.shards, nearScroll, (localX, point) => {
      const width = 6 + point.r * 10;
      const height = 22 + point.r * 55;
      ctx.beginPath();
      ctx.moveTo(offsetX + localX + width / 2, GROUND_TOP - height);
      ctx.lineTo(offsetX + localX + width, GROUND_TOP - height * 0.28);
      ctx.lineTo(offsetX + localX + width * 0.8, GROUND_TOP);
      ctx.lineTo(offsetX + localX + width * 0.2, GROUND_TOP);
      ctx.lineTo(offsetX + localX, GROUND_TOP - height * 0.28);
      ctx.closePath();
      ctx.fill();
    });
  }

  function _lava(offsetX, distance, layer) {
    const scroll = distance * 1.5;

    if (layer === 'sky') {
      ctx.fillStyle = '#1a0804';
      _forTile(sceneData.lava.rocks, scroll, (localX, point) => {
        const width = 45 + point.r * 80;
        const height = 35 + point.r * 90;
        ctx.beginPath();
        ctx.moveTo(offsetX + localX, GROUND_TOP);
        ctx.lineTo(offsetX + localX + width * 0.12, GROUND_TOP - height * 0.55);
        ctx.lineTo(offsetX + localX + width * 0.32, GROUND_TOP - height);
        ctx.lineTo(offsetX + localX + width * 0.58, GROUND_TOP - height * 0.75);
        ctx.lineTo(offsetX + localX + width * 0.8, GROUND_TOP - height * 0.45);
        ctx.lineTo(offsetX + localX + width, GROUND_TOP);
        ctx.closePath();
        ctx.fill();
      });
    }

    if (layer === 'ground') {
      const now = Date.now() / 300;
      _forTile(sceneData.lava.cracks, scroll * 0.5, (localX, point) => {
        const glow = 0.55 + 0.45 * Math.sin(now + point.r * 6.28);
        const length = 22 + point.r * 42;
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(offsetX + localX, GROUND_TOP + 4);
        ctx.lineTo(offsetX + localX + length * 0.3, GROUND_TOP + 1);
        ctx.lineTo(offsetX + localX + length * 0.6, GROUND_TOP + 5);
        ctx.lineTo(offsetX + localX + length, GROUND_TOP + 2);
        ctx.stroke();
        ctx.restore();
      });
    }
  }

  function _castle(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const colScroll = distance * 1.0;
    const torchScroll = distance * 0.5;

    ctx.fillStyle = '#0e0e1c';
    ctx.fillRect(offsetX, 0, HALF_W, GROUND_TOP);

    _forTile(sceneData.castle.cols, colScroll, (localX, point) => {
      const width = 18 + point.r * 10;
      const height = 160 + point.r * 80;
      ctx.fillStyle = '#1c1c2e';
      ctx.fillRect(offsetX + localX, GROUND_TOP - height, width, height);
      ctx.fillStyle = '#282840';
      ctx.fillRect(offsetX + localX - 4, GROUND_TOP - height, width + 8, 9);
      ctx.fillRect(offsetX + localX - 4, GROUND_TOP - height - 13, width + 8, 6);
    });

    _forTile(sceneData.castle.torches, torchScroll, (localX, point) => {
      const ty = GROUND_TOP - 90 - point.r * 60;
      const flicker = 0.35 + 0.3 * Math.sin(Date.now() / (170 + point.r * 90) + point.r * 5);
      ctx.save();
      ctx.globalAlpha = flicker;
      const gradient = ctx.createRadialGradient(
        offsetX + localX,
        ty,
        0,
        offsetX + localX,
        ty,
        55 + point.r * 25
      );
      gradient.addColorStop(0, 'rgba(255,180,55,0.65)');
      gradient.addColorStop(0.5, 'rgba(255,100,20,0.22)');
      gradient.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(offsetX + localX - 65, ty - 65, 130, 130);
      ctx.restore();
    });
  }

  function _nightScene(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const moonX = offsetX + HALF_W / 2;
    const moonY = 72;
    ctx.save();
    ctx.globalAlpha = 0.18;
    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 64);
    glow.addColorStop(0, '#fff8e0');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - 64, moonY - 64, 128, 128);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#c8c0a0';
    ctx.beginPath();
    ctx.arc(moonX - 5, moonY + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX + 7, moonY - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function _drawStars(offsetX, stars, distance) {
    const scroll = (distance * 1.2) % HALF_W;
    ctx.fillStyle = NIGHT_STAR;
    for (const star of stars) {
      const x = (star.x - scroll + HALF_W * 2) % HALF_W;
      ctx.fillRect(offsetX + x, star.y, 1.5, 1.5);
    }
  }

  function _makeRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0xFFFFFFFF;
    };
  }

  function _genPts(count, seed) {
    const rng = _makeRng(seed);
    return Array.from({ length: count }, () => ({ x: rng() * TILE, r: rng() }));
  }

  function _genStars(count, seed) {
    const rng = _makeRng(seed);
    return Array.from({ length: count }, () => ({
      x: rng() * (HALF_W - 4) + 2,
      y: rng() * (GROUND_TOP - 30) + 5,
    }));
  }
}
