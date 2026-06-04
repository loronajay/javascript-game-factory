// Compatibility export for older prototype imports.
// New code should load stages through js/stages/stage-registry.js.
import { getInitialStage } from './stages/stage-registry.js';

export const stage = getInitialStage();
