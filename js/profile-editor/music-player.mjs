import { playerTemplate, emptyStateTemplate } from "./music-player-template.mjs";
import { mountPlayerController } from "./music-player-controller.mjs";

export function initProfileMusicPlayer(containerId, playlist, { doc = globalThis.document } = {}) {
  const container = doc?.getElementById?.(containerId);
  if (!container) return null;

  const tracks = Array.isArray(playlist) ? playlist.filter((t) => t?.url) : [];

  container.hidden = false;

  if (tracks.length === 0) {
    container.innerHTML = emptyStateTemplate();
    return { destroy() { container.hidden = true; container.innerHTML = ""; } };
  }

  container.innerHTML = playerTemplate(containerId);

  const controller = mountPlayerController(container, tracks, containerId, doc);

  return {
    destroy() {
      controller.destroy();
      container.hidden = true;
      container.innerHTML = "";
    },
  };
}
