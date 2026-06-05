export const pack01Stage01 = {
  id: 'pack_01_stage_01',
  packId: 'pack_01',
  stageNumber: 1,
  name: 'Pack 01 — Stage 01',
  backgroundTheme: { id: 'night-construction' },
  width: 7600,
  height: 2000,
  start: { x: 220, y: 1240 },
  fallbackCheckpoint: { x: 220, y: 1240 },
  deathY: 1840,
  timerMs: 60000,

  // Stage-specific Builder rule layer. Future stages can override these values
  // without changing Builder validation code.
  builderRules: {
    ruleLabel: 'Standard build rules',
    totalActiveToolCap: 20,
    enabledTools: {
      platform: true,
      springYellow: true,
      springGreen: true,
      springBlue: true,
      checkpoint: true,
    },
    activeCaps: {
      platform: 5,
      springYellow: 5,
      springGreen: 5,
      springBlue: 5,
      checkpoint: 1,
    },
    checkpoint: {
      enabled: true,
      requiredFloorSupport: true,
      canMoveAfterPlaced: false,
      canDeleteAfterPlaced: false,
      canReplaceAfterPlaced: false,
    },
  },

  // Example future quirk configurations:
  // builderRules: {
  //   ruleLabel: 'No platforms — one spring of each type',
  //   totalActiveToolCap: 3,
  //   enabledTools: { platform: false },
  //   activeCaps: { springYellow: 1, springGreen: 1, springBlue: 1 },
  // },

  goal: { x: 7240, y: 520, w: 140, h: 200 },

  // v5 principle: the Builder is the missing infrastructure.
  // The authored route intentionally contains hard traversal breaks that the Runner
  // should not be able to clear with movement alone.
  solids: [
    // Gate 0: start / tutorial deck.
    { id: 'start_deck', x: 80, y: 1300, w: 540, h: 80 },

    // Gate 1: impossible horizontal gap. Requires a Builder platform or spring assist.
    { id: 'gap_one_landing', x: 1500, y: 1300, w: 340, h: 80 },

    // Gate 2: short breather into climb section.
    { id: 'climb_approach', x: 2140, y: 1300, w: 300, h: 80 },

    // Gate 3: upper ledge after climb. The climb gets you up, but Builder support is
    // needed to safely bridge onward from the top route.
    { id: 'upper_after_climb', x: 2920, y: 900, w: 300, h: 70 },

    // Gate 4: vertical spring test. This ledge is intentionally too high/far to reach
    // cleanly without spring/platform infrastructure.
    { id: 'spring_height_target', x: 3980, y: 560, w: 360, h: 70 },

    // Gate 5: hazard basin entry and exit. The floor between these decks is lethal.
    { id: 'hazard_basin_entry', x: 4660, y: 980, w: 300, h: 70 },
    { id: 'hazard_basin_exit', x: 5720, y: 980, w: 340, h: 70 },

    // Gate 6: final high goal approach. Requires blue spring or constructed platform route.
    { id: 'final_launch_deck', x: 6340, y: 1160, w: 320, h: 80 },
    { id: 'goal_deck', x: 7140, y: 740, w: 420, h: 80 },

    { id: 'left_guard', x: -80, y: 0, w: 80, h: 2000 },
  ],

  // Authored one-ways are only recovery/readability ledges. They deliberately do not
  // complete any of the required gaps.
  oneWays: [
    { id: 'recovery_ledge_gap_one_low', x: 930, y: 1510, w: 120, h: 18 },
    { id: 'recovery_ledge_climb_low', x: 2550, y: 1180, w: 120, h: 18 },
    { id: 'recovery_ledge_basin_low', x: 5170, y: 1290, w: 120, h: 18 },
  ],

  climbables: [
    {
      id: 'main_climb_wall',
      x: 2500,
      y: 850,
      w: 52,
      h: 470,
      topStand: { id: 'main_climb_top', x: 2460, y: 830, w: 190, h: 24 },
    },
    {
      id: 'basin_exit_climb_wall',
      x: 6090,
      y: 800,
      w: 52,
      h: 380,
      topStand: { id: 'basin_exit_climb_top', x: 6050, y: 780, w: 190, h: 24 },
    },
  ],

  hazards: [
    // Visual/kill floors under required infrastructure gaps.
    { id: 'gap_one_death_pit', x: 660, y: 1710, w: 780, h: 80 },
    { id: 'climb_section_death_pit', x: 1840, y: 1710, w: 260, h: 80 },
    { id: 'spring_section_death_pit', x: 3260, y: 1710, w: 680, h: 80 },

    // Hazard basin requires Builder platforms over the danger area.
    { id: 'hazard_basin_spikes', x: 4980, y: 990, w: 720, h: 70 },

    // Final lower pit punishes missing the final launch/constructed route.
    { id: 'final_pit', x: 6660, y: 1710, w: 420, h: 80 },
  ],

  noBuildZones: [
    // Keep placement off the spawn and the actual goal trigger only.
    { id: 'start_no_build', x: 80, y: 1180, w: 300, h: 210 },
    { id: 'goal_no_build', x: 7240, y: 500, w: 180, h: 260 },
  ],

  blockedPlacementZones: [
    // Do not let the Builder erase the purpose of the climb wall by placing inside it.
    { id: 'main_climb_wall_block', x: 2460, y: 820, w: 140, h: 530 },
    { id: 'basin_exit_climb_wall_block', x: 6050, y: 760, w: 140, h: 450 },

    // Do not allow a tool to sit directly inside the hazard basin's lethal strip.
    // Platforms must bridge above it, not overlap it.
    { id: 'hazard_basin_core_block', x: 4980, y: 960, w: 720, h: 110 },
  ],

  preplacedTools: [],
};
