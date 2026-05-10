export function initProfileMusicPlayer(containerId, playlist, { doc = globalThis.document } = {}) {
  const container = doc?.getElementById?.(containerId);
  if (!container) return null;

  const tracks = Array.isArray(playlist) ? playlist.filter((t) => t?.url) : [];

  if (tracks.length === 0) {
    container.hidden = true;
    return { destroy() { container.hidden = true; } };
  }

  container.hidden = false;

  let currentIndex = 0;
  const audio = doc.createElement("audio");
  audio.preload = "metadata";

  const uid = containerId;

  container.innerHTML = `
    <h3 class="music-panel__label">NOW PLAYING</h3>
    <div class="music-player">
      <div class="music-player__track">
        <span class="music-player__title" id="${uid}-title"></span>
        <span class="music-player__artist" id="${uid}-artist"></span>
        <span class="music-player__index" id="${uid}-index"></span>
      </div>
      <div class="music-player__controls">
        <button type="button" class="music-player__btn" id="${uid}-prev" aria-label="Previous track" title="Previous">&#9198;</button>
        <button type="button" class="music-player__btn music-player__btn--play" id="${uid}-play" aria-label="Play">&#9654;</button>
        <button type="button" class="music-player__btn" id="${uid}-next" aria-label="Next track" title="Next">&#9197;</button>
        <button type="button" class="music-player__btn music-player__btn--mute" id="${uid}-mute" aria-label="Mute">&#128266;</button>
      </div>
    </div>
  `;

  const titleEl = doc.getElementById(`${uid}-title`);
  const artistEl = doc.getElementById(`${uid}-artist`);
  const indexEl = doc.getElementById(`${uid}-index`);
  const prevBtn = doc.getElementById(`${uid}-prev`);
  const playBtn = doc.getElementById(`${uid}-play`);
  const nextBtn = doc.getElementById(`${uid}-next`);
  const muteBtn = doc.getElementById(`${uid}-mute`);

  function updateDisplay() {
    const track = tracks[currentIndex];
    if (titleEl) titleEl.textContent = track.title || "Untitled";
    if (artistEl) artistEl.textContent = track.artist || "";
    if (indexEl) indexEl.textContent = tracks.length > 1 ? `${currentIndex + 1} / ${tracks.length}` : "";
    if (playBtn) playBtn.innerHTML = audio.paused ? "&#9654;" : "&#9646;&#9646;";
    if (muteBtn) muteBtn.innerHTML = audio.muted ? "&#128263;" : "&#128266;";
  }

  function loadTrack(index) {
    currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    audio.src = tracks[currentIndex].url;
    updateDisplay();
  }

  function tryPlay() {
    audio.play().then(() => updateDisplay()).catch(() => updateDisplay());
  }

  loadTrack(0);
  tryPlay();

  audio.addEventListener("ended", () => {
    if (tracks.length <= 1) return;
    loadTrack(currentIndex + 1);
    tryPlay();
  });

  playBtn?.addEventListener("click", () => {
    if (audio.paused) tryPlay();
    else { audio.pause(); updateDisplay(); }
  });

  prevBtn?.addEventListener("click", () => {
    loadTrack(currentIndex - 1);
    tryPlay();
  });

  nextBtn?.addEventListener("click", () => {
    loadTrack(currentIndex + 1);
    tryPlay();
  });

  muteBtn?.addEventListener("click", () => {
    audio.muted = !audio.muted;
    updateDisplay();
  });

  return {
    destroy() {
      audio.pause();
      audio.src = "";
      container.hidden = true;
      container.innerHTML = "";
    },
  };
}
