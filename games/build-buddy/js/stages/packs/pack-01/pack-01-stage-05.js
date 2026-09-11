import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage05 = createTeamworkStage({
  "stageNumber": 5,
  "name": "Overtime Crossing",
  "archetype": "hazard_basin",
  "rulePreset": "standard",
  "timerMs": 240000,
  "points": [
    [
      80,
      1800,
      "Lift onto the upper works"
    ],
    [
      800,
      1320,
      "Build across the open basin"
    ],
    [
      2480,
      1320,
      "Reverse left and climb"
    ],
    [
      1760,
      840,
      "Keep left to the exit"
    ],
    [
      1040,
      360,
      "Clock out together"
    ]
  ]
});
