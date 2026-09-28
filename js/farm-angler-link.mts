// The farm's side of the Cove. The farm page asks this module for the angler's
// creel (the fish recipes cook from it), the fish mounted on plaques (build
// mode stands them on Trophy Mounts) and to dress every Trophy Mount on the
// field with its fish. Everything here is read from the server
// (`GET /games/farm/fishing`, `GET /games/farm/fishing/fish`); nothing is
// decided here, and nothing is saved from here.
//
// A Trophy Mount's row names only a fish id. Its fish is shown while that fish
// is MOUNTED and the farm owner's — anything else (a fish since taken down,
// sold on, or a row someone typed by hand) leaves the plaque bare, which is
// what makes a mount impossible to forge without any check in the farm save.

import { normalizeAngler, type Angler, type AnglerFish } from "./farm-angler.mjs";
import { loadFish, type LoadedFish } from "./farm-fish-models.mjs";
import { formatLength, formatWeight, specimenTitle, type FishVariant, type SizeClass } from "./farm-fish.mjs";
import { MOUNT_BOARD, MOUNT_BOARD_MAX, MOUNT_PLATE } from "./farm-props-fish.mjs";
import { canvasPlane } from "./arcade-room-decor-primitives.mjs";
import type { FarmLayout } from "./farm-layout.mjs";
import type { TrophyFishCard } from "./farm-editor-panel.mjs";

type ThreeNamespace = Record<string, any>;

type Api = Readonly<{
  fetchFarmFishing: () => Promise<any>;
  fetchFarmFishDetails: (ids: readonly string[]) => Promise<any>;
}>;

export type MountedFishDetail = AnglerFish & Readonly<{ playerId: string; state: string }>;

export type AnglerLink = Readonly<{
  /** The owner's creel (empty when signed out or visiting). */
  creel: () => readonly AnglerFish[];
  /** Fish mounted and ready to stand on a plaque, as build-mode cards. */
  trophies: () => readonly TrophyFishCard[];
  /** Read the angler again (after a fish recipe was cooked). */
  refresh: () => Promise<void>;
  /** Bring every Trophy Mount on the field into step with its fish. Cheap when nothing changed. */
  dress: (layout: FarmLayout) => void;
}>;

type Dressing = { model: any; fishId: string; fish: LoadedFish | null; extras: any[] };

export function createAnglerLink(options: Readonly<{
  THREE: ThreeNamespace;
  api: Api | null;
  /** Whose farm this is: a mount shows a fish only while that player owns it. */
  ownerId: string;
  /** Only the owner reads their own creel and mounts. */
  isOwner: boolean;
  modelFor: (instanceId: string) => any | undefined;
  onChange?: () => void;
}>): AnglerLink {
  const { THREE, api } = options;
  let angler: Angler | null = null;
  const details = new Map<string, MountedFishDetail | null>();
  const requested = new Set<string>();
  const dressed = new Map<string, Dressing>();
  let pendingLayout: FarmLayout | null = null;

  async function refresh(): Promise<void> {
    if (!api || !options.isOwner) return;
    const next = normalizeAngler(await api.fetchFarmFishing().catch(() => null));
    if (next) angler = next;
    // What the owner has mounted is also what their plaques may show.
    for (const fish of angler?.mounted ?? []) details.set(fish.id, { ...fish, playerId: options.ownerId, state: "mounted" });
    options.onChange?.();
    if (pendingLayout) dress(pendingLayout);
  }

  async function fetchDetails(ids: readonly string[]): Promise<void> {
    if (!api || !ids.length) return;
    for (const id of ids) requested.add(id);
    const answer: any = await api.fetchFarmFishDetails(ids).catch(() => null);
    const found = new Map<string, any>((Array.isArray(answer?.fish) ? answer.fish : []).map((fish: any) => [String(fish.id), fish]));
    for (const id of ids) {
      const fish = found.get(id);
      const normalized = fish ? normalizeAngler({ creel: [fish] })?.creel[0] : null;
      details.set(id, normalized ? { ...normalized, playerId: String(fish.playerId ?? ""), state: String(fish.state ?? "") } : null);
    }
    if (pendingLayout) dress(pendingLayout);
  }

  function undress(instanceId: string): void {
    const entry = dressed.get(instanceId);
    if (!entry) return;
    entry.fish?.dispose();
    for (const extra of entry.extras) extra.removeFromParent();
    const board = entry.model?.getObjectByName?.("trophy-board");
    if (board) {
      board.scale.set(1, 1, 1);
      board.position.y = MOUNT_BOARD.y;
    }
    dressed.delete(instanceId);
  }

  function plate(model: any, fish: AnglerFish): any {
    return canvasPlane(THREE, model, MOUNT_PLATE.width - 0.02, MOUNT_PLATE.height - 0.02, [360, 100], (context, width, height) => {
      context.fillStyle = "#c9a24a";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#3a2708";
      context.textAlign = "center";
      context.font = "bold 30px Georgia, serif";
      context.fillText(specimenTitle(fish.speciesId, fish.variant as FishVariant, fish.sizeClass as SizeClass).slice(0, 22), width / 2, 42);
      context.font = "24px Georgia, serif";
      context.fillText(`${formatWeight(fish.weightG)} · ${formatLength(fish.lengthMm)}`, width / 2, 80);
    }, [0, MOUNT_PLATE.y, MOUNT_PLATE.z + 0.002], false);
  }

  function dressOne(instanceId: string, fishId: string, model: any): void {
    const detail = details.get(fishId);
    const showable = detail && detail.state === "mounted" && (!options.ownerId || detail.playerId === options.ownerId);
    const entry: Dressing = { model, fishId, fish: null, extras: [] };
    dressed.set(instanceId, entry);
    if (!showable) return;
    const lengthM = detail.lengthMm / 1000;
    // The board grows to the fish: a little wider than it, within reason.
    const board = model.getObjectByName?.("trophy-board");
    const width = Math.min(MOUNT_BOARD_MAX, Math.max(MOUNT_BOARD.width, lengthM * 1.12 + 0.3));
    if (board) board.scale.x = width / MOUNT_BOARD.width;
    entry.extras.push(plate(model, detail));
    void loadFish(THREE, detail.speciesId, Math.min(lengthM, MOUNT_BOARD_MAX - 0.2), detail.variant).then((fish) => {
      if (dressed.get(instanceId) !== entry) { fish.dispose(); return; }
      entry.fish = fish;
      // Side on to the room, nose to the left.
      fish.root.rotation.y = Math.PI / 2;
      model.add(fish.root);
      // The board grows tall enough for the fish too, still standing on its posts, and the fish hangs in its middle.
      fish.root.updateMatrixWorld(true);
      const tall = new THREE.Box3().setFromObject(fish.root).getSize(new THREE.Vector3()).y;
      const height = Math.max(MOUNT_BOARD.height, tall * 1.1 + 0.16);
      const bottom = MOUNT_BOARD.y - MOUNT_BOARD.height / 2;
      if (board) {
        board.scale.y = height / MOUNT_BOARD.height;
        board.position.y = bottom + height / 2;
      }
      fish.root.position.set(0, bottom + height / 2, MOUNT_BOARD.z + Math.max(0.06, lengthM * 0.12));
    }).catch(() => undefined);
  }

  function dress(layout: FarmLayout): void {
    pendingLayout = layout;
    const mounts = layout.decor.filter((row) => row.fishId);
    const wanted = new Set(mounts.map((row) => row.instanceId));
    for (const instanceId of [...dressed.keys()]) if (!wanted.has(instanceId)) undress(instanceId);
    const unknown = mounts.map((row) => row.fishId!).filter((id) => !details.has(id) && !requested.has(id));
    if (unknown.length) void fetchDetails(unknown);
    for (const row of mounts) {
      const model = options.modelFor(row.instanceId);
      if (!model) continue;
      const current = dressed.get(row.instanceId);
      // The world rebuilds a model when its row changes item; a new model is dressed afresh.
      if (current && current.model === model && current.fishId === row.fishId) continue;
      if (current) undress(row.instanceId);
      if (!details.has(row.fishId!)) continue;
      dressOne(row.instanceId, row.fishId!, model);
    }
  }

  return Object.freeze({
    creel: () => angler?.creel ?? [],
    trophies: () => (angler?.mounted ?? []).map((fish) => Object.freeze({
      fishId: fish.id,
      title: specimenTitle(fish.speciesId, fish.variant as FishVariant, fish.sizeClass as SizeClass),
      detail: `${formatWeight(fish.weightG)} · ${formatLength(fish.lengthMm)}`,
      portrait: `fish:${fish.speciesId}:${fish.variant}`,
    })),
    refresh,
    dress,
  });
}
