export function clampZoom(value: number, min = 0.25, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function computeLiveCanvasWidth(windowWidth: number, viewportRatio = 0.94, maxWidth = 1380): number {
  return Math.min(windowWidth * viewportRatio, maxWidth);
}

export function getLayoutMaxRow(layout: any): number {
  const panels = layout?.desktop?.panels ?? [];
  return panels.reduce((max: number, panel: any) => Math.max(max, (panel.y || 0) + (panel.h || 1)), 0);
}

export interface ComputeFitZoomOptions {
  rowHeight?: number;
  gap?: number;
  rowCount?: number;
  canvasWidth?: number;
  wrapWidth?: number;
  wrapHeight?: number;
  windowWidth?: number;
  windowHeight?: number;
}

export function computeFitZoom({
  rowHeight = 0,
  gap = 0,
  rowCount = 0,
  canvasWidth = 0,
  wrapWidth = 0,
  wrapHeight = 0,
  windowWidth = 0,
  windowHeight = 0,
}: ComputeFitZoomOptions = {}): number {
  const totalHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * gap;
  const availableHeight = wrapHeight || windowHeight * 0.75;
  const availableWidth = wrapWidth || windowWidth;
  const zoomByHeight = totalHeight > 0 ? availableHeight / totalHeight : 1;
  const zoomByWidth = canvasWidth > 0 && availableWidth > 0 ? availableWidth / canvasWidth : 1;
  return clampZoom(Math.min(1, zoomByHeight, zoomByWidth));
}

export interface BuildZoomFrameOptions {
  zoom?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  wrapWidth?: number;
}

export interface ZoomFrame {
  transform: string;
  transformOrigin: string;
  marginLeft: string;
  overflowX: string;
  wrapHeight: string;
}

export function buildZoomFrame({
  zoom = 1,
  canvasWidth = 0,
  canvasHeight = 0,
  wrapWidth = 0,
}: BuildZoomFrameOptions = {}): ZoomFrame {
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
