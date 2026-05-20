export async function loadBirdDutyManifest(url = "assets/manifest.json") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load Bird Duty manifest: ${response.status}`);
  }
  return response.json();
}

export async function ensureBirdDutyFonts(root = globalThis) {
  const fonts = root.document?.fonts;
  if (!fonts) return;

  await fonts.load('40px "Moonlit Free"');
  await fonts.ready;
}

export function findTarget(manifest, targetName) {
  return manifest.targets.find((target) => target.name === targetName) || null;
}

export function findCostume(target, costumeName) {
  return target?.costumes.find((costume) => costume.name === costumeName) || null;
}

const MOONLIT_FONT_FILE = "703ed40436eb83edf9d93fd02a70a6a2.ttf";

const SVG_VIEWPORT_OVERRIDES = Object.freeze({
  "9975cce3f6a8bdf643c205b1bab14fce.svg": 540,
  "0b721cbd3ba498b8e9fa6e039188364b.svg": 150,
  "18900da9a9262ccc548f37b2eebb619a.svg": 145,
  "4523ca74b7864f4111eb8ede9cd43296.svg": 190,
  "e26185bc2f342df155590c7e58881452.svg": 165,
  "c82e702a71c6566e2cbfccc008317d34.svg": 145,
});

let moonlitFontDataUrlPromise = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function getMoonlitFontDataUrl(basePath) {
  if (!moonlitFontDataUrlPromise) {
    moonlitFontDataUrlPromise = fetch(`${basePath}${MOONLIT_FONT_FILE}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load Moonlit font: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => `data:font/ttf;base64,${arrayBufferToBase64(buffer)}`);
  }

  return moonlitFontDataUrlPromise;
}

function padSvgViewport(svgText, width) {
  return svgText
    .replace(/width="[^"]+"/, `width="${width}"`)
    .replace(/viewBox="0,0,[^,]+,([^"]+)"/, `viewBox="0,0,${width},$1"`);
}

async function normalizeScratchSvg(src, basePath) {
  const fileName = src.split("/").pop();
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Unable to load SVG: ${src}`);

  let svgText = await response.text();
  const paddedWidth = SVG_VIEWPORT_OVERRIDES[fileName];
  if (paddedWidth) svgText = padSvgViewport(svgText, paddedWidth);

  if (svgText.includes("Moonlit Free")) {
    const fontUrl = await getMoonlitFontDataUrl(basePath);
    const style = `<style>@font-face{font-family:"Moonlit Free";src:url("${fontUrl}") format("truetype");}</style>`;
    svgText = svgText.replace(/<svg([^>]*)>/, `<svg$1><defs>${style}</defs>`);
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

export async function loadCostumeImage(costume, basePath = "assets/scratch/") {
  if (!costume?.file) {
    throw new Error("Cannot load a costume without a file");
  }
  const src = `${basePath}${costume.file}`;
  if (costume.format === "svg" || costume.file.endsWith(".svg")) {
    return loadImage(await normalizeScratchSvg(src, basePath));
  }
  return loadImage(src);
}
