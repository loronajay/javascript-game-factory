// Catalog-driven location cards shared by solo and online setup. Selection never swaps a live world.
import { CONFIG, FLOOR_DEFS, floorY, keyIdForFloor, keyLabelForFloor } from './game-config.js';
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createMapPicker({ prefix, maps, mapSession, document, window, onChange }) {
  const mapCards = document.getElementById(`${prefix}MapCards`);
  let selectedMapId = mapSession?.activeMapId() || maps?.DEFAULT_MAP_ID || null;
  // A map's floorplans, drawn from the map's own plan.
  //
  // Deriving the picture rather than shipping one means a location that moves its walls moves its
  // preview in the same commit, and a new location arrives with a preview already drawn. A `soon`
  // map has no plan to draw — `resolveMapPlan` would hand back the default building's — so it gets
  // an empty frame that says so instead.
  function previewPanels(mapId) {
    const previewApi = window.HotelMapPreview;
    if (!previewApi || !maps.isPlayable(mapId)) return [];
    try {
      const plan = maps.resolveMapPlan(mapId, {
        config: CONFIG,
        floorDefs: maps.resolveMapFloorDefs(mapId, { floorDefs: FLOOR_DEFS, scope: window }),
        layout: window.HotelLayout, floorY, keyIdForFloor, keyLabelForFloor, scope: window,
      });
      return previewApi.createMapPreview(plan, { width: 100, height: 100 });
    } catch {
      // A preview is decoration. A map that cannot be drawn is still a map that can be played, and a
      // throw here would take the whole setup screen down with it.
      return [];
    }
  }

  function drawFloorplan(panel) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${panel.width} ${panel.height}`);
    svg.setAttribute('class', 'mapPlan');
    svg.setAttribute('aria-hidden', 'true');
    const add = (name, attrs, className) => {
      const node = document.createElementNS(SVG_NS, name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      node.setAttribute('class', className);
      svg.appendChild(node);
    };
    // Stair and lift runs first, so the walls read on top of them.
    for (const run of panel.stairs) add('rect', { x: run.x, y: run.y, width: run.w, height: run.h }, 'mapPlanStair');
    for (const wall of panel.walls) add('rect', { x: wall.x, y: wall.y, width: wall.w, height: wall.h }, 'mapPlanWall');
    for (const room of panel.rooms) add('circle', { cx: room.x, cy: room.y, r: 1.1 }, 'mapPlanRoom');
    return svg;
  }

  // The picker is built from the catalog, not authored in the markup, so registering a location is
  // the only thing adding one costs. A map whose plan does not exist yet is still listed — a locked
  // card saying the place is coming is worth more than an empty menu — but it cannot be chosen,
  // because choosing it would boot into a building with no geometry.
  function fillMapOptions() {
    if (!mapCards || !maps || mapCards.children.length) return;
    const active = mapSession ? mapSession.activeMapId() : maps.DEFAULT_MAP_ID;
    selectedMapId = active;
    for (const map of maps.listMaps()) {
      const playable = maps.isPlayable(map.id);
      const demons = maps.demonCountFor(map.id);
      const card = document.createElement('label');
      card.className = playable ? 'mapCard' : 'mapCard mapCard--soon';
      card.dataset.mapId = map.id;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${prefix}MapChoice`;
      input.value = map.id;
      input.checked = map.id === active;
      input.disabled = !playable;
      card.appendChild(input);

      const plans = document.createElement('span');
      plans.className = 'mapCardPlans';
      const panels = previewPanels(map.id);
      if (panels.length) {
        for (const panel of panels) {
          const frame = document.createElement('span');
          frame.className = 'mapPlanFrame';
          frame.appendChild(drawFloorplan(panel));
          const caption = document.createElement('small');
          caption.textContent = `L${panel.floor}`;
          frame.appendChild(caption);
          plans.appendChild(frame);
        }
      } else {
        const blank = document.createElement('span');
        blank.className = 'mapPlanFrame mapPlanFrame--empty';
        blank.textContent = playable ? '\u2014' : 'COMING SOON';
        plans.appendChild(blank);
      }
      card.appendChild(plans);

      const title = document.createElement('strong');
      title.textContent = playable ? map.name : `${map.name} — coming soon`;
      card.appendChild(title);
      const meta = document.createElement('small');
      meta.className = 'mapCardMeta';
      meta.textContent = `${map.eyebrow} · ${demons} DEMON${demons === 1 ? '' : 'S'}`;
      card.appendChild(meta);
      const blurb = document.createElement('small');
      blurb.textContent = map.blurb;
      card.appendChild(blurb);

      mapCards.appendChild(card);
    }
    syncMapCards();
  }

  function syncMapCards() {
    if (!mapCards) return;
    for (const card of mapCards.querySelectorAll('.mapCard')) {
      const isActive = card.dataset.mapId === selectedMapId;
      card.classList.toggle('mapCard--active', isActive);
    }
  }

  function renderCopy() {
    if (!maps) return;
    const map = maps.getMap(maps.normalizeMapId(selectedMapId));
    const readout = document.getElementById(`${prefix}MapReadout`);
    const help = document.getElementById(`${prefix}MapHelp`);
    if (readout) readout.textContent = map.name.toUpperCase();
    if (help) help.textContent = map.blurb;
  }
  mapCards?.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.name !== `${prefix}MapChoice` || !maps?.isPlayable(input.value)) return;
    selectedMapId = input.value;
    syncMapCards(); renderCopy();
    onChange?.(selectedMapId);
  });
  fillMapOptions(); renderCopy();
  return { selected: () => selectedMapId };
}