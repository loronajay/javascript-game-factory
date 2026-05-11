/**
 * Pure HTML template functions for the cassette music player.
 * No DOM access, no logic — only returns markup strings.
 */

export function playerTemplate(uid) {
  return `
    <div class="cassette-player" role="region" aria-label="Music player">
      <div class="cassette-player__body">

        <div class="cassette-player__viewport">
          <div class="cassette-player__reel cassette-player__reel--left">
            <div class="cassette-player__reel-hub"></div>
          </div>
          <div class="cassette-player__tape-window"></div>
          <div class="cassette-player__reel cassette-player__reel--right">
            <div class="cassette-player__reel-hub"></div>
          </div>
        </div>

        <div class="cassette-player__label">
          <span class="cassette-player__now-playing">NOW PLAYING</span>
          <span class="cassette-player__title" id="${uid}-title"></span>
          <span class="cassette-player__artist" id="${uid}-artist"></span>
          <span class="cassette-player__index" id="${uid}-index"></span>
        </div>

        <div class="cassette-player__controls">
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
            min="0" max="1" step="0.02" value="1" aria-label="Volume">
        </div>

      </div>
    </div>
  `;
}

export function emptyStateTemplate() {
  return `
    <div class="cassette-empty">
      <span class="cassette-empty__icon" aria-hidden="true">&#128252;</span>
      <p class="cassette-empty__text">No tape loaded</p>
      <p class="cassette-empty__sub">This player hasn't set up their music yet.</p>
    </div>
  `;
}
