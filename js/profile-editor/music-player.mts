import { playerTemplate, emptyStateTemplate } from "./music-player-template.mjs";
import { mountPlayerController } from "./music-player-controller.mjs";

interface MusicPlaylistTrack {
  url?: string;
  title?: string;
  artist?: string;
}

export interface ProfileMusicPlayer {
  destroy(): void;
}

export function renderProfileMusicPlayerPanel(container: HTMLElement | null, playlist: unknown, uid = "profileMusic"): MusicPlaylistTrack[] {
  if (!container) return [];

  const tracks = Array.isArray(playlist) ? (playlist as MusicPlaylistTrack[]).filter((t) => t?.url) : [];
  container.hidden = false;

  if (tracks.length === 0) {
    container.innerHTML = emptyStateTemplate();
    return tracks;
  }

  container.innerHTML = playerTemplate(uid);

  const track = tracks[0];
  const titleEl = container.querySelector(`#${CSS.escape(uid)}-title`);
  const artistEl = container.querySelector(`#${CSS.escape(uid)}-artist`);
  const indexEl = container.querySelector(`#${CSS.escape(uid)}-index`);

  if (titleEl) titleEl.textContent = track.title || "Untitled";
  if (artistEl) artistEl.textContent = track.artist || "";
  if (indexEl) indexEl.textContent = tracks.length > 1 ? `1 / ${tracks.length}` : "";

  return tracks;
}

export function initProfileMusicPlayer(containerId: string, playlist: unknown, { doc = globalThis.document }: { doc?: Document } = {}): ProfileMusicPlayer | null {
  const container = doc?.getElementById?.(containerId);
  if (!container) return null;

  const tracks = renderProfileMusicPlayerPanel(container, playlist, containerId);
  if (tracks.length === 0) {
    return { destroy() { container.hidden = true; container.innerHTML = ""; } };
  }

  const controller = mountPlayerController(container, tracks as { url: string; title?: string; artist?: string }[], containerId, doc);

  return {
    destroy() {
      controller.destroy();
      container.hidden = true;
      container.innerHTML = "";
    },
  };
}
