/**
 * Layout editor zoom math.
 *
 * The editor canvas is rendered at the live profile width so column proportions
 * match /me exactly, then CSS-scaled to fit the viewport. A scaled element still
 * occupies its unscaled layout box, so the canvas sits inside a "stage" element
 * whose explicit size is the scaled size — that stage is what the canvas viewport
 * actually scrolls and centers.
 */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export function clampZoom(value: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
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

/** Fit never magnifies — 100% is "actual size", and that stays the fit ceiling. */
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
}

export interface ZoomFrame {
  transform: string;
  transformOrigin: string;
  stageWidth: string;
  stageHeight: string;
}

export function buildZoomFrame({
  zoom = 1,
  canvasWidth = 0,
  canvasHeight = 0,
}: BuildZoomFrameOptions = {}): ZoomFrame {
  return {
    transform: zoom === 1 ? "" : `scale(${zoom})`,
    transformOrigin: "top left",
    stageWidth: canvasWidth ? `${Math.ceil(canvasWidth * zoom)}px` : "",
    stageHeight: canvasHeight ? `${Math.ceil(canvasHeight * zoom)}px` : "",
  };
}
