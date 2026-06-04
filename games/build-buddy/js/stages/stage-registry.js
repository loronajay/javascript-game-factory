import { pack01Manifest } from './packs/pack-01/pack-01-manifest.js';

export const DEFAULT_PACK_ID = 'pack_01';

export const PACKS = [
  pack01Manifest,
];

const PACKS_BY_ID = Object.fromEntries(PACKS.map((pack) => [pack.id, pack]));
const STAGES_BY_ID = Object.fromEntries(
  PACKS.flatMap((pack) => pack.stages.map((stage) => [stage.id, stage])),
);

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
    timerMs: stage.timerMs ?? 0,
    ruleLabel: stage.builderRules?.ruleLabel ?? 'Standard build rules',
  }));
}
