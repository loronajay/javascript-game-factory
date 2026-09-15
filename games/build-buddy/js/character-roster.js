export const CHARACTER_ART = 'assets/art/animal-runners.png';
export const CHARACTERS = Object.freeze([
  { id: 'fox', name: 'Pip', species: 'Fox', crop: { x: 45, y: 44, w: 515, h: 637 }, anchor: 0.62 },
  { id: 'rabbit', name: 'Clover', species: 'Rabbit', crop: { x: 625, y: 25, w: 410, h: 657 }, anchor: 0.52 },
  { id: 'raccoon', name: 'Scout', species: 'Raccoon', crop: { x: 1084, y: 121, w: 519, h: 561 }, anchor: 0.64 },
  { id: 'bear', name: 'Mochi', species: 'Bear', crop: { x: 1646, y: 91, w: 442, h: 591 }, anchor: 0.5 },
]);
export function normalizeCharacterId(id) {
  return CHARACTERS.some(character => character.id === id) ? id : 'fox';
}
export function characterById(id) {
  return CHARACTERS.find(character => character.id === normalizeCharacterId(id));
}


