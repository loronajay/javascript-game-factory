// A caught hider remains in the match as a camera, never as a body. Target eligibility and cycling
// are pure; this module only moves the camera and paints the small switcher.
export function createSpectator({ logic, camera, world, avatars, config, document, window }) {
  const hud = document.getElementById('spectatorHud');
  const label = document.getElementById('spectatorTarget');
  const previous = document.getElementById('spectatorPrevious');
  const next = document.getElementById('spectatorNext');
  let provider = () => [];
  let selfId = 'local';
  let targetId = null;
  let active = false;

  function players() { return provider() || []; }
  function releaseHead() { if (targetId) avatars.setHeadHidden(targetId, false); }
  function choose(direction = 1) {
    const before = targetId;
    targetId = logic.cycleTarget(players(), selfId, targetId, direction);
    if (before && before !== targetId) avatars.setHeadHidden(before, false);
    if (targetId) avatars.setHeadHidden(targetId, true);
    return targetId;
  }
  function start(nextProvider, nextSelfId = 'local') {
    provider = typeof nextProvider === 'function' ? nextProvider : () => [];
    selfId = nextSelfId;
    active = true;
    world.state.playerSpectating = true;
    document.body.classList.add('spectating');
    hud?.classList.add('visible');
    choose(1);
  }
  function stop() {
    releaseHead();
    active = false; targetId = null;
    world.state.playerSpectating = false;
    document.body.classList.remove('spectating');
    hud?.classList.remove('visible');
  }
  function update() {
    if (!active) return;
    const roster = players();
    let target = logic.targetsFor(roster, selfId).find((entry) => entry.id === targetId);
    if (!target) { choose(1); target = logic.targetsFor(roster, selfId).find((entry) => entry.id === targetId); }
    if (!target) { if (label) label.textContent = 'NO SURVIVORS'; return; }
    const pose = logic.cameraPose(target, config);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.x = pose.pitch; camera.rotation.y = pose.yaw;
    world.state.yaw = pose.yaw; world.state.pitch = pose.pitch;
    world.state.playerFeetY = target.y; world.state.playerFloor = target.floor || world.state.playerFloor;
    if (label) label.textContent = target.name || (target.role === 'seeker' ? 'THE SEEKER' : target.id.toUpperCase());
  }
  function cycle(direction) { if (active) choose(direction); }
  previous?.addEventListener('click', () => cycle(-1));
  next?.addEventListener('click', () => cycle(1));
  window.addEventListener('keydown', (event) => {
    if (!active || event.repeat) return;
    if (event.code === 'KeyQ' || event.code === 'BracketLeft' || event.code === 'ArrowLeft') cycle(-1);
    if (event.code === 'KeyE' || event.code === 'BracketRight' || event.code === 'ArrowRight') cycle(1);
  });
  return { start, stop, update, cycle, isActive: () => active, getTarget: () => targetId };
}
