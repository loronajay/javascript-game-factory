// The demo's front end: title, how-to, extras, and the mid-round pause, all driven by the pure state
// machine in `menu-logic.js`. Only two things live here — turning a screen name into visible DOM, and
// the buttons that dispatch actions into the machine.
//
// `PLAYING` is the game's single "the simulation is running" answer: the loop pauses whenever the
// player is not locked in, which is what stops meters like sanity from ticking behind a menu.
import { CONFIG, FLOOR_DEFS, floorY, keyIdForFloor, keyLabelForFloor } from './game-config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createMenu({ logic, document, window, onPlay, onStartSingle, onScreen, maps = null, mapSession = null, canPause = () => true }) {
  const overlay = document.getElementById('overlay');
  const screenEls = new Map([
    [logic.SCREENS.TITLE, document.getElementById('menuTitle')],
    [logic.SCREENS.SOLO_SETUP, document.getElementById('menuSoloSetup')],
    [logic.SCREENS.HOW_TO, document.getElementById('menuHowTo')],
    [logic.SCREENS.EXTRAS, document.getElementById('menuExtras')],
    [logic.SCREENS.ONLINE, document.getElementById('menuOnline')],
    [logic.SCREENS.PAUSE, document.getElementById('menuPause')],
  ]);
  let state = logic.createMenuState();
  const hiderInput = document.getElementById('soloHiderCount');
  const hideInput = document.getElementById('soloHideSeconds');
  const roleInput = document.getElementById('soloRole');
  const hiderReadout = document.getElementById('soloHiderReadout');
  const hideReadout = document.getElementById('soloHideReadout');
  const roleReadout = document.getElementById('soloRoleReadout');
  const roleSummary = document.getElementById('soloRoleSummary');
  const soloLead = document.getElementById('soloLead');
  const soloStart = document.getElementById('soloStart');
  const hiderLabel = document.getElementById('soloHiderLabel');
  const hiderHelp = document.getElementById('soloHiderHelp');
  const hideHelp = document.getElementById('soloHideHelp');
  const mapCards = document.getElementById('soloMapCards');
  let selectedMapId = null;
  const mapReadout = document.getElementById('soloMapReadout');
  const mapHelp = document.getElementById('soloMapHelp');
  const threatSummary = document.getElementById('soloThreatSummary');
  const lobbyMapName = document.getElementById('lobbyMapName');
  const lobbyDemonCount = document.getElementById('lobbyDemonCount');

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
      input.name = 'soloMapChoice';
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

  function renderMapCopy(mapId) {
    if (!maps) return;
    const map = maps.getMap(maps.normalizeMapId(mapId));
    const demonCount = maps.demonCountFor(map.id);
    if (mapReadout) mapReadout.textContent = map.name.toUpperCase();
    if (mapHelp) mapHelp.textContent = map.blurb;
    if (threatSummary) threatSummary.textContent = `${demonCount} DEMON${demonCount === 1 ? '' : 'S'}`;
    // The lobby is read-only about the map on purpose: the client built its building at boot, so an
    // online round is played in the location this page is already standing.
    if (lobbyMapName) lobbyMapName.textContent = map.name.toUpperCase();
    if (lobbyDemonCount) lobbyDemonCount.textContent = String(demonCount);
  }

  // Changing location is an entry, not a transition — the page re-enters into the new building and
  // the setup the player had filled in travels with it. See `modules/map-session.js`.
  function applyMapChange(mapId) {
    if (!mapSession || !maps || !maps.isPlayable(mapId)) return;
    selectedMapId = mapId;
    syncMapCards();
    const config = matchConfig();
    renderMapCopy(config.mapId);
    mapSession.select(config.mapId, config);
  }

  function matchConfig() {
    return logic.normalizeMatchConfig({ mapId: selectedMapId, hiderCount: hiderInput?.value, hideSeconds: hideInput?.value, role: roleInput?.value });
  }

  function renderMatchConfig() {
    const config = matchConfig();
    if (hiderReadout) hiderReadout.textContent = `${config.hiderCount} guest${config.hiderCount === 1 ? '' : 's'}`;
    if (hideReadout) hideReadout.textContent = `${config.hideSeconds} seconds`;
    if (roleReadout) roleReadout.textContent = config.role.toUpperCase();
    if (roleSummary) roleSummary.textContent = config.role.toUpperCase();
    // The copy names the building the player is actually standing in. It used to say "the hotel" and
    // "both demons" flat out, which stops being true the moment there is a second location with a
    // third demon in it.
    const place = maps ? maps.getMap(maps.normalizeMapId(config.mapId)) : null;
    const placeName = place ? place.name : 'the hotel';
    const demonCount = maps ? maps.demonCountFor(config.mapId) : 2;
    if (soloLead) soloLead.textContent = config.role === 'hider'
      ? `Hide anywhere in ${placeName}, outlast the AI seeker, and stay clear of all ${demonCount} demons.`
      : `Choose how crowded ${placeName} feels and how long the guests get to disappear.`;
    if (soloStart) soloStart.firstChild.textContent = config.role === 'hider' ? 'BEGIN HIDING ' : 'BEGIN THE HUNT ';
    if (hiderLabel) hiderLabel.textContent = config.role === 'hider' ? 'Hiders in Match' : 'Guests to Find';
    if (hiderHelp) hiderHelp.textContent = config.role === 'hider' ? 'Includes you and any AI hider teammates.' : 'More guests make every floor more active.';
    if (hideHelp) hideHelp.textContent = config.role === 'hider' ? 'Use every second before the AI seeker is released.' : 'You remain locked in the elevator.';
    renderMapCopy(config.mapId);
  }

  function emit(name, detail) {
    window.dispatchEvent(new window.CustomEvent(name, { detail }));
  }

  function render() {
    overlay.classList.toggle('hidden', !logic.isOverlayVisible(state.screen));
    for (const [screen, element] of screenEls) if (element) element.classList.toggle('hidden', screen !== state.screen);
    const active = screenEls.get(state.screen);
    const first = active?.querySelector?.('button:not([disabled]), input, select');
    if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
  }

  function dispatch(action) {
    const previousScreen = state.screen;
    const next = logic.nextMenuState(state, action, { allowPause: canPause() });
    // Quitting rebuilds the session rather than pretending the hotel reset: the demon, the open doors
    // and the key ring are all still standing, and a reload is the honest way back to a clean round.
    if (next.effect === 'quit') { window.location.reload(); return; }
    const wasPlaying = logic.isPlaying(state.screen);
    state = next;
    render();
    emit('hotel:menu-action', { action });
    emit('hotel:menu-screen', { screen: state.screen, previousScreen });
    if (onScreen) onScreen(state.screen);
    if (!wasPlaying && logic.isPlaying(state.screen)) {
      if (previousScreen === logic.SCREENS.SOLO_SETUP && onStartSingle) onStartSingle(matchConfig());
      onPlay();
    }
    return state.screen !== previousScreen;
  }

  overlay.addEventListener('click', (event) => {
    const button = event.target.closest ? event.target.closest('[data-menu]') : null;
    if (!button) return;
    event.preventDefault();
    dispatch(button.dataset.menu);
  });
  for (const input of [hiderInput, hideInput, roleInput]) input?.addEventListener('input', renderMatchConfig);
  mapCards?.addEventListener('change', (event) => {
    const input = event.target;
    if (input && input.name === 'soloMapChoice') applyMapChange(input.value);
  });
  // The end-of-round overlay sits above the menu at its own z-index, so a pause menu behind it is
  // unreachable. Single player must always have a way out: Esc (and an explicit button) on that
  // screen quits to the title rather than doing nothing.
  const caughtOverlay = document.getElementById('caughtOverlay');
  const caughtQuit = document.getElementById('caughtQuitBtn');
  caughtQuit?.addEventListener('click', () => dispatch(logic.ACTIONS.QUIT));
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (caughtOverlay && caughtOverlay.classList.contains('visible')) { dispatch(logic.ACTIONS.QUIT); return; }
    if ([logic.SCREENS.SOLO_SETUP, logic.SCREENS.ONLINE, logic.SCREENS.HOW_TO, logic.SCREENS.EXTRAS].includes(state.screen)) dispatch(logic.ACTIONS.BACK);
  });
  window.addEventListener('hotel:caught', () => dispatch(logic.ACTIONS.CAUGHT));

  fillMapOptions();
  renderMatchConfig();
  render();
  // A player who just changed location was in the middle of setting a match up. Put them back where
  // they were rather than on the title screen they never asked to see.
  const pending = mapSession?.takePendingSetup?.();
  if (pending) {
    if (hiderInput) hiderInput.value = String(pending.hiderCount);
    if (hideInput) hideInput.value = String(pending.hideSeconds);
    if (roleInput) roleInput.value = pending.role;
    renderMatchConfig();
    dispatch(logic.ACTIONS.SINGLE_PLAYER);
  }
  return { dispatch, actions: logic.ACTIONS, getMatchConfig: matchConfig, getScreen: () => state.screen, isPlaying: () => logic.isPlaying(state.screen) };
}
