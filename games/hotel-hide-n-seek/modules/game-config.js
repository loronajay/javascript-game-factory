export const CONFIG = Object.freeze({
  eyeHeight: 1.7,
  crouchEyeHeight: 1.02,
  crouchSpeed: 2.45,
  walkSpeed: 4.2,
  sprintSpeed: 6.8,
  playerRadius: 0.34,
  bodyHeight: 1.78,
  groundSnap: 0.62,
  interactDistance: 3,
  floorHeight: 4.6,
  doorOpenAngle: Math.PI / 2,
  doorSpeed: 5.2,
  drawerSpeed: 2.4,
  elevatorSpeed: 2.15,
  elevatorDoorSpeed: 1.35,
  elevatorCenterX: 2.5,
  elevatorCenterZ: 57.45,
  elevatorFrontZ: 55.88,
  elevatorHalfWidth: 1.25,
  elevatorHalfDepth: 1.6,
  enemyWalkSpeed: 2.25,
  enemyChaseSpeed: 4.85,
  enemyCatchDistance: 1.05,
});

export const floorY = (id) => (id - 1) * CONFIG.floorHeight;
export const keyIdForFloor = (id) => `floor-${id}-master`;
export const keyLabelForFloor = (id) => `Floor ${id} Master Key`;

export const FLOOR_DEFS = Object.freeze([
  { id: 1, name: 'Lobby Floor', openRooms: ['105', '111'], lockedRooms: ['107', '113'], roomVariants: { 111: 'suite', 113: 'maintenance' }, keyPlacements: { 105: keyIdForFloor(1) }, secretRooms: ['105', '107'], secretLinks: [['105', '107']] },
  { id: 2, name: 'Lounge Floor', openRooms: ['202', '208', '213'], lockedRooms: ['204', '210'], roomVariants: { 202: 'suite', 204: 'maintenance', 213: 'suite' }, keyPlacements: { 204: keyIdForFloor(2) }, secretRooms: ['202', '204'], secretLinks: [['202', '204']] },
  { id: 3, name: 'Quiet Floor', openRooms: ['305', '312'], lockedRooms: ['302', '307', '308', '314'], roomVariants: { 305: 'suite', 314: 'maintenance' }, keyPlacements: { 305: keyIdForFloor(3) }, secretRooms: ['305', '307'], secretLinks: [['305', '307']] },
  { id: 4, name: 'Renovation Floor', openRooms: ['405', '412'], lockedRooms: ['402', '407', '408', '414'], roomVariants: { 407: 'maintenance', 414: 'maintenance' }, keyPlacements: { 407: keyIdForFloor(4) }, secretRooms: ['405', '407'], secretLinks: [['405', '407']] },
]);

export const inspectionViews = Object.freeze({
  stair: { x: 6.75, y: 1.78, z: 43.8, yaw: Math.PI, pitch: 0.08 },
  stairEntrance: { x: 2.35, y: floorY(2) + 1.78, z: 44.15, yaw: -Math.PI / 2, pitch: 0 },
  doorway: { x: 0, y: floorY(4) + CONFIG.eyeHeight, z: 10, yaw: Math.PI / 2, pitch: 0 },
  monster: { x: 0, y: CONFIG.eyeHeight, z: 31.5, yaw: 0, pitch: 0 },
});
