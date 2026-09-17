// Colour arithmetic for the room editor's picker: hex ↔ HSV and the loose hex
// parsing a text field needs. Pure so the picker's maths is tested under node;
// the DOM picker in `arcade-room-color-picker.mts` only draws and listens.

export type Hsv = Readonly<{ h: number; s: number; v: number }>;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function channel(value: number): string {
  return Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");
}

/** `#rrggbb` → HSV with hue in degrees [0, 360) and s/v in [0, 1]. */
export function hexToHsv(hex: string): Hsv {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV → `#rrggbb`. Hue wraps, saturation and value clamp. */
export function hsvToHex(hsv: Hsv): string {
  const h = (((Number.isFinite(hsv.h) ? hsv.h : 0) % 360) + 360) % 360;
  const s = clamp01(hsv.s);
  const v = clamp01(hsv.v);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
            : [c, 0, x];
  return `#${channel(r + m)}${channel(g + m)}${channel(b + m)}`;
}

/** What a typed hex means: `#abc`, `abc`, `#aabbcc`, `AABBCC`, with stray spaces. Null when it is not a colour. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(text)) return `#${text}`;
  if (/^[0-9a-f]{3}$/.test(text)) return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`;
  return null;
}
