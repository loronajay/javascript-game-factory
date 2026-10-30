export function livestockSpace(homeId, speciesId) {
    return homeId.endsWith("#pen") && speciesId === "livestock.chicken" ? 0.25 : 1;
}
export function occupiedSpace(homes, herd) {
    const counts = new Map(homes.map((home) => [home.id, 0]));
    for (const animal of herd)
        if (animal.homeId && counts.has(animal.homeId)) {
            counts.set(animal.homeId, counts.get(animal.homeId) + livestockSpace(animal.homeId, animal.speciesId));
        }
    return counts;
}
export function freeYoungPlaces(homes, herd, speciesId) {
    const counts = occupiedSpace(homes, herd);
    const takes = (home, species) => !species || !home.species || home.species.includes(species);
    // Large young need general housing. Reserve that first; chicks prefer their coop,
    // then space-efficient pens. A pregnancy must never reserve every species' space.
    const owed = herd.filter((animal) => animal.pregnant).sort((a, b) => Number(a.speciesId === "livestock.chicken") - Number(b.speciesId === "livestock.chicken"));
    for (const mother of owed) {
        const candidates = homes.filter((home) => takes(home, mother.speciesId)).slice().sort((a, b) => {
            if (mother.speciesId === "livestock.chicken")
                return Number(!a.species) - Number(!b.species) || livestockSpace(a.id, mother.speciesId) - livestockSpace(b.id, mother.speciesId);
            return 0;
        });
        const home = candidates.find((entry) => counts.get(entry.id) + livestockSpace(entry.id, mother.speciesId) <= entry.slots);
        if (home)
            counts.set(home.id, counts.get(home.id) + livestockSpace(home.id, mother.speciesId));
    }
    return homes.filter((home) => takes(home, speciesId)).reduce((sum, home) => sum + Math.max(0, Math.floor((home.slots - counts.get(home.id)) / livestockSpace(home.id, speciesId))), 0);
}
