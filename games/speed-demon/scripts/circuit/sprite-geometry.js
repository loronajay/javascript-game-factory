// Geometry shared by circuit sprite selection, drawing and livery projection.
//
// The generated atlases and their manifests are ordered clockwise by the car's
// actual nose. Rendering and customization both consume that canonical order.

import { CIRCUIT_FRAME_SIZE, circuitFrameAngle } from "./assets.js";
import { directionIndex } from "./vehicle.js";

const CIRCUIT_ALPHA_THRESHOLD = 8;
/** World heading to the atlas frame whose visible nose points that way. */
export function circuitFrameIndex(angle) {
  return directionIndex(angle);
}

export function circuitDrawBox(centreX, centreY, baseSize, geometry = null, presentationScale = 1) {
  const scale = geometry?.scale ?? 1;
  const sourceCentreX = geometry?.sourceCentreX ?? baseSize / 2;
  const sourceCentreY = geometry?.sourceCentreY ?? baseSize / 2;
  const size = baseSize * scale * presentationScale;
  return {
    x: centreX - sourceCentreX / baseSize * size,
    y: centreY - sourceCentreY / baseSize * size,
    width: size,
    height: size,
  };
}

/** Screen pixel to car-local `(u, v)`, where v=0 is the nose and v=1 the tail. */
export function localCarCoordinates(
  frameIndex,
  x,
  y,
  frameSize = CIRCUIT_FRAME_SIZE,
  geometry = null,
) {
  const angle = circuitFrameAngle(frameIndex);
  const dx = x + 0.5 - frameSize / 2;
  const dy = y + 0.5 - frameSize / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const lateral = dx * cos + dy * sin;
  const longitudinal = dx * sin - dy * cos;
  if (geometry) {
    const lateralSpan = geometry.lateralMax - geometry.lateralMin || 1;
    const longitudinalSpan = geometry.longitudinalMax - geometry.longitudinalMin || 1;
    return {
      u: (lateral - geometry.lateralMin) / lateralSpan,
      v: (geometry.longitudinalMax - longitudinal) / longitudinalSpan,
    };
  }
  return {
    u: 0.5 + lateral / frameSize,
    v: 0.5 - longitudinal / frameSize,
  };
}

/**
 * Measures every frame as its own camera view.
 *
 * The source master changes perspective and apparent scale as it turns. The
 * authored first view is the reference; every other heading is scaled so its
 * alpha-weighted body area matches that reference exactly. Width and height
 * remain perspective-correct, so side views stay wide and cardinal views tall.
 *
 * The measured oriented bounds are also the UV calibration for liveries. Each
 * independently generated view gets its own nose, tail, left and right rather
 * than pretending all eight occupy the same centred square.
 */
export function measureCircuitFrameGeometry(
  pixels,
  width,
  height,
  frameSize = CIRCUIT_FRAME_SIZE,
) {
  const frameCount = Math.floor(width / frameSize);
  const measured = Array.from({ length: frameCount }, (_, frameIndex) => {
    const angle = circuitFrameAngle(frameIndex);
    const forwardX = Math.sin(angle);
    const forwardY = -Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightY = Math.sin(angle);
    let longitudinalMin = Infinity;
    let longitudinalMax = -Infinity;
    let lateralMin = Infinity;
    let lateralMax = -Infinity;
    let sourceMinX = Infinity;
    let sourceMaxX = -Infinity;
    let sourceMinY = Infinity;
    let sourceMaxY = -Infinity;
    let alphaArea = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (let y = 0; y < height; y += 1) {
      for (let localX = 0; localX < frameSize; localX += 1) {
        const x = frameIndex * frameSize + localX;
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha <= CIRCUIT_ALPHA_THRESHOLD) continue;
        const weight = alpha / 255;
        const sourceX = localX + 0.5;
        const sourceY = y + 0.5;
        const dx = sourceX - frameSize / 2;
        const dy = sourceY - height / 2;
        const longitudinal = dx * forwardX + dy * forwardY;
        const lateral = dx * rightX + dy * rightY;
        longitudinalMin = Math.min(longitudinalMin, longitudinal);
        longitudinalMax = Math.max(longitudinalMax, longitudinal);
        lateralMin = Math.min(lateralMin, lateral);
        lateralMax = Math.max(lateralMax, lateral);
        sourceMinX = Math.min(sourceMinX, sourceX);
        sourceMaxX = Math.max(sourceMaxX, sourceX);
        sourceMinY = Math.min(sourceMinY, sourceY);
        sourceMaxY = Math.max(sourceMaxY, sourceY);
        alphaArea += weight;
        weightedX += sourceX * weight;
        weightedY += sourceY * weight;
      }
    }

    const visible = alphaArea > 0 && Number.isFinite(longitudinalMin);
    return {
      alphaArea: visible ? alphaArea : 1,
      sourceCentreX: visible ? weightedX / alphaArea : frameSize / 2,
      sourceCentreY: visible ? weightedY / alphaArea : height / 2,
      longitudinalMin: visible ? longitudinalMin : -frameSize / 2,
      longitudinalMax: visible ? longitudinalMax : frameSize / 2,
      lateralMin: visible ? lateralMin : -frameSize / 2,
      lateralMax: visible ? lateralMax : frameSize / 2,
      footprintDiameter: visible
        ? Math.max(sourceMaxX - sourceMinX + 1, sourceMaxY - sourceMinY + 1)
        : frameSize,
    };
  });

  const targetAlphaArea = measured[0]?.alphaArea ?? 1;
  return measured.map((frame) => {
    return Object.freeze({
      ...frame,
      targetAlphaArea,
      scale: Math.sqrt(targetAlphaArea / frame.alphaArea),
    });
  });
}
