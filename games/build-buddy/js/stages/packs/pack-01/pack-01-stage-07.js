import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage07 = createTeamworkStage({
  "stageNumber": 7,
  "name": "Relay Station",
  "archetype": "checkpoint_gauntlet",
  "rulePreset": "limitedPlatforms",
  "timerMs": 240000,
  "points": [
    [
      80,
      2280,
      "Build up to the relay"
    ],
    [
      800,
      1800,
      "A good place for a checkpoint"
    ],
    [
      1520,
      1320,
      "Recycle then head left"
    ],
    [
      800,
      840,
      "Return to the west roof"
    ],
    [
      80,
      360,
      "Clock out together"
    ]
  ]
});
