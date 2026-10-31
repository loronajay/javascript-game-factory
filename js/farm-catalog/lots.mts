import type { RoomBounds } from "../arcade-room-layout.mjs";
export const FARM_LOTS = Object.freeze([
  Object.freeze({ id: "lot.smallholding", title: "Cedar Hollow", size: 40, price: 3500,
    setting: "A secluded forest homestead", theme: "woodland", preview: "cedar-hollow.png",
    description: "Trade the open meadow for a sheltered clearing among towering cedars. Mossy boulders, a mountain stream and wooded ridgelines frame a much roomier home.",
    features: ["40 x 40 m of usable farmland", "Cedar forest and mountain-stream scenery", "Exclusive Cedar Creek fishing access", "Your buildings, animals and crops move with you"] }),
  Object.freeze({ id: "lot.estate", title: "Sunwater Estate", size: 56, price: 8000,
    setting: "Your own lakeside country estate", theme: "lakeside", preview: "sunwater-estate.png",
    description: "Settle on a broad lakeside property with a private shoreline, an old orchard and a view across the water. Space for a proper working farm and the life you have been building.",
    features: ["56 x 56 m of usable farmland", "Lake, private pier and orchard scenery", "Private lake fishing and a direct riding trail to the Downs", "Your buildings, animals and crops move with you"] }),
]);
export function farmLotBounds(layout: { lot?: string }): RoomBounds {
  const size = FARM_LOTS.find((lot) => lot.id === layout.lot)?.size ?? 28;
  return { width: size, depth: size, wallInset: 0.3 };
}
