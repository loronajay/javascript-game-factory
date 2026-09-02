// The cue-contact widget: a drawn cue ball with a draggable tip mark.
//
// Its own module because it is the one piece of 2D canvas in the cabinet, and
// because it is a control rather than a readout — it produces a value, and the
// match owns that value. It draws whatever it is told and reports where it was
// dragged; it never remembers the contact point itself.

/** Radius of the ball as a fraction of the widget. Leaves room for the mark at the rim. */
const BALL_FRACTION = 0.43;

export function createSpinDial(canvas, { onChange } = {}) {
  if (!canvas) return { draw() {}, destroy() {} };
  const ctx = canvas.getContext("2d");
  let dragging = false;

  /**
   * Where a pointer is, in contact-point space: (0,0) is centre ball, (0,1) the
   * top of the ball. Clamped to the circle, because dragging past the rim means
   * maximum rather than nothing.
   */
  function pointToContact(event) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = (event.clientX - cx) / (rect.width * BALL_FRACTION);
    let y = -(event.clientY - cy) / (rect.height * BALL_FRACTION);
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { spinX: x, spinY: y };
  }

  const report = (event) => onChange?.(pointToContact(event));

  const onDown = (event) => {
    dragging = true;
    canvas.setPointerCapture?.(event.pointerId);
    report(event);
  };
  const onMove = (event) => {
    if (dragging) report(event);
  };
  const onUp = () => {
    dragging = false;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return {
    /** Redraw for a contact point. Cheap enough to call on every state change. */
    draw(spinX = 0, spinY = 0) {
      const { width, height } = canvas;
      const cx = width / 2;
      const cy = height / 2;
      const r = width * BALL_FRACTION;

      ctx.clearRect(0, 0, width, height);

      // The ball, lit from the upper left so it reads as a sphere rather than a
      // disc — the same direction the hall's pendants light the real one.
      const shade = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 4, cx, cy, r);
      shade.addColorStop(0, "#ffffff");
      shade.addColorStop(1, "#cfcfca");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair, so centre ball is findable without dragging around for it.
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      // The tip mark. Inset from the rim so it stays fully visible at full offset.
      ctx.fillStyle = "#b12626";
      ctx.beginPath();
      ctx.arc(cx + spinX * r * 0.78, cy - spinY * r * 0.78, 7, 0, Math.PI * 2);
      ctx.fill();
    },

    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    },
  };
}
