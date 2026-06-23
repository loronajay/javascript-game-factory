import { buildHudMarkup } from '../../src/hud.js';
import { result } from './helpers.mjs';

const markup = buildHudMarkup();
const headerStart = markup.indexOf('<header');
const headerEnd = markup.indexOf('</header>');
const resources = markup.indexOf('hud-resource-strip');
const commands = markup.indexOf('hud-command-bar');

result(
  headerStart >= 0
    && resources > headerStart
    && resources < headerEnd
    && commands > headerEnd,
  { headerStart, headerEnd, resources, commands },
);
