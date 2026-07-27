// Device profiles for the mobile emulation harness.
//
// Sizes are CSS pixels in LANDSCAPE, because Tactical Arena gates portrait phones
// behind the rotate screen (see src/ui/mobileViewport.js). Pass --portrait to any
// harness script to swap the axes and exercise that gate instead.
//
// `dsf` is the real device pixel ratio. It does not affect layout (CSS px are CSS px)
// — only image sharpness — so the interactive preview defaults to 1 and the headless
// screenshot matrix uses the true value.
//
// Why these specifically:
//   - `min` is the practical floor Tactical Arena has to survive.
//   - `galaxy-s8` is the narrow-and-short worst case for the isometric board.
//   - Everything at height <= 540 trips shouldUseBoardTouchAssist() and the compact
//     landscape posture in mobileViewport.js, which is the code path under test.

export const DEVICES = Object.freeze({
  min: { label: "Minimum supported (640x360)", width: 640, height: 360, dsf: 2 },
  "galaxy-s8": { label: "Galaxy S8 landscape", width: 740, height: 360, dsf: 4 },
  "iphone-se": { label: "iPhone SE landscape", width: 667, height: 375, dsf: 2 },
  pixel5: { label: "Pixel 5 landscape", width: 851, height: 393, dsf: 2.75 },
  "iphone-14-pro": { label: "iPhone 14 Pro landscape", width: 852, height: 393, dsf: 3 },
  pixel8: { label: "Pixel 8 landscape", width: 892, height: 412, dsf: 2.625 },
  "ipad-mini": { label: "iPad mini landscape", width: 1024, height: 768, dsf: 2 },
});

export const DEFAULT_DEVICE = "pixel5";

// The phone profiles, in ascending size order. Used as the default sweep for the
// screenshot matrix — the tablet is excluded because it is not where layout breaks.
export const PHONE_SWEEP = Object.freeze([
  "min",
  "galaxy-s8",
  "iphone-se",
  "pixel5",
  "pixel8",
]);

export function resolveDevice(name, { portrait = false } = {}) {
  const key = String(name || DEFAULT_DEVICE).toLowerCase();
  const profile = DEVICES[key];
  if (!profile) {
    const known = Object.keys(DEVICES).join(", ");
    throw new Error(`Unknown device "${name}". Known devices: ${known}`);
  }
  const width = portrait ? profile.height : profile.width;
  const height = portrait ? profile.width : profile.height;
  return { key, ...profile, width, height, portrait };
}

export function describeDevices() {
  return Object.entries(DEVICES)
    .map(([key, d]) => `  ${key.padEnd(15)} ${d.label} @${d.dsf}x`)
    .join("\n");
}
