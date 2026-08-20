// Geometry shared by circuit sprite selection, drawing and livery projection.
//
// The generated atlases are ordered by camera-facing views, not by the car's
// actual nose: frame 0 presents the rear at the top and therefore points south.
// Keeping that correction here prevents rendering and customization from
// developing separate, contradictory ideas of which end of the car is forward.

import { CIRCUIT_FRAME_SIZE } from "./assets.js";
import { directionIndex } from "./vehicle.js";

export const CIRCUIT_TARGET_LENGTH = 56;
const CIRCUIT_ALPHA_THRESHOLD = 8;

/** World heading to the atlas frame whose visible nose points that way. */
export function circuitFrameIndex(angle) {
  return (directionIndex(angle) + 4) % 8;
}

export function circuitDrawBox(centreX, centreY, baseSize, scale = 1) {
  const size = baseSize * scale;
  return {
    x: centreX - size / 2,
    y: centreY - size / 2,
    width: size,
    height: size,
  };
}

/** Screen pixel to car-local `(u, v)`, where v=0 is the nose and v=1 the tail. */
export function localCarCoordinates(frameIndex, x, y, frameSize = CIRCUIT_FRAME_SIZE) {
  const angle = ((frameIndex + 4) % 8) * Math.PI / 4;
  const dx = (x + 0.5) / frameSize - 0.5;
  const dy = (y + 0.5) / frameSize - 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    u: 0.5 + dx * cos + dy * sin,
    v: 0.5 - dx * sin + dy * cos,
  };
}

/**
 * Measures every frame along the car's own longitudinal axis.
 *
 * The source compiler fitted each view independently into a 56px box. A
 * diagonal car therefore arrived longer than a cardinal one. These scales make
 * the occupied car length constant without stretching one axis or distorting
 * the artwork.
 */
export function measureCircuitFrameGeometry(
  pixels,
  width,
  height,
  frameSize = CIRCUIT_FRAME_SIZE,
) {
  const frameCount = Math.floor(width / frameSize);
  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const angle = ((frameIndex + 4) % 8) * Math.PI / 4;
    const forwardX = Math.sin(angle);
    const forwardY = -Math.cos(angle);
    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < height; y += 1) {
      for (let localX = 0; localX < frameSize; localX += 1) {
        const x = frameIndex * frameSize + localX;
        if (pixels[(y * width + x) * 4 + 3] <= CIRCUIT_ALPHA_THRESHOLD) continue;
        const dx = localX - (frameSize - 1) / 2;
        const dy = y - (height - 1) / 2;
        const longitudinal = dx * forwardX + dy * forwardY;
        min = Math.min(min, longitudinal);
        max = Math.max(max, longitudinal);
      }
    }

    const localLength = Number.isFinite(min) ? max - min + 1 : CIRCUIT_TARGET_LENGTH;
    return Object.freeze({
      localLength,
      scale: CIRCUIT_TARGET_LENGTH / localLength,
    });
  });
}
