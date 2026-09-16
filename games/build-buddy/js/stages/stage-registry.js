import { pack01Manifest } from './packs/pack-01/pack-01-manifest.js';
import { pack02Manifest } from './packs/pack-02/pack-02-manifest.js';

export const DEFAULT_PACK_ID = 'pack_01';

export const PACKS = [
  pack01Manifest,
  pack02Manifest,
];

const PACKS_BY_ID = Object.fromEntries(PACKS.map((pack) => [pack.id, pack]));
const STAGES_BY_ID = {};
for (const pack of PACKS) {
  for (const stage of pack.stages) {
    // A stage compiled under the wrong pack id would silently replace another
    // pack's stage, so a collision is a registry error, not a last-write-wins.
    if (STAGES_BY_ID[stage.id]) throw new Error(`Duplicate Build Buddy stage id: ${stage.id}`);
    if (stage.packId !== pack.id) throw new Error(`Stage ${stage.id} is registered under ${pack.id} but compiled for ${stage.packId}`);
    STAGES_BY_ID[stage.id] = { ...stage, biome: pack.biome };
  }
}

export function getPackById(packId = DEFAULT_PACK_ID) {
  const pack = PACKS_BY_ID[packId];
  if (!pack) throw new Error(`Unknown Build Buddy stage pack: ${packId}`);
  return pack;
}

export function getStageById(stageId) {
  const stage = STAGES_BY_ID[stageId];
  if (!stage) throw new Error(`Unknown Build Buddy stage: ${stageId}`);
  return structuredClone(stage);
}

export function getStageSequence(packId = DEFAULT_PACK_ID) {
  return getPackById(packId).stages.map((stage) => stage.id);
}

export function getInitialStage(packId = DEFAULT_PACK_ID) {
  return getStageById(getStageSequence(packId)[0]);
}

export function listPacks() {
  return PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    biome: pack.biome,
    stageCount: pack.stageCount,
    registeredStages: pack.stages.length,
  }));
}

export function listStages(packId = DEFAULT_PACK_ID) {
  return getPackById(packId).stages.map((stage) => ({
    id: stage.id,
    packId: stage.packId,
    stageNumber: stage.stageNumber,
    name: stage.name,
    biome: getPackById(packId).biome,
    timerMs: stage.timerMs ?? 0,
    ruleLabel: stage.builderRules?.ruleLabel ?? 'Standard build rules',
  }));
}
