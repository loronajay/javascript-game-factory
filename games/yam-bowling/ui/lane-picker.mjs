import { $, escapeHtml } from "./dom.mjs";

// The player's own lane preference: picked here, persisted here, and handed
// upward as a slug. This module deliberately does NOT own `applyMatchLane` —
// deciding which house a match is bowled in is match logic (a local match takes
// this pick, an online match takes the lane the server dealt), so the picker
// only reports a choice and calls `onPreview` to keep the backdrop live.
export function createLanePicker({ laneCore, audio, onPreview }) {
  let selectedSlug = laneCore.loadLaneSlug();

  function apply(slug, persist = false) {
    selectedSlug = persist ? laneCore.saveLaneSlug(slug) : laneCore.getLane(slug).slug;
    const lane = laneCore.getLane(selectedSlug);
    const art = $("lane-button-art");
    art.src = lane.thumbnailSrc;
    art.alt = "";
    $("lane-button-name").textContent = lane.name;
    $("lane-button-description").textContent = lane.description;
    $("lane-button").title = `Current lane: ${lane.name}`;

    for (const card of $("lane-grid").querySelectorAll("[data-lane-slug]")) {
      const selected = card.dataset.laneSlug === selectedSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }

    // The backdrop swaps immediately so the picker reads as a live preview.
    onPreview(selectedSlug);
  }

  function build() {
    const grid = $("lane-grid");
    for (const lane of laneCore.LANES) {
      const card = document.createElement("button");
      card.className = "lane-card";
      card.type = "button";
      card.setAttribute("data-lane-slug", lane.slug);
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${lane.thumbnailSrc}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(lane.name)}</strong><small>${escapeHtml(lane.description)}</small></span>`;
      card.addEventListener("click", () => {
        apply(lane.slug, true);
        $("lane-dialog").close();
      });
      grid.appendChild(card);
    }
    apply(selectedSlug);

    $("lane-button").addEventListener("click", () => {
      $("lane-dialog").showModal();
      audio.play("popup");
    });
    $("lane-close").addEventListener("click", () => $("lane-dialog").close());
  }

  return { build, getSelectedSlug: () => selectedSlug };
}
