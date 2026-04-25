import {
  GRID_PAGE_SIZE,
  fillArcadePageSlots,
  loadArcadeCatalog,
  paginateArcadeGames,
} from "./arcade-catalog.mjs";
import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { initSessionNav } from "./arcade-session-nav.mjs";

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function generateThumb(game) {
  const W = 192;
  const H = 108;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, H);

  const accent = game.accentColor || "#ff6b35";

  if (game.isPlaceholder) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "rgba(2, 18, 10, 0.96)");
    sky.addColorStop(0.45, "rgba(4, 38, 18, 0.92)");
    sky.addColorStop(1, "rgba(0, 0, 0, 0.98)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sunGlow = ctx.createRadialGradient(W / 2, 44, 4, W / 2, 44, 32);
    sunGlow.addColorStop(0, "rgba(144, 255, 196, 0.92)");
    sunGlow.addColorStop(0.45, "rgba(24, 255, 140, 0.22)");
    sunGlow.addColorStop(1, "transparent");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(0, 8, 3, 0.96)";
    ctx.fillRect(0, 64, W, 10);

    ctx.strokeStyle = "rgba(24, 255, 140, 0.5)";
    ctx.lineWidth = 1;
    const gridTop = 70;
    for (let x = -W; x < W * 2; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(W / 2 + (x - W / 2) * 0.28, gridTop);
      ctx.stroke();
    }
    for (let y = gridTop; y < H; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(120, 255, 182, 0.08)";
    for (let y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }

    ctx.fillStyle = "#b6ffd4";
    ctx.font = "bold 34px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", W / 2, 48);

    return canvas;
  }

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "rgba(38, 38, 38, 0.42)");
  sky.addColorStop(0.48, hexToRgba(accent, 0.14));
  sky.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  const sunGlow = ctx.createRadialGradient(W / 2, 44, 8, W / 2, 44, 42);
  sunGlow.addColorStop(0, "rgba(255, 221, 189, 0.95)");
  sunGlow.addColorStop(0.45, hexToRgba(accent, 0.58));
  sunGlow.addColorStop(1, "transparent");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, W, H);

  const skylineY = 62;
  ctx.fillStyle = "rgba(14, 14, 28, 0.96)";
  ctx.fillRect(0, skylineY, W, 8);

  const towers = [
    [18, 50, 8, 12],
    [32, 42, 10, 20],
    [47, 46, 7, 16],
    [64, 38, 11, 24],
    [82, 49, 8, 13],
    [106, 40, 12, 22],
    [128, 52, 9, 10],
    [144, 44, 8, 18],
    [162, 36, 12, 26],
  ];
  towers.forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));

  const gridTop = 72;
  ctx.strokeStyle = hexToRgba(accent, 0.84);
  ctx.lineWidth = 1;

  for (let x = -W; x < W * 2; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(W / 2 + (x - W / 2) * 0.28, gridTop);
    ctx.stroke();
  }

  for (let y = gridTop; y < H; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const heart = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];

  ctx.fillStyle = hexToRgba(accent, 0.96);
  heart.forEach((row, r) => {
    row.forEach((pixel, col) => {
      if (pixel) {
        ctx.fillRect(W / 2 - 5 + col * 2, 56 + r * 2, 2, 2);
      }
    });
  });

  return canvas;
}

function createThumbNode(game) {
  if (game.isPlaceholder) {
    return generateThumb(game);
  }

  if (game.previewImage) {
    const img = document.createElement("img");
    img.src = game.previewImage;
    img.alt = `${game.title} preview`;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = "true";
        img.replaceWith(generateThumb(game));
      }
    }, { once: true });
    return img;
  }

  return generateThumb(game);
}

let sfx = null;

function getSFX() {
  if (sfx) return sfx;
  if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return null;

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfx = {
      hover() {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.03);
      },
      select() {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
      },
    };
  } catch {
    sfx = null;
  }

  return sfx;
}

const track = document.getElementById("gridTrack");
const emptyState = document.getElementById("emptyState");
const pageIndicator = document.getElementById("pageIndicator");
const prevPageButton = document.getElementById("prevPage");
const nextPageButton = document.getElementById("nextPage");
const pagerRow = document.querySelector(".grid-stage__pager");

let pages = [];
let currentPage = 0;
let selectedIndex = 0;
let showGamepadSelection = false;

function createCard(game) {
  const card = document.createElement(game.isPlaceholder ? "article" : "a");
  card.className = ["game-card", ...game.cardClasses].join(" ");

  if (game.isPlaceholder) {
    card.setAttribute("aria-disabled", "true");
  } else {
    card.href = game.href;
  }

  card.innerHTML = `
    <div class="game-card-preview">
      <div class="game-thumb"></div>
      <div class="game-card-copy${game.isPlaceholder ? " game-card-copy--placeholder" : ""}">
        <h2 class="game-title">${game.isPlaceholder ? "COMING SOON" : game.title}</h2>
      </div>
    </div>
  `;

  card.querySelector(".game-thumb").appendChild(createThumbNode(game));

  if (!game.isPlaceholder) {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      getSFX()?.select();
      card.style.transition = "transform 280ms ease-in";
      card.style.transform = "scale(1.05)";
      setTimeout(() => {
        window.location.href = card.href;
      }, 220);
    });

    card.addEventListener("mouseenter", () => {
      const index = visibleCards().indexOf(card);
      if (index !== -1) {
        setSelectedIndex(index);
        getSFX()?.hover();
      }
    });
  }

  return card;
}

function visibleCards() {
  return pages[currentPage] || [];
}

function setSelectedIndex(index) {
  const cards = visibleCards();
  if (!cards.length) return;

  selectedIndex = ((index % cards.length) + cards.length) % cards.length;
  cards.forEach((card, cardIndex) => {
    card.classList.toggle("gamepad-selected", showGamepadSelection && cardIndex === selectedIndex);
  });
}

function syncPager() {
  const totalPages = pages.length || 1;
  pageIndicator.textContent = `${currentPage + 1} / ${totalPages}`;
  prevPageButton.hidden = currentPage === 0;
  nextPageButton.hidden = currentPage >= totalPages - 1;

  if (pagerRow) {
    pagerRow.hidden = totalPages <= 1;
  }
}

function showPage(index, nextSelectedIndex = 0) {
  currentPage = Math.max(0, Math.min(index, pages.length - 1));

  Array.from(track.children).forEach((page, pageIndex) => {
    page.hidden = pageIndex !== currentPage;
  });

  syncPager();
  setSelectedIndex(nextSelectedIndex);
}

function buildPages(games) {
  const chunks = paginateArcadeGames(games, GRID_PAGE_SIZE);
  const sourcePages = chunks.length > 0 ? chunks : [[]];

  pages = [];
  track.innerHTML = "";

  sourcePages.forEach((chunk) => {
    const page = document.createElement("section");
    page.className = "grid-page";

    const grid = document.createElement("div");
    grid.className = "game-grid";

    fillArcadePageSlots(chunk, GRID_PAGE_SIZE).forEach((game) => {
      grid.appendChild(createCard(game));
    });

    page.appendChild(grid);
    track.appendChild(page);
    pages.push(Array.from(grid.querySelectorAll(".game-card:not(.game-card--placeholder)")));
  });

  emptyState.hidden = true;
  track.hidden = false;
}

function moveSelection(delta) {
  const cards = visibleCards();
  if (!cards.length) return;

  const nextIndex = selectedIndex + delta;
  if (nextIndex >= 0 && nextIndex < cards.length) {
    setSelectedIndex(nextIndex);
    return;
  }

  if (delta > 0 && currentPage < pages.length - 1) {
    showPage(currentPage + 1, 0);
    return;
  }

  if (delta < 0 && currentPage > 0) {
    const previousCards = pages[currentPage - 1];
    showPage(currentPage - 1, previousCards.length - 1);
  }
}

prevPageButton.addEventListener("click", () => {
  if (currentPage > 0) {
    showPage(currentPage - 1, 0);
  }
});

nextPageButton.addEventListener("click", () => {
  if (currentPage < pages.length - 1) {
    showPage(currentPage + 1, 0);
  }
});

window.ArcadeInput?.onAction((action) => {
  showGamepadSelection = true;
  setSelectedIndex(selectedIndex);

  if (action === "left" || action === "up") {
    moveSelection(-1);
  }

  if (action === "right" || action === "down") {
    moveSelection(1);
  }

  if (action === "select") {
    visibleCards()[selectedIndex]?.click();
  }
});

const catalog = await loadArcadeCatalog();
initArcadeProfilePanel();
buildPages(catalog);
initSessionNav(document.getElementById("gridAuthNav"), {
  signInPath: "sign-in/index.html",
  signUpPath: "sign-up/index.html",
  homeOnLogout: "index.html",
});

// registered users manage their full profile at /me — hide the guest name chip
try {
  const session = await createAuthApiClient().getSession();
  if (session?.ok && session?.playerId) {
    const chip = document.getElementById("playerProfileButton");
    const panel = document.getElementById("playerProfilePanel");
    if (chip) chip.hidden = true;
    if (panel) panel.hidden = true;
  }
} catch { /* network down, keep chip visible */ }

if (pages.length > 0) {
  showPage(0, 0);
} else {
  syncPager();
}
