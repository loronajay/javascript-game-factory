/**
 * Audio state machine and DOM event wiring for the cassette player.
 * Receives pre-rendered DOM (via container) and a track list.
 * Knows nothing about how the HTML is structured beyond the element IDs it queries.
 */

export function mountPlayerController(container, tracks, uid, doc) {
  const audio = doc.createElement("audio");
  audio.preload = "metadata";

  let currentIndex = 0;

  const titleEl  = doc.getElementById(`${uid}-title`);
  const artistEl = doc.getElementById(`${uid}-artist`);
  const indexEl  = doc.getElementById(`${uid}-index`);
  const prevBtn  = doc.getElementById(`${uid}-prev`);
  const playBtn  = doc.getElementById(`${uid}-play`);
  const nextBtn  = doc.getElementById(`${uid}-next`);
  const muteBtn  = doc.getElementById(`${uid}-mute`);

  const reelEls  = container.querySelectorAll(".cassette-player__reel");

  function setReelSpinning(spinning) {
    reelEls.forEach((r) => {
      if (spinning) r.classList.add("cassette-player__reel--spinning");
      else r.classList.remove("cassette-player__reel--spinning");
    });
  }

  function updateDisplay() {
    const track = tracks[currentIndex];
    if (titleEl)  titleEl.textContent  = track.title  || "Untitled";
    if (artistEl) artistEl.textContent = track.artist || "";
    if (indexEl)  indexEl.textContent  = tracks.length > 1 ? `${currentIndex + 1} / ${tracks.length}` : "";

    const playing = !audio.paused;
    if (playBtn) {
      const icon = playBtn.querySelector(".cassette-btn__icon");
      if (icon) icon.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    if (muteBtn) {
      const icon = muteBtn.querySelector(".cassette-btn__icon");
      if (icon) icon.innerHTML = audio.muted ? "&#128263;" : "&#128266;";
      muteBtn.setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
    }

    setReelSpinning(playing);
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

  prevBtn?.addEventListener("click", () => { loadTrack(currentIndex - 1); tryPlay(); });
  nextBtn?.addEventListener("click", () => { loadTrack(currentIndex + 1); tryPlay(); });

  muteBtn?.addEventListener("click", () => {
    audio.muted = !audio.muted;
    updateDisplay();
  });

  return {
    destroy() {
      audio.pause();
      audio.src = "";
    },
  };
}
