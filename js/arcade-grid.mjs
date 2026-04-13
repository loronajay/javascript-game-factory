import { GRID_PAGE_SIZE, loadArcadeCatalog, paginateArcadeGames } from "./arcade-catalog.mjs";

// --- Thumbnail generation ---

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function generateThumb(game) {
  const W = 192, H = 108;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const accent = game.accentColor || "#ffb84d";

  // Base
  ctx.fillStyle = "#07050f";
  ctx.fillRect(0, 0, W, H);

  // Accent radial glow
  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
  glow.addColorStop(0, hexToRgba(accent, 0.18));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Scanlines
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  // Ground line
  const groundY = 80;
  ctx.strokeStyle = hexToRgba(accent, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  // Center divider (dashed)
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Boy silhouette (cyan) — left side
  const bx = 58, by = groundY - 20;
  ctx.fillStyle = "#8cf6d4";
  ctx.fillRect(bx + 1, by - 6, 6, 6);   // head
  ctx.fillRect(bx, by, 8, 12);            // body
  ctx.fillRect(bx + 8, by + 3, 4, 2);    // arm

  // Girl silhouette (pink) — right side (mirrored)
  const gx = W - 58 - 8, gy = groundY - 20;
  ctx.fillStyle = "#ff80ab";
  ctx.fillRect(gx + 1, gy - 6, 6, 6);
  ctx.fillRect(gx, gy, 8, 12);
  ctx.fillRect(gx - 4, gy + 3, 4, 2);

  // Pixel heart between them
  const hx = W / 2 - 5, hy = groundY - 30;
  const heart = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  ctx.fillStyle = hexToRgba(accent, 0.9);
  heart.forEach((row, r) => {
    row.forEach((px, col) => {
      if (px) ctx.fillRect(hx + col * 2, hy + r * 2, 2, 2);
    });
  });

  // Cabinet label
  ctx.fillStyle = hexToRgba(accent, 0.7);
  ctx.font = "7px Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`CAB ${String(game.order).padStart(2, "0")}`, 6, 6);

  return c;
}

// --- SFX ---

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

let pages = [];
let currentPage = 0;
let selectedIndex = 0;

function createCard(game) {
  const card = document.createElement("a");
  const cardClasses = ["game-card", ...game.cardClasses];
  card.className = cardClasses.join(" ");
  card.href = game.href;
  card.innerHTML = `
    <div class="game-thumb"></div>
    <div class="game-card-content">
      <div class="game-card-topline">
        <span class="game-kicker">Cabinet ${String(game.order).padStart(2, "0")}</span>
        <span class="game-players">${game.players}</span>
      </div>
      <h2 class="game-title">${game.title}</h2>
      <div class="game-card-footer">
        <span>Launch</span>
        <span class="game-chevron">&#x276F;</span>
      </div>
    </div>
    <div class="game-desc-overlay">
      <p class="game-tagline">${game.tagline}</p>
      ${game.description ? `<p class="game-description">${game.description}</p>` : ""}
    </div>
  `;

  card.querySelector(".game-thumb").appendChild(generateThumb(game));

  card.addEventListener("click", (e) => {
    e.preventDefault();
    getSFX()?.select();
    card.style.transition = "transform 280ms ease-in";
    card.style.transform = "scale(1.08)";
    setTimeout(() => {
      window.location.href = card.href;
    }, 260);
  });

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
    card.classList.toggle("gamepad-selected", cardIndex === selectedIndex);
  });
}

function syncPager() {
  const totalPages = pages.length || 1;
  pageIndicator.textContent = `${currentPage + 1} / ${totalPages}`;
  prevPageButton.hidden = currentPage === 0;
  nextPageButton.hidden = currentPage >= totalPages - 1;
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
  pages = [];
  track.innerHTML = "";

  chunks.forEach((chunk) => {
    const page = document.createElement("section");
    page.className = "grid-page";
    const grid = document.createElement("div");
    grid.className = "game-grid";

    chunk.forEach((game) => {
      const card = createCard(game);
      card.addEventListener("mouseenter", () => {
        const index = visibleCards().indexOf(card);
        if (index !== -1) {
          setSelectedIndex(index);
          getSFX()?.hover();
        }
      });
      grid.appendChild(card);
    });

    page.appendChild(grid);
    track.appendChild(page);
    pages.push(Array.from(grid.querySelectorAll(".game-card")));
  });

  emptyState.hidden = games.length > 0;
  track.hidden = games.length === 0;
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
buildPages(catalog);

if (pages.length > 0) {
  showPage(0, 0);
} else {
  syncPager();
}
