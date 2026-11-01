export const FARM_LOTS = Object.freeze([
    Object.freeze({ id: "lot.smallholding", title: "Cedar Hollow", size: 40, price: 25000,
        setting: "A secluded forest homestead", theme: "woodland", preview: "cedar-hollow.png",
        description: "Start another farm in a sheltered clearing among towering cedars. Mossy boulders, a mountain stream and wooded ridgelines frame a much roomier home.",
        features: ["40 x 40 m of usable farmland", "Cedar forest and mountain-stream scenery", "Exclusive Cedar Creek fishing access", "A separate farm; your other properties stay intact"] }),
    Object.freeze({ id: "lot.estate", title: "Sunwater Estate", size: 56, price: 100000,
        setting: "Your own lakeside country estate", theme: "lakeside", preview: "sunwater-estate.png",
        description: "Settle on a broad lakeside property with a private shoreline, an old orchard and a view across the water. Space for a proper working farm and a new chapter alongside your other farms.",
        features: ["56 x 56 m of usable farmland", "Lake, private pier and orchard scenery", "Private lake fishing and a direct riding trail to the Downs", "A separate farm; your other properties stay intact"] }),
]);
export function farmLotBounds(layout) {
    const size = FARM_LOTS.find((lot) => lot.id === layout.lot)?.size ?? 28;
    return { width: size, depth: size, wallInset: 0.3 };
}
