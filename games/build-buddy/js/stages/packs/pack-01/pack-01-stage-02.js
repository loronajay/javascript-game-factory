import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage02 = createTeamworkStage({
  "stageNumber": 2,
  "name": "Across the Yard",
  "archetype": "bridge_chain",
  "rulePreset": "standard",
  "timerMs": 210000,
  "points": [
    [
      80,
      1800,
      "Bridge the missing span"
    ],
    [
      1760,
      1800,
      "Turn left and gain height"
    ],
    [
      1040,
      1320,
      "Keep climbing left"
    ],
    [
      320,
      840,
      "Turn right for the roof"
    ],
    [
      1040,
      360,
      "Clock out together"
    ]
  ]
});
