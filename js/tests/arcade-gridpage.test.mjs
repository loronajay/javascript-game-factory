import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

const repoRoot = resolve(import.meta.dirname, "..", "..");
const gridHtml = readFileSync(resolve(repoRoot, "grid.html"), "utf8");
const arcadeBaseCss = readFileSync(resolve(repoRoot, "css", "arcade.css"), "utf8");
let gridStageCss = "";
try { gridStageCss = readFileSync(resolve(repoRoot, "css", "grid-stage.css"), "utf8"); } catch { }
let profileEditorCardCss = "";
try { profileEditorCardCss = readFileSync(resolve(repoRoot, "css", "profile-editor-card.css"), "utf8"); } catch { }
let sessionNavCss = "";
try { sessionNavCss = readFileSync(resolve(repoRoot, "css", "session-nav.css"), "utf8"); } catch { }
const arcadeCss = `${arcadeBaseCss}\n${sessionNavCss}\n${profileEditorCardCss}\n${gridStageCss}`;
const gridScript = readFileSync(resolve(repoRoot, "js", "arcade-grid.mjs"), "utf8");

console.log("\narcade-gridpage");

test("grid page presents the arcade as a searchable catalog", () => {
  assert(gridHtml.includes('class="grid-page-shell"'), "expected a synthwave grid page shell");
  assert(gridHtml.includes('class="grid-stage"'), "expected a scene stage wrapper");
  assert(gridHtml.includes('grid-stage__header'), "expected a centered grid header block");
  assert(gridHtml.includes('grid-stage__nav'), "expected a dedicated nav cluster in the top controls");
  assert(gridHtml.includes('href="css/session-nav.css"'), "expected shared session-nav stylesheet for account controls");
  assert(gridHtml.includes('href="css/profile-editor-card.css"'), "expected shared profile-editor-card stylesheet for the player panel");
  assert(gridHtml.includes('href="css/grid-stage.css"'), "expected shared grid-stage stylesheet for the arcade grid shell");
  assert(gridHtml.includes('src="js/platform-config.mjs"'), "expected shared platform api config include");
  // The grid shell upgraded from a static Me link to the shared signed-in primary nav,
  // which is JS-injected into the gridPrimaryNav mount and includes the Me destination.
  assert(gridHtml.includes('id="gridPrimaryNav"'), "expected shared primary-nav mount in the grid shell");
  assert(gridScript.includes("renderPrimaryAppNav"), "expected grid shell to render the shared signed-in nav");
  assert(gridHtml.includes('id="playerProfileButton"'), "expected a player-card trigger in the shell");
  assert(gridHtml.includes('id="playerProfilePanel"'), "expected a player-card panel mount");
  assert(gridHtml.includes('id="catalogSearch"'), "expected a catalog search input");
  assert(gridHtml.includes('id="categoryFilters"'), "expected generated category filters");
  assert(gridHtml.includes('id="dimensionFilters"'), "expected 2D/3D format filters");
  assert(gridHtml.includes('id="modeFilter"'), "expected a play-mode filter");
  assert(gridHtml.includes('id="catalogResults"'), "expected an accessible result count");
  assert(gridHtml.includes(">GAME GRID<"), "expected the reference title to stay intact");
  assert(gridHtml.includes(">PLAYER CARD<"), "expected the shell profile card title");
  assert(gridHtml.includes("Pick a cabinet and jump right in."), "expected the reference subtitle");
});

test("grid page removes old utility bars and keeps the grid mount", () => {
  assert(!gridHtml.includes('class="page-topbar"'), "expected old top bar chrome to be removed");
  assert(!gridHtml.includes('class="floor-bar"'), "expected old floor status bar to be removed");
  assert(gridHtml.includes('id="gridTrack"'), "expected interactive grid mount");
});

test("arcade CSS defines responsive catalog cards and filter controls", () => {
  assert(arcadeCss.includes(".app-shell-nav__utility-link"), "expected shared session utility styling");
  assert(arcadeCss.includes("grid-template-columns: repeat(auto-fill, minmax("), "expected a responsive catalog grid");
  assert(arcadeCss.includes(".grid-stage__header"), "expected centered header styling");
  assert(arcadeCss.includes(".grid-stage__nav"), "expected grid nav cluster styling");
  assert(arcadeCss.includes("width: min(100%, 1120px);"), "expected the controls rail to fit the stage instead of a fixed viewport fraction");
  assert(arcadeCss.includes("width: min(82vw, 760px);"), "expected grid header to keep its relative position with viewport-based sizing");
  assert(arcadeCss.includes(".grid-stage__portal"), "expected player-page portal styling");
  assert(arcadeCss.includes(".profile-chip"), "expected a shell profile trigger style");
  assert(arcadeCss.includes(".player-card"), "expected a dedicated player-card panel style");
  assert(arcadeCss.includes(".grid-board"), "expected dedicated board layout styling");
  assert(arcadeCss.includes(".catalog-toolbar"), "expected catalog toolbar styling");
  assert(arcadeCss.includes(".catalog-filter-chip"), "expected category chip styling");
  assert(arcadeCss.includes(".game-card__meta"), "expected visible card metadata styling");
  assert(arcadeCss.includes(".game-card__tagline"), "expected accurate cabinet copy on catalog cards");
  assert(arcadeCss.includes(".game-card__footer"), "expected player count and launch affordance on catalog cards");
  assert(arcadeCss.includes(".game-card__video"), "expected video preview layering");
  assert(arcadeCss.includes(".game-card__frame"), "expected preview frame styling");
});

test("grid script renders metadata-rich catalog cards without filler cabinets", () => {
  assert(gridScript.includes('from "./arcade-profile.mjs"'), "expected grid page to import the shared shell profile controller");
  assert(gridScript.includes("initArcadeProfilePanel"), "expected the shared profile panel to be initialized");
  assert(gridScript.includes("game.previewImage"), "expected live tiles to use configured screenshot previews");
  assert(gridScript.includes("filterArcadeCatalog"), "expected the grid controller to use pure catalog filtering");
  assert(gridScript.includes("buildCatalogFacets"), "expected category facets to come from metadata");
  assert(gridScript.includes("game.categories"), "expected category metadata on every card");
  assert(gridScript.includes("game.dimensions"), "expected format metadata on every card");
  assert(gridScript.includes("game.description"), "expected accurate descriptions on every card");
  assert(gridScript.includes("game.previewVideo"), "expected optional gameplay video previews");
  assert(gridScript.includes('(hover: hover) and (pointer: fine)'), "expected video previews to be desktop-only");
  assert(gridScript.includes("prefers-reduced-motion: reduce"), "expected video previews to respect reduced motion");
  assert(gridScript.includes("video.muted = true"), "expected hover previews to stay muted");
  assert(gridScript.includes("video.loop = true"), "expected hover previews to loop");
  assert(!gridScript.includes("COMING SOON"), "expected the catalog to omit filler cabinets");
});

test("live game tiles include a dedicated hover treatment", () => {
  assert(
    arcadeCss.includes(".grid-page-shell .game-card:hover .game-card__image"),
    "expected live game previews to animate on hover"
  );
  assert(
    arcadeCss.includes(".grid-page-shell .game-card:hover .game-card__title"),
    "expected live game titles to react on hover"
  );
  assert(
    arcadeCss.includes(".grid-page-shell .game-card:hover,"),
    "expected live game tiles to get a dedicated visible hover container state"
  );
  assert(
    arcadeCss.includes("translateY(-5px) scale(1.01)"),
    "expected live game tiles to lift more strongly than placeholder tiles"
  );
});

test("grid preview artwork stays fully visible at rest and on hover", () => {
  assert(
    /\.game-card__image,\s*\.game-card__video\s*\{[^}]*object-fit:\s*contain/.test(gridStageCss),
    "expected preview media to fit inside the frame without cropping"
  );
  const previewHoverRule = gridStageCss.match(
    /\.grid-page-shell \.game-card:hover \.game-card__image,[\s\S]*?\{([^}]*)\}/
  )?.[1] || "";
  assert(
    !previewHoverRule.includes("transform: scale"),
    "expected hover treatment not to zoom and crop the preview artwork"
  );
});

test("catalog controls and cards stay usable on narrow screens", () => {
  assert(arcadeCss.includes("minmax(min(100%,"), "expected catalog cards to clamp to narrow screens");
  assert(arcadeCss.includes(".catalog-dimension-filters"), "expected grouped filters to have a responsive layout");
  assert(
    /\.grid-stage__controls\s*{[^}]*flex-wrap:\s*wrap/.test(arcadeCss),
    "expected the controls rail to wrap instead of overflowing a narrow window"
  );
});

test("grid script only shows selection styling after arcade input is used", () => {
  assert(
    gridScript.includes("let showGamepadSelection = false;"),
    "expected gamepad selection visuals to start disabled"
  );
  assert(
    gridScript.includes('card.classList.toggle("gamepad-selected", showGamepadSelection && cardIndex === selectedIndex);'),
    "expected selected styling to depend on explicit arcade-input state"
  );
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
