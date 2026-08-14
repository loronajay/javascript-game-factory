// The VS card: the painted splash, and a driver in each of its two slots.
//
// Canvas only. Everything about *who* is on the card was decided in
// `ui/versus.js`; this file puts them in the holes the artwork already has.
//
// ## The slots are measured off the art, not laid out
//
// `assets/vs-splash.jpg` is not a backdrop with room in the middle — it is a
// frame: two neon-bordered squares either side of a lightning strike with VS
// burned into it. So the two portraits go **inside those borders**, and their
// positions are fractions of the image measured off the file (the campaign map's
// rule) rather than numbers that happened to look right at 1280x720.
//
// Because they are fractions of the *image*, they are mapped through the same
// cover transform the image itself is drawn with, so a slot cannot drift off its
// painted frame at any canvas size. `sourceRect` is the one place that mapping
// happens.

import { WORLD } from "./scene.js";
import { fitContain } from "./setup.js";
import { liverySprite } from "./livery.js";

export const VS_SPLASH = "assets/vs-splash.jpg";

/**
 * The two neon frames, as fractions of the source image.
 *
 * Measured off the 1024x572 original by scanning for the frames' own colour —
 * the red rectangle spans x 88-344 and the blue x 678-936, both y 160-448 — the
 * same way the campaign map's nodes were found rather than typed. Re-measure the
 * same way if the art is re-authored; do not nudge a number.
 */
export const VS_SLOTS = {
  player: { x: 88 / 1024, y: 160 / 572, width: 256 / 1024, height: 288 / 572 },
  opponent: { x: 678 / 1024, y: 160 / 572, width: 258 / 1024, height: 288 / 572 },
};

/**
 * The furniture under the slots: the car each driver is bringing, their stat
 * line, and the bar that says the curtain lifts on its own.
 *
 * As numbers rather than inline offsets because they all land in the ~150px
 * between the foot of the painted frame and the bottom of the screen, and the
 * first cut had the timer bar drawn straight through the cars.
 * `tests/versus.test.js` sweeps them.
 */
export const VS_FOOTER = {
  car: { top: 570, width: 104, height: 74 },
  stat: { y: 664 },
  bar: { y: 682, width: 320, height: 3 },
  hint: { y: 706 },
};

const INK = "#f2f4f8";
const DIM = "#9aa3b2";

function label(ctx, value, x, y, { size = 14, colour = DIM, weight = "600", align = "left", spacing = 0 } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (spacing) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(value, x, y);
  // `ctx.letterSpacing` is sticky on the context — the menus' rule.
  if (spacing) ctx.letterSpacing = "0px";
}

const ready = (image) => Boolean(image && image.complete && image.naturalWidth > 0);

/**
 * Where the splash is actually drawn, covering the canvas.
 *
 * Exported because the slots are meaningless without it, and because a test can
 * then check that both slots land on screen without a canvas.
 */
export function splashRect(image) {
  const width = ready(image) ? image.naturalWidth : 1024;
  const height = ready(image) ? image.naturalHeight : 572;
  const scale = Math.max(WORLD.width / width, WORLD.height / height);
  return {
    x: (WORLD.width - width * scale) / 2,
    y: (WORLD.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

/** A slot's screen rect, given where the splash landed. */
export function slotRect(side, image) {
  const frame = splashRect(image);
  const slot = VS_SLOTS[side];
  return {
    x: frame.x + slot.x * frame.width,
    y: frame.y + slot.y * frame.height,
    width: slot.width * frame.width,
    height: slot.height * frame.height,
  };
}

/**
 * A driver's face, filling the neon frame.
 *
 * Cover rather than contain, the profile card's rule and for its reason: the
 * portraits are square and the frames are not, and letterboxing inside a painted
 * neon border would look like a mistake in the artwork rather than in the code.
 * A portrait that has not loaded — or does not exist, which is the ordinary case
 * for a campaign event's anonymous local — draws the initial on a plate in the
 * driver's own accent.
 */
function drawFace(ctx, rect, driver, image) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  if (ready(image)) {
    const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    // Anchored a little above centre: these are portraits, and the head is the
    // half worth keeping when there is more image than frame.
    ctx.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) * 0.35, width, height);
  } else {
    ctx.fillStyle = "rgba(8,10,16,0.9)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    label(ctx, driver.initial, rect.x + rect.width / 2, rect.y + rect.height / 2 + rect.height * 0.16, {
      size: rect.height * 0.42,
      colour: driver.accent,
      weight: "800",
      align: "center",
    });
  }

  // A wash up from the foot of the slot, so the name plate underneath has
  // something to sit against whatever the portrait happens to be doing there.
  const wash = ctx.createLinearGradient(0, rect.y + rect.height * 0.55, 0, rect.y + rect.height);
  wash.addColorStop(0, "rgba(4,6,10,0)");
  wash.addColorStop(1, "rgba(4,6,10,0.85)");
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y + rect.height * 0.55, rect.width, rect.height * 0.45);
  ctx.restore();
}

/** The car a driver is bringing, drawn small under their name. */
function drawCar(ctx, rect, driver, { sheetImages, liveryCache }) {
  if (!driver.model) return;
  const image = sheetImages?.get(driver.model.sheetId);
  if (!ready(image)) return;
  const fit = fitContain(driver.model.sw, driver.model.sh, rect, 2);
  const sprite = liveryCache && driver.livery
    ? liverySprite(liveryCache, { image, model: driver.model, livery: driver.livery })
    : null;
  if (sprite) {
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, fit.x, fit.y, fit.width, fit.height);
  } else {
    ctx.drawImage(image, driver.model.sx, driver.model.sy, driver.model.sw, driver.model.sh, fit.x, fit.y, fit.width, fit.height);
  }
}

function drawDriver(ctx, side, driver, { splashImage, image, sheetImages, liveryCache, entrance }) {
  // Through the same image the splash was drawn from, so the slot cannot land
  // anywhere but on its own painted frame — see `slotRect`.
  const rect = slotRect(side, splashImage);
  ctx.save();
  // The two halves slide in from their own edges. `entrance` is the progress, so
  // the offset is what is *left* of it: a card drawn after the entrance has been
  // stepped past is already in place.
  ctx.translate((side === "player" ? -1 : 1) * (1 - entrance) * 260, 0);
  ctx.globalAlpha = 0.25 + 0.75 * entrance;

  drawFace(ctx, rect, driver, image);

  // The neon frame is painted into the splash, so this is a *second*, tighter
  // line in the driver's own accent: it says which of the two you are, which the
  // artwork's fixed red-and-blue cannot.
  ctx.strokeStyle = driver.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);

  label(ctx, driver.tag, rect.x + rect.width / 2, rect.y + rect.height - 46, {
    size: 12,
    colour: driver.accent,
    align: "center",
    spacing: 2,
  });
  label(ctx, driver.name, rect.x + rect.width / 2, rect.y + rect.height - 18, {
    size: 28,
    colour: INK,
    weight: "800",
    align: "center",
  });

  drawCar(
    ctx,
    {
      x: rect.x + rect.width / 2 - VS_FOOTER.car.width / 2,
      y: VS_FOOTER.car.top,
      width: VS_FOOTER.car.width,
      height: VS_FOOTER.car.height,
    },
    driver,
    { sheetImages, liveryCache },
  );

  if (driver.stat) {
    label(ctx, driver.stat, rect.x + rect.width / 2, VS_FOOTER.stat.y, {
      size: 14,
      colour: DIM,
      align: "center",
    });
  }
  ctx.restore();
}

export function drawVersus(ctx, view, { splashImage, faces, sheetImages, liveryCache = null }) {
  ctx.fillStyle = "#05070b";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  if (ready(splashImage)) {
    const frame = splashRect(splashImage);
    ctx.drawImage(splashImage, frame.x, frame.y, frame.width, frame.height);
  }
  // A light scrim only: the artwork is the point, and it is already night.
  ctx.fillStyle = "rgba(4,6,10,0.22)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  drawDriver(ctx, "player", view.player, {
    splashImage,
    image: faces?.get(view.player.imageSrc),
    sheetImages,
    liveryCache,
    entrance: view.entrance,
  });
  if (view.opponent) {
    drawDriver(ctx, "opponent", view.opponent, {
      splashImage,
      image: faces?.get(view.opponent.imageSrc),
      sheetImages,
      liveryCache,
      entrance: view.entrance,
    });
  }

  if (view.headline) {
    label(ctx, view.headline, WORLD.width / 2, 62, { size: 26, colour: INK, weight: "800", align: "center", spacing: 4 });
  }
  if (view.subtitle) {
    label(ctx, view.subtitle, WORLD.width / 2, 88, { size: 13, colour: DIM, align: "center", spacing: 2 });
  }

  // The bar says the curtain lifts on its own. Without it a card that
  // disappears mid-glance reads as a dropped frame rather than as a timer.
  // Held clear of the very bottom edge, and below the cars rather than through
  // them: everything down here shares about 150px between the foot of the
  // painted frame and the edge of the screen. See `VS_FOOTER`.
  const bar = {
    x: WORLD.width / 2 - VS_FOOTER.bar.width / 2,
    y: VS_FOOTER.bar.y,
    width: VS_FOOTER.bar.width,
    height: VS_FOOTER.bar.height,
  };
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  ctx.fillStyle = "#ff5a2e";
  ctx.fillRect(bar.x, bar.y, bar.width * view.hold, bar.height);
  // On a plate, and a shade brighter than a hint would normally be: this line
  // lands on the artwork's lightning strike, which is the brightest thing on the
  // screen, and small grey type over it simply disappears — the title screen's
  // control legend had the same problem over the tyre smoke and the same answer.
  ctx.save();
  ctx.fillStyle = "rgba(4,6,10,0.55)";
  ctx.beginPath();
  ctx.roundRect(WORLD.width / 2 - 130, VS_FOOTER.hint.y - 14, 260, 20, 6);
  ctx.fill();
  ctx.restore();
  label(ctx, "ANY KEY TO GET ON WITH IT", WORLD.width / 2, VS_FOOTER.hint.y, {
    size: 11,
    colour: DIM,
    align: "center",
    spacing: 2,
  });
}
