import { pack01Stage01 } from './pack-01-stage-01.js';
import { pack01StageStubs } from './pack-01-stage-stubs.js';

export const pack01Manifest = {
  id: 'pack_01',
  name: 'Pack 01',
  stageCount: 10,
  stages: [
    pack01Stage01,
    ...pack01StageStubs,
  ],
};
