// The overlays: aim line, ghost ball, object path, and the kitchen.
//
// Everything here is drawn with `depthTest: false` and a high `renderOrder`, so
// it sits over the cloth and the balls rather than clipping into them. That is
// deliberate — an aim line that disappears behind the ball it is aimed at is
// worse than no aim line.
//
// THE GEOMETRY COMES FROM `sim/aim.js`. This file draws a solution; it does not
// compute one. That is what guarantees the line the player sees is the line the
// physics will take, and it is the same function the CPU searches with.

import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, HEAD_STRING_X, TABLE_WIDTH } from "../sim/constants.js";

/** Heights above the cloth for each overlay. Ordered so they never z-fight. */
const KITCHEN_Y = 0.264;
const RING_Y = 0.268;
const HEAD_STRING_Y = 0.271;
const LINE_Y = 0.285;
const OBJECT_LINE_Y = 0.287;

export function createGuidesView(THREE, scene) {
  const overlay = (mesh, order) => {
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  };

  const cueLine = overlay(
    new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.84, depthTest: false }),
    ),
    30,
  );

  const objectLine = overlay(
    new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf0ca78, transparent: true, opacity: 0.78, depthTest: false }),
    ),
    30,
  );

  const ghost = overlay(
    new THREE.Mesh(
      new THREE.RingGeometry(BALL_RADIUS * 0.95, BALL_RADIUS * 1.09, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    ),
    31,
  );
  ghost.rotation.x = -Math.PI / 2;

  const placementRing = overlay(
    new THREE.Mesh(
      new THREE.RingGeometry(BALL_RADIUS * 1.38, BALL_RADIUS * 1.72, 48),
      new THREE.MeshBasicMaterial({
        color: 0x69d391,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    ),
    32,
  );
  placementRing.rotation.x = -Math.PI / 2;

  // The kitchen: shown only while a scratch is being spotted, because a
  // permanent line across the cloth would read as part of the table.
  const kitchen = overlay(
    new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_LENGTH / 2, TABLE_WIDTH - BALL_RADIUS * 2),
      new THREE.MeshBasicMaterial({
        color: 0x69d391,
        transparent: true,
        opacity: 0.085,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    ),
    28,
  );
  kitchen.rotation.x = -Math.PI / 2;
  kitchen.position.set((-HALF_LENGTH + HEAD_STRING_X) / 2, KITCHEN_Y, 0);

  const headStringMaterial = new THREE.LineDashedMaterial({
    color: 0x9be4b4,
    transparent: true,
    opacity: 0.9,
    dashSize: 0.035,
    gapSize: 0.023,
    depthTest: false,
  });
  const headString = overlay(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(HEAD_STRING_X, HEAD_STRING_Y, -HALF_WIDTH + BALL_RADIUS),
        new THREE.Vector3(HEAD_STRING_X, HEAD_STRING_Y, HALF_WIDTH - BALL_RADIUS),
      ]),
      headStringMaterial,
    ),
    33,
  );
  headString.computeLineDistances();

  /** Replace a line's points. Disposes the old buffer — these change every frame. */
  function setPoints(line, points) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  const hideAll = () => {
    for (const item of [cueLine, objectLine, ghost, placementRing, kitchen, headString]) item.visible = false;
  };

  return {
    hideAll,

    /**
     * Draw the guides for the current aim.
     *
     * @param cue       the cue ball
     * @param solution  from `sim/aim.js`
     * @param guideMode "full" | "line" | "off"
     * @param placing   `null`, or the ball-in-hand zone being placed in
     */
    update(cue, solution, guideMode, placing = null) {
      if (!cue || cue.pocketed) return hideAll();

      placementRing.visible = Boolean(placing);
      placementRing.position.set(cue.x, RING_Y + 0.001, cue.z);

      const showKitchen = placing === "kitchen";
      kitchen.visible = showKitchen;
      headString.visible = showKitchen;

      if (guideMode === "off" || !solution) {
        cueLine.visible = false;
        objectLine.visible = false;
        ghost.visible = false;
        return;
      }

      cueLine.visible = true;
      setPoints(cueLine, [
        new THREE.Vector3(cue.x, LINE_Y, cue.z),
        new THREE.Vector3(solution.end.x, LINE_Y, solution.end.z),
      ]);

      // The ghost ball and the object path are the "full" tier: they are the
      // assistance that actually reads the cut for the player, so they are what
      // the "line only" setting takes away.
      const showObject = guideMode === "full" && Boolean(solution.contact);
      ghost.visible = showObject;
      objectLine.visible = showObject;
      if (!showObject) return;

      ghost.position.set(solution.contact.x, RING_Y, solution.contact.z);
      const ball = solution.contact.ball;
      setPoints(objectLine, [
        new THREE.Vector3(ball.x, OBJECT_LINE_Y, ball.z),
        new THREE.Vector3(ball.x + solution.object.x * 0.44, OBJECT_LINE_Y, ball.z + solution.object.z * 0.44),
      ]);
    },
  };
}
