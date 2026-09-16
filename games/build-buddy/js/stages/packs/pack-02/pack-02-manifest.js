import { pack02Stage01 } from './pack-02-stage-01.js';
import { pack02Stage02 } from './pack-02-stage-02.js';
import { pack02Stage03 } from './pack-02-stage-03.js';
import { pack02Stage04 } from './pack-02-stage-04.js';
import { pack02Stage05 } from './pack-02-stage-05.js';
import { pack02Stage06 } from './pack-02-stage-06.js';
import { pack02Stage07 } from './pack-02-stage-07.js';
import { pack02Stage08 } from './pack-02-stage-08.js';
import { pack02Stage09 } from './pack-02-stage-09.js';
import { pack02Stage10 } from './pack-02-stage-10.js';

export const pack02Manifest = {
  id: 'pack_02',
  name: 'Pack 02',
  biome: 'harbor',
  stageCount: 10,
  stages: [
    pack02Stage01,
    pack02Stage02,
    pack02Stage03,
    pack02Stage04,
    pack02Stage05,
    pack02Stage06,
    pack02Stage07,
    pack02Stage08,
    pack02Stage09,
    pack02Stage10,
  ],
};
