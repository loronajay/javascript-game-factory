// Analog gauge mathematics — pure, no canvas.
//
// Everything a sweeping-needle dial needs: value-to-angle mapping, tick layout,
// and the smoothing that gives a needle mass. The renderer draws; this module
// decides where things point.
//
// Canvas angles run clockwise from three o'clock with y pointing down, so a dial
// that sweeps visually clockwise from lower-left to lower-right is an increasing
// angle from 0.75pi to 2.25pi — a 270 degree face.

import { PERFECT_RPM_WINDOW } from "../sim/constants.js";

export const TACH_SWEEP = { startAngle: Math.PI * 0.75, endAngle: Math.PI * 2.25 };
export const SPEEDO_SWEEP = { startAngle: Math.PI * 0.75, endAngle: Math.PI * 2.25 };

export const SHIFT_LIGHT_OFF = "off";
export const SHIFT_LIGHT_ARMED = "armed";
export const SHIFT_LIGHT_OVER = "over";

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Where the needle points for `value`, clamped to the ends of the dial. */
export function needleAngle(value, { min, max, startAngle, endAngle }) {
  const range = max - min;
  if (!(range > 0)) {
    return startAngle; // a degenerate scale parks the needle rather than blowing up
  }
  return startAngle + (endAngle - startAngle) * clamp01((value - min) / range);
}

/**
 * Tick marks across the face, ascending, with minors interleaved between majors
 * and never duplicating one.
 */
export function gaugeTicks({ min, max, startAngle, endAngle, majorStep, minorStep }) {
  const sweep = { min, max, startAngle, endAngle };
  const ticks = new Map(); // value -> major flag, so a major always wins a collision

  const addSeries = (step, major) => {
    if (!(step > 0)) {
      return;
    }
    const steps = Math.round((max - min) / step);
    for (let i = 0; i <= steps; i += 1) {
      const value = min + i * step;
      if (major || !ticks.has(value)) {
        ticks.set(value, major);
      }
    }
  };

  addSeries(minorStep, false);
  addSeries(majorStep, true);

  return [...ticks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, major]) => ({ value, major, angle: needleAngle(value, sweep) }));
}

/**
 * Exponential approach, framerate-independent. Used for needle sweep, so the
 * tachometer lags the physics slightly the way a real one does. Called from
 * tick(), never from render().
 */
export function smoothToward(current, target, rate, dt) {
  if (dt <= 0) {
    return current;
  }
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * The shift light is the only HUD element that hands the player timing
 * information, so it is derived from the same window grading uses. If the two
 * ever disagree the light is lying, which is worse than having no light.
 */
export function shiftLightState(car, rpm) {
  if (rpm < car.optimalShiftRpm - PERFECT_RPM_WINDOW) {
    return SHIFT_LIGHT_OFF;
  }
  if (rpm <= car.optimalShiftRpm + PERFECT_RPM_WINDOW) {
    return SHIFT_LIGHT_ARMED;
  }
  return SHIFT_LIGHT_OVER;
}
