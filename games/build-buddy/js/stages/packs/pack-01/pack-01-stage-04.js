import { createTeamworkStage } from './pack-01-stage-helpers.js';

export const pack01Stage04 = createTeamworkStage({
  "stageNumber": 4,
  "name": "Springwell",
  "archetype": "spring_tower",
  "rulePreset": "springFocus",
  "timerMs": 180000,
  "points": [
    [
      80,
      2280,
      "High spring then air jump"
    ],
    [
      800,
      1800,
      "Brake before the landing"
    ],
    [
      80,
      1320,
      "Launch back to the right"
    ],
    [
      800,
      840,
      "Last launch goes left"
    ],
    [
      80,
      360,
      "Clock out together"
    ]
  ]
});
