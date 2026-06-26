const RETRO_SOURCE_PRESETS = [
  {
    id: "unit_select",
    name: "Unit Select",
    category: "Mini-Tactics",
    description: "Clean tactical selection chirp.",
    duration: 0.13,
    gain: 0.62,
    voices: [
      { type: "sine", frequency: 520, endFrequency: 760, gain: 0.34, duration: 0.11, envelope: { attack: 0.003, decay: 0.04, sustain: 0.28, release: 0.04 } },
      { type: "triangle", frequency: 1040, endFrequency: 1330, gain: 0.12, duration: 0.08, offset: 0.025, envelope: { attack: 0.002, decay: 0.025, sustain: 0.2, release: 0.03 } }
    ],
    effects: { filter: { type: "lowpass", frequency: 5200, q: 0.8 } }
  },
  {
    id: "move_step",
    name: "Move Step",
    category: "Mini-Tactics",
    description: "Short board-piece movement tick.",
    duration: 0.11,
    gain: 0.64,
    noise: [
      { color: "brown", gain: 0.42, duration: 0.075, filter: { type: "bandpass", frequency: 760, endFrequency: 430, q: 1.4 }, envelope: { attack: 0.002, decay: 0.03, sustain: 0.18, release: 0.025 } }
    ],
    voices: [
      { type: "triangle", frequency: 145, endFrequency: 92, gain: 0.27, duration: 0.09, envelope: { attack: 0.002, decay: 0.035, sustain: 0.16, release: 0.025 } }
    ],
    effects: { distortion: 0.08 }
  },
  {
    id: "move_cancel",
    name: "Undo Move",
    category: "Mini-Tactics",
    description: "Reverse cue for cancelling an unspent move.",
    duration: 0.2,
    gain: 0.62,
    voices: [
      { type: "triangle", frequency: 330, endFrequency: 710, gain: 0.3, duration: 0.16, envelope: { attack: 0.004, decay: 0.06, sustain: 0.3, release: 0.05 } },
      { type: "sine", frequency: 220, endFrequency: 420, gain: 0.16, duration: 0.13, offset: 0.035, envelope: { attack: 0.003, decay: 0.04, sustain: 0.24, release: 0.04 } }
    ]
  },
  {
    id: "dice_roll",
    name: "Dice Roll",
    category: "Mini-Tactics",
    description: "Clustered impacts for the attack roll.",
    duration: 0.46,
    gain: 0.72,
    noise: [
      { color: "white", gain: 0.25, duration: 0.055, offset: 0.00, filter: { type: "bandpass", frequency: 1800, q: 2.8 }, envelope: { attack: 0.001, decay: 0.018, sustain: 0.08, release: 0.02 } },
      { color: "white", gain: 0.24, duration: 0.052, offset: 0.08, filter: { type: "bandpass", frequency: 1440, q: 2.7 }, envelope: { attack: 0.001, decay: 0.018, sustain: 0.08, release: 0.02 } },
      { color: "white", gain: 0.23, duration: 0.05, offset: 0.155, filter: { type: "bandpass", frequency: 1200, q: 2.6 }, envelope: { attack: 0.001, decay: 0.016, sustain: 0.07, release: 0.018 } },
      { color: "white", gain: 0.22, duration: 0.048, offset: 0.225, filter: { type: "bandpass", frequency: 980, q: 2.5 }, envelope: { attack: 0.001, decay: 0.016, sustain: 0.07, release: 0.018 } },
      { color: "white", gain: 0.3, duration: 0.075, offset: 0.315, filter: { type: "bandpass", frequency: 760, q: 2.2 }, envelope: { attack: 0.001, decay: 0.024, sustain: 0.1, release: 0.025 } }
    ],
    voices: [
      { type: "triangle", frequency: 190, endFrequency: 125, gain: 0.13, duration: 0.06, offset: 0.315, envelope: { attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.02 } }
    ]
  },
  {
    id: "warrior_attack",
    name: "Warrior Slash",
    category: "Mini-Tactics",
    description: "Fast blade sweep and contact snap.",
    duration: 0.34,
    gain: 0.8,
    noise: [
      { color: "white", gain: 0.35, duration: 0.19, filter: { type: "highpass", frequency: 900, endFrequency: 4200, q: 0.6 }, envelope: { attack: 0.008, decay: 0.07, sustain: 0.22, release: 0.07 } },
      { color: "white", gain: 0.26, duration: 0.055, offset: 0.18, filter: { type: "bandpass", frequency: 2100, q: 2.4 }, envelope: { attack: 0.001, decay: 0.018, sustain: 0.08, release: 0.02 } }
    ],
    voices: [
      { type: "sawtooth", frequency: 220, endFrequency: 92, gain: 0.13, duration: 0.16, offset: 0.12, envelope: { attack: 0.002, decay: 0.045, sustain: 0.2, release: 0.05 }, filter: { type: "lowpass", frequency: 1200, endFrequency: 420, q: 0.8 } }
    ],
    effects: { distortion: 0.12 }
  },
  {
    id: "tank_attack",
    name: "Tank Smash",
    category: "Mini-Tactics",
    description: "Heavy armor impact with low-frequency body.",
    duration: 0.5,
    gain: 0.9,
    voices: [
      { type: "sine", frequency: 92, endFrequency: 42, gain: 0.55, duration: 0.42, envelope: { attack: 0.002, decay: 0.1, sustain: 0.28, release: 0.16 } },
      { type: "square", frequency: 155, endFrequency: 72, gain: 0.16, duration: 0.23, envelope: { attack: 0.001, decay: 0.06, sustain: 0.16, release: 0.08 }, filter: { type: "lowpass", frequency: 720, endFrequency: 280, q: 0.9 } }
    ],
    noise: [
      { color: "brown", gain: 0.52, duration: 0.38, filter: { type: "lowpass", frequency: 980, endFrequency: 260, q: 0.8 }, envelope: { attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.14 } },
      { color: "white", gain: 0.18, duration: 0.055, filter: { type: "bandpass", frequency: 2400, q: 2.2 }, envelope: { attack: 0.001, decay: 0.02, sustain: 0.06, release: 0.018 } }
    ],
    effects: { distortion: 0.32 }
  },
  {
    id: "ranger_shot",
    name: "Ranger Shot",
    category: "Mini-Tactics",
    description: "Sharp projectile launch with distant snap.",
    duration: 0.38,
    gain: 0.75,
    noise: [
      { color: "white", gain: 0.38, duration: 0.055, filter: { type: "bandpass", frequency: 2900, endFrequency: 1450, q: 2.1 }, envelope: { attack: 0.001, decay: 0.018, sustain: 0.08, release: 0.018 } },
      { color: "white", gain: 0.12, duration: 0.09, offset: 0.2, filter: { type: "bandpass", frequency: 1800, q: 1.8 }, envelope: { attack: 0.001, decay: 0.03, sustain: 0.08, release: 0.03 } }
    ],
    voices: [
      { type: "triangle", frequency: 380, endFrequency: 110, gain: 0.22, duration: 0.16, envelope: { attack: 0.001, decay: 0.045, sustain: 0.13, release: 0.05 } }
    ],
    effects: { delay: { time: 0.095, feedback: 0.14, mix: 0.12 }, distortion: 0.09 }
  },
  {
    id: "medic_attack",
    name: "Medic Attack",
    category: "Mini-Tactics",
    description: "Small clinical energy pulse.",
    duration: 0.25,
    gain: 0.64,
    voices: [
      { type: "square", frequency: 720, endFrequency: 360, gain: 0.18, duration: 0.19, envelope: { attack: 0.002, decay: 0.055, sustain: 0.24, release: 0.055 }, filter: { type: "lowpass", frequency: 2300, endFrequency: 960, q: 1.2 } },
      { type: "sine", frequency: 1180, endFrequency: 590, gain: 0.13, duration: 0.13, offset: 0.025, envelope: { attack: 0.002, decay: 0.035, sustain: 0.18, release: 0.04 } }
    ]
  },
  {
    id: "defend",
    name: "Defend",
    category: "Mini-Tactics",
    description: "Shield-up cue with a restrained metallic ring.",
    duration: 0.42,
    gain: 0.72,
    voices: [
      { type: "triangle", frequency: 230, endFrequency: 165, gain: 0.3, duration: 0.24, envelope: { attack: 0.004, decay: 0.075, sustain: 0.28, release: 0.08 } },
      { type: "sine", frequency: 980, endFrequency: 740, gain: 0.14, duration: 0.31, offset: 0.035, envelope: { attack: 0.003, decay: 0.09, sustain: 0.2, release: 0.1 } }
    ],
    noise: [
      { color: "white", gain: 0.12, duration: 0.06, filter: { type: "bandpass", frequency: 2600, q: 3.2 }, envelope: { attack: 0.001, decay: 0.02, sustain: 0.07, release: 0.02 } }
    ],
    effects: { delay: { time: 0.07, feedback: 0.12, mix: 0.08 } }
  },
  {
    id: "heal",
    name: "Medic Heal",
    category: "Mini-Tactics",
    description: "Ascending restorative pulse.",
    duration: 0.7,
    gain: 0.68,
    voices: [
      { type: "sine", frequency: 390, endFrequency: 620, gain: 0.22, duration: 0.52, envelope: { attack: 0.025, decay: 0.12, sustain: 0.52, release: 0.18 } },
      { type: "sine", frequency: 585, endFrequency: 930, gain: 0.16, duration: 0.48, offset: 0.07, envelope: { attack: 0.02, decay: 0.1, sustain: 0.42, release: 0.18 } },
      { type: "triangle", frequency: 780, endFrequency: 1240, gain: 0.09, duration: 0.38, offset: 0.18, envelope: { attack: 0.015, decay: 0.08, sustain: 0.34, release: 0.14 } }
    ],
    effects: { delay: { time: 0.12, feedback: 0.24, mix: 0.2 }, filter: { type: "lowpass", frequency: 4800, q: 0.7 } }
  },
  {
    id: "miss",
    name: "Attack Miss",
    category: "Mini-Tactics",
    description: "Airy failure sweep.",
    duration: 0.3,
    gain: 0.62,
    noise: [
      { color: "white", gain: 0.34, duration: 0.23, filter: { type: "bandpass", frequency: 2600, endFrequency: 620, q: 0.8 }, envelope: { attack: 0.006, decay: 0.07, sustain: 0.18, release: 0.08 } }
    ],
    voices: [
      { type: "sine", frequency: 310, endFrequency: 180, gain: 0.09, duration: 0.22, envelope: { attack: 0.006, decay: 0.06, sustain: 0.14, release: 0.07 } }
    ]
  },
  {
    id: "critical_hit",
    name: "Critical Hit",
    category: "Mini-Tactics",
    description: "High-impact confirmation for rolling a six.",
    duration: 0.68,
    gain: 0.92,
    voices: [
      { type: "square", frequency: 180, endFrequency: 82, gain: 0.31, duration: 0.27, envelope: { attack: 0.001, decay: 0.075, sustain: 0.18, release: 0.1 }, filter: { type: "lowpass", frequency: 1400, endFrequency: 420, q: 1 } },
      { type: "sine", frequency: 660, endFrequency: 990, gain: 0.16, duration: 0.28, offset: 0.15, envelope: { attack: 0.003, decay: 0.07, sustain: 0.24, release: 0.09 } },
      { type: "sine", frequency: 990, endFrequency: 1320, gain: 0.12, duration: 0.32, offset: 0.21, envelope: { attack: 0.003, decay: 0.08, sustain: 0.24, release: 0.1 } }
    ],
    noise: [
      { color: "white", gain: 0.42, duration: 0.09, filter: { type: "bandpass", frequency: 1700, q: 1.7 }, envelope: { attack: 0.001, decay: 0.025, sustain: 0.06, release: 0.03 } }
    ],
    effects: { distortion: 0.24, delay: { time: 0.11, feedback: 0.2, mix: 0.13 } }
  },
  {
    id: "damage",
    name: "Take Damage",
    category: "Mini-Tactics",
    description: "Compact hit response.",
    duration: 0.28,
    gain: 0.78,
    noise: [
      { color: "brown", gain: 0.42, duration: 0.21, filter: { type: "lowpass", frequency: 1500, endFrequency: 320, q: 0.8 }, envelope: { attack: 0.001, decay: 0.055, sustain: 0.16, release: 0.075 } }
    ],
    voices: [
      { type: "sawtooth", frequency: 170, endFrequency: 74, gain: 0.2, duration: 0.21, envelope: { attack: 0.001, decay: 0.05, sustain: 0.14, release: 0.075 }, filter: { type: "lowpass", frequency: 860, endFrequency: 250, q: 0.7 } }
    ],
    effects: { distortion: 0.23 }
  },
  {
    id: "unit_defeated",
    name: "Unit Defeated",
    category: "Mini-Tactics",
    description: "Falling tonal cue with a final impact.",
    duration: 0.78,
    gain: 0.8,
    voices: [
      { type: "triangle", frequency: 410, endFrequency: 105, gain: 0.27, duration: 0.62, envelope: { attack: 0.004, decay: 0.14, sustain: 0.35, release: 0.2 } },
      { type: "sine", frequency: 205, endFrequency: 62, gain: 0.2, duration: 0.52, offset: 0.08, envelope: { attack: 0.004, decay: 0.12, sustain: 0.3, release: 0.18 } }
    ],
    noise: [
      { color: "brown", gain: 0.38, duration: 0.18, offset: 0.48, filter: { type: "lowpass", frequency: 820, endFrequency: 220, q: 0.7 }, envelope: { attack: 0.001, decay: 0.05, sustain: 0.12, release: 0.07 } }
    ],
    effects: { distortion: 0.12 }
  },
  {
    id: "turn_switch",
    name: "Turn Switch",
    category: "Mini-Tactics",
    description: "Neutral handoff cue between players.",
    duration: 0.54,
    gain: 0.66,
    voices: [
      { type: "sine", frequency: 330, endFrequency: 440, gain: 0.2, duration: 0.24, envelope: { attack: 0.004, decay: 0.06, sustain: 0.3, release: 0.08 } },
      { type: "sine", frequency: 440, endFrequency: 660, gain: 0.18, duration: 0.26, offset: 0.18, envelope: { attack: 0.004, decay: 0.065, sustain: 0.28, release: 0.09 } }
    ],
    effects: { delay: { time: 0.075, feedback: 0.12, mix: 0.09 } }
  },
  {
    id: "victory",
    name: "Victory",
    category: "Mini-Tactics",
    description: "Short tactical win fanfare.",
    duration: 1.3,
    gain: 0.76,
    voices: [
      { type: "triangle", frequency: 392, gain: 0.18, duration: 0.25, offset: 0.00, envelope: { attack: 0.004, decay: 0.06, sustain: 0.42, release: 0.08 } },
      { type: "triangle", frequency: 523.25, gain: 0.18, duration: 0.25, offset: 0.22, envelope: { attack: 0.004, decay: 0.06, sustain: 0.42, release: 0.08 } },
      { type: "triangle", frequency: 659.25, gain: 0.18, duration: 0.25, offset: 0.44, envelope: { attack: 0.004, decay: 0.06, sustain: 0.42, release: 0.08 } },
      { type: "sine", frequency: 783.99, gain: 0.24, duration: 0.55, offset: 0.66, envelope: { attack: 0.006, decay: 0.12, sustain: 0.42, release: 0.22 } },
      { type: "sine", frequency: 392, gain: 0.11, duration: 0.55, offset: 0.66, envelope: { attack: 0.006, decay: 0.12, sustain: 0.35, release: 0.22 } }
    ],
    effects: { delay: { time: 0.14, feedback: 0.24, mix: 0.18 } }
  },
  {
    id: "defeat",
    name: "Defeat",
    category: "Mini-Tactics",
    description: "Short descending loss cue.",
    duration: 1.15,
    gain: 0.72,
    voices: [
      { type: "triangle", frequency: 392, gain: 0.18, duration: 0.28, offset: 0, envelope: { attack: 0.004, decay: 0.07, sustain: 0.32, release: 0.1 } },
      { type: "triangle", frequency: 311.13, gain: 0.18, duration: 0.3, offset: 0.24, envelope: { attack: 0.004, decay: 0.075, sustain: 0.3, release: 0.11 } },
      { type: "sine", frequency: 233.08, endFrequency: 174.61, gain: 0.22, duration: 0.55, offset: 0.5, envelope: { attack: 0.006, decay: 0.12, sustain: 0.34, release: 0.2 } }
    ]
  },
  {
    id: "ui_click",
    name: "UI Click",
    category: "General",
    description: "Minimal menu click.",
    duration: 0.08,
    gain: 0.55,
    voices: [
      { type: "square", frequency: 720, endFrequency: 560, gain: 0.14, duration: 0.055, envelope: { attack: 0.001, decay: 0.016, sustain: 0.08, release: 0.018 }, filter: { type: "lowpass", frequency: 2600, q: 0.7 } }
    ]
  },
  {
    id: "pickup",
    name: "Pickup",
    category: "General",
    description: "Classic ascending collection sound.",
    duration: 0.34,
    gain: 0.64,
    voices: [
      { type: "square", frequency: 440, endFrequency: 880, gain: 0.16, duration: 0.24, envelope: { attack: 0.002, decay: 0.045, sustain: 0.28, release: 0.07 }, filter: { type: "lowpass", frequency: 2900, q: 0.8 } },
      { type: "sine", frequency: 660, endFrequency: 1320, gain: 0.11, duration: 0.18, offset: 0.065, envelope: { attack: 0.002, decay: 0.04, sustain: 0.22, release: 0.055 } }
    ]
  },
  {
    id: "laser",
    name: "Laser",
    category: "Sci-Fi",
    description: "Descending arcade energy shot.",
    duration: 0.38,
    gain: 0.72,
    voices: [
      { type: "sawtooth", frequency: 1300, endFrequency: 105, gain: 0.22, duration: 0.31, envelope: { attack: 0.002, decay: 0.07, sustain: 0.22, release: 0.1 }, filter: { type: "lowpass", frequency: 4800, endFrequency: 720, q: 2.2 } },
      { type: "square", frequency: 650, endFrequency: 82, gain: 0.1, duration: 0.29, offset: 0.015, envelope: { attack: 0.001, decay: 0.06, sustain: 0.18, release: 0.1 }, filter: { type: "lowpass", frequency: 2500, endFrequency: 520, q: 1.2 } }
    ],
    effects: { distortion: 0.18, delay: { time: 0.055, feedback: 0.16, mix: 0.1 } }
  },
  {
    id: "explosion",
    name: "Explosion",
    category: "General",
    description: "Layered procedural blast.",
    duration: 0.9,
    gain: 0.92,
    voices: [
      { type: "sine", frequency: 110, endFrequency: 31, gain: 0.58, duration: 0.78, envelope: { attack: 0.001, decay: 0.17, sustain: 0.24, release: 0.28 } },
      { type: "sawtooth", frequency: 150, endFrequency: 40, gain: 0.13, duration: 0.42, envelope: { attack: 0.001, decay: 0.09, sustain: 0.16, release: 0.16 }, filter: { type: "lowpass", frequency: 820, endFrequency: 220, q: 0.7 } }
    ],
    noise: [
      { color: "brown", gain: 0.72, duration: 0.82, filter: { type: "lowpass", frequency: 1900, endFrequency: 180, q: 0.8 }, envelope: { attack: 0.001, decay: 0.16, sustain: 0.22, release: 0.3 } },
      { color: "white", gain: 0.28, duration: 0.13, filter: { type: "highpass", frequency: 1600, endFrequency: 3900, q: 0.7 }, envelope: { attack: 0.001, decay: 0.038, sustain: 0.08, release: 0.045 } }
    ],
    effects: { distortion: 0.46 }
  },
  {
    id: "alarm",
    name: "Alarm",
    category: "General",
    description: "Two-tone warning pulse.",
    duration: 0.82,
    gain: 0.62,
    voices: [
      { type: "square", frequency: 720, gain: 0.15, duration: 0.25, offset: 0, envelope: { attack: 0.008, decay: 0.04, sustain: 0.78, release: 0.04 }, filter: { type: "lowpass", frequency: 2700, q: 0.8 } },
      { type: "square", frequency: 540, gain: 0.15, duration: 0.25, offset: 0.27, envelope: { attack: 0.008, decay: 0.04, sustain: 0.78, release: 0.04 }, filter: { type: "lowpass", frequency: 2700, q: 0.8 } },
      { type: "square", frequency: 720, gain: 0.15, duration: 0.25, offset: 0.54, envelope: { attack: 0.008, decay: 0.04, sustain: 0.78, release: 0.04 }, filter: { type: "lowpass", frequency: 2700, q: 0.8 } }
    ]
  },
  {
    id: "fart_short",
    name: "Fart: Short",
    category: "Biological Nonsense",
    description: "Brief low-pressure raspberry.",
    duration: 0.48,
    gain: 0.82,
    voices: [
      { type: "sawtooth", frequency: 105, endFrequency: 58, gain: 0.34, duration: 0.39, envelope: { attack: 0.012, decay: 0.09, sustain: 0.44, release: 0.13 }, filter: { type: "lowpass", frequency: 520, endFrequency: 260, q: 4.8 } },
      { type: "square", frequency: 52, endFrequency: 43, gain: 0.12, duration: 0.33, offset: 0.03, envelope: { attack: 0.01, decay: 0.08, sustain: 0.35, release: 0.12 }, filter: { type: "lowpass", frequency: 230, q: 2.8 } }
    ],
    noise: [
      { color: "brown", gain: 0.26, duration: 0.4, filter: { type: "bandpass", frequency: 260, endFrequency: 140, q: 3.4 }, envelope: { attack: 0.009, decay: 0.09, sustain: 0.38, release: 0.13 } }
    ],
    effects: { distortion: 0.36 }
  },
  {
    id: "fart_wet",
    name: "Fart: Wet",
    category: "Biological Nonsense",
    description: "Unnecessarily detailed sputtering failure.",
    duration: 1.15,
    gain: 0.9,
    voices: [
      { type: "sawtooth", frequency: 82, endFrequency: 47, gain: 0.35, duration: 0.86, envelope: { attack: 0.018, decay: 0.12, sustain: 0.56, release: 0.24 }, filter: { type: "lowpass", frequency: 430, endFrequency: 190, q: 5.6 } },
      { type: "square", frequency: 41, endFrequency: 34, gain: 0.11, duration: 0.74, offset: 0.08, envelope: { attack: 0.02, decay: 0.13, sustain: 0.46, release: 0.22 }, filter: { type: "lowpass", frequency: 190, q: 3 } }
    ],
    noise: [
      { color: "brown", gain: 0.28, duration: 0.18, offset: 0.02, filter: { type: "bandpass", frequency: 230, q: 5.4 }, envelope: { attack: 0.005, decay: 0.05, sustain: 0.32, release: 0.06 } },
      { color: "brown", gain: 0.3, duration: 0.16, offset: 0.24, filter: { type: "bandpass", frequency: 190, q: 5.8 }, envelope: { attack: 0.004, decay: 0.045, sustain: 0.34, release: 0.055 } },
      { color: "brown", gain: 0.32, duration: 0.2, offset: 0.46, filter: { type: "bandpass", frequency: 165, q: 6.1 }, envelope: { attack: 0.004, decay: 0.06, sustain: 0.36, release: 0.07 } },
      { color: "pink", gain: 0.18, duration: 0.22, offset: 0.7, filter: { type: "lowpass", frequency: 620, endFrequency: 170, q: 2.2 }, envelope: { attack: 0.004, decay: 0.07, sustain: 0.2, release: 0.08 } }
    ],
    effects: { distortion: 0.5 }
  },
  {
    id: "fart_royal",
    name: "Fart: Royal",
    category: "Biological Nonsense",
    description: "Ceremonial brass-adjacent catastrophe.",
    duration: 1.45,
    gain: 0.86,
    voices: [
      { type: "custom", harmonics: [1, 0.55, 0.32, 0.18, 0.1], frequency: 76, endFrequency: 49, gain: 0.34, duration: 1.12, envelope: { attack: 0.03, decay: 0.16, sustain: 0.58, release: 0.34 }, filter: { type: "lowpass", frequency: 680, endFrequency: 270, q: 6.2 } },
      { type: "sine", frequency: 152, endFrequency: 98, gain: 0.11, duration: 0.86, offset: 0.08, envelope: { attack: 0.03, decay: 0.14, sustain: 0.4, release: 0.28 } }
    ],
    noise: [
      { color: "brown", gain: 0.23, duration: 0.9, filter: { type: "bandpass", frequency: 210, endFrequency: 120, q: 4.2 }, envelope: { attack: 0.025, decay: 0.14, sustain: 0.48, release: 0.28 } }
    ],
    effects: { distortion: 0.34, delay: { time: 0.095, feedback: 0.18, mix: 0.11 } }
  }
];

function cloneRetroPreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}


export const RETRO_PRESETS = RETRO_SOURCE_PRESETS.map((preset) => ({
  ...cloneRetroPreset(preset),
  id: `retro_${preset.id}`,
  name: `${preset.name} [Retro]`,
  bank: "Retro / Arcade",
  category: preset.category === "Mini-Tactics" ? "Mini-Tactics Retro" : preset.category,
  description: `${preset.description} Preserved from the oscillator-first proof of concept.`,
}));
