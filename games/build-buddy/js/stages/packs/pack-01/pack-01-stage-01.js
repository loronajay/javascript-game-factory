import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage01 = createTeamworkStage({
  "stageNumber": 1,
  "name": "First Shift",
  "archetype": "switchback_intro",
  "rulePreset": "standard",
  "timerMs": 180000,
  "points": [
    [
      80,
      1800,
      "Build a step or a high spring"
    ],
    [
      800,
      1320,
      "Turn back left and build up"
    ],
    [
      80,
      840,
      "One more lift to the right"
    ],
    [
      800,
      360,
      "Clock out together"
    ]
  ]
});
