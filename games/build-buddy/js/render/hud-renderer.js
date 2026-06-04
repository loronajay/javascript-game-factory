import { TOOL_DEFS, VIEW } from '../constants.js';
import { formatMs } from '../utils.js';
import { resolveBuilderRules } from '../stage-rules.js';
import { panel, roundRect } from './render-utils.js';
import { VIEW_MODES, viewModeConfig } from '../view-modes.js';

const TOOL_ORDER = ['platform', 'springYellow', 'springGreen', 'springBlue', 'checkpoint'];

export class HudRenderer {
  constructor(stage, registry, runner, builder) {
    this.stage = stage;
    this.registry = registry;
    this.runner = runner;
    this.builder = builder;
  }

  draw(ctx, game, { viewMode = VIEW_MODES.HYBRID } = {}) {
    const cfg = viewModeConfig(viewMode);
    this.drawTopBar(ctx, game, viewMode);
    if (cfg.showToolStrip) this.drawToolStrip(ctx);
    this.drawMessage(ctx);
    if (game.cleared) this.drawClearCard(ctx);
  }

  drawTopBar(ctx, game, viewMode) {
    const compact = viewMode === VIEW_MODES.RUNNER;
    const x = VIEW.width - (compact ? 322 : 390);
    const y = 14;
    const w = compact ? 308 : 376;
    const h = compact ? 122 : 150;
    panel(ctx, x, y, w, h);

    ctx.fillStyle = '#eef3ff';
    ctx.font = '800 13px system-ui';
    ctx.fillText(`BUILD BUDDY // ${viewMode.toUpperCase()}`, x + 16, y + 24);

    ctx.fillStyle = '#f6fbff';
    ctx.font = '900 28px system-ui';
    ctx.fillText(formatMs(game.timeRemainingMs), x + 16, y + 60);

    ctx.font = '13px system-ui';
    ctx.fillStyle = '#cbd6ee';
    ctx.fillText(`Stage ${this.stage.id}`, x + 16, y + 84);
    ctx.fillText(`Deaths ${this.runner.deaths}   Repositions ${this.runner.repositions}`, x + 16, y + 106);

    if (!compact) {
      const rules = resolveBuilderRules(this.stage);
      ctx.fillText(`Selected ${TOOL_DEFS[this.builder.selectedTool].label}`, x + 16, y + 126);
      ctx.fillStyle = '#aebad4';
      ctx.fillText(`Tools ${this.registry.countTotalNonCheckpoint()}/${rules.totalActiveToolCap}`, x + 16, y + 144);
      ctx.fillText(rules.ruleLabel, x + 126, y + 144);
    }
  }

  drawToolStrip(ctx) {
    const rules = resolveBuilderRules(this.stage);
    const panelW = 620;
    const x = VIEW.width / 2 - panelW / 2;
    const y = VIEW.height - 70;
    panel(ctx, x, y, panelW, 56);

    TOOL_ORDER.forEach((key, i) => {
      const def = TOOL_DEFS[key];
      const bx = x + 12 + i * 120;
      const enabled = rules.enabledTools[key] !== false;
      const selected = this.builder.selectedTool === key;
      const cap = rules.activeCaps[key] ?? def.maxActive;

      ctx.save();
      ctx.globalAlpha = enabled ? 1 : 0.42;
      ctx.fillStyle = selected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.045)';
      ctx.strokeStyle = selected ? 'rgba(226,241,255,0.36)' : 'rgba(190,212,255,0.12)';
      ctx.lineWidth = 1;
      roundRect(ctx, bx, y + 8, 108, 34, 10, true, true);

      this.drawToolChip(ctx, key, bx + 8, y + 13, enabled ? def.color : '#747f92');
      ctx.fillStyle = '#eef3ff';
      ctx.font = '800 10px system-ui';
      ctx.fillText(this.toolLabel(key, i + 1, enabled), bx + 31, y + 23);
      ctx.fillStyle = '#aebad4';
      ctx.font = '10px system-ui';
      ctx.fillText(enabled ? `cap ${cap}` : 'locked', bx + 31, y + 35);
      ctx.restore();
    });
  }

  drawToolChip(ctx, key, x, y, color) {
    if (key === 'platform') {
      ctx.fillStyle = color;
      roundRect(ctx, x, y + 7, 18, 9, 4, true, false);
      return;
    }
    if (key === 'checkpoint') {
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 2, 3, 17);
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 3);
      ctx.lineTo(x + 18, y + 8);
      ctx.lineTo(x + 9, y + 13);
      ctx.closePath();
      ctx.fill();
      return;
    }

    ctx.fillStyle = color;
    roundRect(ctx, x, y, 18, 8, 4, true, false);
    ctx.strokeStyle = 'rgba(240,246,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 10);
    ctx.lineTo(x + 8, y + 18);
    ctx.lineTo(x + 13, y + 10);
    ctx.lineTo(x + 18, y + 18);
    ctx.stroke();
  }

  toolLabel(key, index, enabled) {
    if (!enabled) return `${index} LOCK`;
    if (key === 'platform') return `${index} PLATFORM`;
    if (key === 'springYellow') return `${index} LOW`;
    if (key === 'springGreen') return `${index} MED`;
    if (key === 'springBlue') return `${index} HIGH`;
    return `${index} CHECK`;
  }

  drawMessage(ctx) {
    const msg = this.builder.messageTime > 0 ? this.builder.message : (this.runner.messageTime > 0 ? this.runner.message : '');
    if (!msg) return;
    panel(ctx, VIEW.width / 2 - 220, 22, 440, 48);
    ctx.fillStyle = '#fff';
    ctx.font = '800 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(msg, VIEW.width / 2, 53);
    ctx.textAlign = 'left';
  }

  drawClearCard(ctx) {
    panel(ctx, VIEW.width / 2 - 230, VIEW.height / 2 - 86, 460, 172);
    ctx.fillStyle = '#7fffba';
    ctx.font = '900 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE CLEAR', VIEW.width / 2, VIEW.height / 2 - 28);
    ctx.fillStyle = '#eef3ff';
    ctx.font = '16px system-ui';
    ctx.fillText('Enter/R restart prototype   N next stage', VIEW.width / 2, VIEW.height / 2 + 17);
    ctx.textAlign = 'left';
  }
}
