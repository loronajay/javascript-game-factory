import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";
import { COURT_SCREENS, SCREENS, SCREEN_TRICK_SHOT } from "../scripts/ui/screens.js";
import { createSandboxPiece, BOARD_PIECE, SPRING_PIECE } from "../scripts/sim/trick-shot.js";
import {
  boardProjectedGeometry,
  pieceControlLayout,
  sandboxPieceAtPoint,
  sandboxPieceControlAtPoint,
} from "../scripts/render/trick-shot.js";

suite("trick-shot lab — editor screen and reusable rendering seam");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts", "init-game.js"), "utf8");
const game = fs.readFileSync(path.join(root, "scripts", "trick-shot-game.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "scripts", "render", "trick-shot.js"), "utf8");
const view = fs.readFileSync(path.join(root, "scripts", "ui", "trick-shot-view.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles", "trick-shot.css"), "utf8");

test("the lab is a routed court reached from the marquee", () => {
  assertEqual(SCREEN_TRICK_SHOT, "trickshot");
  assert(SCREENS.includes(SCREEN_TRICK_SHOT));
  assert(COURT_SCREENS.includes(SCREEN_TRICK_SHOT));
  assert(html.includes('id="trickShotScreen"'));
  assert(html.includes('data-command="trickshot"'));
  assert(shell.includes("bootTrickShot"));
});

test("the editor exposes creation, tuning, testing, and a named shot bank", () => {
  for (const id of [
    "trickShotCourt", "trickAddBoard", "trickAddSpring", "trickAddCannon", "trickResetBall",
    "trickUndo", "trickDeletePiece", "trickPowerGauge", "trickPowerFill", "trickPowerReadout",
    "trickDepth", "trickAngle", "trickPitch", "trickPower", "trickDelay",
    "trickShotName", "trickSave", "trickNew", "trickBankList",
  ]) {
    assert(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test("the cannon uses project assets while the rebound pad is perspective-native geometry", () => {
  for (const asset of ["cannon-base.png", "cannon-barrel.png"]) {
    assert(fs.existsSync(path.join(root, "assets", "trick-shot", asset)), `missing ${asset}`);
    assert(fs.statSync(path.join(root, "assets", "trick-shot", asset)).size > 1000, `${asset} is only a placeholder`);
    assert(html.includes(`assets/trick-shot/${asset}`), `${asset} is not shown in the tool tray`);
    assert(renderer.includes(asset), `${asset} is not drawn on the court`);
  }
  assert(!html.includes("rebound-board.png"), "the stretched bar asset must not represent a square rebound pad");
  assert(html.includes("trick-pad-preview"), "the tray needs the same square-pad silhouette as the court");
  assert(renderer.includes("boardProjectedGeometry"), "the pad must be built by projecting its world-space box");
  assert(renderer.includes("drawImage("), "the court never draws the tool art");
});

test("a rebound pad has a projected square face with thickness and body hit testing", () => {
  const pad = createSandboxPiece(BOARD_PIECE, { id: "pad", x: 0.1, y: 0.72, z: 0.5, yaw: 0, angle: 0, length: 0.48 });
  const geometry = boardProjectedGeometry(pad);
  assertEqual(geometry.front.length, 4);
  assertEqual(geometry.back.length, 4);
  assert(geometry.hull.length >= 4, "the projected pad needs a finite silhouette");
  assertEqual(sandboxPieceAtPoint([pad], geometry.centre)?.id, pad.id);

  const turned = createSandboxPiece(BOARD_PIECE, { ...pad, id: "turned", yaw: Math.PI / 2, angle: 0.2 });
  const turnedGeometry = boardProjectedGeometry(turned);
  const turnedWidth = Math.max(...turnedGeometry.hull.map((point) => point.x))
    - Math.min(...turnedGeometry.hull.map((point) => point.x));
  const turnedArea = Math.abs(turnedGeometry.hull.reduce((sum, point, index) => {
    const next = turnedGeometry.hull[(index + 1) % turnedGeometry.hull.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  assert(turnedWidth > 30 && turnedArea > 1000, "the pad's box silhouette survives an edge-on room angle");
});

test("a springboard reuses the square pad geometry but has distinct spring art", () => {
  const spring = createSandboxPiece(SPRING_PIECE, { id: "spring", x: -0.12, y: 0.68, z: 0.55, angle: -0.2 });
  const geometry = boardProjectedGeometry(spring);
  assertEqual(sandboxPieceAtPoint([spring], geometry.centre)?.id, spring.id);
  assert(html.includes("trick-spring-preview"), "the tray needs a recognizable springboard preview");
  // One solid, two skins: a springboard is the same lit block as a rebound pad,
  // told apart by its palette and the compression motif on its impact face.
  assert(renderer.includes("drawSpringFaceMotif"), "springboards need their own face motif");
  assert(renderer.includes("PALETTES"), "each piece kind needs its own palette rather than inline literals");
});

test("a selected piece exposes direct remove and depth handles in the same projection as its collider", () => {
  const board = createSandboxPiece(BOARD_PIECE, { id: "board", x: 0.15, y: 0.7, z: 0.5, angle: 0.2 });
  const controls = pieceControlLayout(board);
  assert(controls.delete && controls.depth, "selected pieces need both controls");
  assertEqual(sandboxPieceControlAtPoint([board], controls.delete, board.id).action, "delete");
  assertEqual(sandboxPieceControlAtPoint([board], controls.depth, board.id).action, "depth");
});

test("delete/backspace and undo are first-class editor actions", () => {
  assert(game.includes('event.key === "Delete"'));
  assert(game.includes('event.key === "Backspace"'));
  assert(game.includes("onUndo"));
  assert(view.includes("onUndo"));
});

test("the on-court power gauge receives live pull power and release state", () => {
  assert(game.includes("power: pull?.power || 0"));
  assert(view.includes("nodes.powerFill"));
  assert(view.includes("RELEASE TO SHOOT"));
});

test("tool orientation offers useful snapped directions through the full room", () => {
  assert(html.includes('id="trickAngle" type="range" min="-180" max="180" step="15"'));
  assert(html.includes('id="trickPitch" type="range" min="5" max="85" step="5"'));
  assert([...html.matchAll(/data-trick-direction=/g)].length >= 8, "common 3D directions need one-tap presets");
  assert(view.includes('isPadPiece(selected) ? "Face tilt" : "Launch angle"'));
});

test("piece art and hit testing use the cabinet's one projection", () => {
  assert(renderer.includes('from "../sim/projection.js"'));
  assert(renderer.includes("projectPoint("));
  assert(!renderer.includes("PROJECTION_ORIGIN_X"), "the piece renderer must not restate the camera");
});

test("furniture occlusion is resolved per entity, and depth is answered on the floor", () => {
  assert(renderer.includes("drawRoomOccluders(ctx, backdrop, locationId, entity.z)"));
  assert(!renderer.includes("const nearestDepth"), "one nearest-depth redraw makes launchers pop behind furniture during flight");
  // A tool drawn smaller and higher up is equally consistent with being further
  // away and with being raised. The floor is where that is answered — a cast
  // shadow always, a footprint ring and tether while building.
  assert(renderer.includes("drawPieceShadow("), "every tool needs a cast shadow at its own depth");
  assert(renderer.includes("drawPieceFloorMark("), "building needs a footprint ring at the tool's own depth");
  assert(renderer.includes("drawBuildFloorGrid("), "the floor needs ruled depths to measure a footprint against");
});

test("editor chrome belongs to build mode, and detail to the selection", () => {
  const frame = renderer.slice(renderer.indexOf("export function renderTrickShotFrame"));
  for (const chrome of ["drawBuildFloorGrid(ctx)", "drawPieceFloorMark(ctx", "drawPieceControls(ctx"]) {
    const at = frame.indexOf(chrome);
    assert(at >= 0, `missing ${chrome}`);
    assert(/building/.test(frame.slice(Math.max(0, at - 220), at)), `${chrome} must be gated on build mode`);
  }
  assert(frame.includes("showPreview: building"), "contact and launch previews have no business over a live shot");
  assert(!renderer.includes('"LAUNCHER"'), "per-piece caption boxes put a label over every tool at once");
});

test("a pad is a lit solid: back faces culled, one light, real thickness", () => {
  const pad = createSandboxPiece(BOARD_PIECE, { id: "lit", x: 0, y: 0.7, z: 0.5, yaw: 0, angle: 0, length: 0.48 });
  const facing = boardProjectedGeometry(pad).faces.filter((face) => face.facing);
  // Below eye level and dead centre: the camera sees the face turned toward it
  // and the top, and nothing else. Both side faces are exactly edge-on there,
  // so a cull that let them through would be inverted.
  assertEqual(facing.length, 2, "a box at screen centre shows exactly two faces");
  assert(facing.some((face) => face.axis === "normal" && face.sign === -1), "the face toward the camera is visible");
  assert(facing.some((face) => face.axis === "up" && face.sign === 1), "a pad below eye level shows its top");

  const high = createSandboxPiece(BOARD_PIECE, { ...pad, id: "high", y: 1.5 });
  const highFacing = boardProjectedGeometry(high).faces.filter((face) => face.facing);
  assert(
    highFacing.some((face) => face.axis === "up" && face.sign === -1),
    "a pad above eye level shows its underside instead",
  );

  // THE TURN MUST NOT BE AN EVAPORATION. A flat plate really does foreshorten to
  // nothing, which is why the collider is a block: edge-on it still has to be a
  // grabbable, visible object rather than a bright hairline.
  const edgeOn = createSandboxPiece(BOARD_PIECE, { ...pad, id: "edge", yaw: Math.PI / 2 });
  const hull = boardProjectedGeometry(edgeOn).hull;
  const width = Math.max(...hull.map((point) => point.x)) - Math.min(...hull.map((point) => point.x));
  assert(width > 30, `an edge-on pad still has a body (was ${width.toFixed(1)}px)`);
  assertEqual(sandboxPieceAtPoint([edgeOn], boardProjectedGeometry(edgeOn).centre)?.id, edgeOn.id);
});

test("the lab owns, advances, and renders fragile-ball splats", () => {
  for (const seam of ["createSplatField", "addSplat", "tickSplatField", "ballSplat", "assets.ballSplats"]) {
    assert(game.includes(seam), `missing splat seam: ${seam}`);
  }
  assert(renderer.includes("drawSplatDecals"), "the lab never paints the marks left on the room");
  assert(renderer.includes("drawSplatParticles"), "the lab never paints the impact burst");
  assert(!/\|\|\s*ball\.splat\)\s*\{\s*resetShot/.test(game), "a splat must remain visible instead of resetting in its birth tick");
});

test("the lab resolves sandbox contacts on physics substeps, not just rendered frames", () => {
  assert(game.includes("PHYSICS_SUBSTEP_SECONDS"));
  assert(game.includes("stepTrickShotPieces("));
  assert(game.includes("stepBall("));
  assert(/while \(accumulator >= TICK_MS\)/.test(game));
});

test("the court canvas always keeps its intrinsic 960 by 760 aspect ratio", () => {
  assert(styles.includes("aspect-ratio: 960 / 760;"), "missing the court's native aspect ratio");
  assert(
    !/\.court-canvas\s*\{[^}]*(?<!max-)height\s*:\s*100%/gs.test(styles),
    "a full-height canvas can be width-clamped and visibly warped",
  );
  assert(/\.trick-court \.court-canvas\s*\{[^}]*height:\s*auto/gs.test(styles));
});

finish();
