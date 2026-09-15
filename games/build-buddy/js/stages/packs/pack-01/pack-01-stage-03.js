import { createTeamworkStage, deck, climb, spikes, girder, tool } from './pack-01-stage-helpers.js';

// Two scaffold masts that stop short of the floor. The west mast hangs 420px
// up, so the Runner is launched into it off a blue spring and catches it
// mid-flight. The east mast hangs under a spiked ceiling that would kill that
// same launch, so it needs a platform step and a careful single jump. Then
// three gaps on the way out with only two platforms: place, cross, pull, place.
export const pack01Stage03 = createTeamworkStage({
  stageNumber: 3,
  name: 'Scaffold Shuffle',
  archetype: 'limited_platform_climb',
  rulePreset: 'limitedPlatforms',
  timerMs: 210000,
  route: [
    deck('start', 80, 2000, 480),
    climb('west_mast', 700, 1000, 580, [tool('springBlue', 600, 1960)]),
    deck('transfer', 1000, 1520, 320),
    climb('east_mast', 1800, 500, 560, [tool('platform', 1660, 1280)]),
    deck('bridgehead', 1952, 476, 448),
    deck('first_span', 3340, 476, 400, 64, [tool('platform', 2820, 476)]),
    deck('second_span', 4680, 476, 400, 64, [tool('platform', 4160, 476)]),
    deck('exit', 6020, 276, 480, 64, [tool('platform', 5500, 376)]),
  ],
  extras: [
    ...girder('transfer_girder', 1120, 1000, 640),
    spikes('span_spikes', 3460, 476, 160),
    spikes('bridgehead_spikes', 2200, 476, 80),
  ],
});
