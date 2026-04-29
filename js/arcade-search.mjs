import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { initSessionNav, renderPrimaryAppNav } from "./arcade-session-nav.mjs";

const api = createPlatformApiClient();

function buildInitials(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function renderResults(players) {
  const list = document.getElementById("searchResults");
  if (!list) return;

  if (!players.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = players.map((p) => {
    const profileUrl = `../player/index.html?id=${encodeURIComponent(p.playerId)}`;
    const initials = buildInitials(p.profileName);
    const tagline = p.tagline ? `<p class="search-result-card__tagline">${p.tagline}</p>` : "";
    return `
      <li>
        <a class="search-result-card" href="${profileUrl}">
          <div class="search-result-card__avatar">${initials}</div>
          <div class="search-result-card__info">
            <p class="search-result-card__name">${p.profileName || p.playerId}</p>
            ${tagline}
          </div>
          <span class="search-result-card__arrow">&#x276F;</span>
        </a>
      </li>
    `;
  }).join("");
}

function setFlash(message) {
  const el = document.getElementById("searchFlash");
  if (el) el.textContent = message;
}

function setSearching(searching) {
  const btn = document.getElementById("searchBtn");
  if (btn) {
    btn.disabled = searching;
    btn.textContent = searching ? "Searching..." : "Search";
  }
}

async function runSearch(query) {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    setFlash("Enter a name to search.");
    return;
  }

  if (!api.isConfigured) {
    setFlash("Search is unavailable right now.");
    return;
  }

  setFlash("");
  setSearching(true);

  const players = await api.searchPlayers(trimmed);

  setSearching(false);

  if (!Array.isArray(players)) {
    setFlash("Could not reach the server. Try again.");
    return;
  }

  renderResults(players);
  setFlash(players.length === 0 ? "No registered pilots matched that search." : "");
}

document.addEventListener("DOMContentLoaded", () => {
  renderPrimaryAppNav(document.getElementById("searchPrimaryNav"), {
    basePath: "../",
    currentPage: "search",
    linkClass: "search-stage__portal",
    sessionNavId: "searchAuthNav",
  });
  void initSessionNav(document.getElementById("searchAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
  });

  const input = document.getElementById("searchInput");
  const btn = document.getElementById("searchBtn");

  if (!input || !btn) return;

  btn.addEventListener("click", () => { void runSearch(input.value); });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { void runSearch(input.value); }
  });

  // Pre-fill from URL ?q= param
  const preQuery = new URLSearchParams(window.location.search).get("q") || "";
  if (preQuery) {
    input.value = preQuery;
    void runSearch(preQuery);
  }
});
