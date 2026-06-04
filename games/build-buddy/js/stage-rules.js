export const DEFAULT_BUILDER_RULES = Object.freeze({
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
  checkpoint: Object.freeze({
    enabled: true,
    requiredFloorSupport: true,
    canMoveAfterPlaced: false,
    canDeleteAfterPlaced: false,
    canReplaceAfterPlaced: false,
  }),
});

export function resolveBuilderRules(stage) {
  const rules = stage?.builderRules ?? {};
  const enabledTools = {
    ...DEFAULT_BUILDER_RULES.enabledTools,
    ...(rules.enabledTools ?? {}),
  };

  const activeCaps = {
    ...DEFAULT_BUILDER_RULES.activeCaps,
    ...(rules.activeCaps ?? {}),
  };

  const checkpoint = {
    ...DEFAULT_BUILDER_RULES.checkpoint,
    ...(rules.checkpoint ?? {}),
  };

  if (checkpoint.enabled === false) enabledTools.checkpoint = false;

  return {
    ruleLabel: rules.ruleLabel ?? DEFAULT_BUILDER_RULES.ruleLabel,
    totalActiveToolCap: rules.totalActiveToolCap ?? DEFAULT_BUILDER_RULES.totalActiveToolCap,
    enabledTools,
    activeCaps,
    checkpoint,
  };
}

export function isToolEnabled(stage, toolType) {
  const rules = resolveBuilderRules(stage);
  return rules.enabledTools[toolType] !== false;
}

export function activeCapFor(stage, toolType, fallbackCap) {
  const rules = resolveBuilderRules(stage);
  const cap = rules.activeCaps[toolType];
  return Number.isFinite(cap) ? cap : fallbackCap;
}
