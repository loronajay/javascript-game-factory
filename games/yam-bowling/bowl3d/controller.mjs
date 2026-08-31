import { matchUses3d, localBowlingStyle } from './mode.mjs';
import { $, showScreen } from '../ui/dom.mjs';

// This adapter keeps the shared match lifecycle unaware of WebGL, loading,
// camera controls and which physical engine is active. Heavy imports are local
// and lazy: a normal match never downloads or initializes either 3D library.
export function createBowlingMode({ session, classicRenderer, physics, cpu, laneCore, effects, balls,
  getElement = $, loadEngine = async () => {
    const [{ create3dPhysics }, { create3dCpu }, { Bowling3dRenderer }] = await Promise.all([
      import('./physics.mjs'), import('./cpu.mjs'), import('./renderer.mjs'),
    ]);
    return { physics: create3dPhysics(physics), cpu: create3dCpu(physics),
      renderer: new Bowling3dRenderer({ canvas: getElement('game-canvas-3d'), classicRenderer, physics, laneCore, effects, balls }) };
  },
}) {
  let engine = null, loading = null, starting = false;
  async function prepare(style) {
    if (style !== '3d') return;
    try {
      if (!engine) { loading ||= loadEngine(); engine = await loading; }
      if (engine.renderer.contextLost) throw new Error('The graphics context is unavailable. Reload to retry.');
    } catch (error) { loading = null; throw error; }
  }
  const active = () => matchUses3d(session);
  const selectedPhysics = () => active() ? engine.physics : physics;
  const renderer = {
    get ctx() { return classicRenderer.ctx; },
    get ready() { return classicRenderer.ready; },
    get shake() { return classicRenderer.shake; },
    set shake(value) { classicRenderer.shake = value; },
    get debug() { return classicRenderer.debug; },
    set debug(value) { classicRenderer.debug = value; },
    load: (...args) => classicRenderer.load(...args),
    setLane: (...args) => classicRenderer.setLane(...args),
    setCharacter: (...args) => classicRenderer.setCharacter(...args),
    render(scene, state) {
      const is3d = active();
      classicRenderer.canvas.hidden = is3d;
      getElement('game-canvas-3d').hidden = !is3d;
      getElement('three-d-camera').hidden = !is3d;
      if (is3d) {
        if (engine.renderer.contextLost) {
          session.paused = true; getElement('three-d-error').hidden = false; return;
        }
        engine.renderer.render(scene,state,{laneSlug:session.matchLaneSlug,debug:classicRenderer.debug});
      } else classicRenderer.render(scene,state);
    },
  };
  return {
    prepare,
    renderer,
    physics: {
      ...physics,
      get fullLaneSimulation() { return active(); },
      createSimulation: (...args) => selectedPhysics().createSimulation(...args),
      stepSimulation: (...args) => selectedPhysics().stepSimulation(...args),
      knockedCount: (...args) => selectedPhysics().knockedCount(...args),
      clearFallen: (...args) => selectedPhysics().clearFallen(...args),
    },
    cpu: { createCpuPlan: (...args) => (active() ? engine.cpu : cpu).createCpuPlan(...args) },
    tick(dt) {
      if (active() && engine && !session.paused && !getElement('game-screen').hidden) {
        engine.renderer.tick(session.scene,dt,Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
      }
    },
    async start(startMatch) {
      if (starting) return;
      if (localBowlingStyle(session) !== '3d') { startMatch(); return; }
      const button = getElement('start-match'), status = getElement('bowling-style-status');
      starting = true; button.disabled = true; button.textContent = 'Building 3D lane…';
      status.textContent = 'Loading the 3D alley and pin physics…';
      try {
        await prepare('3d');
        if (getElement('setup-screen').hidden || localBowlingStyle(session) !== '3d') return;
        getElement('three-d-error').hidden = true;
        status.textContent = '3D Bowl · local exhibition · no ranked or Circuit progress.';
        startMatch();
      } catch (error) {
        loading = null;
        status.textContent = '3D Bowl could not start. Try again, or choose Arcade. A WebGL 2 capable browser is required.';
        status.title = String(error.message || error);
      } finally {
        starting = false; button.disabled = false; button.textContent = 'Start match';
      }
    },
    bind() {
      getElement('three-d-camera').addEventListener('click', () => {
        if (!engine) return;
        const fixed = engine.renderer.cameraMode !== 'fixed';
        engine.renderer.cameraMode = fixed ? 'fixed' : 'follow';
        getElement('three-d-camera').textContent = fixed ? 'Camera · Fixed' : 'Camera · Follow';
        getElement('three-d-camera').setAttribute('aria-pressed',String(fixed));
      });
      getElement('three-d-back').addEventListener('click', () => {
        session.paused = true; getElement('three-d-error').hidden = true; showScreen('setup-screen');
      });
    },
  };
}
