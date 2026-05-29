/**
 * Pure HTML template functions for the cassette music player.
 * No DOM access, no logic; only returns markup strings.
 */

import { PROFILE_MUSIC_DEFAULT_VOLUME } from "./constants.mjs";

export function playerTemplate(uid: string): string {
  return `
    <div class="cassette-player cassette-player__surface" data-profile-child-id="playerSurface" role="region" aria-label="Music player"></div>

    <div class="cassette-player__viewport" data-profile-child-id="deck">
      <div class="cassette-player__reel cassette-player__reel--left">
        <div class="cassette-player__reel-hub"></div>
      </div>
      <div class="cassette-player__tape-window"></div>
      <div class="cassette-player__reel cassette-player__reel--right">
        <div class="cassette-player__reel-hub"></div>
      </div>
    </div>

    <div class="cassette-player__label" data-profile-child-id="trackLabel">
      <span class="cassette-player__now-playing">NOW PLAYING</span>
      <span class="cassette-player__title" id="${uid}-title"></span>
      <span class="cassette-player__artist" id="${uid}-artist"></span>
      <span class="cassette-player__index" id="${uid}-index"></span>
    </div>

    <div class="cassette-player__controls" data-profile-child-id="controls">
      <button type="button" class="cassette-btn cassette-btn--prev" id="${uid}-prev" aria-label="Previous track" title="Previous">
        <span aria-hidden="true">&#9198;</span>
      </button>
      <button type="button" class="cassette-btn cassette-btn--play" id="${uid}-play" aria-label="Play">
        <span class="cassette-btn__icon" aria-hidden="true">&#9654;</span>
      </button>
      <button type="button" class="cassette-btn cassette-btn--next" id="${uid}-next" aria-label="Next track" title="Next">
        <span aria-hidden="true">&#9197;</span>
      </button>
      <button type="button" class="cassette-btn cassette-btn--mute" id="${uid}-mute" aria-label="Mute">
        <span class="cassette-btn__icon" aria-hidden="true">&#128266;</span>
      </button>
      <input type="range" class="cassette-volume" id="${uid}-volume"
        min="0" max="1" step="0.02" value="${PROFILE_MUSIC_DEFAULT_VOLUME}" aria-label="Volume">
    </div>
  `;
}

export function emptyStateTemplate(): string {
  return `
    <div class="cassette-empty" data-profile-child-id="playerSurface">
      <span class="cassette-empty__icon" aria-hidden="true">&#128252;</span>
      <p class="cassette-empty__text">No tape loaded</p>
      <p class="cassette-empty__sub">This player hasn't set up their music yet.</p>
    </div>
  `;
}
