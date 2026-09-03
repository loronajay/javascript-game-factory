// Just enough `document.createElement("canvas")` to run the texture generators
// under node.
//
// It exists so the tests that matter most about cosmetics — that switching one
// moves no geometry, and that nothing physical rides along in a payload — can
// build the table with REAL cosmetics applied rather than with the slots empty.
// A check that only runs on the empty case is a check of the empty case.
//
// It draws nothing. Every 2D context call is a no-op and `getImageData` hands
// back zeroed pixels, because the assertions are about positions and payloads,
// never about colour. Anything that needs to see the pixels belongs in a browser.

const NOOP = () => {};

function context() {
  return new Proxy(
    {
      canvas: null,
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: NOOP,
      createLinearGradient: () => ({ addColorStop: NOOP }),
      createRadialGradient: () => ({ addColorStop: NOOP }),
      measureText: () => ({ width: 10 }),
    },
    {
      // Everything else is either a drawing call or a style property. Returning
      // a no-op for the first and swallowing the second is the whole stub.
      get: (target, key) => (key in target ? target[key] : NOOP),
      set: () => true,
    },
  );
}

/**
 * Install the stub, and return the function that removes it.
 *
 * Always call the returned function in a `finally`: a leaked global `document`
 * would let a later test touch the DOM under node and pass by accident, which is
 * exactly the class of defect `tests/modules.test.js` exists to catch.
 */
export function installCanvasStub() {
  const had = Object.hasOwn(globalThis, "document");
  const previous = globalThis.document;
  globalThis.document = {
    createElement: (tag) => {
      if (tag !== "canvas") return {};
      const canvas = { width: 1, height: 1, getContext: () => context() };
      return canvas;
    },
  };
  return () => {
    if (had) globalThis.document = previous;
    else delete globalThis.document;
  };
}
