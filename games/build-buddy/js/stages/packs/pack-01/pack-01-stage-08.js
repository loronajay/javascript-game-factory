import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage08 = createTeamworkStage({
  "stageNumber": 8,
  "name": "Spring Exchange",
  "archetype": "no_platform_springs",
  "rulePreset": "noPlatforms",
  "timerMs": 210000,
  "points": [
    [
      80,
      1800,
      "Place a high spring near the edge"
    ],
    [
      800,
      1320,
      "Return the spring for another lift"
    ],
    [
      80,
      840,
      "Reuse it and jump at the apex"
    ],
    [
      800,
      360,
      "Clock out together"
    ]
  ]
});
