// Ambient declarations for the global APIs that 3 always-on scripts attach to.
// As of Phase 8 these are typed ES modules (`.mts` -> emitted `.mjs`), loaded as
// `<script type="module">` on every page before the page entry module:
//   - js/pixel-text.mts       -> window.PixelText
//   - js/arcade-input.mts     -> window.ArcadeInput
//   - js/platform-config.mts  -> globalThis.__JGF_PLATFORM_API_URL__
//
// The modules attach their APIs to the global object (rather than exporting
// values) because every consumer reads the global, not an import. This file
// stays as the permanent ambient contract for those global reads.

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
