// Ambient declarations for the 3 classic <script> globals.
// These files are loaded as non-module scripts and attach to `window`:
//   - js/pixel-text.js       -> window.PixelText
//   - js/arcade-input.js     -> window.ArcadeInput
//   - js/platform-config.js  -> globalThis.__JGF_PLATFORM_API_URL__
//
// This is a Phase 0 stub so the rest of the platform can type-check while still
// referencing these globals. Phase 8 converts the source files to ES modules
// and this file is deleted in favor of real exports.

interface PixelTextApi {
  /** Render pixel-font text into a single element. */
  render(element: HTMLElement): void;
  /** Re-render every pixel-text element under the given root (defaults to document). */
  renderAll(root?: Document | HTMLElement): void;
}

interface ArcadeInputApi {
  /** Register a listener for arcade navigation actions. */
  onAction(listener: (action: string, source: string) => void): void;
}

declare var PixelText: PixelTextApi;
declare var ArcadeInput: ArcadeInputApi;
declare var __JGF_PLATFORM_API_URL__: string | undefined;
declare var __JGF_LAST_FRIEND_REQUEST_ERROR__: string | undefined;

interface Window {
  PixelText: PixelTextApi;
  ArcadeInput: ArcadeInputApi;
  __JGF_PLATFORM_API_URL__?: string;
}
