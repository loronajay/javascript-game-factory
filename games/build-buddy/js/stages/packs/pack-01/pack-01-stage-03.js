import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage03 = createTeamworkStage({
  "stageNumber": 3,
  "name": "Scaffold Shuffle",
  "archetype": "limited_platform_climb",
  "rulePreset": "limitedPlatforms",
  "timerMs": 210000,
  "points": [
    [
      800,
      2280,
      "Build left with two platforms"
    ],
    [
      80,
      1800,
      "Recycle the scaffold behind you"
    ],
    [
      800,
      1320,
      "Move the kit to the right"
    ],
    [
      1520,
      840,
      "Bring it back left"
    ],
    [
      800,
      360,
      "Clock out together"
    ]
  ]
});
