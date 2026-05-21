export function clampZoom(value, min = 0.25, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function computeLiveCanvasWidth(windowWidth, viewportRatio = 0.94, maxWidth = 1380) {
  return Math.min(windowWidth * viewportRatio, maxWidth);
}

export function getLayoutMaxRow(layout) {
  const panels = layout?.desktop?.panels ?? [];
  return panels.reduce((max, panel) => Math.max(max, (panel.y || 0) + (panel.h || 1)), 0);
}

export function computeFitZoom({
  rowHeight,
  gap,
  rowCount,
  canvasWidth,
  wrapWidth,
  wrapHeight,
  windowWidth,
  windowHeight,
} = {}) {
  const totalHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * gap;
  const availableHeight = wrapHeight || windowHeight * 0.75;
  const availableWidth = wrapWidth || windowWidth;
  const zoomByHeight = totalHeight > 0 ? availableHeight / totalHeight : 1;
  const zoomByWidth = canvasWidth > 0 && availableWidth > 0 ? availableWidth / canvasWidth : 1;
  return clampZoom(Math.min(1, zoomByHeight, zoomByWidth));
}

export function buildZoomFrame({
  zoom,
  canvasWidth,
  canvasHeight,
  wrapWidth,
} = {}) {
  if (zoom < 1) {
    const scaledWidth = canvasWidth * zoom;
    const translateX = Math.max(0, (wrapWidth - scaledWidth) / 2);
    return {
      transform: `translateX(${translateX}px) scale(${zoom})`,
      transformOrigin: "top left",
      marginLeft: "0",
      overflowX: scaledWidth <= wrapWidth ? "hidden" : "auto",
      wrapHeight: canvasHeight ? `${Math.ceil(canvasHeight * zoom)}px` : "",
    };
  }

  return {
    transform: "",
    transformOrigin: "",
    marginLeft: "",
    overflowX: "auto",
    wrapHeight: "",
  };
}
