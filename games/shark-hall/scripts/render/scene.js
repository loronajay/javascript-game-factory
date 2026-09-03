// The render layer's front door: one call in, one object out.
//
// `init-game.js` asks for a table scene and gets back something with `sync`,
// `resize` and `render`. It never sees a renderer, a material or a light, and
// the six modules under `render/` never see the match. That is the whole seam.
//
// THREE ARRIVES HERE AND NOWHERE ELSE. The CDN import lives in `init-game.js`,
// the module is handed down through this function, and every other file under
// `render/` takes it as a parameter. One pinned version, one failure point, and
// nothing under `sim/` can accidentally reach it.

import { BALLS_GROUP_Y, createBallsView } from "./balls-view.js";
import { createCameraRig } from "./camera.js";
import { createCueView } from "./cue-view.js";
import { createGuidesView } from "./guides-view.js";
import { buildRoom } from "./room.js";
import { BALL_Y, buildTable } from "./table-view.js";

export function createTableScene(THREE, canvas, { cosmetics = { table: {}, hall: {} } } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  // Capped at 2: past that the cost is real and the gain is not visible on any
  // phone that would survive the frame budget anyway.
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08090b);
  // The fog is what makes the hall feel like a room with a light in it rather
  // than a table floating in black. It starts just past the table's far rail.
  scene.fog = new THREE.Fog(0x08090b, 4.8, 10.5);

  // The scene is built FROM a resolved cosmetic configuration rather than
  // built and then repainted: a first frame drawn on the house table and
  // corrected on the second is a flash of the wrong table on every load.
  const room = buildRoom(THREE, scene, { cosmetics: cosmetics.hall });
  const table = buildTable(THREE, scene, { cosmetics: cosmetics.table });
  const balls = createBallsView(THREE, scene, {
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    set: cosmetics.table?.balls ?? undefined,
  });
  const cue = createCueView(THREE, scene);
  const guides = createGuidesView(THREE, scene);
  const rig = createCameraRig(THREE);

  // Pointer picking. The plane sits at the height a ball's centre rides, so a
  // tap lands where the player thinks it does rather than on the cloth beneath.
  //
  // DERIVED, NEVER TYPED. It was hard-coded at 0.262 — the group lift plus the
  // mesh height, but missing the ball's own radius, so the plane sat a full ball
  // radius UNDER the centres. Aiming survived that; picking a ball out of a rack
  // did not, because from a low camera the error projects to more than a ball
  // across. Every centre is coplanar at this height, which is what makes picking
  // off a plane exact rather than a tolerance guess.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BALLS_GROUP_Y + BALL_Y));
  const hitPoint = new THREE.Vector3();

  let width = 1;
  let height = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width));
    const nextHeight = Math.max(1, Math.floor(rect.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    rig.resize(width, height);
  }

  rig.snap(new THREE.Vector3(-1.3, 0.9, 1.45), new THREE.Vector3(0, 0.2, 0));
  resize();

  return {
    scene,
    renderer,
    camera: rig.camera,
    balls,
    cue,
    guides,
    table,
    room,
    resize,

    /**
     * Repaint the table and the hall from a resolved loadout.
     *
     * THE RENDER LAYER'S HALF OF THE COSMETIC CONTRACT. It takes presentation
     * payloads and no item ids, so nothing here can look a cosmetic up, ask
     * whether it is owned, or reach the catalog. Idempotent and cheap enough to
     * call on every preview click: each view compares payload identity per slot
     * and does nothing where nothing changed.
     */
    applyCosmetics(resolved = {}) {
      table.apply(resolved.table ?? {});
      room.apply(resolved.hall ?? {});
      balls.setBallSet(resolved.table?.balls);
    },

    /** The ball set currently painted on, so the hover readout names the right colour. */
    get ballSet() {
      return balls.ballSet;
    },

    /** Point the editor's orbit camera. Returns the clamped orbit. */
    setOrbit(orbit) {
      return rig.setOrbit(orbit);
    },
    getOrbit: () => rig.getOrbit(),

    /** Kick the cue's follow-through. Called when the match reports a strike. */
    strike() {
      cue.strike();
      rig.holdOnStrike();
    },

    /** Rebuild for a new rack. Cheap — the meshes are reused. */
    reset(ballList) {
      balls.reset(ballList);
    },

    /**
     * Advance every view by one frame.
     *
     * @param view everything the render layer needs from the match, gathered by
     *   `init-game.js`. Passing one object rather than eight arguments is what
     *   keeps this signature stable as the game grows.
     */
    sync(dt, view) {
      resize();
      // The pendants hang directly over the table, so from the overhead shot they
      // are all you can see. Hidden geometry only: the light itself never moves,
      // which is why the cloth looks identical from both cameras.
      room.fixture.visible = view.cameraMode !== "over";
      // In the editor the room is part of what is being edited, so the pendant
      // stays visible however the player has orbited — hiding it there would
      // make the light slot uneditable from above.
      if (view.cameraMode === "editor") room.fixture.visible = true;
      cue.update(dt);
      balls.sync(view.balls, view.paused ? 0 : dt);
      cue.place(view.cue, view.angle, view.charge, view.moving);
      guides.update(view.cue, view.moving ? null : view.solution, view.moving ? "off" : view.guideMode, view.placing);
      rig.update(dt, {
        mode: view.cameraMode,
        cue: view.cue,
        balls: view.balls,
        angle: view.angle,
        moving: view.moving,
        width,
      });
    },

    render() {
      renderer.render(scene, rig.camera);
    },

    /** Screen point to a position on the cloth. Null if the ray misses the plane. */
    pointToTable(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(ndc, rig.camera);
      return raycaster.ray.intersectPlane(tablePlane, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
    },

    /** Canvas width in CSS pixels, which is what the layout decisions key off. */
    get width() {
      return width;
    },
  };
}
