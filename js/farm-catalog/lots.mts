import type { RoomBounds } from "../arcade-room-layout.mjs";
export const FARM_LOTS = Object.freeze([
  Object.freeze({ id: "lot.smallholding", title: "Smallholding · 40 × 40 m", size: 40, price: 3500 }),
  Object.freeze({ id: "lot.estate", title: "Country Estate · 56 × 56 m", size: 56, price: 8000 }),
]);
export function farmLotBounds(layout: { lot?: string }): RoomBounds {
  const size = FARM_LOTS.find((lot) => lot.id === layout.lot)?.size ?? 28;
  return { width: size, depth: size, wallInset: 0.3 };
}
