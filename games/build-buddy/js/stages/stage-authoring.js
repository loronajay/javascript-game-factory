const DEFAULT_PACK_ID = 'pack_01';
const DEFAULT_STAGE_HEIGHT = 2000;
const DEFAULT_BASE_Y = 1300;

export const BUILDER_RULE_PRESETS = Object.freeze({
  standard: Object.freeze({
    ruleId: 'standard',
    ruleLabel: 'Standard build rules',
    totalActiveToolCap: 20,
    enabledTools: Object.freeze({
      platform: true,
      springYellow: true,
      springGreen: true,
      springBlue: true,
      checkpoint: true,
    }),
    activeCaps: Object.freeze({
      platform: 5,
      springYellow: 5,
      springGreen: 5,
      springBlue: 5,
      checkpoint: 1,
    }),
  }),
  limitedPlatforms: Object.freeze({
    ruleId: 'limited_platforms',
    ruleLabel: 'Limited platform route',
    totalActiveToolCap: 14,
    activeCaps: Object.freeze({
      platform: 2,
      springYellow: 5,
      springGreen: 5,
      springBlue: 5,
      checkpoint: 1,
    }),
  }),
  springFocus: Object.freeze({
    ruleId: 'spring_focus',
    ruleLabel: 'Spring route baseline',
    totalActiveToolCap: 16,
    activeCaps: Object.freeze({
      platform: 2,
      springYellow: 7,
      springGreen: 7,
      springBlue: 7,
      checkpoint: 1,
    }),
  }),
  noBlueSpring: Object.freeze({
    ruleId: 'no_blue_spring',
    ruleLabel: 'No blue spring',
    totalActiveToolCap: 18,
    enabledTools: Object.freeze({
      springBlue: false,
    }),
    activeCaps: Object.freeze({
      platform: 5,
      springYellow: 6,
      springGreen: 6,
      springBlue: 0,
      checkpoint: 1,
    }),
  }),
  noPlatforms: Object.freeze({
    ruleId: 'no_platforms_one_spring_each',
    ruleLabel: 'No platforms - one spring of each type',
    totalActiveToolCap: 4,
    enabledTools: Object.freeze({
      platform: false,
    }),
    activeCaps: Object.freeze({
      platform: 0,
      springYellow: 1,
      springGreen: 1,
      springBlue: 1,
      checkpoint: 1,
    }),
  }),
});

function clone(value) {
  return structuredClone(value);
}

function idSuffix(stageNumber) {
  return String(stageNumber).padStart(2, '0');
}

function stageId(packId, stageNumber) {
  return `${packId}_stage_${idSuffix(stageNumber)}`;
}

function prefixedId(stageNumber, id) {
  return `stage_${idSuffix(stageNumber)}_${id}`;
}

function compileBuilderRules(rulePreset = 'standard', overrides = {}) {
  const standard = BUILDER_RULE_PRESETS.standard;
  const preset = BUILDER_RULE_PRESETS[rulePreset] ?? standard;
  const merged = {
    ...clone(standard),
    ...clone(preset),
    ...clone(overrides),
  };

  return {
    ...merged,
    enabledTools: {
      ...clone(standard.enabledTools),
      ...clone(preset.enabledTools ?? {}),
      ...clone(overrides.enabledTools ?? {}),
    },
    activeCaps: {
      ...clone(standard.activeCaps),
      ...clone(preset.activeCaps ?? {}),
      ...clone(overrides.activeCaps ?? {}),
    },
    checkpoint: {
      enabled: true,
      requiredFloorSupport: true,
      canMoveAfterPlaced: false,
      canDeleteAfterPlaced: false,
      canReplaceAfterPlaced: false,
      ...clone(overrides.checkpoint ?? {}),
    },
  };
}

function compileRouteBeat(stageNumber, beat) {
  const id = prefixedId(stageNumber, beat.id);
  if (beat.kind === 'climbable') {
    const x = beat.x ?? 0;
    const y = beat.y ?? 0;
    const w = beat.w ?? 52;
    const h = beat.h ?? 360;
    return {
      kind: 'climbables',
      value: {
        id,
        x,
        y,
        w,
        h,
        topStand: beat.topStand ?? {
          id: prefixedId(stageNumber, `${beat.id}_top`),
          x: x - 40,
          y: y - 24,
          w: 190,
          h: 24,
        },
      },
    };
  }

  const value = {
    id,
    x: beat.x ?? 0,
    y: beat.y ?? DEFAULT_BASE_Y,
    w: beat.w ?? 160,
    h: beat.h ?? 40,
  };

  if (beat.kind === 'oneWay') return { kind: 'oneWays', value };
  if (beat.kind === 'hazard') return { kind: 'hazards', value };
  if (beat.kind === 'noBuild') return { kind: 'noBuildZones', value };
  if (beat.kind === 'blocked') return { kind: 'blockedPlacementZones', value };
  return { kind: 'solids', value };
}

export function compileStageBlueprint(blueprint) {
  const packId = blueprint.packId ?? DEFAULT_PACK_ID;
  const stageNumber = blueprint.stageNumber;
  const suffix = idSuffix(stageNumber);
  const width = blueprint.width ?? 4200 + stageNumber * 260;
  const height = blueprint.height ?? DEFAULT_STAGE_HEIGHT;
  const baseY = blueprint.baseY ?? DEFAULT_BASE_Y;
  const goal = blueprint.goal ?? { x: width - 380, y: baseY - 460, w: 140, h: 200 };
  const start = blueprint.start ?? { x: 220, y: baseY - 60 };
  const route = Array.isArray(blueprint.route) ? blueprint.route : [];
  const compiled = {
    solids: [],
    oneWays: [],
    climbables: [],
    hazards: [],
    noBuildZones: [],
    blockedPlacementZones: [],
  };

  route.map((beat) => compileRouteBeat(stageNumber, beat)).forEach(({ kind, value }) => {
    compiled[kind].push(value);
  });

  compiled.solids.push({ id: `stage_${suffix}_left_guard`, x: -80, y: 0, w: 80, h: height });
  compiled.noBuildZones.push(
    { id: `stage_${suffix}_start_no_build`, x: start.x - 140, y: start.y - 120, w: 300, h: 210 },
    { id: `stage_${suffix}_goal_no_build`, x: goal.x, y: goal.y - 20, w: 180, h: 260 },
  );

  return {
    id: stageId(packId, stageNumber),
    packId,
    stageNumber,
    archetype: blueprint.archetype ?? 'baseline',
    name: blueprint.name ?? `Pack ${packId.split('_').at(-1)} - Stage ${suffix}`,
    backgroundTheme: { id: blueprint.theme ?? (stageNumber % 2 === 0 ? 'sunset-construction' : 'night-construction') },
    width,
    height,
    start,
    fallbackCheckpoint: blueprint.fallbackCheckpoint ?? start,
    deathY: blueprint.deathY ?? 1840,
    timerMs: blueprint.timerMs ?? Math.max(120000, 240000 - (stageNumber - 1) * 7000),
    builderRules: compileBuilderRules(blueprint.rulePreset, blueprint.builderRules),
    goal,
    solids: compiled.solids,
    oneWays: compiled.oneWays,
    climbables: compiled.climbables,
    hazards: compiled.hazards,
    noBuildZones: compiled.noBuildZones,
    blockedPlacementZones: compiled.blockedPlacementZones,
    preplacedTools: clone(blueprint.preplacedTools ?? []),
  };
}

export function createPackStageCatalog({ packId = DEFAULT_PACK_ID, stages }) {
  return stages
    .map((blueprint) => compileStageBlueprint({ ...blueprint, packId }))
    .sort((a, b) => a.stageNumber - b.stageNumber);
}
