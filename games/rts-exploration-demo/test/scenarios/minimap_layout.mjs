import { getMinimapLayout } from '../../src/renderer.js';
import { result } from './helpers.mjs';

const desktop = getMinimapLayout(1280, 720);
const compact = getMinimapLayout(279, 279);

result(
  desktop.size === 184
    && desktop.x0 === 1082
    && compact.size <= 64
    && compact.x0 + compact.size + compact.pad === 279
    && compact.y0 === compact.pad,
  { desktop, compact },
);
