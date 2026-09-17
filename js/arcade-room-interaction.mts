export const CABINET_SESSION_READY = "ready" as const;
export const CABINET_SESSION_PLAYING = "playing" as const;
export const CABINET_SESSION_CLOSED = "closed" as const;

type HorizontalVector = Readonly<{ x: number; z: number }>;
type PlayerPose = HorizontalVector & Readonly<{ forward: HorizontalVector }>;
type CabinetInteractionTarget = Readonly<{
  position: HorizontalVector;
  forward: HorizontalVector;
  radius: number;
  facingThreshold: number;
}>;
type CabinetSessionStatus =
  | typeof CABINET_SESSION_READY
  | typeof CABINET_SESSION_PLAYING
  | typeof CABINET_SESSION_CLOSED;

export type CabinetSession = Readonly<{ cabinetId: string; status: CabinetSessionStatus }>;

function normalizedDot(a: HorizontalVector, b: HorizontalVector): number {
  const aLength = Math.hypot(a.x, a.z);
  const bLength = Math.hypot(b.x, b.z);
  if (aLength === 0 || bLength === 0) return -1;
  return (a.x * b.x + a.z * b.z) / (aLength * bLength);
}

export function canInteractWithCabinet(player: PlayerPose, cabinet: CabinetInteractionTarget): boolean {
  const cabinetToPlayer = {
    x: player.x - cabinet.position.x,
    z: player.z - cabinet.position.z,
  };
  const distance = Math.hypot(cabinetToPlayer.x, cabinetToPlayer.z);
  if (distance > cabinet.radius) return false;

  const playerToCabinet = { x: -cabinetToPlayer.x, z: -cabinetToPlayer.z };
  const playerIsFacingCabinet = normalizedDot(player.forward, playerToCabinet) >= cabinet.facingThreshold;
  const playerIsInFront = normalizedDot(cabinet.forward, cabinetToPlayer) >= 0;
  return playerIsFacingCabinet && playerIsInFront;
}

export function getCabinetPrompt(canInteract: boolean, title: string): string {
  return canInteract ? `Press E to play ${title}` : "";
}

export function createCabinetSession(cabinetId: string): CabinetSession {
  return Object.freeze({ cabinetId, status: CABINET_SESSION_READY });
}

export function openCabinetSession(session: CabinetSession): CabinetSession {
  if (session.status === CABINET_SESSION_PLAYING) return session;
  return Object.freeze({ ...session, status: CABINET_SESSION_PLAYING });
}

export function closeCabinetSession(session: CabinetSession): CabinetSession {
  if (session.status === CABINET_SESSION_CLOSED) return session;
  return Object.freeze({ ...session, status: CABINET_SESSION_CLOSED });
}
