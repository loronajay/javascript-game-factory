// ── Animation Editor ──────────────────────────────────────────────────────
// Standalone dev tool for building and previewing move timelines.
// Runs the real animation engine — no special editor mode needed.
// ─────────────────────────────────────────────────────────────────────────

// playSfx stub — audio paths differ in editor context; visuals only here
if (typeof playSfx === 'undefined') window.playSfx = () => {};

// ── Type metadata ─────────────────────────────────────────────────────────

const TYPE_COLORS = {
  creature_anim:  '#4488ff',
  projectile:     '#ff8833',
  beam:           '#ffdd44',
  particle_burst: '#44cc88',
  field_flash:    '#cc66ff',
  screen_shake:   '#ff4444',
  creature_shake: '#ff8866',
  sound:          '#888888',
  preset:         '#44cccc',
  impact:         '#ffcc44',
};

const EVENT_DEFAULTS = {
  creature_anim:  { target: 'actor',  class: '' },
  projectile:     { from: 'actor', to: 'target', size: 14, color: '#ff8833', duration: 300, shape: 'circle', trail: false },
  beam:           { from: 'actor', to: 'target', color: '#ffffff', width: 4, duration: 400, glow: false },
  particle_burst: { origin: 'target', count: 8, spread: 55, duration: 420, size: 6, color: '#ffffff', direction: 'all', glow: false },
  field_flash:    { color: '#ffffff', opacity: 0.5, duration: 200 },
  screen_shake:   { intensity: 5, duration: 300, style: 'smooth' },
  creature_shake: { target: 'target', intensity: 4, duration: 200 },
  sound:          { id: '', repeat: 1, interval: 0 },
  preset:         { id: '' },
  impact:         {},
};

const EVENT_FIELDS = {
  creature_anim: [
    { key: 'at',     label: 'Time (ms)', type: 'number'  },
    { key: 'target', label: 'Target',    type: 'select',  options: ['actor', 'target'] },
    { key: 'class',  label: 'CSS Class', type: 'text'     },
  ],
  projectile: [
    { key: 'at',       label: 'Time (ms)',        type: 'number'   },
    { key: 'from',     label: 'From',             type: 'select',  options: ['actor', 'target'] },
    { key: 'to',       label: 'To',               type: 'select',  options: ['target', 'actor'] },
    { key: 'size',     label: 'Size (px)',         type: 'number'   },
    { key: 'color',    label: 'Color',             type: 'color'    },
    { key: 'duration', label: 'Duration (ms)',     type: 'number'   },
    { key: 'arc',      label: 'Arc (px, neg=up)',  type: 'number'   },
    { key: 'shape',    label: 'Shape',             type: 'select',  options: ['circle', 'oval', 'shard'] },
    { key: 'trail',    label: 'Trail glow',        type: 'checkbox' },
  ],
  beam: [
    { key: 'at',       label: 'Time (ms)',    type: 'number'   },
    { key: 'from',     label: 'From',         type: 'select',  options: ['actor', 'target'] },
    { key: 'to',       label: 'To',           type: 'select',  options: ['target', 'actor'] },
    { key: 'color',    label: 'Color',         type: 'color'    },
    { key: 'width',    label: 'Width (px)',    type: 'number'   },
    { key: 'duration', label: 'Duration (ms)', type: 'number'   },
    { key: 'glow',     label: 'Glow',          type: 'checkbox' },
  ],
  particle_burst: [
    { key: 'at',        label: 'Time (ms)',     type: 'number'   },
    { key: 'origin',    label: 'Origin',        type: 'select',  options: ['target', 'actor'] },
    { key: 'count',     label: 'Count',         type: 'number'   },
    { key: 'spread',    label: 'Spread (px)',   type: 'number'   },
    { key: 'duration',  label: 'Duration (ms)', type: 'number'   },
    { key: 'size',      label: 'Size (px)',      type: 'number'   },
    { key: 'color',     label: 'Color',          type: 'color'    },
    { key: 'direction', label: 'Direction',      type: 'select',  options: ['all', 'up', 'down'] },
    { key: 'glow',      label: 'Glow',           type: 'checkbox' },
  ],
  field_flash: [
    { key: 'at',       label: 'Time (ms)',    type: 'number'  },
    { key: 'color',    label: 'Color',        type: 'color'   },
    { key: 'opacity',  label: 'Opacity',      type: 'range',  min: 0, max: 1, step: 0.05 },
    { key: 'duration', label: 'Duration (ms)',type: 'number'  },
  ],
  screen_shake: [
    { key: 'at',        label: 'Time (ms)',     type: 'number' },
    { key: 'intensity', label: 'Intensity (px)', type: 'number' },
    { key: 'duration',  label: 'Duration (ms)', type: 'number' },
    { key: 'style',     label: 'Style',          type: 'select', options: ['smooth', 'stutter'] },
  ],
  creature_shake: [
    { key: 'at',        label: 'Time (ms)',     type: 'number' },
    { key: 'target',    label: 'Target',        type: 'select', options: ['actor', 'target'] },
    { key: 'intensity', label: 'Intensity (px)', type: 'number' },
    { key: 'duration',  label: 'Duration (ms)', type: 'number' },
  ],
  sound: [
    { key: 'at',       label: 'Time (ms)',    type: 'number' },
    { key: 'id',       label: 'Sound ID',     type: 'text'   },
    { key: 'repeat',   label: 'Repeat',       type: 'number' },
    { key: 'interval', label: 'Interval (ms)',type: 'number' },
  ],
  preset: [
    { key: 'at',     label: 'Time (ms)',       type: 'number'        },
    { key: 'id',     label: 'Preset ID',       type: 'preset-select' },
    { key: 'origin', label: 'Origin override', type: 'select', options: ['', 'actor', 'target'] },
  ],
  impact: [
    { key: 'at', label: 'Time (ms)', type: 'number' },
  ],
};

// ── Editor state ──────────────────────────────────────────────────────────

const ES = {
  timeline:      [],
  selectedIndex: -1,
  isPlaying:     false,
  loopEnabled:   false,
};

// ── Field setup ───────────────────────────────────────────────────────────

const FIELD_W = 560;
const FIELD_H = 315;

// Middle slot positions from the main game's SLOT_LAYOUT
const CREATURE_LAYOUT = {
  player:   { xPct: 31, yPct: 52, scale: 0.74 },
  opponent: { xPct: 69, yPct: 52, scale: 0.74 },
};
const SPRITE_BASE = 80;
const SPRITE_SCALE_NORM = 0.58;
const SPRITE_SRC = '../shared/creatures/salamander/salamander.png';

function buildField() {
  const field = document.getElementById('battle-field');
  if (!field) return;
  field.innerHTML = '';

  ['player', 'opponent'].forEach(side => {
    const lay  = CREATURE_LAYOUT[side];
    const size = Math.round(SPRITE_BASE * lay.scale / SPRITE_SCALE_NORM);
    const flip = side === 'opponent' ? 'scaleX(-1)' : '';
    const shadowW = Math.round(size * 0.72);
    const shadowH = Math.round(size * 0.14);

    const el = document.createElement('div');
    el.className = `battle-creature ${side}`;
    el.dataset.creature = `${side}-middle`;
    el.style.cssText = `left:${lay.xPct}%;top:${lay.yPct}%;z-index:30`;

    el.innerHTML = `
      <div class="creature-breathe-wrapper">
        <img src="${SPRITE_SRC}" alt="${side}"
             style="width:${size}px;height:${size}px;transform:${flip};display:block;image-rendering:pixelated;object-fit:contain"
             onerror="this.style.cssText='width:${size}px;height:${size * 1.2}px;background:#2a1a00;display:block;border-radius:4px'">
      </div>
      <div class="battle-shadow" style="width:${shadowW}px;height:${shadowH}px"></div>
    `;
    field.appendChild(el);
  });
}

// ── Mock context for engine ───────────────────────────────────────────────

function getMockContext() {
  const mockResult = { type: 'damage', targetSide: 'opponent', targetSlot: 'middle', amount: 42 };
  return {
    actorSide: 'player',
    actorSlot:  'middle',
    result:     mockResult,
    action: {
      actorSide:  'player',
      actorSlot:  'middle',
      targetSide: 'opponent',
      targetSlot: 'middle',
      moveId:     'preview',
    },
    options: {
      onImpact: () => mockResult,
    },
  };
}

// ── Playback ──────────────────────────────────────────────────────────────

function play() {
  if (ES.isPlaying || !ES.timeline.length) return;
  ES.isPlaying = true;
  document.getElementById('ae-play').textContent = '◼ Stop';
  document.getElementById('ae-play').classList.add('active');

  resetVisuals();
  runAnimTimeline([...ES.timeline], getMockContext()).then(() => {
    ES.isPlaying = false;
    document.getElementById('ae-play').textContent = '▶ Play';
    document.getElementById('ae-play').classList.remove('active');
    if (ES.loopEnabled) setTimeout(play, 600);
  });
}

function stopPlayback() {
  // Can't cancel mid-flight Promises, but mark as stopped so loop doesn't restart
  ES.isPlaying = false;
  document.getElementById('ae-play').textContent = '▶ Play';
  document.getElementById('ae-play').classList.remove('active');
}

function resetVisuals() {
  // Clear overlay VFX
  const overlay = document.getElementById('battle-anim-overlay');
  if (overlay) overlay.innerHTML = '';

  // Strip animation classes from creature elements
  document.querySelectorAll('.battle-creature').forEach(el => {
    // Remove all anim-* and anim-state-* classes, keep base classes
    [...el.classList].forEach(c => {
      if (c.startsWith('anim-')) el.classList.remove(c);
    });
    // Clear inline CSS vars set by animations
    el.style.removeProperty('--shake-intensity');
    el.style.removeProperty('--shake-duration');
    el.style.removeProperty('--status-color');
    el.style.removeProperty('transform');
    el.style.removeProperty('filter');
    // Also clear shake on battle-field itself
    const field = document.getElementById('battle-field');
    if (field) {
      [...field.classList].forEach(c => {
        if (c.startsWith('anim-')) field.classList.remove(c);
      });
      field.style.removeProperty('--shake-intensity');
      field.style.removeProperty('--shake-duration');
    }
  });
}

// ── Timeline management ───────────────────────────────────────────────────

function addEvent(type) {
  const defaults = EVENT_DEFAULTS[type] || {};
  // Place at the end of the current timeline + a small offset
  const maxAt = ES.timeline.reduce((m, e) => Math.max(m, e.at), 0);
  const event = { at: ES.timeline.length ? maxAt + 100 : 0, type, ...defaults };
  ES.timeline.push(event);
  ES.selectedIndex = ES.timeline.length - 1;
  renderAll();
}

function deleteEvent(index) {
  ES.timeline.splice(index, 1);
  if (ES.selectedIndex >= ES.timeline.length) ES.selectedIndex = ES.timeline.length - 1;
  renderAll();
}

function selectEvent(index) {
  ES.selectedIndex = index;
  renderAll();
}

function updateEvent(index, key, value) {
  if (!ES.timeline[index]) return;
  ES.timeline[index][key] = value;
  renderTimeline();
  // Don't re-render inspector to avoid losing focus mid-edit
}

function sortTimeline() {
  const sel = ES.selectedIndex >= 0 ? ES.timeline[ES.selectedIndex] : null;
  ES.timeline.sort((a, b) => a.at - b.at);
  if (sel) ES.selectedIndex = ES.timeline.indexOf(sel);
  renderAll();
}

// ── Rendering ─────────────────────────────────────────────────────────────

function renderAll() {
  renderTimeline();
  renderInspector();
}

function summarize(event) {
  switch (event.type) {
    case 'creature_anim':  return `${event.target}  ${event.class || '—'}`;
    case 'projectile':     return `${event.from}→${event.to}  ${event.color || ''}  ${event.duration || ''}ms`;
    case 'beam':           return `${event.from}→${event.to}  ${event.color || ''}  ${event.duration || ''}ms`;
    case 'particle_burst': return `${event.origin}  ×${event.count}  r${event.spread}  ${event.color || ''}`;
    case 'field_flash':    return `${event.color || ''}  ×${event.opacity}  ${event.duration || ''}ms`;
    case 'screen_shake':   return `${event.style}  ${event.intensity}px  ${event.duration}ms`;
    case 'creature_shake': return `${event.target}  ${event.intensity}px  ${event.duration}ms`;
    case 'sound':          return event.id || '—';
    case 'preset':         return event.id || '—';
    case 'impact':         return '⬡ damage resolves here';
    default:               return '';
  }
}

function renderTimeline() {
  const list  = document.getElementById('ae-event-list');
  const strip = document.getElementById('ae-strip');
  const count = document.getElementById('ae-tl-count');

  count.textContent = `${ES.timeline.length} event${ES.timeline.length !== 1 ? 's' : ''}`;

  // ── Event list ──────────────────────────────────────────────────────────
  if (!ES.timeline.length) {
    list.innerHTML = '<div class="ae-empty-state">No events yet — add one from the palette above.</div>';
  } else {
    list.innerHTML = ES.timeline.map((ev, i) => `
      <div class="ae-event-row ${i === ES.selectedIndex ? 'selected' : ''}" data-index="${i}">
        <span class="ae-ev-dot ${ev.type === 'impact' ? 'impact-dot' : ''}"
              style="background:${TYPE_COLORS[ev.type] || '#666'}"></span>
        <span class="ae-ev-time">${ev.at}ms</span>
        <span class="ae-ev-type">${ev.type}</span>
        <span class="ae-ev-summary">${summarize(ev)}</span>
        <button class="ae-ev-delete" data-del="${i}" title="Delete">✕</button>
      </div>
    `).join('');
  }

  list.querySelectorAll('.ae-event-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.dataset.del != null) return;
      selectEvent(parseInt(row.dataset.index));
    });
  });
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteEvent(parseInt(btn.dataset.del));
    });
  });

  // ── Visual strip ────────────────────────────────────────────────────────
  if (!ES.timeline.length) { strip.innerHTML = ''; return; }

  const maxAt   = Math.max(...ES.timeline.map(e => e.at)) + 400;
  const scale   = 0.5; // px per ms
  const totalW  = Math.max(maxAt * scale, 400);
  strip.style.width = `${totalW}px`;

  // Ruler ticks every 100ms
  let rulerHtml = '';
  for (let t = 0; t <= maxAt; t += 100) {
    rulerHtml += `
      <div class="ae-ruler-tick" style="left:${t * scale}px">
        <div class="ae-ruler-line"></div>
        <div class="ae-ruler-label">${t}</div>
      </div>`;
  }

  // Event markers
  let markerHtml = '';
  ES.timeline.forEach((ev, i) => {
    const left  = ev.at * scale;
    const color = TYPE_COLORS[ev.type] || '#666';
    markerHtml += `
      <div class="ae-strip-marker ${ev.type === 'impact' ? 'impact' : ''}"
           style="left:${left}px;background:${color};opacity:${i === ES.selectedIndex ? 1 : 0.55}"
           title="${ev.type} @${ev.at}ms"
           data-index="${i}"></div>`;
  });

  strip.innerHTML = rulerHtml + markerHtml;
  strip.querySelectorAll('.ae-strip-marker').forEach(m => {
    m.addEventListener('click', () => selectEvent(parseInt(m.dataset.index)));
  });
}

function renderInspector() {
  const form  = document.getElementById('ae-inspector-form');
  const empty = document.getElementById('ae-inspector-empty');
  const ev    = ES.timeline[ES.selectedIndex];

  if (!ev) {
    form.innerHTML  = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const fields = EVENT_FIELDS[ev.type] || [{ key: 'at', label: 'Time (ms)', type: 'number' }];

  form.innerHTML = fields.map(f => buildFieldHtml(f, ev)).join('');

  // Wire up change handlers
  form.querySelectorAll('[data-key]').forEach(input => {
    const key = input.dataset.key;
    const field = fields.find(f => f.key === key);
    if (!field) return;

    input.addEventListener('change', () => {
      let val = input.value;
      if (field.type === 'number') val = parseFloat(val) || 0;
      if (field.type === 'checkbox') val = input.checked;
      if (field.type === 'range') val = parseFloat(val);
      updateEvent(ES.selectedIndex, key, val);
    });

    // Range: also update on input for live feedback
    if (field.type === 'range') {
      input.addEventListener('input', () => {
        const display = input.nextElementSibling;
        if (display?.classList.contains('ae-range-value')) display.textContent = input.value;
      });
    }

    // Sort timeline when `at` time changes
    if (key === 'at') {
      input.addEventListener('blur', sortTimeline);
    }
  });
}

function buildFieldHtml(field, ev) {
  const val = ev[field.key] ?? '';
  const id  = `ae-f-${field.key}`;

  if (field.type === 'checkbox') {
    return `
      <div class="ae-field-row ae-field-row-inline">
        <input class="ae-field-input" type="checkbox" id="${id}" data-key="${field.key}"
               ${val ? 'checked' : ''}>
        <label class="ae-field-label" for="${id}">${field.label}</label>
      </div>`;
  }

  if (field.type === 'range') {
    return `
      <div class="ae-field-row">
        <label class="ae-field-label" for="${id}">${field.label}</label>
        <div class="ae-field-row-inline">
          <input class="ae-field-input" type="range" id="${id}" data-key="${field.key}"
                 min="${field.min ?? 0}" max="${field.max ?? 1}" step="${field.step ?? 0.1}"
                 value="${val}">
          <span class="ae-range-value">${val}</span>
        </div>
      </div>`;
  }

  if (field.type === 'select') {
    const options = (field.options || []).map(o =>
      `<option value="${o}" ${val === o ? 'selected' : ''}>${o || '(none)'}</option>`
    ).join('');
    return `
      <div class="ae-field-row">
        <label class="ae-field-label" for="${id}">${field.label}</label>
        <select class="ae-field-input" id="${id}" data-key="${field.key}">${options}</select>
      </div>`;
  }

  if (field.type === 'preset-select') {
    const presetIds = Object.keys(ANIM_PRESETS || {});
    const options = ['', ...presetIds].map(o =>
      `<option value="${o}" ${val === o ? 'selected' : ''}>${o || '— pick a preset —'}</option>`
    ).join('');
    return `
      <div class="ae-field-row">
        <label class="ae-field-label" for="${id}">${field.label}</label>
        <select class="ae-field-input" id="${id}" data-key="${field.key}">${options}</select>
      </div>`;
  }

  const inputType = field.type === 'color' ? 'color' : (field.type === 'number' ? 'number' : 'text');
  return `
    <div class="ae-field-row">
      <label class="ae-field-label" for="${id}">${field.label}</label>
      <input class="ae-field-input" type="${inputType}" id="${id}" data-key="${field.key}"
             value="${val}">
    </div>`;
}

// ── Export ────────────────────────────────────────────────────────────────

function formatExport() {
  if (!ES.timeline.length) return '// No events — build your timeline first.';

  const sorted = [...ES.timeline].sort((a, b) => a.at - b.at);
  const lines  = sorted.map(ev => {
    // Build a clean copy without undefined values
    const clean = Object.fromEntries(
      Object.entries(ev).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    );
    return '    ' + JSON.stringify(clean) + ',';
  });

  return `// Paste into registerMoveAnimations({ move_id: { timeline: [...] } })
timeline: [
${lines.join('\n')}
]`;
}

function showExport() {
  document.getElementById('ae-export-output').textContent = formatExport();
  document.getElementById('ae-export-modal').classList.remove('hidden');
}

function hideExport() {
  document.getElementById('ae-export-modal').classList.add('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildField();

  // Palette buttons
  document.getElementById('ae-palette-grid').querySelectorAll('.ae-palette-btn').forEach(btn => {
    btn.addEventListener('click', () => addEvent(btn.dataset.type));
  });

  // Controls
  document.getElementById('ae-play').addEventListener('click', () => {
    if (ES.isPlaying) stopPlayback(); else play();
  });

  document.getElementById('ae-loop').addEventListener('click', () => {
    ES.loopEnabled = !ES.loopEnabled;
    document.getElementById('ae-loop').classList.toggle('active', ES.loopEnabled);
  });

  document.getElementById('ae-reset').addEventListener('click', () => {
    stopPlayback();
    resetVisuals();
  });

  document.getElementById('ae-export').addEventListener('click', showExport);

  // Sort button
  document.getElementById('ae-sort').addEventListener('click', sortTimeline);

  // Export modal
  document.getElementById('ae-modal-close').addEventListener('click', hideExport);
  document.getElementById('ae-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('ae-export-output').textContent)
      .then(() => {
        const btn = document.getElementById('ae-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 1500);
      });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideExport();
  });

  renderAll();
});
