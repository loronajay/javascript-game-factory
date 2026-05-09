const MUSIC_PLAYLIST_MAX = 5;
const MUSIC_TRACK_TITLE_MAX = 80;
const MUSIC_TRACK_ARTIST_MAX = 60;
const AUDIO_ACCEPT = "audio/mpeg,audio/ogg,audio/wav";

function emptySlot() {
  return { url: "", title: "", artist: "", uploading: false, status: "" };
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSlotHtml(slot, index) {
  const isEmpty = !slot.url;
  const draggable = !isEmpty && !slot.uploading;
  return `
    <div class="music-slot${isEmpty ? " music-slot--empty" : ""}${slot.uploading ? " music-slot--uploading" : ""}"
      draggable="${draggable}"
      data-slot-index="${index}">
      <span class="music-slot__handle" aria-hidden="true"${isEmpty ? ' style="visibility:hidden"' : ""}>&#8942;</span>
      <div class="music-slot__body">
        <div class="music-slot__inputs">
          <input
            type="text"
            class="player-card__input player-card__input--compact"
            placeholder="Track title"
            maxlength="${MUSIC_TRACK_TITLE_MAX}"
            data-music-title="${index}"
            value="${escapeAttr(slot.title)}"
          >
          <input
            type="text"
            class="player-card__input player-card__input--compact"
            placeholder="Artist"
            maxlength="${MUSIC_TRACK_ARTIST_MAX}"
            data-music-artist="${index}"
            value="${escapeAttr(slot.artist)}"
          >
        </div>
        <div class="music-slot__controls">
          <button
            type="button"
            class="player-card__action player-card__action--secondary music-slot__upload-btn"
            data-music-upload="${index}"
            ${slot.uploading ? "disabled" : ""}
          >${slot.uploading ? "Uploading…" : isEmpty ? "Add Track" : "Replace"}</button>
          ${!isEmpty ? `<button type="button" class="music-slot__clear" data-music-clear="${index}" aria-label="Remove track">×</button>` : ""}
        </div>
        <input type="file" class="music-slot__file-input" data-music-file="${index}" accept="${AUDIO_ACCEPT}" hidden>
        ${slot.status ? `<p class="music-slot__status" aria-live="polite">${escapeHtml(slot.status)}</p>` : ""}
        ${slot.url && !slot.uploading ? `<span class="music-slot__ready">✓ ${escapeHtml(slot.title || "Track loaded")}</span>` : ""}
      </div>
    </div>
  `.trim();
}

export function createMusicEditor({ doc = globalThis.document, apiClient } = {}) {
  let pendingSlots = Array.from({ length: MUSIC_PLAYLIST_MAX }, emptySlot);
  let dragSrcIndex = -1;
  let container = null;

  function render() {
    if (!container) return;
    container.innerHTML = pendingSlots.map((slot, i) => buildSlotHtml(slot, i)).join("");
  }

  function handleClick(event) {
    const uploadBtn = event.target.closest("[data-music-upload]");
    if (uploadBtn) {
      const index = Number(uploadBtn.dataset.musicUpload);
      const fileInput = container.querySelector(`[data-music-file="${index}"]`);
      fileInput?.click();
      return;
    }

    const clearBtn = event.target.closest("[data-music-clear]");
    if (clearBtn) {
      const index = Number(clearBtn.dataset.musicClear);
      pendingSlots[index] = emptySlot();
      render();
    }
  }

  async function handleChange(event) {
    if (!event.target.matches("[data-music-file]")) return;
    const index = Number(event.target.dataset.musicFile);
    const file = event.target.files?.[0];
    if (!file) return;

    pendingSlots[index] = { ...pendingSlots[index], uploading: true, status: "Uploading…" };
    render();

    if (!apiClient?.isConfigured || typeof apiClient.uploadMusic !== "function") {
      pendingSlots[index] = { ...pendingSlots[index], uploading: false, status: "Upload not available — API not connected." };
      render();
      return;
    }

    const result = await apiClient.uploadMusic(file).catch(() => null);

    if (!result?.url) {
      const code = result?.uploadError || "";
      const msg = code === "file_too_large" ? "File too large (max 20 MB)."
        : code === "unsupported_file_type" ? "Use MP3, OGG, or WAV."
        : "Upload failed. Try again.";
      pendingSlots[index] = { ...pendingSlots[index], uploading: false, status: msg };
      render();
      return;
    }

    pendingSlots[index] = { ...pendingSlots[index], url: result.url, uploading: false, status: "" };
    render();
  }

  function handleInput(event) {
    if (event.target.matches("[data-music-title]")) {
      const index = Number(event.target.dataset.musicTitle);
      pendingSlots[index] = { ...pendingSlots[index], title: event.target.value };
      return;
    }
    if (event.target.matches("[data-music-artist]")) {
      const index = Number(event.target.dataset.musicArtist);
      pendingSlots[index] = { ...pendingSlots[index], artist: event.target.value };
    }
  }

  function handleDragStart(event) {
    const slot = event.target.closest(".music-slot");
    if (!slot || slot.getAttribute("draggable") !== "true") return;
    dragSrcIndex = Number(slot.dataset.slotIndex);
    slot.classList.add("music-slot--dragging");
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event) {
    const slot = event.target.closest(".music-slot");
    if (!slot) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    container.querySelectorAll(".music-slot--drag-over").forEach((el) => el.classList.remove("music-slot--drag-over"));
    slot.classList.add("music-slot--drag-over");
  }

  function handleDragLeave(event) {
    if (!event.relatedTarget || !container.contains(event.relatedTarget)) {
      container.querySelectorAll(".music-slot--drag-over").forEach((el) => el.classList.remove("music-slot--drag-over"));
    }
  }

  function handleDrop(event) {
    const slot = event.target.closest(".music-slot");
    if (!slot) return;
    event.preventDefault();
    const dropIndex = Number(slot.dataset.slotIndex);
    if (dragSrcIndex === -1 || dragSrcIndex === dropIndex) {
      dragSrcIndex = -1;
      render();
      return;
    }
    const reordered = [...pendingSlots];
    const [removed] = reordered.splice(dragSrcIndex, 1);
    reordered.splice(dropIndex, 0, removed);
    pendingSlots = reordered;
    dragSrcIndex = -1;
    render();
  }

  function handleDragEnd() {
    dragSrcIndex = -1;
    container?.querySelectorAll(".music-slot--drag-over, .music-slot--dragging").forEach((el) => {
      el.classList.remove("music-slot--drag-over", "music-slot--dragging");
    });
  }

  function mount(el) {
    container = el;
    if (!container) return;
    container.addEventListener("click", handleClick);
    container.addEventListener("change", handleChange);
    container.addEventListener("input", handleInput);
    container.addEventListener("dragstart", handleDragStart);
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", handleDragLeave);
    container.addEventListener("drop", handleDrop);
    container.addEventListener("dragend", handleDragEnd);
    render();
  }

  return {
    mount,
    seedFromProfile(playlist) {
      const tracks = Array.isArray(playlist) ? playlist.slice(0, MUSIC_PLAYLIST_MAX) : [];
      pendingSlots = Array.from({ length: MUSIC_PLAYLIST_MAX }, (_, i) => {
        const track = tracks[i];
        if (!track?.url) return emptySlot();
        return { url: track.url, title: track.title || "", artist: track.artist || "", uploading: false, status: "" };
      });
      render();
    },
    getPendingPlaylist() {
      return pendingSlots
        .filter((slot) => slot.url)
        .map((slot) => ({ url: slot.url, title: slot.title, artist: slot.artist }));
    },
    reset() {
      pendingSlots = Array.from({ length: MUSIC_PLAYLIST_MAX }, emptySlot);
      render();
    },
  };
}
