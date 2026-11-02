import type { RoomBounds } from "../arcade-room-layout.mjs";
export const FARM_LOTS = Object.freeze([
  Object.freeze({ id: "lot.smallholding", title: "Cedar Hollow", size: 40, price: 25000,
    setting: "A secluded forest homestead", theme: "woodland", preview: "cedar-hollow.png",
    description: "Start another farm in a sheltered clearing among towering cedars. Mossy boulders, a mountain stream and wooded ridgelines frame a much roomier home.",
    features: ["40 x 40 m of usable farmland", "Cedar forest and mountain-stream scenery", "Exclusive Cedar Creek fishing access", "A separate farm; your other properties stay intact"] }),
  Object.freeze({ id: "lot.estate", title: "Sunwater Estate", size: 56, price: 100000,
    setting: "Your own lakeside country estate", theme: "lakeside", preview: "sunwater-estate.png",
    description: "Settle on a broad lakeside property with a private shoreline, an old orchard and a view across the water. Space for a proper working farm and a new chapter alongside your other farms.",
    features: ["56 x 56 m of usable farmland", "Lake, private pier and orchard scenery", "Private lake fishing and a direct riding trail to the Downs", "A separate farm; your other properties stay intact"] }),
  Object.freeze({ id: "lot.orchard", title: "Orchard Isle Homestead", size: 40, price: 35000,
    setting: "A working farm above Orchard Harbor", theme: "orchard", preview: "",
    description: "Put down roots among the island's orchards and whitewashed cottages. Grow the island's specialty crops, raise livestock and walk down to the harbor market. Your mainland farms remain yours.",
    features: ["40 x 40 m of usable farmland", "Orchards, coastal gardens and island surroundings", "Island-only pepper and lavender crops", "A separate farm, with its own animals, crops and buildings"] }),
]);
export function farmLotBounds(layout: { lot?: string }): RoomBounds {
  const size = FARM_LOTS.find((lot) => lot.id === layout.lot)?.size ?? 28;
  return { width: size, depth: size, wallInset: 0.3 };
}
