import { CHARACTER_COLOR_OPTIONS, CHARACTERS, CHARACTER_ART, normalizeCharacterCosmetics, normalizeCharacterId } from './characters.js';
import { characterColorHex } from './character-cosmetics.js';
import { drawCharacterPreview, observeCharacterPreview } from './character-preview.js';

const DEFAULT_PICKER_COLORS = Object.freeze({ scarfColor: '#159aa2', shoeColor: '#159aa2', furColor: '#c77842' });

export function createTrailingTask(task, {
  delay = 75,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let timer = null;
  const cancel = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  return {
    schedule() {
      cancel();
      timer = setTimer(() => {
        timer = null;
        task();
      }, delay);
    },
    flush() {
      cancel();
      task();
    },
    cancel,
  };
}

export function createCharacterPicker({ players, onSelect, onCustomize = () => {}, online = false }) {
  const section = document.createElement('section');
  section.className = 'character-picker';
  const title = document.createElement('h3');
  title.textContent = online ? 'Choose your runner' : 'Choose your buddies';
  const description = document.createElement('p');
  description.textContent = 'Choose a buddy, tune every color, and preview the exact look you will take into the run.';
  section.append(title, description);
  players.forEach((player, index) => {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = online ? 'Your character' : `${player.displayName} · ${index === 0 ? 'runs first' : 'runs next'}`;
    group.append(legend);
    const appearance = {
      characterId: normalizeCharacterId(player.characterId),
      cosmetics: normalizeCharacterCosmetics(player.cosmetics),
    };
    const preview = document.createElement('canvas');
    preview.className = 'character-live-preview';
    preview.width = 210;
    preview.height = 180;
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', `${player.displayName || 'Your'} customized character preview`);
    group.append(preview);
    drawCharacterPreview(preview, appearance);
    observeCharacterPreview(preview, appearance);
    const row = document.createElement('div');
    row.className = 'character-options';
    const buttons = [];
    CHARACTERS.forEach(character => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'character-option';
      button.setAttribute('aria-label', `${character.name} the ${character.species}`);
      button.setAttribute('aria-pressed', String(normalizeCharacterId(player.characterId) === character.id));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const { x, y, w, h } = character.crop;
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      svg.setAttribute('aria-hidden', 'true');
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('href', CHARACTER_ART);
      image.setAttribute('width', '2172');
      image.setAttribute('height', '724');
      svg.append(image);
      const name = document.createElement('strong');
      name.textContent = character.name;
      const species = document.createElement('span');
      species.textContent = character.species;
      button.append(svg, name, species);
      button.addEventListener('click', () => {
        appearance.characterId = character.id;
        onSelect(index, character.id);
        buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        drawCharacterPreview(preview, appearance);
      });
      buttons.push(button);
      row.append(button);
    });
    group.append(row);
    const cosmetics = appearance.cosmetics;
    const customizer = document.createElement('div');
    customizer.className = 'character-customizer';
    for (const [key, label] of [['scarfColor', 'Scarf'], ['shoeColor', 'Shoes'], ['furColor', 'Fur']]) {
      const colorGroup = document.createElement('div');
      colorGroup.className = 'color-choice-group';
      const colorLabel = document.createElement('span');
      colorLabel.textContent = label;
      colorGroup.append(colorLabel);
      const swatches = [];
      for (const option of CHARACTER_COLOR_OPTIONS[key]) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `color-swatch${option.hex ? '' : ' color-swatch-classic'}`;
        swatch.setAttribute('aria-label', `${label}: ${option.label}`);
        swatch.setAttribute('aria-pressed', String(cosmetics[key] === option.id));
        swatch.title = option.label;
        if (option.hex) swatch.style?.setProperty?.('--swatch-color', option.hex);
        swatch.addEventListener('click', () => {
          cosmetics[key] = option.id;
          onCustomize(index, key, option.id);
          swatches.forEach(other => other.setAttribute('aria-pressed', String(other === swatch)));
          colorInput.value = option.hex || DEFAULT_PICKER_COLORS[key];
          drawCharacterPreview(preview, appearance);
        });
        swatches.push(swatch);
        colorGroup.append(swatch);
      }
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'color-wheel';
      colorInput.value = characterColorHex(key, cosmetics[key]) || DEFAULT_PICKER_COLORS[key];
      colorInput.title = `Custom ${label.toLowerCase()} color`;
      colorInput.setAttribute('aria-label', `Custom ${label.toLowerCase()} color wheel`);
      const previewUpdate = createTrailingTask(() => drawCharacterPreview(preview, appearance));
      colorInput.addEventListener('input', () => {
        cosmetics[key] = colorInput.value;
        swatches.forEach(other => other.setAttribute('aria-pressed', 'false'));
        previewUpdate.schedule();
      });
      colorInput.addEventListener('change', () => {
        cosmetics[key] = colorInput.value;
        onCustomize(index, key, colorInput.value);
        swatches.forEach(other => other.setAttribute('aria-pressed', 'false'));
        previewUpdate.flush();
      });
      colorGroup.append(colorInput);
      customizer.append(colorGroup);
    }
    group.append(customizer);
    section.append(group);
  });
  return section;
}
