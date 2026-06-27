// Sound catalog for Tactical Arena.
// Each entry maps a logical key to a HybridAudioEngine patch.
// Sample assets reference the 5 reference WAVs in sounds/references/.

const SOUND_BASE = new URL("../../sounds/", import.meta.url);
const REF_BASE = new URL("references/", SOUND_BASE);

export const SAMPLE_SOURCES = Object.freeze({
  buttonClick:         new URL("button-click.wav",         SOUND_BASE).href,
  arrowHit:            new URL("arrow-hit.wav",            REF_BASE).href,
  projectileAirborne:  new URL("projectile-airborne.wav",  REF_BASE).href,
  miss:                new URL("miss.wav",                  REF_BASE).href,
  defendedHit:         new URL("defended-hit.wav",         REF_BASE).href,
  attackHit:           new URL("attack-hit.wav",           REF_BASE).href,
});

// ---------------------------------------------------------------------------
// Patches: Mini-Tactics hybrid combat sounds (use the 5 reference WAVs)
// ---------------------------------------------------------------------------

const P_BUTTON_CLICK = {
  id: "ta_button_click", duration: 0.1, gain: 0.72,
  layers: [
    { type: "sample", asset: "buttonClick", role: "contact", gain: 0.48,
      playbackRate: 1.08, trimEnd: 0.012,
      filter: [{ type: "highpass", frequency: 650, q: 0.7 }, { type: "lowpass", frequency: 6200, q: 0.7 }] },
    { type: "resonatorBank", role: "resonance", material: "wood", gain: 0.045, offset: 0.002,
      pitchScale: 1.45, excitationDuration: 0.008 }
  ],
  effects: { highpass: 220, lowpass: 9000, compressor: { threshold: -18, ratio: 2.5, attack: 0.001, release: 0.06 } }
};

const P_UNIT_SELECT = {
  id: "ta_unit_select", duration: 0.18, gain: 0.76,
  layers: [
    { type: "sample", asset: "buttonClick", role: "contact", gain: 0.28,
      playbackRate: 0.78, trimEnd: 0.01,
      filter: [{ type: "highpass", frequency: 180, q: 0.7 }, { type: "lowpass", frequency: 5200, q: 0.7 }] },
    { type: "oscillator", role: "tone", waveform: "triangle", gain: 0.16, duration: 0.16, offset: 0.012,
      frequencyCurve: [[0, 260], [0.26, 390], [1, 330]],
      envelope: [[0, 0.0001], [0.08, 0.9], [0.52, 0.55], [1, 0.0001]],
      filter: { type: "lowpass", frequency: 1800, q: 0.8 } },
    { type: "resonatorBank", role: "resonance", material: "wood", gain: 0.055, offset: 0.018,
      pitchScale: 0.92, excitationDuration: 0.012 }
  ],
  effects: { highpass: 80, lowpass: 7200, compressor: { threshold: -19, ratio: 2.8, attack: 0.001, release: 0.08 } }
};

const P_DICE_ROLL = {
  id: "ta_dice_roll", duration: 0.56, gain: 0.92,
  layers: [
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.22, offset: 0.00,  playbackRate: 1.95, pitchVariation: 0.1, timeVariation: 0.006, filter: { type: "bandpass", frequency: 2400, q: 1.5 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.25, offset: 0.075, playbackRate: 1.65, pitchVariation: 0.1, timeVariation: 0.008, filter: { type: "bandpass", frequency: 1900, q: 1.4 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.27, offset: 0.15,  playbackRate: 1.42, pitchVariation: 0.1, timeVariation: 0.008, filter: { type: "bandpass", frequency: 1500, q: 1.35 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.30, offset: 0.235, playbackRate: 1.18, pitchVariation: 0.09, timeVariation: 0.01, filter: { type: "bandpass", frequency: 1180, q: 1.3 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.38, offset: 0.36,  playbackRate: 0.92, pitchVariation: 0.07, timeVariation: 0.006, filter: { type: "bandpass", frequency: 920,  q: 1.2 } }
  ],
  effects: { highpass: 120, lowpass: 9500, saturation: 0.025, compressor: { threshold: -20, ratio: 3.5, attack: 0.001, release: 0.09 } }
};

const P_UNIT_MOVE = {
  id: "ta_unit_move", duration: 0.13, gain: 0.79,
  layers: [
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.28,
      playbackRate: 0.72, pitchVariation: 0.055, gainVariation: 0.07,
      filter: { type: "lowpass", frequency: 2100, q: 0.8 } },
    { type: "impactBody", role: "body", gain: 0.06, offset: 0.006,
      frequency: 150, endFrequency: 105, duration: 0.07,
      effects: { filter: { type: "lowpass", frequency: 430, q: 0.8 } } }
  ],
  effects: { highpass: 65, lowpass: 4200, compressor: { threshold: -20, ratio: 2.8, attack: 0.001, release: 0.07 } }
};

const P_ATTACK_HIT = {
  id: "ta_attack_hit", duration: 1.02, gain: 0.97,
  layers: [
    { type: "sample", asset: "attackHit", role: "air", gain: 0.94, pitchVariation: 0.018, gainVariation: 0.035,
      filter: { type: "highpass", frequency: 38, q: 0.7 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.31, offset: 0.19,
      playbackRate: 0.9, pitchVariation: 0.045, gainVariation: 0.08,
      filter: { type: "highpass", frequency: 220, q: 0.7 } },
    { type: "impactBody", role: "body", gain: 0.25, offset: 0.192,
      frequency: 92, endFrequency: 46, duration: 0.31,
      effects: { filter: { type: "lowpass", frequency: 520, q: 0.8 }, saturation: 0.05 } },
    { type: "resonatorBank", role: "resonance", material: "body", gain: 0.16, offset: 0.195, excitationDuration: 0.018 }
  ],
  effects: { highpass: 32, lowpass: 15000, saturation: 0.045, compressor: { threshold: -18, ratio: 4.5, attack: 0.0015, release: 0.16 } }
};

const P_CRITICAL_HIT = {
  id: "ta_critical_hit", duration: 1.08, gain: 1.0,
  layers: [
    { type: "sample", asset: "attackHit", role: "air", gain: 0.98, playbackRate: 0.94, pitchVariation: 0.014 },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.48, offset: 0.205,
      playbackRate: 0.74, pitchVariation: 0.035,
      filter: { type: "highpass", frequency: 140, q: 0.8 } },
    { type: "impactBody", role: "body", gain: 0.5, offset: 0.205,
      modes: [
        { frequency: 78, endFrequency: 36, gain: 1, decay: 0.48, waveform: "sine" },
        { frequency: 156, endFrequency: 72, gain: 0.28, decay: 0.24, waveform: "triangle" }
      ],
      effects: { filter: { type: "lowpass", frequency: 620, q: 0.75 }, saturation: 0.09 } },
    { type: "noise", role: "contact", color: "brown", gain: 0.18, offset: 0.21, duration: 0.19,
      envelope: [[0, 0.0001], [0.015, 1], [0.26, 0.44], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 820], [1, 210]], q: 1.1 } },
    { type: "resonatorBank", role: "resonance", material: "armor", gain: 0.16, offset: 0.208, pitchScale: 0.72, excitationDuration: 0.02 }
  ],
  effects: { highpass: 28, lowpass: 15000, saturation: 0.075, compressor: { threshold: -20, ratio: 6, attack: 0.001, release: 0.19 } }
};

const P_DEFENDED_HIT = {
  id: "ta_defended_hit", duration: 0.9, gain: 0.96,
  layers: [
    { type: "sample", asset: "miss", role: "air", gain: 0.56, playbackRate: 1.05, trimEnd: 0.22 },
    { type: "sample", asset: "defendedHit", role: "contact", gain: 0.94, offset: 0.12,
      playbackRate: 0.98, pitchVariation: 0.02,
      filter: { type: "highpass", frequency: 260, q: 0.8 } },
    { type: "impactBody", role: "body", gain: 0.08, offset: 0.13,
      frequency: 116, endFrequency: 72, duration: 0.16,
      effects: { filter: { type: "lowpass", frequency: 460, q: 0.8 } } },
    { type: "resonatorBank", role: "resonance", material: "metal", gain: 0.25, offset: 0.132,
      excitationDuration: 0.014, pitchVariation: 0.025 }
  ],
  effects: { highpass: 65, lowpass: 17500, saturation: 0.025, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.18 } }
};

const P_DEFEND = {
  id: "ta_defend", duration: 0.52, gain: 0.86,
  layers: [
    { type: "sample", asset: "defendedHit", role: "contact", gain: 0.31,
      playbackRate: 0.82, trimEnd: 0.35,
      filter: { type: "highpass", frequency: 240, q: 0.8 } },
    { type: "impactBody", role: "body", gain: 0.12, offset: 0.015,
      frequency: 98, endFrequency: 65, duration: 0.22,
      effects: { filter: { type: "lowpass", frequency: 480, q: 0.8 } } },
    { type: "resonatorBank", role: "resonance", material: "armor", gain: 0.15, offset: 0.02, pitchScale: 0.86 }
  ],
  effects: { highpass: 45, lowpass: 12000, saturation: 0.02, compressor: { threshold: -19, ratio: 3.5, attack: 0.001, release: 0.16 } }
};

const P_MISS = {
  id: "ta_miss", duration: 0.75, gain: 0.94,
  layers: [
    { type: "sample", asset: "miss", role: "air", gain: 0.98, pitchVariation: 0.025, gainVariation: 0.045, timeVariation: 0.002,
      filter: { type: "highpass", frequency: 70, q: 0.7 } },
    { type: "noise", role: "air", color: "pink", gain: 0.055, duration: 0.45, offset: 0.015,
      envelope: [[0, 0.0001], [0.11, 0.46], [0.24, 1], [0.58, 0.24], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 850], [0.2, 3100], [1, 620]], q: 0.8 },
      pitchVariation: 0.08 }
  ],
  effects: { highpass: 45, lowpass: 14500, saturation: 0.025, compressor: { threshold: -20, ratio: 3.5, attack: 0.002, release: 0.11 } }
};

const P_ARROW_AIRBORNE = {
  id: "ta_arrow_airborne", duration: 0.48, gain: 0.94,
  layers: [
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.34, reverse: true,
      playbackRate: 1.25, pitchVariation: 0.04,
      filter: { type: "highpass", frequency: 420, q: 0.8 } },
    { type: "sample", asset: "projectileAirborne", role: "air", gain: 0.92, offset: 0.018,
      playbackRate: 1.02, pitchVariation: 0.025, gainVariation: 0.04 },
    { type: "noise", role: "air", color: "white", gain: 0.07, duration: 0.12,
      envelope: [[0, 0.0001], [0.02, 1], [0.25, 0.3], [1, 0.0001]],
      filter: { type: "highpass", frequencyCurve: [[0, 4200], [1, 1200]], q: 0.7 } }
  ],
  effects: { highpass: 70, lowpass: 15500, saturation: 0.018, compressor: { threshold: -18, ratio: 3.5, attack: 0.001, release: 0.1 } }
};

const P_ARROW_HIT = {
  id: "ta_arrow_hit", duration: 0.52, gain: 0.97,
  layers: [
    { type: "sample", asset: "projectileAirborne", role: "air", gain: 0.9, playbackRate: 1.02, pitchVariation: 0.022 },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.98, offset: 0.315,
      playbackRate: 0.95, pitchVariation: 0.045, gainVariation: 0.07 },
    { type: "impactBody", role: "body", gain: 0.13, offset: 0.318,
      frequency: 128, endFrequency: 72, duration: 0.14,
      effects: { filter: { type: "lowpass", frequency: 720, q: 0.8 } } },
    { type: "resonatorBank", role: "resonance", material: "wood", gain: 0.11, offset: 0.318, pitchScale: 1.15, excitationDuration: 0.012 }
  ],
  effects: { highpass: 55, lowpass: 15500, saturation: 0.025, compressor: { threshold: -18, ratio: 4.5, attack: 0.001, release: 0.12 } }
};

const P_HEAL = {
  id: "ta_heal", duration: 0.92, gain: 0.84,
  layers: [
    { type: "noise", role: "air", color: "pink", gain: 0.11, duration: 0.78,
      envelope: [[0, 0.0001], [0.14, 0.28], [0.42, 1], [0.76, 0.45], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 820], [0.45, 4200], [1, 1700]], q: 0.75 } },
    { type: "oscillator", role: "tone", waveform: "sine", gain: 0.095, duration: 0.74, offset: 0.05,
      frequencyCurve: [[0, 286], [0.5, 360], [1, 430]],
      envelope: [[0, 0.0001], [0.18, 0.55], [0.5, 1], [1, 0.0001]] },
    { type: "oscillator", role: "tone", waveform: "sine", gain: 0.055, duration: 0.62, offset: 0.17,
      frequencyCurve: [[0, 572], [1, 860]],
      envelope: [[0, 0.0001], [0.22, 0.42], [0.58, 1], [1, 0.0001]] },
    { type: "resonatorBank", role: "resonance", material: "metal", gain: 0.035, offset: 0.42,
      pitchScale: 1.85, excitationDuration: 0.008 }
  ],
  effects: { highpass: 120, lowpass: 12500, saturation: 0.008, delay: { time: 0.085, feedback: 0.11, mix: 0.08 }, compressor: { threshold: -22, ratio: 2.5, attack: 0.006, release: 0.2 } }
};

const P_UNIT_DEFEATED = {
  id: "ta_unit_defeated", duration: 1.42, gain: 0.92,
  layers: [
    { type: "sample", asset: "attackHit", role: "contact", gain: 0.76,
      playbackRate: 0.68, trimStart: 0.12,
      filter: { type: "lowpass", frequency: 8200, q: 0.7 } },
    { type: "impactBody", role: "body", gain: 0.38, offset: 0.17,
      frequency: 68, endFrequency: 31, duration: 0.56,
      effects: { filter: { type: "lowpass", frequency: 430, q: 0.8 }, saturation: 0.08 } },
    { type: "noise", role: "texture", color: "brown", gain: 0.12, offset: 0.2, duration: 0.72,
      envelope: [[0, 0.0001], [0.06, 1], [0.28, 0.4], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 920], [1, 130]], q: 0.8 } }
  ],
  effects: { highpass: 24, lowpass: 10500, saturation: 0.055, compressor: { threshold: -21, ratio: 5.5, attack: 0.002, release: 0.24 } }
};

const P_TURN_SWITCH = {
  id: "ta_turn_switch", duration: 0.34, gain: 0.78,
  layers: [
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.2,
      playbackRate: 1.3, filter: { type: "bandpass", frequency: 1200, q: 1.1 } },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.24, offset: 0.15,
      playbackRate: 0.98, filter: { type: "bandpass", frequency: 920, q: 1.1 } }
  ],
  effects: { highpass: 120, lowpass: 6500, compressor: { threshold: -20, ratio: 2.8, attack: 0.001, release: 0.08 } }
};

// ---------------------------------------------------------------------------
// Patches: Tactical Arena — new synthesized sounds (no sample files needed)
// ---------------------------------------------------------------------------

// Magician: Spark — electric bolt
const P_SPARK = {
  id: "ta_spark", duration: 0.28, gain: 0.82,
  layers: [
    { type: "noise", color: "white", gain: 0.18, duration: 0.04,
      envelope: [[0, 0.0001], [0.04, 1], [0.35, 0.2], [1, 0.0001]],
      filter: { type: "highpass", frequency: 3000, q: 0.8 } },
    { type: "oscillator", waveform: "sawtooth", gain: 0.22, duration: 0.22,
      frequencyCurve: [[0, 380], [0.15, 560], [0.5, 480], [1, 320]],
      envelope: [[0, 0.0001], [0.03, 1], [0.2, 0.6], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 4200], [0.5, 2800], [1, 1200]], q: 1.2 } },
    { type: "oscillator", waveform: "sine", gain: 0.1, duration: 0.18, offset: 0.02,
      frequencyCurve: [[0, 760], [0.4, 960], [1, 640]],
      envelope: [[0, 0.0001], [0.05, 0.6], [0.5, 0.8], [1, 0.0001]] }
  ],
  effects: { highpass: 180, lowpass: 7500, saturation: 0.04, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.12 } }
};

// Magician: Banish — dark arcane exile
const P_BANISH = {
  id: "ta_banish", duration: 0.6, gain: 0.86,
  layers: [
    { type: "oscillator", waveform: "sawtooth", gain: 0.26, duration: 0.52,
      frequencyCurve: [[0, 0.0001], [0.08, 260], [0.5, 140], [1, 88]],
      envelope: [[0, 0.0001], [0.06, 1], [0.4, 0.7], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 3200], [0.5, 1400], [1, 480]], q: 1.4 } },
    { type: "oscillator", waveform: "sine", gain: 0.14, duration: 0.46, offset: 0.04,
      frequencyCurve: [[0, 520], [0.3, 280], [1, 160]],
      envelope: [[0, 0.0001], [0.1, 0.8], [0.55, 1], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.1, duration: 0.38, offset: 0.06,
      envelope: [[0, 0.0001], [0.15, 1], [0.55, 0.4], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 800], [0.4, 360], [1, 140]], q: 0.9 } }
  ],
  effects: { highpass: 40, lowpass: 5000, saturation: 0.06, delay: { time: 0.13, feedback: 0.22, mix: 0.18 }, compressor: { threshold: -19, ratio: 5, attack: 0.002, release: 0.2 } }
};

// Magician: Nuke — RAGE explosive burst
const P_NUKE = {
  id: "ta_nuke", duration: 0.82, gain: 0.98,
  layers: [
    { type: "impactBody", gain: 0.72, frequency: 52, endFrequency: 24, duration: 0.62,
      effects: { filter: { type: "lowpass", frequency: 580, q: 0.8 }, saturation: 0.14 } },
    { type: "oscillator", waveform: "sawtooth", gain: 0.28, duration: 0.48,
      frequencyCurve: [[0, 340], [0.08, 560], [0.35, 160], [1, 64]],
      envelope: [[0, 0.0001], [0.04, 1], [0.18, 0.7], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 6000], [0.3, 2200], [1, 380]], q: 1.0 } },
    { type: "noise", color: "brown", gain: 0.24, duration: 0.68, offset: 0.04,
      envelope: [[0, 0.0001], [0.04, 1], [0.22, 0.6], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 1800], [0.4, 480], [1, 120]], q: 0.8 } },
    { type: "resonatorBank", material: "stone", gain: 0.14, offset: 0.06, pitchScale: 0.64, excitationDuration: 0.024 }
  ],
  effects: { highpass: 18, lowpass: 10000, saturation: 0.12, compressor: { threshold: -24, ratio: 8, attack: 0.001, release: 0.28 } }
};

// Magician: Flee — teleport vanish
const P_FLEE = {
  id: "ta_flee", duration: 0.26, gain: 0.78,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.24, duration: 0.22,
      frequencyCurve: [[0, 440], [0.3, 680], [0.7, 920], [1, 1200]],
      envelope: [[0, 0.0001], [0.04, 0.9], [0.55, 0.7], [1, 0.0001]] },
    { type: "noise", color: "white", gain: 0.12, duration: 0.14,
      envelope: [[0, 0.0001], [0.05, 1], [0.3, 0.3], [1, 0.0001]],
      filter: { type: "highpass", frequencyCurve: [[0, 1800], [1, 3200]], q: 0.7 } },
    { type: "oscillator", waveform: "triangle", gain: 0.1, duration: 0.18, offset: 0.04,
      frequencyCurve: [[0, 880], [0.4, 1200], [1, 1760]],
      envelope: [[0, 0.0001], [0.08, 0.6], [1, 0.0001]] }
  ],
  effects: { highpass: 320, lowpass: 9500, saturation: 0.018, compressor: { threshold: -18, ratio: 3.5, attack: 0.001, release: 0.1 } }
};

// Swordsman: Footwork — sprint dash
const P_FOOTWORK = {
  id: "ta_footwork", duration: 0.42, gain: 0.86,
  layers: [
    { type: "sample", asset: "miss", role: "air", gain: 0.88, playbackRate: 1.22, pitchVariation: 0.02,
      filter: { type: "highpass", frequency: 55, q: 0.7 } },
    { type: "impactBody", role: "body", gain: 0.16, offset: 0.24,
      frequency: 130, endFrequency: 85, duration: 0.14,
      effects: { filter: { type: "lowpass", frequency: 520, q: 0.8 } } }
  ],
  effects: { highpass: 40, lowpass: 13000, saturation: 0.02, compressor: { threshold: -18, ratio: 3.5, attack: 0.001, release: 0.12 } }
};

// Swordsman: Life Sap — HP drain
const P_LIFE_SAP = {
  id: "ta_life_sap", duration: 0.72, gain: 0.8,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.14, duration: 0.6,
      frequencyCurve: [[0, 180], [0.4, 260], [0.7, 320], [1, 380]],
      envelope: [[0, 0.0001], [0.16, 0.5], [0.5, 1], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.08, duration: 0.52, offset: 0.1,
      frequencyCurve: [[0, 360], [0.5, 520], [1, 640]],
      envelope: [[0, 0.0001], [0.22, 0.5], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.1, duration: 0.54, offset: 0.06,
      envelope: [[0, 0.0001], [0.2, 0.6], [0.55, 1], [0.82, 0.4], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 480], [0.4, 1200], [1, 2800]], q: 0.75 } }
  ],
  effects: { highpass: 100, lowpass: 7500, saturation: 0.008, delay: { time: 0.09, feedback: 0.1, mix: 0.1 }, compressor: { threshold: -22, ratio: 2.5, attack: 0.005, release: 0.2 } }
};

// Archer: Poison Arrow — arrow + venom burst
const P_POISON_ARROW = {
  id: "ta_poison_arrow", duration: 0.58, gain: 0.92,
  layers: [
    { type: "sample", asset: "projectileAirborne", role: "air", gain: 0.82, playbackRate: 1.04 },
    { type: "sample", asset: "arrowHit", role: "contact", gain: 0.88, offset: 0.3, playbackRate: 0.9 },
    { type: "noise", color: "pink", gain: 0.09, duration: 0.24, offset: 0.32,
      envelope: [[0, 0.0001], [0.06, 1], [0.4, 0.45], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 320], [0.4, 820], [1, 420]], q: 0.85 } },
    { type: "impactBody", role: "body", gain: 0.1, offset: 0.31,
      frequency: 110, endFrequency: 64, duration: 0.12,
      effects: { filter: { type: "lowpass", frequency: 620, q: 0.8 } } }
  ],
  effects: { highpass: 48, lowpass: 12000, saturation: 0.02, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.14 } }
};

// Mystic: Pray — area heal, holy and bright
const P_PRAY = {
  id: "ta_pray", duration: 0.88, gain: 0.82,
  layers: [
    { type: "noise", color: "pink", gain: 0.1, duration: 0.76,
      envelope: [[0, 0.0001], [0.2, 0.4], [0.5, 1], [0.82, 0.5], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 600], [0.45, 3200], [1, 1400]], q: 0.72 } },
    { type: "oscillator", waveform: "sine", gain: 0.12, duration: 0.72, offset: 0.04,
      frequencyCurve: [[0, 316], [0.5, 396], [1, 446]],
      envelope: [[0, 0.0001], [0.2, 0.6], [0.55, 1], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.08, duration: 0.62, offset: 0.1,
      frequencyCurve: [[0, 474], [0.5, 594], [1, 669]],
      envelope: [[0, 0.0001], [0.25, 0.5], [0.6, 0.9], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.05, duration: 0.52, offset: 0.18,
      frequencyCurve: [[0, 632], [1, 792]],
      envelope: [[0, 0.0001], [0.3, 0.4], [1, 0.0001]] },
    { type: "resonatorBank", material: "metal", gain: 0.04, offset: 0.46, pitchScale: 1.9, excitationDuration: 0.008 }
  ],
  effects: { highpass: 140, lowpass: 11000, saturation: 0.006, delay: { time: 0.1, feedback: 0.12, mix: 0.09 }, compressor: { threshold: -23, ratio: 2.5, attack: 0.006, release: 0.22 } }
};

// Mystic: Wish — single-target heal, softer
const P_WISH = {
  id: "ta_wish", duration: 0.56, gain: 0.78,
  layers: [
    { type: "noise", color: "pink", gain: 0.08, duration: 0.46,
      envelope: [[0, 0.0001], [0.18, 0.3], [0.48, 1], [0.78, 0.4], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 800], [0.45, 3800], [1, 1800]], q: 0.75 } },
    { type: "oscillator", waveform: "sine", gain: 0.1, duration: 0.48, offset: 0.04,
      frequencyCurve: [[0, 420], [0.5, 540], [1, 620]],
      envelope: [[0, 0.0001], [0.18, 0.55], [0.55, 1], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.06, duration: 0.38, offset: 0.12,
      frequencyCurve: [[0, 840], [1, 1040]],
      envelope: [[0, 0.0001], [0.25, 0.45], [1, 0.0001]] }
  ],
  effects: { highpass: 180, lowpass: 10000, saturation: 0.005, delay: { time: 0.07, feedback: 0.08, mix: 0.07 }, compressor: { threshold: -23, ratio: 2.5, attack: 0.005, release: 0.18 } }
};

// Silence applied (Mystic Silence ART, Mage Killer effect, Banish effect)
const P_SILENCE_APPLIED = {
  id: "ta_silence_applied", duration: 0.32, gain: 0.8,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.2, duration: 0.28,
      frequencyCurve: [[0, 360], [0.15, 280], [0.5, 160], [1, 90]],
      envelope: [[0, 0.0001], [0.025, 1], [0.2, 0.5], [1, 0.0001]] },
    { type: "noise", color: "white", gain: 0.1, duration: 0.08,
      envelope: [[0, 0.0001], [0.03, 1], [0.4, 0.2], [1, 0.0001]],
      filter: { type: "bandpass", frequency: 1200, q: 1.2 } }
  ],
  effects: { highpass: 60, lowpass: 4500, saturation: 0.03, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.14 } }
};

// Poison tick — quiet wet pulse each activation
const P_POISON_TICK = {
  id: "ta_poison_tick", duration: 0.22, gain: 0.62,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.14, duration: 0.18,
      frequencyCurve: [[0, 240], [0.12, 180], [1, 130]],
      envelope: [[0, 0.0001], [0.02, 1], [0.2, 0.45], [1, 0.0001]],
      filter: { type: "lowpass", frequency: 1200, q: 1.4 } },
    { type: "noise", color: "brown", gain: 0.09, duration: 0.14,
      envelope: [[0, 0.0001], [0.03, 1], [0.3, 0.3], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 600], [1, 200]], q: 0.8 } }
  ],
  effects: { highpass: 30, lowpass: 1600, compressor: { threshold: -20, ratio: 3, attack: 0.001, release: 0.1 } }
};

// Blind applied (Moonstrike effect)
const P_BLIND_APPLIED = {
  id: "ta_blind_applied", duration: 0.22, gain: 0.76,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.22, duration: 0.18,
      frequencyCurve: [[0, 680], [0.25, 920], [0.6, 1100], [1, 780]],
      envelope: [[0, 0.0001], [0.03, 1], [0.35, 0.7], [1, 0.0001]] },
    { type: "noise", color: "white", gain: 0.1, duration: 0.07,
      envelope: [[0, 0.0001], [0.02, 1], [0.35, 0.2], [1, 0.0001]],
      filter: { type: "highpass", frequency: 2400, q: 0.8 } }
  ],
  effects: { highpass: 400, lowpass: 8000, compressor: { threshold: -18, ratio: 3.5, attack: 0.001, release: 0.1 } }
};

// Slow applied (Leg Shot effect)
const P_SLOW_APPLIED = {
  id: "ta_slow_applied", duration: 0.44, gain: 0.74,
  layers: [
    { type: "oscillator", waveform: "triangle", gain: 0.2, duration: 0.38,
      frequencyCurve: [[0, 140], [0.4, 100], [1, 72]],
      envelope: [[0, 0.0001], [0.06, 1], [0.45, 0.7], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.1, duration: 0.34,
      envelope: [[0, 0.0001], [0.1, 0.8], [0.5, 0.4], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 480], [1, 120]], q: 0.8 } }
  ],
  effects: { highpass: 28, lowpass: 1800, compressor: { threshold: -19, ratio: 4, attack: 0.002, release: 0.18 } }
};

// Rage triggered (≤5 HP threshold)
const P_RAGE_ACTIVATED = {
  id: "ta_rage_activated", duration: 0.52, gain: 0.94,
  layers: [
    { type: "impactBody", gain: 0.56, frequency: 78, endFrequency: 40, duration: 0.36,
      effects: { filter: { type: "lowpass", frequency: 600, q: 0.8 }, saturation: 0.1 } },
    { type: "oscillator", waveform: "sawtooth", gain: 0.18, duration: 0.2, offset: 0.02,
      frequencyCurve: [[0, 640], [0.2, 900], [0.5, 480], [1, 320]],
      envelope: [[0, 0.0001], [0.03, 1], [0.3, 0.5], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 4200], [1, 1400]], q: 1.2 } },
    { type: "noise", color: "brown", gain: 0.14, duration: 0.22,
      envelope: [[0, 0.0001], [0.04, 1], [0.3, 0.5], [1, 0.0001]],
      filter: { type: "lowpass", frequency: 2400, q: 0.9 } }
  ],
  effects: { highpass: 30, lowpass: 9000, saturation: 0.08, compressor: { threshold: -22, ratio: 6, attack: 0.001, release: 0.22 } }
};

// Match start fanfare
const P_MATCH_START = {
  id: "ta_match_start", duration: 0.62, gain: 0.8,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.2, duration: 0.22,
      frequencyCurve: [[0, 330], [1, 330]],
      envelope: [[0, 0.0001], [0.06, 1], [0.65, 0.8], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.2, duration: 0.26, offset: 0.16,
      frequencyCurve: [[0, 440], [1, 440]],
      envelope: [[0, 0.0001], [0.06, 1], [0.65, 0.8], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.18, duration: 0.3, offset: 0.32,
      frequencyCurve: [[0, 660], [1, 660]],
      envelope: [[0, 0.0001], [0.06, 1], [0.65, 0.7], [1, 0.0001]] },
    { type: "resonatorBank", material: "wood", gain: 0.08, pitchScale: 0.72, excitationDuration: 0.014 }
  ],
  effects: { highpass: 100, lowpass: 9000, delay: { time: 0.09, feedback: 0.1, mix: 0.08 }, compressor: { threshold: -20, ratio: 2.8, attack: 0.002, release: 0.18 } }
};

// Paladin: Lightseeker — radiant divine burst on light tiles
const P_LIGHTSEEKER = {
  id: "ta_lightseeker", duration: 0.66, gain: 0.84,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.22, duration: 0.58,
      frequencyCurve: [[0, 550], [0.3, 660], [0.65, 880], [1, 1100]],
      envelope: [[0, 0.0001], [0.04, 1], [0.45, 0.7], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.14, duration: 0.52, offset: 0.06,
      frequencyCurve: [[0, 825], [0.4, 1100], [1, 1320]],
      envelope: [[0, 0.0001], [0.06, 0.7], [0.5, 0.9], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.08, duration: 0.42, offset: 0.12,
      frequencyCurve: [[0, 1320], [1, 1760]],
      envelope: [[0, 0.0001], [0.1, 0.5], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.065, duration: 0.24, offset: 0.02,
      envelope: [[0, 0.0001], [0.06, 0.8], [0.4, 0.4], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 2400], [0.5, 5500], [1, 3200]], q: 0.7 } },
    { type: "resonatorBank", material: "metal", gain: 0.06, offset: 0.04, pitchScale: 2.2, excitationDuration: 0.006 }
  ],
  effects: { highpass: 280, lowpass: 14000, saturation: 0.004, delay: { time: 0.11, feedback: 0.14, mix: 0.1 }, compressor: { threshold: -22, ratio: 2.5, attack: 0.003, release: 0.2 } }
};

// Paladin: Darkseeker (RAGE) — ominous holy wave on dark tiles
const P_DARKSEEKER = {
  id: "ta_darkseeker", duration: 0.72, gain: 0.9,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.2, duration: 0.62,
      frequencyCurve: [[0, 200], [0.15, 260], [0.5, 140], [1, 90]],
      envelope: [[0, 0.0001], [0.05, 1], [0.35, 0.8], [1, 0.0001]] },
    { type: "oscillator", waveform: "triangle", gain: 0.14, duration: 0.54, offset: 0.04,
      frequencyCurve: [[0, 400], [0.4, 280], [1, 180]],
      envelope: [[0, 0.0001], [0.08, 0.8], [0.5, 0.9], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.09, duration: 0.42, offset: 0.06,
      envelope: [[0, 0.0001], [0.1, 0.9], [0.5, 0.5], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 320], [0.4, 180], [1, 90]], q: 0.9 } },
    { type: "impactBody", gain: 0.16, offset: 0.04, frequency: 72, endFrequency: 38, duration: 0.42,
      effects: { filter: { type: "lowpass", frequency: 480, q: 0.8 } } },
    { type: "resonatorBank", material: "stone", gain: 0.1, offset: 0.06, pitchScale: 0.55, excitationDuration: 0.018 }
  ],
  effects: { highpass: 30, lowpass: 6500, saturation: 0.06, delay: { time: 0.15, feedback: 0.18, mix: 0.14 }, compressor: { threshold: -21, ratio: 5, attack: 0.002, release: 0.22 } }
};

// Paladin: Hand of Life passive — golden aura heal on allies
const P_HAND_OF_LIFE = {
  id: "ta_hand_of_life", duration: 0.78, gain: 0.78,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.16, duration: 0.68,
      frequencyCurve: [[0, 396], [0.35, 500], [0.65, 594], [1, 660]],
      envelope: [[0, 0.0001], [0.14, 0.6], [0.5, 1], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.1, duration: 0.58, offset: 0.08,
      frequencyCurve: [[0, 594], [0.5, 750], [1, 880]],
      envelope: [[0, 0.0001], [0.18, 0.5], [0.6, 0.8], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.06, duration: 0.44, offset: 0.16,
      frequencyCurve: [[0, 990], [1, 1320]],
      envelope: [[0, 0.0001], [0.24, 0.4], [1, 0.0001]] },
    { type: "noise", color: "pink", gain: 0.07, duration: 0.52, offset: 0.1,
      envelope: [[0, 0.0001], [0.18, 0.5], [0.5, 0.9], [0.8, 0.3], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 1000], [0.45, 3800], [1, 1600]], q: 0.72 } },
    { type: "resonatorBank", material: "metal", gain: 0.04, offset: 0.42, pitchScale: 2.0, excitationDuration: 0.007 }
  ],
  effects: { highpass: 160, lowpass: 11500, saturation: 0.005, delay: { time: 0.092, feedback: 0.11, mix: 0.09 }, compressor: { threshold: -23, ratio: 2.5, attack: 0.005, release: 0.2 } }
};

// Sniper: Build Cover — a heavy stone block dropped into place (wood/stone thunk)
const P_BUILD_COVER = {
  id: "ta_build_cover", duration: 0.42, gain: 0.84,
  layers: [
    { type: "impactBody", gain: 0.5, frequency: 96, endFrequency: 52, duration: 0.26,
      effects: { filter: { type: "lowpass", frequency: 500, q: 0.8 }, saturation: 0.05 } },
    { type: "noise", color: "brown", gain: 0.14, duration: 0.22,
      envelope: [[0, 0.0001], [0.03, 1], [0.3, 0.4], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 1400], [1, 300]], q: 0.8 } },
    { type: "resonatorBank", material: "stone", gain: 0.12, offset: 0.02, pitchScale: 0.7, excitationDuration: 0.018 }
  ],
  effects: { highpass: 30, lowpass: 6000, saturation: 0.05, compressor: { threshold: -20, ratio: 4, attack: 0.001, release: 0.16 } }
};

// Sniper: Throw Cigar — the ground catches alight (ignite whoosh + low roar)
const P_THROW_CIGAR = {
  id: "ta_throw_cigar", duration: 0.5, gain: 0.8,
  layers: [
    { type: "noise", color: "white", gain: 0.2, duration: 0.42,
      envelope: [[0, 0.0001], [0.06, 0.5], [0.3, 1], [0.7, 0.5], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 500], [0.3, 2600], [1, 1400]], q: 0.7 } },
    { type: "oscillator", waveform: "sawtooth", gain: 0.1, duration: 0.32, offset: 0.02,
      frequencyCurve: [[0, 120], [0.4, 200], [1, 150]],
      envelope: [[0, 0.0001], [0.05, 0.7], [0.5, 0.5], [1, 0.0001]],
      filter: { type: "lowpass", frequencyCurve: [[0, 1800], [1, 600]], q: 0.9 } },
    { type: "noise", color: "brown", gain: 0.1, duration: 0.3, offset: 0.05,
      envelope: [[0, 0.0001], [0.08, 0.8], [0.5, 0.4], [1, 0.0001]],
      filter: { type: "lowpass", frequency: 900, q: 0.8 } }
  ],
  effects: { highpass: 120, lowpass: 9000, saturation: 0.04, compressor: { threshold: -19, ratio: 3.5, attack: 0.002, release: 0.14 } }
};

// Sniper: a Build Cover wall shattering under fire (crunchy stone debris)
const P_WALL_BREAK = {
  id: "ta_wall_break", duration: 0.58, gain: 0.9,
  layers: [
    { type: "impactBody", gain: 0.4, frequency: 84, endFrequency: 40, duration: 0.3,
      effects: { filter: { type: "lowpass", frequency: 520, q: 0.8 }, saturation: 0.08 } },
    { type: "noise", color: "brown", gain: 0.26, duration: 0.5,
      envelope: [[0, 0.0001], [0.02, 1], [0.22, 0.5], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 1800], [0.4, 700], [1, 220]], q: 0.8 } },
    { type: "noise", color: "white", gain: 0.1, duration: 0.16,
      envelope: [[0, 0.0001], [0.02, 1], [0.4, 0.2], [1, 0.0001]],
      filter: { type: "highpass", frequency: 2600, q: 0.7 } },
    { type: "resonatorBank", material: "stone", gain: 0.14, pitchScale: 0.6, excitationDuration: 0.02 }
  ],
  effects: { highpass: 40, lowpass: 9000, saturation: 0.07, compressor: { threshold: -21, ratio: 5, attack: 0.001, release: 0.2 } }
};

// Fire tile burning a unit at the rollover — a short quiet crackle
const P_FIRE_TICK = {
  id: "ta_fire_tick", duration: 0.3, gain: 0.66,
  layers: [
    { type: "noise", color: "pink", gain: 0.14, duration: 0.26,
      envelope: [[0, 0.0001], [0.04, 1], [0.4, 0.4], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 1200], [0.4, 2400], [1, 900]], q: 0.8 } },
    { type: "noise", color: "white", gain: 0.06, duration: 0.12,
      envelope: [[0, 0.0001], [0.02, 1], [0.5, 0.2], [1, 0.0001]],
      filter: { type: "highpass", frequency: 3000, q: 0.7 } }
  ],
  effects: { highpass: 200, lowpass: 8000, saturation: 0.03, compressor: { threshold: -20, ratio: 3, attack: 0.001, release: 0.1 } }
};

// Sniper: Smoke Bomb — a soft pressurized puff/hiss
const P_SMOKE_BOMB = {
  id: "ta_smoke_bomb", duration: 0.42, gain: 0.74,
  layers: [
    { type: "noise", color: "pink", gain: 0.2, duration: 0.38,
      envelope: [[0, 0.0001], [0.04, 1], [0.35, 0.5], [1, 0.0001]],
      filter: { type: "bandpass", frequencyCurve: [[0, 400], [0.3, 1400], [1, 600]], q: 0.7 } },
    { type: "noise", color: "white", gain: 0.08, duration: 0.1,
      envelope: [[0, 0.0001], [0.02, 1], [0.4, 0.2], [1, 0.0001]],
      filter: { type: "highpass", frequency: 2200, q: 0.7 } }
  ],
  effects: { highpass: 150, lowpass: 6000, saturation: 0.02, compressor: { threshold: -20, ratio: 3, attack: 0.002, release: 0.14 } }
};

// Victory chord
const P_VICTORY = {
  id: "ta_victory", duration: 1.2, gain: 0.88,
  layers: [
    { type: "oscillator", waveform: "sine", gain: 0.22, duration: 0.96,
      frequencyCurve: [[0, 392], [1, 392]],
      envelope: [[0, 0.0001], [0.06, 1], [0.6, 0.9], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.20, duration: 0.96, offset: 0.08,
      frequencyCurve: [[0, 494], [1, 494]],
      envelope: [[0, 0.0001], [0.06, 1], [0.6, 0.9], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.18, duration: 0.96, offset: 0.16,
      frequencyCurve: [[0, 587], [1, 587]],
      envelope: [[0, 0.0001], [0.06, 1], [0.6, 0.9], [1, 0.0001]] },
    { type: "oscillator", waveform: "sine", gain: 0.1, duration: 0.82, offset: 0.24,
      frequencyCurve: [[0, 784], [1, 784]],
      envelope: [[0, 0.0001], [0.08, 0.6], [0.6, 0.5], [1, 0.0001]] }
  ],
  effects: { highpass: 80, lowpass: 8500, delay: { time: 0.16, feedback: 0.18, mix: 0.14 }, compressor: { threshold: -20, ratio: 3, attack: 0.003, release: 0.24 } }
};

// ---------------------------------------------------------------------------
// Catalog: logical key → patch
// ---------------------------------------------------------------------------

export const SOUND_CATALOG = Object.freeze([
  { key: "buttonClick",     patch: P_BUTTON_CLICK },
  { key: "unitSelect",      patch: P_UNIT_SELECT },
  { key: "diceRoll",        patch: P_DICE_ROLL },
  { key: "unitMove",        patch: P_UNIT_MOVE },
  { key: "attackHit",       patch: P_ATTACK_HIT },
  { key: "criticalHit",     patch: P_CRITICAL_HIT },
  { key: "defendedHit",     patch: P_DEFENDED_HIT },
  { key: "defend",          patch: P_DEFEND },
  { key: "miss",            patch: P_MISS },
  { key: "arrowAirborne",   patch: P_ARROW_AIRBORNE },
  { key: "arrowHit",        patch: P_ARROW_HIT },
  { key: "heal",            patch: P_HEAL },
  { key: "unitDefeated",    patch: P_UNIT_DEFEATED },
  { key: "turnSwitch",      patch: P_TURN_SWITCH },
  // Tactical Arena arts
  { key: "spark",           patch: P_SPARK },
  { key: "banish",          patch: P_BANISH },
  { key: "nuke",            patch: P_NUKE },
  { key: "flee",            patch: P_FLEE },
  { key: "footwork",        patch: P_FOOTWORK },
  { key: "lifeSap",         patch: P_LIFE_SAP },
  { key: "poisonArrow",     patch: P_POISON_ARROW },
  { key: "pray",            patch: P_PRAY },
  { key: "wish",            patch: P_WISH },
  { key: "silenceApplied",  patch: P_SILENCE_APPLIED },
  { key: "poisonTick",      patch: P_POISON_TICK },
  { key: "blindApplied",    patch: P_BLIND_APPLIED },
  { key: "slowApplied",     patch: P_SLOW_APPLIED },
  { key: "rageActivated",   patch: P_RAGE_ACTIVATED },
  { key: "matchStart",      patch: P_MATCH_START },
  { key: "victory",         patch: P_VICTORY },
  // Paladin
  { key: "lightseeker",    patch: P_LIGHTSEEKER },
  { key: "darkseeker",     patch: P_DARKSEEKER },
  { key: "handOfLife",     patch: P_HAND_OF_LIFE },
  // Sniper + tile hazards
  { key: "buildCover",     patch: P_BUILD_COVER },
  { key: "throwCigar",     patch: P_THROW_CIGAR },
  { key: "wallBreak",      patch: P_WALL_BREAK },
  { key: "fireTick",       patch: P_FIRE_TICK },
  { key: "smokeBomb",      patch: P_SMOKE_BOMB },
]);
