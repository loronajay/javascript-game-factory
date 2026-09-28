// Carpentry, in the world: the board on the Workbench while a piece is being
// made (pencil marks, the cut, the nail heads — the bench model's own handle,
// `group.userData.workbench`), and the finished piece set down in front of
// the bench in the finish it earned, until the player walks off or the next
// piece starts. The bench model lives in farm-props-furniture.mts; this file
// only drives it.

import { WORKBENCH_ANCHORS, createFurniturePiece, type WorkbenchHandle } from "./farm-props-furniture.mjs";
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import type { CraftStepKind, PieceStars } from "./farm-catalog/carpentry.mjs";
import type { FarmDecorRow } from "./farm-layout.mjs";
import type { FarmWorld } from "./farm-world.mjs";

type ThreeNamespace = Record<string, any>;

export type WorkshopView = Readonly<{
  /** A piece is started at this bench. */
  begin: (row: FarmDecorRow) => void;
  step: (kind: CraftStepKind) => void;
  progress: (done: number) => void;
  /** The piece is made: show it off in front of the bench. */
  finish: (row: FarmDecorRow, itemId: string, stars: PieceStars) => void;
  cancel: () => void;
  /** The layout changed: a bench that went takes its board and showcase with it. */
  sync: (decor: readonly FarmDecorRow[]) => void;
}>;

export function createWorkshopView(THREE: ThreeNamespace, scene: any, world: FarmWorld): WorkshopView {
  let bench: FarmDecorRow | null = null;
  let showcase: any = null;

  function handleOf(row: FarmDecorRow | null): WorkbenchHandle | null {
    const model = row ? world.modelFor(row.instanceId) : undefined;
    return (model?.userData?.workbench as WorkbenchHandle | undefined) ?? null;
  }

  function clearShowcase(): void {
    if (!showcase) return;
    scene.remove(showcase);
    showcase.traverse?.((child: any) => child.geometry?.dispose?.());
    showcase = null;
  }

  function begin(row: FarmDecorRow): void {
    clearShowcase();
    bench = row;
    handleOf(row)?.setWork("measure");
  }

  function finish(row: FarmDecorRow, itemId: string, stars: PieceStars): void {
    handleOf(row)?.setWork("idle");
    clearShowcase();
    const definition = findFarmDecor(itemId);
    if (!definition) return;
    showcase = createFurniturePiece(THREE, definition.model, itemId, stars);
    // In front of the bench, turned to face the player who made it.
    const { showcase: at } = WORKBENCH_ANCHORS;
    const cos = Math.cos(row.rotationY);
    const sin = Math.sin(row.rotationY);
    showcase.position.set(row.x + at.x * cos + at.z * sin, 0, row.z - at.x * sin + at.z * cos);
    showcase.rotation.y = row.rotationY;
    scene.add(showcase);
  }

  return Object.freeze({
    begin,
    step: (kind) => handleOf(bench)?.setWork(kind),
    progress: (done) => handleOf(bench)?.setProgress(done),
    finish,
    cancel() {
      handleOf(bench)?.setWork("idle");
      bench = null;
    },
    sync(decor) {
      if (bench && !decor.some((row) => row.instanceId === bench!.instanceId)) bench = null;
      // The showcase is a moment, not furniture: any change to the field clears it.
      clearShowcase();
    },
  });
}
