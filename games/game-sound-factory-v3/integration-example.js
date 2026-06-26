import { HybridAudioEngine } from "./src/hybrid-audio-engine.js";
import { SAMPLE_SOURCES } from "./src/sample-manifest.js";
import { MINI_TACTICS_PRESETS } from "./src/hybrid-presets.js";

const audio = new HybridAudioEngine({ sampleSources: SAMPLE_SOURCES });
const sounds = new Map(MINI_TACTICS_PRESETS.map((preset) => [preset.id, preset]));

export async function initializeMiniTacticsAudio() {
  await audio.initialize();
  await audio.preloadSamples();
}

export async function playMiniTacticsSound(id, options = {}) {
  const patch = sounds.get(id);

  if (!patch) {
    console.warn(`[audio] Unknown Mini-Tactics sound: ${id}`);
    return null;
  }

  return audio.play(patch, {
    variation: 0.05,
    roleGains: {
      air: 1,
      contact: 1,
      body: 1,
      resonance: 1,
    },
    ...options,
  });
}

export function setMiniTacticsAudioVolume(volume) {
  audio.setMasterVolume(volume);
}

export function stopMiniTacticsAudio() {
  audio.stopAll();
}

/*
Suggested game hooks:

await playMiniTacticsSound("mt_unit_select");
await playMiniTacticsSound("mt_move_step");
await playMiniTacticsSound("mt_undo_move");
await playMiniTacticsSound("mt_dice_roll");

await playMiniTacticsSound("mt_warrior_miss");
await playMiniTacticsSound("mt_warrior_hit");
await playMiniTacticsSound("mt_warrior_critical");
await playMiniTacticsSound("mt_warrior_defended");

await playMiniTacticsSound("mt_tank_smash");
await playMiniTacticsSound("mt_tank_defended");

await playMiniTacticsSound("mt_ranger_launch");
await playMiniTacticsSound("mt_ranger_miss");
await playMiniTacticsSound("mt_ranger_hit");
await playMiniTacticsSound("mt_ranger_defended");

await playMiniTacticsSound("mt_defend_stance");
await playMiniTacticsSound("mt_medic_heal");
await playMiniTacticsSound("mt_unit_defeated");
await playMiniTacticsSound("mt_turn_switch");
*/
