export const REFERENCE_PRESETS = [
  {
    id: "ref_miss",
    name: "Reference: Miss",
    bank: "Reference Files",
    category: "Reference",
    description: "Raw weapon-swoosh reference supplied for the Mini-Tactics target.",
    duration: 0.74,
    gain: 0.95,
    layers: [
      { type: "sample", asset: "miss", role: "reference", gain: 1 }
    ],
    effects: { compressor: false }
  },
  {
    id: "ref_attack_hit",
    name: "Reference: Attack Hit",
    bank: "Reference Files",
    category: "Reference",
    description: "Raw attack movement and physical impact reference.",
    duration: 1.0,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "attackHit", role: "reference", gain: 1 }
    ],
    effects: { compressor: false }
  },
  {
    id: "ref_defended_hit",
    name: "Reference: Defended Hit",
    bank: "Reference Files",
    category: "Reference",
    description: "Raw bright armored or shielded contact reference.",
    duration: 0.82,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "defendedHit", role: "reference", gain: 1 }
    ],
    effects: { compressor: false }
  },
  {
    id: "ref_projectile_airborne",
    name: "Reference: Projectile Air",
    bank: "Reference Files",
    category: "Reference",
    description: "Raw projectile flyby and displaced-air reference.",
    duration: 0.42,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "projectileAirborne", role: "reference", gain: 1 }
    ],
    effects: { compressor: false }
  },
  {
    id: "ref_arrow_hit",
    name: "Reference: Arrow Hit",
    bank: "Reference Files",
    category: "Reference",
    description: "Raw compact projectile-contact transient.",
    duration: 0.06,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "arrowHit", role: "reference", gain: 1 }
    ],
    effects: { compressor: false }
  }
];

export const MINI_TACTICS_PRESETS = [
  {
    id: "mt_warrior_miss",
    name: "Warrior Miss",
    bank: "Mini-Tactics Hybrid",
    category: "Warrior",
    description: "Natural blade movement with procedural air variation and no contact.",
    duration: 0.75,
    gain: 0.94,
    layers: [
      {
        type: "sample", asset: "miss", role: "air", gain: 0.98,
        pitchVariation: 0.025, gainVariation: 0.045, timeVariation: 0.002,
        filter: { type: "highpass", frequency: 70, q: 0.7 }
      },
      {
        type: "noise", role: "air", color: "pink", gain: 0.055, duration: 0.45, offset: 0.015,
        envelope: [[0, 0.0001], [0.11, 0.46], [0.24, 1], [0.58, 0.24], [1, 0.0001]],
        filter: { type: "bandpass", frequencyCurve: [[0, 850], [0.2, 3100], [1, 620]], q: 0.8 },
        pitchVariation: 0.08
      }
    ],
    effects: { highpass: 45, lowpass: 14500, saturation: 0.025, compressor: { threshold: -20, ratio: 3.5, attack: 0.002, release: 0.11 } }
  },
  {
    id: "mt_warrior_hit",
    name: "Warrior Hit",
    bank: "Mini-Tactics Hybrid",
    category: "Warrior",
    description: "Weapon movement, compact contact snap, body response, and short material decay.",
    duration: 1.02,
    gain: 0.97,
    layers: [
      {
        type: "sample", asset: "attackHit", role: "air", gain: 0.94,
        pitchVariation: 0.018, gainVariation: 0.035,
        filter: { type: "highpass", frequency: 38, q: 0.7 }
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.31, offset: 0.19,
        playbackRate: 0.9, pitchVariation: 0.045, gainVariation: 0.08,
        filter: { type: "highpass", frequency: 220, q: 0.7 }
      },
      {
        type: "impactBody", role: "body", gain: 0.25, offset: 0.192,
        frequency: 92, endFrequency: 46, duration: 0.31,
        effects: { filter: { type: "lowpass", frequency: 520, q: 0.8 }, saturation: 0.05 }
      },
      {
        type: "resonatorBank", role: "resonance", material: "body", gain: 0.16, offset: 0.195,
        excitationDuration: 0.018
      }
    ],
    effects: { highpass: 32, lowpass: 15000, saturation: 0.045, compressor: { threshold: -18, ratio: 4.5, attack: 0.0015, release: 0.16 } }
  },
  {
    id: "mt_warrior_critical",
    name: "Warrior Critical",
    bank: "Mini-Tactics Hybrid",
    category: "Warrior",
    description: "Heavier normal hit with stronger body, fracture texture, and a longer material tail.",
    duration: 1.08,
    gain: 1.0,
    layers: [
      {
        type: "sample", asset: "attackHit", role: "air", gain: 0.98,
        playbackRate: 0.94, pitchVariation: 0.014
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.48, offset: 0.205,
        playbackRate: 0.74, pitchVariation: 0.035,
        filter: { type: "highpass", frequency: 140, q: 0.8 }
      },
      {
        type: "impactBody", role: "body", gain: 0.5, offset: 0.205,
        modes: [
          { frequency: 78, endFrequency: 36, gain: 1, decay: 0.48, waveform: "sine" },
          { frequency: 156, endFrequency: 72, gain: 0.28, decay: 0.24, waveform: "triangle" }
        ],
        effects: { filter: { type: "lowpass", frequency: 620, q: 0.75 }, saturation: 0.09 }
      },
      {
        type: "noise", role: "contact", color: "brown", gain: 0.18, offset: 0.21, duration: 0.19,
        envelope: [[0, 0.0001], [0.015, 1], [0.26, 0.44], [1, 0.0001]],
        filter: { type: "bandpass", frequencyCurve: [[0, 820], [1, 210]], q: 1.1 }
      },
      {
        type: "resonatorBank", role: "resonance", material: "armor", gain: 0.16, offset: 0.208,
        pitchScale: 0.72, excitationDuration: 0.02
      }
    ],
    effects: { highpass: 28, lowpass: 15000, saturation: 0.075, compressor: { threshold: -20, ratio: 6, attack: 0.001, release: 0.19 } }
  },
  {
    id: "mt_warrior_defended",
    name: "Warrior Defended",
    bank: "Mini-Tactics Hybrid",
    category: "Warrior",
    description: "Blade motion ending in bright shield or armor contact.",
    duration: 0.9,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "miss", role: "air", gain: 0.56, playbackRate: 1.05, trimEnd: 0.22 },
      {
        type: "sample", asset: "defendedHit", role: "contact", gain: 0.94, offset: 0.12,
        playbackRate: 0.98, pitchVariation: 0.02,
        filter: { type: "highpass", frequency: 260, q: 0.8 }
      },
      {
        type: "impactBody", role: "body", gain: 0.08, offset: 0.13,
        frequency: 116, endFrequency: 72, duration: 0.16,
        effects: { filter: { type: "lowpass", frequency: 460, q: 0.8 } }
      },
      {
        type: "resonatorBank", role: "resonance", material: "metal", gain: 0.25, offset: 0.132,
        excitationDuration: 0.014, pitchVariation: 0.025
      }
    ],
    effects: { highpass: 65, lowpass: 17500, saturation: 0.025, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.18 } }
  },
  {
    id: "mt_tank_smash",
    name: "Tank Smash",
    bank: "Mini-Tactics Hybrid",
    category: "Tank",
    description: "Slower attack reference with a much heavier low body and rigid material response.",
    duration: 1.35,
    gain: 0.99,
    layers: [
      {
        type: "sample", asset: "attackHit", role: "air", gain: 0.93,
        playbackRate: 0.79, pitchVariation: 0.012,
        filter: { type: "lowpass", frequency: 10500, q: 0.7 }
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.4, offset: 0.245,
        playbackRate: 0.62, filter: { type: "lowpass", frequency: 5200, q: 0.8 }
      },
      {
        type: "impactBody", role: "body", gain: 0.66, offset: 0.245,
        modes: [
          { frequency: 62, endFrequency: 29, gain: 1, decay: 0.62, waveform: "sine" },
          { frequency: 118, endFrequency: 51, gain: 0.34, decay: 0.35, waveform: "triangle" }
        ],
        effects: { filter: { type: "lowpass", frequency: 480, q: 0.8 }, saturation: 0.12 }
      },
      {
        type: "noise", role: "body", color: "brown", gain: 0.2, offset: 0.25, duration: 0.42,
        envelope: [[0, 0.0001], [0.02, 1], [0.2, 0.52], [1, 0.0001]],
        filter: { type: "lowpass", frequencyCurve: [[0, 1200], [1, 160]], q: 0.8 }
      },
      {
        type: "resonatorBank", role: "resonance", material: "stone", gain: 0.24, offset: 0.25,
        pitchScale: 0.74
      }
    ],
    effects: { highpass: 24, lowpass: 12500, saturation: 0.095, compressor: { threshold: -22, ratio: 7, attack: 0.001, release: 0.23 } }
  },
  {
    id: "mt_tank_defended",
    name: "Tank Defended",
    bank: "Mini-Tactics Hybrid",
    category: "Tank",
    description: "Heavy blocked attack with low armor body and a restrained metallic tail.",
    duration: 1.02,
    gain: 0.98,
    layers: [
      { type: "sample", asset: "defendedHit", role: "contact", gain: 0.9, playbackRate: 0.82 },
      {
        type: "impactBody", role: "body", gain: 0.35, offset: 0.045,
        frequency: 72, endFrequency: 38, duration: 0.38,
        effects: { filter: { type: "lowpass", frequency: 520, q: 0.8 }, saturation: 0.08 }
      },
      {
        type: "resonatorBank", role: "resonance", material: "armor", gain: 0.32, offset: 0.05,
        pitchScale: 0.78
      }
    ],
    effects: { highpass: 30, lowpass: 15000, saturation: 0.05, compressor: { threshold: -20, ratio: 6, attack: 0.001, release: 0.2 } }
  },
  {
    id: "mt_ranger_launch",
    name: "Ranger Launch",
    bank: "Mini-Tactics Hybrid",
    category: "Ranger",
    description: "Compact bow or projectile launch feeding into real airborne movement.",
    duration: 0.48,
    gain: 0.94,
    layers: [
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.34, reverse: true,
        playbackRate: 1.25, pitchVariation: 0.04,
        filter: { type: "highpass", frequency: 420, q: 0.8 }
      },
      {
        type: "sample", asset: "projectileAirborne", role: "air", gain: 0.92, offset: 0.018,
        playbackRate: 1.02, pitchVariation: 0.025, gainVariation: 0.04
      },
      {
        type: "noise", role: "air", color: "white", gain: 0.07, duration: 0.12,
        envelope: [[0, 0.0001], [0.02, 1], [0.25, 0.3], [1, 0.0001]],
        filter: { type: "highpass", frequencyCurve: [[0, 4200], [1, 1200]], q: 0.7 }
      }
    ],
    effects: { highpass: 70, lowpass: 15500, saturation: 0.018, compressor: { threshold: -18, ratio: 3.5, attack: 0.001, release: 0.1 } }
  },
  {
    id: "mt_ranger_miss",
    name: "Ranger Miss",
    bank: "Mini-Tactics Hybrid",
    category: "Ranger",
    description: "Projectile passes the target without a contact layer.",
    duration: 0.5,
    gain: 0.93,
    layers: [
      {
        type: "sample", asset: "projectileAirborne", role: "air", gain: 0.98,
        playbackRate: 0.96, pitchVariation: 0.035, gainVariation: 0.05
      },
      {
        type: "noise", role: "air", color: "pink", gain: 0.045, offset: 0.09, duration: 0.29,
        envelope: [[0, 0.0001], [0.23, 1], [0.58, 0.32], [1, 0.0001]],
        filter: { type: "bandpass", frequencyCurve: [[0, 900], [0.4, 2400], [1, 620]], q: 0.85 }
      }
    ],
    effects: { highpass: 60, lowpass: 14000, compressor: { threshold: -19, ratio: 3, attack: 0.002, release: 0.11 } }
  },
  {
    id: "mt_ranger_hit",
    name: "Ranger Hit",
    bank: "Mini-Tactics Hybrid",
    category: "Ranger",
    description: "Airborne projectile followed by a compact, readable target impact.",
    duration: 0.52,
    gain: 0.97,
    layers: [
      {
        type: "sample", asset: "projectileAirborne", role: "air", gain: 0.9,
        playbackRate: 1.02, pitchVariation: 0.022
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.98, offset: 0.315,
        playbackRate: 0.95, pitchVariation: 0.045, gainVariation: 0.07
      },
      {
        type: "impactBody", role: "body", gain: 0.13, offset: 0.318,
        frequency: 128, endFrequency: 72, duration: 0.14,
        effects: { filter: { type: "lowpass", frequency: 720, q: 0.8 } }
      },
      {
        type: "resonatorBank", role: "resonance", material: "wood", gain: 0.11, offset: 0.318,
        pitchScale: 1.15, excitationDuration: 0.012
      }
    ],
    effects: { highpass: 55, lowpass: 15500, saturation: 0.025, compressor: { threshold: -18, ratio: 4.5, attack: 0.001, release: 0.12 } }
  },
  {
    id: "mt_ranger_defended",
    name: "Ranger Defended",
    bank: "Mini-Tactics Hybrid",
    category: "Ranger",
    description: "Projectile flight terminating in a bright armor deflection.",
    duration: 0.92,
    gain: 0.96,
    layers: [
      { type: "sample", asset: "projectileAirborne", role: "air", gain: 0.78, playbackRate: 1.08 },
      {
        type: "sample", asset: "defendedHit", role: "contact", gain: 0.82, offset: 0.31,
        playbackRate: 1.16, trimEnd: 0.24,
        filter: { type: "highpass", frequency: 420, q: 0.8 }
      },
      {
        type: "resonatorBank", role: "resonance", material: "metal", gain: 0.16, offset: 0.322,
        pitchScale: 1.22, excitationDuration: 0.01
      }
    ],
    effects: { highpass: 80, lowpass: 18000, saturation: 0.018, compressor: { threshold: -18, ratio: 4, attack: 0.001, release: 0.15 } }
  },
  {
    id: "mt_dice_roll",
    name: "Dice Roll",
    bank: "Mini-Tactics Hybrid",
    category: "Board",
    description: "Physical tabletop roll assembled from randomized compact impacts.",
    duration: 0.56,
    gain: 0.92,
    layers: [
      { type: "sample", asset: "arrowHit", role: "contact", gain: 0.22, offset: 0.00, playbackRate: 1.95, pitchVariation: 0.1, timeVariation: 0.006, filter: { type: "bandpass", frequency: 2400, q: 1.5 } },
      { type: "sample", asset: "arrowHit", role: "contact", gain: 0.25, offset: 0.075, playbackRate: 1.65, pitchVariation: 0.1, timeVariation: 0.008, filter: { type: "bandpass", frequency: 1900, q: 1.4 } },
      { type: "sample", asset: "arrowHit", role: "contact", gain: 0.27, offset: 0.15, playbackRate: 1.42, pitchVariation: 0.1, timeVariation: 0.008, filter: { type: "bandpass", frequency: 1500, q: 1.35 } },
      { type: "sample", asset: "arrowHit", role: "contact", gain: 0.3, offset: 0.235, playbackRate: 1.18, pitchVariation: 0.09, timeVariation: 0.01, filter: { type: "bandpass", frequency: 1180, q: 1.3 } },
      { type: "sample", asset: "arrowHit", role: "contact", gain: 0.38, offset: 0.36, playbackRate: 0.92, pitchVariation: 0.07, timeVariation: 0.006, filter: { type: "bandpass", frequency: 920, q: 1.2 } }
    ],
    effects: { highpass: 120, lowpass: 9500, saturation: 0.025, compressor: { threshold: -20, ratio: 3.5, attack: 0.001, release: 0.09 } }
  },
  {
    id: "mt_unit_select",
    name: "Unit Select",
    bank: "Mini-Tactics Hybrid",
    category: "Board",
    description: "Quiet tactile selection click without a retro pitch chirp.",
    duration: 0.1,
    gain: 0.78,
    layers: [
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.23,
        playbackRate: 1.75, trimEnd: 0.018,
        filter: [
          { type: "highpass", frequency: 650, q: 0.7 },
          { type: "lowpass", frequency: 6200, q: 0.7 }
        ]
      },
      {
        type: "resonatorBank", role: "resonance", material: "wood", gain: 0.055, offset: 0.002,
        pitchScale: 1.45, excitationDuration: 0.008
      }
    ],
    effects: { highpass: 220, lowpass: 9000, compressor: { threshold: -18, ratio: 2.5, attack: 0.001, release: 0.06 } }
  },
  {
    id: "mt_move_step",
    name: "Move Step",
    bank: "Mini-Tactics Hybrid",
    category: "Board",
    description: "Subtle board-piece placement with mild material variation.",
    duration: 0.13,
    gain: 0.79,
    layers: [
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.28,
        playbackRate: 0.72, pitchVariation: 0.055, gainVariation: 0.07,
        filter: { type: "lowpass", frequency: 2100, q: 0.8 }
      },
      {
        type: "impactBody", role: "body", gain: 0.06, offset: 0.006,
        frequency: 150, endFrequency: 105, duration: 0.07,
        effects: { filter: { type: "lowpass", frequency: 430, q: 0.8 } }
      }
    ],
    effects: { highpass: 65, lowpass: 4200, compressor: { threshold: -20, ratio: 2.8, attack: 0.001, release: 0.07 } }
  },
  {
    id: "mt_undo_move",
    name: "Undo Move",
    bank: "Mini-Tactics Hybrid",
    category: "Board",
    description: "Reverse tactile cue for restoring a unit to its prior tile.",
    duration: 0.2,
    gain: 0.8,
    layers: [
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.2, reverse: true,
        playbackRate: 0.78,
        filter: { type: "lowpass", frequency: 2800, q: 0.7 }
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.2, offset: 0.085,
        playbackRate: 0.95,
        filter: { type: "lowpass", frequency: 3400, q: 0.7 }
      }
    ],
    effects: { highpass: 80, lowpass: 5200, compressor: { threshold: -20, ratio: 2.8, attack: 0.001, release: 0.07 } }
  },
  {
    id: "mt_defend_stance",
    name: "Defend Stance",
    bank: "Mini-Tactics Hybrid",
    category: "Status",
    description: "Restrained armor-ready cue rather than an arcade shield sound.",
    duration: 0.52,
    gain: 0.86,
    layers: [
      {
        type: "sample", asset: "defendedHit", role: "contact", gain: 0.31,
        playbackRate: 0.82, trimEnd: 0.35,
        filter: { type: "highpass", frequency: 240, q: 0.8 }
      },
      {
        type: "impactBody", role: "body", gain: 0.12, offset: 0.015,
        frequency: 98, endFrequency: 65, duration: 0.22,
        effects: { filter: { type: "lowpass", frequency: 480, q: 0.8 } }
      },
      {
        type: "resonatorBank", role: "resonance", material: "armor", gain: 0.15, offset: 0.02,
        pitchScale: 0.86
      }
    ],
    effects: { highpass: 45, lowpass: 12000, saturation: 0.02, compressor: { threshold: -19, ratio: 3.5, attack: 0.001, release: 0.16 } }
  },
  {
    id: "mt_medic_heal",
    name: "Medic Heal",
    bank: "Mini-Tactics Hybrid",
    category: "Medic",
    description: "Soft modern restorative texture with air and restrained tonal movement.",
    duration: 0.92,
    gain: 0.84,
    layers: [
      {
        type: "noise", role: "air", color: "pink", gain: 0.11, duration: 0.78,
        envelope: [[0, 0.0001], [0.14, 0.28], [0.42, 1], [0.76, 0.45], [1, 0.0001]],
        filter: { type: "bandpass", frequencyCurve: [[0, 820], [0.45, 4200], [1, 1700]], q: 0.75 }
      },
      {
        type: "oscillator", role: "tone", waveform: "sine", gain: 0.095, duration: 0.74, offset: 0.05,
        frequencyCurve: [[0, 286], [0.5, 360], [1, 430]],
        envelope: [[0, 0.0001], [0.18, 0.55], [0.5, 1], [1, 0.0001]]
      },
      {
        type: "oscillator", role: "tone", waveform: "sine", gain: 0.055, duration: 0.62, offset: 0.17,
        frequencyCurve: [[0, 572], [1, 860]],
        envelope: [[0, 0.0001], [0.22, 0.42], [0.58, 1], [1, 0.0001]]
      },
      {
        type: "resonatorBank", role: "resonance", material: "metal", gain: 0.035, offset: 0.42,
        pitchScale: 1.85, excitationDuration: 0.008
      }
    ],
    effects: { highpass: 120, lowpass: 12500, saturation: 0.008, delay: { time: 0.085, feedback: 0.11, mix: 0.08 }, compressor: { threshold: -22, ratio: 2.5, attack: 0.006, release: 0.2 } }
  },
  {
    id: "mt_unit_defeated",
    name: "Unit Defeated",
    bank: "Mini-Tactics Hybrid",
    category: "Status",
    description: "Physical collapse using the attack texture at lower speed and weight.",
    duration: 1.42,
    gain: 0.92,
    layers: [
      {
        type: "sample", asset: "attackHit", role: "contact", gain: 0.76,
        playbackRate: 0.68, trimStart: 0.12,
        filter: { type: "lowpass", frequency: 8200, q: 0.7 }
      },
      {
        type: "impactBody", role: "body", gain: 0.38, offset: 0.17,
        frequency: 68, endFrequency: 31, duration: 0.56,
        effects: { filter: { type: "lowpass", frequency: 430, q: 0.8 }, saturation: 0.08 }
      },
      {
        type: "noise", role: "texture", color: "brown", gain: 0.12, offset: 0.2, duration: 0.72,
        envelope: [[0, 0.0001], [0.06, 1], [0.28, 0.4], [1, 0.0001]],
        filter: { type: "lowpass", frequencyCurve: [[0, 920], [1, 130]], q: 0.8 }
      }
    ],
    effects: { highpass: 24, lowpass: 10500, saturation: 0.055, compressor: { threshold: -21, ratio: 5.5, attack: 0.002, release: 0.24 } }
  },
  {
    id: "mt_turn_switch",
    name: "Turn Switch",
    bank: "Mini-Tactics Hybrid",
    category: "Board",
    description: "Two understated tactile handoff clicks.",
    duration: 0.34,
    gain: 0.78,
    layers: [
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.2,
        playbackRate: 1.3, filter: { type: "bandpass", frequency: 1200, q: 1.1 }
      },
      {
        type: "sample", asset: "arrowHit", role: "contact", gain: 0.24, offset: 0.15,
        playbackRate: 0.98, filter: { type: "bandpass", frequency: 920, q: 1.1 }
      }
    ],
    effects: { highpass: 120, lowpass: 6500, compressor: { threshold: -20, ratio: 2.8, attack: 0.001, release: 0.08 } }
  }
];

export const ALL_HYBRID_PRESETS = [...MINI_TACTICS_PRESETS, ...REFERENCE_PRESETS];
