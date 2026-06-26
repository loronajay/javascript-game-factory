const COMPACT_TOUCH_SHORT_EDGE = 520;
const COMPACT_TOUCH_LONG_EDGE = 950;

export function getViewportPosture({ width, height, coarsePointer = false }) {
  const viewportWidth = Number(width) || 0;
  const viewportHeight = Number(height) || 0;
  const shortEdge = Math.min(viewportWidth, viewportHeight);
  const longEdge = Math.max(viewportWidth, viewportHeight);
  const orientation = viewportWidth > viewportHeight ? "landscape" : "portrait";
  const isCompactTouch =
    Boolean(coarsePointer) &&
    shortEdge > 0 &&
    shortEdge <= COMPACT_TOUCH_SHORT_EDGE &&
    longEdge <= COMPACT_TOUCH_LONG_EDGE;

  return {
    orientation,
    isCompactTouch,
    gateVisible: isCompactTouch && orientation === "portrait",
  };
}

export function shouldRequestFullscreen({
  width,
  height,
  coarsePointer = false,
  fullscreenElement = null,
}) {
  const posture = getViewportPosture({ width, height, coarsePointer });
  return (
    posture.isCompactTouch &&
    posture.orientation === "landscape" &&
    !fullscreenElement
  );
}

export async function requestMobileFullscreen({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  const root = documentRef?.documentElement;
  if (!windowRef || !root?.requestFullscreen) {
    return false;
  }

  const viewport = windowRef.visualViewport;
  const width = Math.round(
    viewport?.width ?? windowRef.innerWidth ?? root.clientWidth ?? 0,
  );
  const height = Math.round(
    viewport?.height ?? windowRef.innerHeight ?? root.clientHeight ?? 0,
  );

  if (
    !shouldRequestFullscreen({
      width,
      height,
      coarsePointer: isCoarsePointer(windowRef),
      fullscreenElement: documentRef.fullscreenElement,
    })
  ) {
    return false;
  }

  try {
    await root.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    // Browsers without a compatible Fullscreen API (notably some iOS builds)
    // still benefit from the compact landscape layout.
    return false;
  }
}

export function applyMobileViewport({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  const root = documentRef?.documentElement;
  if (!windowRef || !root) {
    return { update() {}, destroy() {} };
  }

  const update = () => {
    const viewport = windowRef.visualViewport;
    const width = Math.round(
      viewport?.width ?? windowRef.innerWidth ?? root.clientWidth ?? 0,
    );
    const height = Math.round(
      viewport?.height ?? windowRef.innerHeight ?? root.clientHeight ?? 0,
    );
    const posture = getViewportPosture({
      width,
      height,
      coarsePointer: isCoarsePointer(windowRef),
    });

    root.style.setProperty("--app-height", `${height}px`);
    root.setAttribute("data-viewport-orientation", posture.orientation);
    root.setAttribute("data-compact-touch", posture.isCompactTouch ? "on" : "off");
    root.setAttribute("data-landscape-gate", posture.gateVisible ? "on" : "off");
  };

  const listen = (target, type) => {
    target?.addEventListener?.(type, update, { passive: true });
  };
  const unlisten = (target, type) => {
    target?.removeEventListener?.(type, update);
  };

  update();
  listen(windowRef, "resize");
  listen(windowRef, "orientationchange");
  listen(windowRef.visualViewport, "resize");

  return {
    update,
    destroy() {
      unlisten(windowRef, "resize");
      unlisten(windowRef, "orientationchange");
      unlisten(windowRef.visualViewport, "resize");
    },
  };
}

function isCoarsePointer(windowRef) {
  return Boolean(
    windowRef.matchMedia?.("(pointer: coarse)")?.matches ||
      windowRef.navigator?.maxTouchPoints > 0,
  );
}
