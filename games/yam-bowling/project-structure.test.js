const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AVAILABLE_SKINS, CANON_BOWLERS } = require("./animation-core.js");

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Ownership assertions of the "this module must NOT do X" shape have to read
// code, not prose: a comment explaining why X is forbidden otherwise fails the
// very rule it documents.
const readCode = (file) => read(file)
  .replace(/\/\*[^]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// The stylesheet is split per screen, and what matters for appearance is what
// the browser ends up with: every sheet index.html links, concatenated in link
// order, which is exactly the cascade. Reading them this way keeps these
// assertions about the rendered result rather than pinning them to a file.
const readStyles = () => [...read("index.html").matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)]
  .map((match) => read(match[1]))
  .join("\n");

test("split stylesheets keep screen, dialog, inspector, and responsive rules separate", () => {
  const html = read("index.html");
  const stylesheetLinks = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)]
    .map((match) => match[1]);
  const results = read("styles/results.css");
  const dialogs = read("styles/dialogs.css");
  const inspector = read("styles/inspector.css");
  const responsive = read("styles/responsive.css");

  assert.deepEqual(stylesheetLinks.slice(-5), [
    "styles/results.css",
    "styles/dialogs.css",
    "styles/inspector.css",
    "styles/responsive.css",
    "styles/mobile-landscape.css",
  ]);

  assert.match(results, /\.results-screen\s*\{/);
  assert.match(results, /\.result-player__portrait\s*\{/);
  assert.doesNotMatch(results, /\.(?:modal-layer|tutorial-coach|menu-splash|character-inspector)|@media/);

  assert.match(dialogs, /\.modal-layer\s*\{/);
  assert.match(dialogs, /\.pause-card\s*\{/);
  assert.match(dialogs, /\.dialog-close\s*\{/);
  assert.doesNotMatch(dialogs, /\.(?:results-screen|result-player|menu-splash|character-inspector|tutorial-coach)|@media/);

  assert.match(inspector, /\.menu-splash-dialog\s*\{/);
  assert.match(inspector, /\.inspect-bowler-button\s*\{/);
  assert.match(inspector, /\.character-inspector-dialog\s*\{/);
  assert.doesNotMatch(inspector, /\.(?:results-screen|result-player|modal-layer|pause-card|tutorial-coach)|@media/);

  assert.deepEqual(
    [...responsive.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((match) => Number(match[1])),
    [1100, 960, 560],
  );
  assert.match(responsive, /@media\s*\(max-width:\s*560px\)[^]*\.results-players\s*\{/);
});

test("every canon bowler has every reusable processed skin package", () => {
  for (const bowler of CANON_BOWLERS) {
    const bowlerDirectory = path.join(root, "assets", "characters", "skins", bowler.slug);
    for (const skin of AVAILABLE_SKINS.filter(({ id }) => id !== "canon")) {
      const skinDirectory = path.join(bowlerDirectory, skin.id);
      const expectedFiles = [
        "source.png",
        "portrait.webp",
        "victory.webp",
        "defeat.webp",
        ...Array.from({ length: 5 }, (_, index) => `throw-${String(index + 1).padStart(2, "0")}.webp`),
      ];

      const imageFiles = fs.readdirSync(skinDirectory).filter((file) => /\.(?:png|webp)$/.test(file));
      for (const expectedFile of expectedFiles) {
        assert.equal(
          imageFiles.includes(expectedFile),
          true,
          `${bowler.name} ${skin.name} should include ${expectedFile}`,
        );
      }
      assert.deepEqual(
        imageFiles.filter(
          (file) => !expectedFiles.includes(file) && !/^throw-0[1-5]\.png$/.test(file),
        ),
        [],
        `${bowler.name} ${skin.name} should contain only runtime assets and optional throw overrides`,
      );
    }
    assert.equal(
      fs.readdirSync(bowlerDirectory).filter((file) => file.endsWith(".png")).length,
      0,
      `${bowler.name} should not keep a legacy sheet outside a skin-id folder`,
    );
  }
});

test("the setup screen exposes skin equipment controls", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']skin-options["']/);
  assert.match(html, /id=["']online-skin-options["']/);
  assert.match(read("ui/skin-options.mjs"), /loadout\.equipSkin\(/);
  assert.match(read("ui/skin-options.mjs"), /skinId/);
  assert.match(read("renderer.js"), /getFrameAssetPath/);
});

test("local and online character selection expose the read-only bowler inspector", () => {
  const html = read("index.html");
  const game = read("game.js");
  const css = readStyles();

  for (const id of [
    "inspect-bowler-button", "online-inspect-bowler-button", "character-inspector-dialog",
    "character-inspector-close", "character-inspector-previous", "character-inspector-next",
    "character-inspector-art", "character-inspector-name", "character-inspector-skins",
    "character-inspector-age", "character-inspector-hometown", "character-inspector-occupation",
    "character-inspector-style", "character-inspector-ball", "character-inspector-personality",
    "character-inspector-bio", "character-inspector-history-heading", "character-inspector-history-status",
    "character-inspector-history-content", "character-inspector-history-level-badge", "character-inspector-history-level", "character-inspector-history-xp",
    "character-inspector-history-progress", "character-inspector-history-matches", "character-inspector-history-wins",
    "character-inspector-history-strikes", "character-inspector-history-high-game",
    "character-inspector-history-collection", "character-inspector-history-collection-progress",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }

  assert.ok(html.indexOf("character-catalog-data.js") < html.indexOf("character-catalog.js"));
  assert.ok(html.indexOf("character-catalog.js") < html.indexOf("game.js"));
  const inspector = read("ui/character-inspector.mjs");
  assert.match(game, /characterInspector\.open\(/);
  assert.match(inspector, /catalog\.getCharacter\(/);
  assert.match(inspector, /catalog\.getAdjacentCharacterSlug\(/);
  assert.match(inspector, /buildCharacterHistoryModel/);
  assert.match(inspector, /levelBadge\.hidden\s*=\s*model\.status\s*!==\s*["']ready["']/);
  assert.match(game, /progressionStatus/);
  assert.match(css, /\.character-inspector-dialog\s*\{/);
  assert.match(css, /\.character-inspector-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.character-inspector-history\s*\{/);
  assert.ok(
    html.indexOf("character-inspector-history") < html.indexOf("character-inspector-story"),
    "player-owned history should be structurally separate from the fictional dossier",
  );
});

test("inspector skin previews never use the equipment persistence path", () => {
  const inspector = read("ui/character-inspector.mjs");
  const previewFunction = inspector.match(/function renderSkinOptions\([^]*?\n  \}/)?.[0] ?? "";

  assert.notEqual(previewFunction, "", "the inspector should own a skin-preview renderer");
  assert.match(previewFunction, /previewSkinId/);
  assert.match(previewFunction, /getSkinPreviewLabel/);
  assert.doesNotMatch(previewFunction, /saveEquippedSkinId|equipSkin|equipBowlerSlot/);
  // The whole module is preview-only; equipping belongs to the setup screens.
  assert.doesNotMatch(readCode("ui/character-inspector.mjs"), /saveEquippedSkinId|equipSkin|equipBowlerSlot/);
});

test("the cosmetic catalog and the presentation loadout own separate halves of the contract", () => {
  const html = read("index.html");
  const catalog = readCode("cosmetics-core.js");
  const loadout = readCode("loadout-core.js");

  // Both cores are built from the roster and splash catalogs, so they load after them.
  assert.ok(html.indexOf("animation-core.js") < html.indexOf("cosmetics-core.js"));
  assert.ok(html.indexOf("menu-splash-core.js") < html.indexOf("cosmetics-core.js"));
  assert.ok(html.indexOf("campaign-core.js") < html.indexOf("cosmetics-core.js"));
  assert.ok(html.indexOf("cosmetics-core.js") < html.indexOf("loadout-core.js"));
  assert.ok(html.indexOf("loadout-core.js") < html.indexOf("game.js"));

  // The catalog describes what exists. It must not know what a player owns,
  // wears, or paid: that belongs to the loadout and, later, to the server.
  assert.doesNotMatch(catalog, /localStorage|\.setItem\(|\.getItem\(|\bequip|\bgranted\b/i);

  // Equipment and ownership have exactly one owner.
  assert.match(loadout, /LOADOUT_STORAGE_KEY\s*=\s*"yam-bowling\.loadout\.v1"/);
  assert.match(loadout, /SCHEMA_VERSION\s*=\s*1/);
  assert.match(loadout, /LEGACY_EQUIPPED_SKINS_STORAGE_KEY/, "the old skin key must be a migration input");
  assert.match(loadout, /MENU_SPLASH_STORAGE_KEY/, "the old splash key must be a migration input");
  assert.match(loadout, /campaign\.getUnlockedBowlerSlugs\(\)/, "character-linked art should derive ownership from campaign progress");
  assert.match(readCode("game.js"), /createLoadoutStore\(\{\s*campaign:\s*campaignStore\s*\}\)/);

  const manifest = JSON.parse(read("runtime-assets.json"));
  assert.ok(manifest.include.includes("cosmetics-core.js"));
  assert.ok(manifest.include.includes("loadout-core.js"));
});

test("equippable effects are render-only and cannot reach gameplay", () => {
  const html = read("index.html");
  const effects = readCode("effects-core.js");
  const renderer = readCode("renderer.js");
  const runtime = readCode("match/match-runtime.mjs");

  assert.ok(html.indexOf("cosmetics-core.js") < html.indexOf("effects-core.js"));
  assert.ok(html.indexOf("effects-core.js") < html.indexOf("game.js"));
  assert.ok(JSON.parse(read("runtime-assets.json")).include.includes("effects-core.js"));

  // The emitter is presentation. It has no route to physics, scoring, the deck
  // simulation or the wire, which is what makes "effects never alter trajectory,
  // collision, timing or server shot inputs" a structural fact.
  assert.doesNotMatch(effects, /require\(|YamPhysics|YamGameCore|simulation|submitShot|knocked/i);
  // Deterministic: a seeded generator, never Math.random, so the scatter and the
  // particle budget can both be asserted exactly.
  assert.doesNotMatch(effects, /Math\.random/);
  assert.match(effects, /MAX_TRAIL_PARTICLES\s*=\s*\d+/);
  assert.match(effects, /MAX_BURST_PARTICLES\s*=\s*\d+/);

  // The runtime advances particles; the renderer only paints them. Keeping that
  // arrow straight is the same rule the HUD follows.
  assert.match(runtime, /effects\.advance\(/);
  assert.match(runtime, /effects\.emitTrail\(/);
  assert.match(runtime, /effects\.triggerBurst\(/);
  assert.doesNotMatch(renderer, /emitTrail|triggerBurst|advance\(/);

  // A burst is keyed by the roll that earned it, so a replayed online snapshot
  // or a resumed match cannot fire it twice.
  assert.match(runtime, /rollEffectKey\(/);
  assert.match(readCode("effects-core.js"), /lastBurstKey/);

  // Reduced motion is honored from the composition root, not guessed at inside
  // the emitter.
  assert.match(readCode("game.js"), /prefers-reduced-motion/);
});

test("every equippable presentation slot has a player-facing control, and it writes through the loadout", () => {
  const html = read("index.html");
  const model = readCode("profile/profile-model.mjs");
  const screen = readCode("ui/profile-screen.mjs");

  // The room editor is where a slot with no picker of its own is equipped. Skin,
  // room and menu art are absent because they already have their own controls.
  assert.match(html, /id="profile-presentation"/);
  for (const key of ["ballTrail", "strikeBurst", "victoryPose", "defeatPose", "playerCard", "profileArt", "title", "badge", "profileFrame", "profileBackground"]) {
    assert.match(model, new RegExp(`key: "${key}"`), `${key} needs a control, not just a slot`);
  }

  // Equipment keeps one owner: the editor may only ask the loadout to equip,
  // never write the record itself.
  assert.match(screen, /loadout\.equipGlobalSlot\(/);
  assert.match(screen, /loadout\.equipBowlerSlot\(/);
  assert.match(screen, /loadout\.clearGlobalSlot\(/);
  assert.doesNotMatch(screen, /setItem|localStorage|LOADOUT_STORAGE_KEY/);

  // Ownership decides what may be equipped, never what is shown: a locked reward
  // stays visible so it can be played for.
  assert.match(screen, /is-locked/);
  assert.match(screen, /option\.owned/);

  // An outcome pose is a slot, so the results screen resolves it through the one
  // module that owns character paths — and a remote bowler keeps their own look.
  assert.match(readCode("ui/character-assets.mjs"), /victoryPose|defeatPose/);
  const results = readCode("ui/results-screen.mjs");
  assert.match(results, /remote,/);
  assert.match(results, /poseId:\s*player\.presentation\?\.victoryPoseId/);
  assert.doesNotMatch(readCode("ui/results-screen.mjs"), /getBowlerSlot|getResultPortraitAssetPath/);
});

test("reactions travel as a wheel slot and are owned by one HUD module", () => {
  const hud = readCode("ui/match-reactions.mjs");
  const client = readCode("online-client.mjs");
  const html = read("index.html");

  // The tray is the only sender and the loadout is the only source of what is in
  // it: a reaction the player has not equipped has no chip and no slot.
  assert.match(hud, /sendReaction\?\.\(kind, slot\)/);
  assert.match(hud, /getReactionWheel\?\.\(kind\)/);
  assert.match(client, /lobbyMessage\("yam_reaction", \{ kind, slot: index \}\)/);

  // No emote or catch-line slug may reach the wire. The server resolves the slot
  // against the wheel it froze at match start, which is what keeps ownership
  // decided by the garage it sanitized rather than by whatever a client claims.
  assert.doesNotMatch(client, /"emote:|"catch-line:/);

  // The HUD paints and sends; it never equips. Persisting from here would give
  // the loadout a second writer that a server garage save could not see.
  assert.doesNotMatch(hud, /equipGlobalSlot|setItem|localStorage/);

  // Both wheels are in the match screen's shot panel rather than behind a menu,
  // and each chip is reachable by keyboard shortcut as well as by pointer.
  assert.match(html, /id="match-reaction-tray"/);
  assert.match(html, /id="match-emote-wheel"/);
  assert.match(html, /id="match-catch-line-wheel"/);
  assert.match(readCode("input/bindings.mjs"), /matchReactions\?\.handleKey\?\.\(event\)/);

  // Slot 1 of the catch-line wheel keeps its second job: the entrance line. The
  // entrance reads the wheel rather than a field of its own, so the two cannot
  // drift into disagreeing about what a bowler walks on to.
  assert.match(readCode("ui/match-entrance.mjs"), /catchLineIds\?\.\[0\]/);
});

test("how-to-play bowls a coached frame and the coach only observes it", () => {
  const html = read("index.html");
  const coach = readCode("ui/tutorial.mjs");
  const bindings = readCode("input/bindings.mjs");

  // The orientation card is gone: the button starts the lesson instead. A player
  // who never reads a dialog still learns the shot.
  assert.doesNotMatch(html, /how-dialog|how-grid/);
  assert.match(html, /id="tutorial-coach"/);
  assert.match(html, /id="tutorial-complete"/);
  assert.match(bindings, /\$\("how-button"\)\.addEventListener\("click", \(\) => tutorial\.start\(\)\)/);

  // The coach reads the session and paints a card. Advancing a match, simulating
  // a roll or writing equipment all belong to modules that already own them --
  // a second mover in the shot pipeline is exactly what this file exists to stop.
  assert.doesNotMatch(coach, /beginThrow|startSpin|startCharge|releaseCharge|recordRoll|createSimulation|localStorage|equipGlobalSlot/);
  assert.match(coach, /matchRuntime\.startMatch\(\)/);

  // Its stylesheet is its own and loads with the match screen it sits over.
  assert.ok(html.includes('href="styles/tutorial.css"'));
  assert.match(read("styles/tutorial.css"), /\.tutorial-coach\s*\{/);
  assert.ok(html.indexOf("styles/match.css") < html.indexOf("styles/tutorial.css"));
});

test("player rooms are unlockable content the loadout alone equips", () => {
  const html = read("index.html");
  const rooms = readCode("room-core.js");

  // The catalog is built from the room list, so rooms load before it.
  assert.ok(html.indexOf("room-core.js") < html.indexOf("cosmetics-core.js"));
  assert.ok(html.indexOf("cosmetics-core.js") < html.indexOf("loadout-core.js"));
  assert.ok(JSON.parse(read("runtime-assets.json")).include.includes("room-core.js"));

  // Rooms are the first cosmetic to ship after progression, so unlike lanes and
  // splashes they own no persistence and carry no legacy key: the loadout has
  // been their only owner from the first line.
  assert.doesNotMatch(rooms, /localStorage|\.setItem\(|\.getItem\(|STORAGE_KEY/);
  assert.match(readCode("loadout-core.js"), /getRoomSlug/);
  assert.match(readCode("loadout-core.js"), /setRoomSlug/);

  // Nothing else may name a room's image file: the path is derived from the slug
  // so a new room is one catalog row plus one processed PNG.
  assert.match(rooms, /assets\/menu-splashes\/player-rooms\/\$\{slug\}\.webp/);
  for (const file of ["cosmetics-core.js", "loadout-core.js", "index.html"]) {
    assert.doesNotMatch(read(file), /player-rooms\//, `${file} must not name a room asset path`);
  }

  // Campaign owns circuit unlocks; a room is loadout content it must not absorb.
  assert.doesNotMatch(readCode("room-core.js"), /campaign-core|CampaignCore/);
});

test("progression is the one owner of XP, and the client never awards itself any", () => {
  const html = read("index.html");
  const code = readCode("progression-core.js");

  // Its only dependency is the canon roster, so it loads straight after it.
  assert.ok(html.indexOf("animation-core.js") < html.indexOf("progression-core.js"));
  assert.ok(html.indexOf("progression-core.js") < html.indexOf("game.js"));
  assert.ok(JSON.parse(read("runtime-assets.json")).include.includes("progression-core.js"));

  // The XP table and the curves live in exactly one file. A second copy is how
  // a retune ships half-applied.
  assert.match(code, /GRANT_SOURCES\s*=/);
  assert.match(code, /MAX_LEVEL\s*=\s*30/);
  for (const file of ["game-core.js", "cosmetics-core.js", "loadout-core.js", "match/match-runtime.mjs"]) {
    assert.doesNotMatch(readCode(file), /GRANT_SOURCES|xpForLevel|computeMatchGrant/, `${file} must not own an XP rule`);
  }

  // The grant calculator is pure: it reads no storage and banks nothing. The
  // server evaluates the same inputs, which is what keeps the two in agreement.
  const grantFunction = code.slice(code.indexOf("function computeMatchGrant"), code.indexOf("function emptyRecord"));
  assert.notEqual(grantFunction, "", "progression-core should own the grant calculator");
  assert.doesNotMatch(grantFunction, /localStorage|\.setItem\(|\.getItem\(|persist\(/);

  // Only an authoritative snapshot moves a balance. `recordPending` queues a
  // grant so the UI can show a pending state without inventing one.
  const store = code.slice(code.indexOf("function createProgressionStore"));
  const balanceWrites = [...store.matchAll(/record\.player\s*=|record\s*=\s*next|record\.bowlers\s*=/g)];
  assert.equal(balanceWrites.length, 1, "applySnapshot must be the only path that changes XP");
  assert.match(store, /function applySnapshot/);
  const pendingFunction = store.slice(store.indexOf("function recordPending"), store.indexOf("function listPending"));
  assert.doesNotMatch(pendingFunction, /record\.player|record\.bowlers/, "queuing a grant must not move a balance");
});

test("XP and the rating are reported together, through one call site", () => {
  const reporter = readCode("online/progression-reporter.mjs");
  const onlineSession = readCode("online/online-session.mjs");

  // One request carries both, under one session id, so a dropped connection has
  // one thing to lose rather than two that can disagree.
  assert.match(onlineSession, /updateGameRating\([^)]*"yam-bowling"/);
  assert.match(reporter, /progression: block/, "the reporter builds the whole request it queues");
  assert.doesNotMatch(reporter, /updateGameRating|fetch\(/, "the reporter must not open a second report path");

  // A result whose request never landed is re-sent through that SAME call site.
  // A replay path of its own would be a second thing that could disagree, which
  // is the failure the single site exists to prevent.
  assert.match(onlineSession, /function flushPendingReports/);
  assert.equal(
    [...onlineSession.matchAll(/platformApi\.updateGameRating/g)].length,
    2,
    "the fresh report and the replay are the only two sends, and both live here",
  );
  assert.match(reporter, /function listUnsentRequests/, "the reporter owns which grants may be replayed");

  // The block describes what was played. An XP amount on the wire would be the
  // client declaring its own economy, which is the one thing this milestone exists
  // to prevent.
  const block = reporter.slice(reporter.indexOf("const block = {"), reporter.indexOf("function listUnsentRequests"));
  assert.notEqual(block, "", "the reporter should own the report block");
  assert.doesNotMatch(block, /\bxp\b|playerXp|bowlerXp|\blevel\b/i);

  // The reporter reads the loadout's neighbours but must never equip anything:
  // earning a level and wearing a reward are different milestones.
  assert.doesNotMatch(reporter, /equipSkin|equipBowlerSlot|equipGlobalSlot|grant\(/);
});

test("no surface shows a price or an unlock claim before ownership is authoritative", () => {
  // Milestone 2 rule: a dev entitlement is allowed to open the catalog for
  // authoring, but nothing may advertise an XP cost the server cannot honor.
  for (const file of ["cosmetics-core.js", "loadout-core.js", "ui/skin-options.mjs", "ui/menu-splash-picker.mjs"]) {
    assert.doesNotMatch(readCode(file), /price|cost|purchase|XP/i, `${file} should not price a cosmetic yet`);
  }
});

test("the published runtime includes the generated character catalog", () => {
  const manifest = JSON.parse(read("runtime-assets.json"));
  assert.ok(manifest.include.includes("character-catalog-data.js"));
  assert.ok(manifest.include.includes("character-catalog.js"));
});

// A module that is imported but not matched by the manifest works locally and
// 404s in the published overlay, which is the worst shape of breakage: invisible
// until deploy. Splitting game.js multiplies the chances, so the manifest is
// checked against the real import graph rather than trusted.
test("every module the cabinet imports is matched by the runtime manifest", () => {
  const manifest = JSON.parse(read("runtime-assets.json"));
  // Minimal glob support, matching what package_runtime.py's Path.glob does:
  // `**/` spans directories, `*` stops at a separator.
  const globToRegExp = (pattern) => {
    const text = String(pattern);
    let source = "";
    for (let index = 0; index < text.length; index += 1) {
      if (text.startsWith("**/", index)) { source += "(?:.*/)?"; index += 2; continue; }
      const character = text[index];
      if (character === "*") { source += "[^/]*"; continue; }
      source += /[.+^${}()|[\]\\?]/.test(character) ? `\\${character}` : character;
    }
    return new RegExp(`^${source}$`);
  };
  const patterns = manifest.include.map(globToRegExp);
  const shipped = (relativePath) => patterns.some((pattern) => pattern.test(relativePath));

  const collectModules = (entry, seen = new Set()) => {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const source = read(entry);
    const directory = path.posix.dirname(entry);
    for (const match of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
      const resolved = path.posix.normalize(path.posix.join(directory, match[1]));
      // `../../js/platform/**` is shared factory code served from the repo root,
      // not a game-local file, so it is outside this cabinet's manifest.
      if (resolved.startsWith("..")) continue;
      collectModules(resolved, seen);
    }
    return seen;
  };

  for (const module of collectModules("game.js")) {
    assert.equal(shipped(module), true, `${module} is imported but missing from runtime-assets.json`);
  }
});

test("the cabinet exposes title, setup, match, and results screens", () => {
  const html = read("index.html");
  for (const screen of ["title-screen", "setup-screen", "game-screen", "results-screen"]) {
    assert.match(html, new RegExp(`id=["']${screen}["']`));
  }
  assert.match(html, /id=["']character-grid["']/);
  assert.match(html, /id=["']game-canvas["']/);
  assert.match(html, /Hotseat/i);
  assert.match(html, /Vs CPU/i);
});

test("the title screen provides a return link to the arcade", () => {
  const html = read("index.html");
  const css = readStyles();
  const arcadeLink = html.match(/<a[^>]*class=["'][^"']*arcade-link[^"']*["'][^>]*>[^<]*<\/a>/i)?.[0] ?? "";

  assert.match(arcadeLink, /href=["']\.\.\/\.\.\/grid\.html["']/i);
  assert.match(arcadeLink, /Return to Arcade/i);
  assert.match(css, /\.arcade-link\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.arcade-link\s*\{[^}]*z-index:\s*\d+/s);
});

test("the signed-in player profile composes server loadout, room art, and progression", () => {
  const html = read("index.html");
  const game = read("game.js");
  const profile = read("ui/profile-screen.mjs");
  const sync = read("profile/profile-sync-client.mjs");
  const manifest = JSON.parse(read("runtime-assets.json"));

  for (const id of [
    "profile-button", "profile-screen", "profile-back", "profile-room-art",
    "profile-bowler-art", "profile-player-level", "profile-career-stats",
    "profile-bowler-stats", "profile-bowler-options", "profile-skin-options",
    "profile-room-options", "profile-save", "profile-sync-status",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(html.match(/<button[^>]+id=["']profile-button["'][^>]*>/)?.[0] || "", /data-factory-account-feature/);
  assert.ok(html.includes('href="styles/profile.css"'));
  assert.match(read("styles/profile.css"), /\.profile-room\s*\{/);
  assert.match(read("styles/profile.css"), /\.profile-hero__bowler\s*\{/);
  assert.match(game, /createProfileSyncClient/);
  assert.match(game, /createProfileScreen/);
  assert.match(game, /profileScreen/);
  assert.match(read("input/bindings.mjs"), /profileScreen\.open\(\)/);
  assert.match(profile, /buildProfileModel/);
  assert.match(profile, /loadout\.setFeatured/);
  assert.match(profile, /loadout\.setRoomSlug/);
  assert.match(profile, /syncClient\.save\(\)/);
  assert.match(sync, /\/games\/\$\{GAME_SLUG\}\/garage/);
  assert.ok(manifest.include.includes("profile/*.mjs"));
  assert.ok(
    html.indexOf("../../js/platform-config.mjs") < html.indexOf('src="game.js"'),
    "the production platform API URL must be configured before Yam creates its API client",
  );
});

test("public profiles use public documents, stay read-only, and share the Match Found identity card", () => {
  const html = read("index.html");
  const game = read("game.js");
  const client = read("profile/public-profile-client.mjs");
  const model = read("profile/public-profile-model.mjs");
  const publicScreen = read("ui/public-profile-screen.mjs");
  const onlineScreen = read("ui/online-screen.mjs");
  const resultsScreen = read("ui/results-screen.mjs");

  for (const id of [
    "public-profile-dialog", "public-profile-close", "public-profile-close-hint", "public-profile-name",
    "public-profile-room-art", "public-profile-bowler-art", "public-profile-player-level",
    "public-profile-career-stats", "public-profile-bowler-stats", "public-profile-status",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(game, /createPublicProfileClient/);
  assert.match(game, /createPublicProfileRepository/);
  assert.match(game, /createPublicProfileScreen/);
  assert.match(client, /\/games\/\$\{GAME_SLUG\}\/loadout\/\$\{encoded\}/);
  assert.match(client, /getGameProgression/);
  assert.match(client, /getGameRating/);
  assert.doesNotMatch(client, /\/garage|exportGarage|applyServerGarage/);
  assert.match(publicScreen, /buildPublicProfileModel|repository\.load/);
  assert.doesNotMatch(publicScreen, /setFeatured|setRoomSlug|\.save\(/);
  assert.match(onlineScreen, /compactIdentityCardMarkup/);
  assert.match(onlineScreen, /buildCompactIdentityModel/);
  assert.match(onlineScreen, /data-public-profile-id/);
  assert.match(resultsScreen, /data-public-profile-id/);
  assert.match(resultsScreen, /accountPlayerId/);
  assert.match(model, /competitive/);
  // The online screen owns the stakes, while the shared public identity model
  // owns the rating figure. Keeping the API read out of the screen prevents a
  // second normalization path for Match Found.
  assert.doesNotMatch(onlineScreen, /spareRate|getGameRating|ratingLine/);
  assert.match(html.match(/<button[^>]+id=["']public-profile-close["'][^>]*>/)?.[0] || "", /aria-keyshortcuts=["']Escape["']/);
  assert.match(html, /id=["']public-profile-close-hint["'][^>]*>[\s\S]*?<kbd>Esc<\/kbd>[\s\S]*?Close/i);
  assert.match(
    read("styles/profile.css"),
    /\.public-profile-dialog\s+\.dialog-close\s*\{[^}]*z-index\s*:\s*[2-9]\d*/s,
    "the public-profile close button must sit above the positioned header and content",
  );
});

test("the cabinet exposes complete quick-match and private-room online screens", () => {
  const html = read("index.html");
  for (const id of [
    "online-button", "online-screen", "online-character-grid", "quick-match-button",
    "create-room-button", "join-room-code", "join-room-button", "online-lobby-screen",
    "online-room-code", "online-lobby-players", "online-status", "leave-online-button",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(html, /Quick Match/i);
  assert.match(html, /Create Private Room/i);
  assert.match(html, /Join Private Room/i);
});

test("online play uses the Factory identity, server-owned shots, ratings, and reconnect client", () => {
  const html = read("index.html");
  const game = read("game.js");
  assert.match(html, /type=["']module["'][^>]*src=["']game\.js["']/);
  assert.match(game, /loadFactoryProfile/);
  assert.match(game, /createOnlineClient/);
  // The lobby name is derived from the Factory profile through one module, and
  // resolved per send rather than captured: the identity a client publishes must
  // never be older than the profile it came from.
  assert.match(read("online-identity.mjs"), /createOnlineIdentityPayload/);
  assert.match(game, /createYamOnlineIdentity/);
  assert.match(game, /resolveIdentity:/);
  assert.doesNotMatch(read("online-client.mjs"), /function setIdentity/);
  // A cabinet derives a match alias; it never writes the shared factory profile.
  assert.doesNotMatch(read("online-identity.mjs"), /saveFactoryProfile|bindFactoryProfileToSession/);
  assert.match(read("match/match-runtime.mjs"), /onlineClient\.submitShot/);
  assert.match(read("online/online-session.mjs"), /updateGameRating\(["']yam-bowling["']/);
  assert.match(read("online-client.mjs"), /resume_lobby/);
});

// Ranked and casual are one lane apart, so the thing that decides which is which
// has to be the server's answer and nothing else. The client picks the stakes it
// QUEUES for; it never picks the stakes it REPORTS.
test("online stakes are chosen on the setup screen and decided by the server", () => {
  const html = read("index.html");
  const onlineScreen = readCode("ui/online-screen.mjs");
  const onlineClient = readCode("online-client.mjs");
  const onlineSession = readCode("online/online-session.mjs");
  const reporter = readCode("online/progression-reporter.mjs");

  assert.match(html, /id=["']online-stakes-options["']/);
  assert.match(html, /data-online-stakes=["']ranked["']/);
  assert.match(html, /data-online-stakes=["']casual["']/);
  assert.match(onlineScreen, /onlineSetup\.ranked/);

  // The stakes ride in lobby settings, where matchmaking can see them: a ranked
  // search must never be paired with a casual room.
  assert.match(onlineClient, /settings:\s*\{[^}]*ranked:/);

  // The report takes the stakes off the authoritative snapshot. Reading them off
  // the setup screen instead is the bug this whole seam exists to prevent — a
  // toggle flipped after the match, or a resumed match whose setup was never
  // touched, would otherwise decide whether somebody's rating moves.
  assert.match(onlineSession, /session\.onlineSnapshot\?\.ranked === true/);
  assert.doesNotMatch(
    onlineSession.slice(onlineSession.indexOf("async function reportResult")),
    /onlineSetup/,
    "reportResult must not consult the local setup screen for the stakes",
  );
  // And the queued re-send remembers them, because the snapshot is long gone by
  // the time an unsent report is replayed.
  assert.match(reporter, /ranked: ranked === true/);
});

test("the title splash keeps the complete painted artwork visible", () => {
  const css = readStyles();
  assert.match(
    css,
    /\.title-art\s*\{[^}]*object-fit:\s*contain/s,
    "the splash should fit inside the viewport instead of cropping its painted title",
  );
});

test("players can choose and persist a character-named menu splash", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']menu-splash-button["']/);
  assert.match(html, /id=["']menu-splash-dialog["']/);
  assert.match(html, /id=["']menu-splash-grid["']/);
  assert.ok(html.indexOf("menu-splash-core.js") < html.indexOf("game.js"));
  const picker = read("ui/menu-splash-picker.mjs");
  assert.match(game, /menuSplashPicker\.build\(\)/);
  assert.match(picker, /loadout\.getMenuSplashSlug\(/);
  assert.match(picker, /loadout\.setMenuSplashSlug\(/);
  assert.match(picker, /data-splash-slug/);
});

test("the title screen links out to the calendar preorder without wiring it into the game", () => {
  const html = read("index.html");

  const link = html.match(/<a[^>]*id=["']calendar-button["'][^>]*>/);
  assert.ok(link, "the title screen should offer a way to reach the calendar preorder");
  assert.match(link[0], /href=["']calendar\/index\.html["']/);

  // Merchandise, not gameplay: the calendar is a plain navigation out of the cabinet, so no
  // module may bind it, read it, or otherwise let a preorder reach match code.
  for (const file of ["game.js", "input/bindings.mjs"]) {
    assert.doesNotMatch(
      read(file),
      /calendar/i,
      `${file} should not know the calendar exists`,
    );
  }
});

test("local setup lets a player choose a lane and remembers it", () => {
  const html = read("index.html");
  const game = read("game.js");

  const setupStart = html.indexOf('id="setup-screen"');
  const lanePick = html.indexOf('id="lane-button"');
  const startMatch = html.indexOf('id="start-match"');
  assert.ok(setupStart > -1 && setupStart < lanePick && lanePick < startMatch,
    "the lane picker should sit inside setup, ahead of the start button");

  assert.match(html, /id=["']lane-dialog["']/);
  assert.match(html, /id=["']lane-grid["']/);
  assert.ok(html.indexOf("lane-core.js") < html.indexOf("game.js"));
  const picker = read("ui/lane-picker.mjs");
  assert.match(picker, /loadLaneSlug/);
  assert.match(picker, /saveLaneSlug/);
  assert.match(picker, /data-lane-slug/);
  assert.match(game, /renderer\.load\(lanePicker\.getSelectedSlug\(\)\)/);
  // The picker reports a preference; it must not own the match-lane seam.
  assert.doesNotMatch(readCode("ui/lane-picker.mjs"), /applyMatchLane|renderer\./,
    "choosing which house a match uses is match logic, not picker logic");
});

test("match controls bind before signed-in account synchronization can stall startup", () => {
  const game = read("game.js");
  const init = game.slice(game.indexOf("async function init()"));
  const bindings = init.indexOf("bindEvents({");
  const campaignSync = init.indexOf("campaignProgress.sync()");
  const profileSync = init.indexOf("profileSync.sync()");

  assert.ok(bindings > -1, "startup should attach the shared match controls");
  assert.ok(campaignSync > -1 && bindings < campaignSync,
    "a slow campaign request must not leave every start-match button inert");
  assert.ok(profileSync > -1 && bindings < profileSync,
    "a slow profile request must not leave every start-match button inert");
});

test("online matches bowl on the lane the server dealt, not the local pick", () => {
  const game = read("game.js");
  const runtime = read("match/match-runtime.mjs");
  const onlineSession = read("online/online-session.mjs");

  const online = onlineSession.slice(onlineSession.indexOf("function resetSceneForOnline"));
  assert.ok(
    online.indexOf("applyMatchLane(laneCore.laneFromRoll(snapshot.laneRoll).slug)") <
      online.indexOf("session.match = structuredClone(snapshot.match)"),
    "an online match should take its lane from the served roll before the scene builds",
  );
  assert.match(runtime, /function startMatch\(\) \{\s*applyMatchLane\(session\.tournamentMatch\?\.venueSlug \|\| session\.campaignMatch\?\.venueSlug \|\| getLocalLaneSlug\(\)\);/,
    "a sanctioned circuit or tournament match should use its declared venue and an exhibition should return to the saved lane");
  assert.doesNotMatch(onlineSession, /onlineSetup\.lane|laneSlug:/,
    "a local lane preference must never be published to an online room");
  assert.doesNotMatch(readCode("game.js"), /renderer\.ready.*renderer\.setLane/,
    "a served lane must apply even while boot art is still loading");
  // applyMatchLane stays the single seam: only the composition root defines it,
  // and the two callers above are the only ways a lane reaches the renderer.
  assert.match(game, /function applyMatchLane\(slug\)/);
  for (const [name, source] of [["match runtime", runtime], ["online session", onlineSession]]) {
    assert.doesNotMatch(readCode(name === "match runtime" ? "match/match-runtime.mjs" : "online/online-session.mjs"),
      /renderer\.setLane/, `${name} should route lane changes through applyMatchLane`);
    assert.ok(source.includes("applyMatchLane"), `${name} should use the lane seam`);
  }
});

test("lane artwork is resolved through the catalog rather than a hard-coded file", () => {
  const renderer = read("renderer.js");
  const laneCore = read("lane-core.js");

  assert.match(renderer, /async setLane\(/);
  assert.doesNotMatch(renderer, /assets\/lanes\/[^$]/,
    "renderer should never name a lane image directly");
  assert.match(laneCore, /assets\/lanes\/\$\{slug\}\.webp/);
});

test("the match keeps the bowling lane centered between supporting UI rails", () => {
  const html = read("index.html");
  const leftRail = html.indexOf('class="game-panel game-panel--score');
  const lane = html.indexOf('class="lane-shell"');
  const rightRail = html.indexOf('class="game-panel game-panel--shot');

  assert.ok(leftRail > -1, "score and turn context should live in a left rail");
  assert.ok(rightRail > -1, "shot controls should live in a right rail");
  assert.ok(leftRail < lane && lane < rightRail, "the lane should be the center of the match layout");

  const css = readStyles();
  assert.match(css, /\.match-layout\s*\{[^}]*grid-template-columns:\s*minmax\([^;]+\)\s+minmax\([^;]+\)\s+minmax\(/s);
  assert.match(css, /\.lane-shell\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
});

test("online emotes float without borrowing the catch-line card", () => {
  const css = readStyles();
  const floatingEmote = css.match(/\.match-reaction-bubble\[data-reaction-kind="emote"\]\s*\{([^}]*)\}/s)?.[1] || "";

  assert.match(floatingEmote, /padding:\s*0/);
  assert.match(floatingEmote, /border:\s*0/);
  assert.match(floatingEmote, /background:\s*transparent/);
  assert.match(floatingEmote, /box-shadow:\s*none/);
  assert.match(floatingEmote, /animation:\s*emote-pop/);
  assert.match(css, /\.match-reaction-bubble\[data-reaction-kind="emote"\]\s+img\s*\{[^}]*filter:\s*drop-shadow\(/s);
});

test("the runtime owns a fixed-timestep update loop and pixel-sharp canvas", () => {
  const game = read("game.js");
  assert.match(game, /requestAnimationFrame\s*\(/);
  assert.match(game, /while\s*\(accumulator\s*>=\s*TICK_MS\)/);
  assert.match(game, /imageSmoothingEnabled\s*=\s*false/);
});

test("game rules, physics, rendering, and browser orchestration remain separate", () => {
  for (const file of ["audio-core.js", "ball-core.js", "game-core.js", "physics-core.js", "cpu-core.js", "renderer.js", "game.js"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test("ball properties and overcharge consequences are labeled in the shot UI", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']ball-profile["']/);
  assert.match(html, /id=["']charge-warning["']/);
  assert.ok(html.indexOf("ball-core.js") < html.indexOf("game.js"));
  assert.match(read("ui/shot-hud.mjs"), /ballCore\.profileStats/);
  assert.match(read("match/match-runtime.mjs"), /ball\.aimSpeed/);
  assert.match(read("match/match-runtime.mjs"), /physics\.chargeStateAtTime/);
});

test("the physics-aware CPU planner loads after physics and before browser orchestration", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("physics-core.js") < html.indexOf("cpu-core.js"));
  assert.ok(html.indexOf("cpu-core.js") < html.indexOf("game.js"));
});

test("CPU turns plan against the live pin bodies and retain planner ball choice", () => {
  const runtime = read("match/match-runtime.mjs");
  assert.match(runtime, /cpu\.createCpuPlan\(\{[^}]*pins:\s*scene\.pins[^}]*balls,/s);
  assert.match(runtime, /scene\.liveShot\.ballIndex\s*=\s*plan\.ballIndex/);
});

test("the cabinet exposes an accessible audio control and loads audio before the game", () => {
  const html = read("index.html");
  assert.match(html, /id=["']audio-toggle["']/);
  assert.match(html, /aria-pressed=["']true["']/);
  assert.ok(html.indexOf("audio-core.js") < html.indexOf("game.js"));
  assert.match(read("tools/serve.mjs"), /["']\.mp3["']\s*:\s*["']audio\/mpeg/);
});

test("the lane and default menu artwork use compressed runtime images", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");

  assert.match(html, /assets\/menu-splashes\/daisy-monroe\.webp/);
  assert.match(renderer, /root\.YamLaneCore\.getLane/);
  assert.match(renderer, /assets\/pins\/1\.webp/);
});

test("screen transitions reset the viewport for phone navigation", () => {
  assert.match(read("ui/dom.mjs"), /window\.scrollTo\(\{\s*top:\s*0/);
});

test("selection and identity surfaces use portraits while the lane uses throw frames", () => {
  const game = read("game.js");
  assert.match(read("ui/character-assets.mjs"), /characterPortrait:/);
  assert.match(read("ui/setup-screen.mjs"), /assets\.characterPortrait\(bowler\.slug\)/);
  const runtime = read("match/match-runtime.mjs");
  assert.match(runtime, /session\.playerSkinId\(player\)/);
  assert.match(runtime, /assets\.characterPortrait\(player\.characterSlug, skinId\)/);
  assert.match(runtime, /renderer\.setCharacter\(player\.characterSlug, skinId\)/);
});

test("results give both bowlers large outcome-specific character art", () => {
  const game = read("game.js");
  const css = readStyles();

  assert.match(read("ui/character-assets.mjs"), /getResultPortraitAssetPath/);
  const results = read("ui/results-screen.mjs");
  assert.match(results, /is-defeated/);
  assert.match(results, /result-player__portrait/);
  assert.match(results, /result-player__outcome/);
  assert.match(css, /\.result-player__portrait\s*\{[^}]*min-height:/s);
  assert.match(css, /\.result-player__portrait img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.result-player\.is-winner[^}]*box-shadow:/s);
});

test("strike and spare callouts pop a bowler pose clear of the callout text", () => {
  const html = read("index.html");
  const game = read("game.js");
  const css = readStyles();

  assert.match(html, /id=["']callout-pose["']/);
  assert.match(html, /id=["']callout-pose-art["']/);
  assert.match(read("ui/character-assets.mjs"), /getCalloutPoseAssetPath/);
  assert.match(read("ui/results-screen.mjs"), /function showCalloutPose/);

  const poseRule = css.match(/\.callout-pose\s*\{[^}]*\}/s)?.[0] ?? "";
  const calloutTop = Number(css.match(/\.callout\s*\{[^}]*top:\s*(\d+)%/s)?.[1]);
  const poseBottom = Number(poseRule.match(/bottom:\s*(\d+)%/)?.[1]);
  const poseTop = 100 - Number(poseRule.match(/height:\s*(\d+)%/)?.[1]) - poseBottom;

  assert.match(poseRule, /position:\s*absolute/);
  assert.match(poseRule, /pointer-events:\s*none/);
  assert.match(css, /\.callout-pose img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.callout-pose\.is-visible\s*\{[^}]*opacity:\s*1/s);
  // The pose sits over the bowler sprite, so it needs a frame of its own to read as a popup.
  assert.match(poseRule, /border:\s*1px solid/);
  assert.match(poseRule, /border-radius:/);
  assert.match(poseRule, /background:/);
  assert.match(poseRule, /box-shadow:/);
  assert.ok(Number.isFinite(calloutTop) && Number.isFinite(poseTop));
  assert.ok(poseTop >= calloutTop + 20, "the pose must start well below the callout headline");
});

test("human throws use a timed spin stage before hold-to-charge power", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']spin-meter["']/);
  assert.match(html, /id=["']spin-cursor["']/);
  assert.doesNotMatch(html, /id=["']hook-control["']/);
  const runtime = read("match/match-runtime.mjs");
  assert.match(runtime, /function startSpin/);
  assert.match(runtime, /scene\.phase === ["']spin["']/);
  assert.match(runtime, /physics\.spinAtTime/);
});

test("keyboard shot setup keeps A/D on strafe and arrow keys on aim", () => {
  const bindings = read("input/bindings.mjs");
  const runtime = read("match/match-runtime.mjs");

  assert.match(bindings, /event\.code === ["']ArrowLeft["']/);
  assert.match(bindings, /event\.code === ["']ArrowRight["']/);
  assert.match(runtime, /scene\.liveShot\.position\s*=.*strafeDirection/s);
  assert.match(runtime, /scene\.liveShot\.aim\s*=.*aimDirection/s);
  assert.match(runtime, /Math\.min\(0\.45,\s*scene\.liveShot\.aim/);
});

test("the reward ladders load in dependency order and share one state machine", () => {
  const html = read("index.html");

  assert.ok(html.indexOf("reward-tree-core.js") < html.indexOf("mastery-rewards-core.js"));
  assert.ok(html.indexOf("reward-tree-core.js") < html.indexOf("player-rewards-core.js"));
  assert.ok(html.indexOf("player-rewards-core.js") < html.indexOf("game.js"));

  // Both ladders build their nodes through the shared track, so locked/owned/
  // equipped state cannot come to mean two different things.
  for (const file of ["mastery-rewards-core.js", "player-rewards-core.js"]) {
    assert.match(readCode(file), /createRewardTrack\(/, `${file} must not re-implement the tree`);
  }
  assert.match(readCode("reward-tree-core.js"), /function createRewardTrack/);
});

test("rotating tournaments are a separate signed-in CPU bracket surface", () => {
  const html = read("index.html");
  const game = read("game.js");
  const screen = read("ui/tournament-screen.mjs");
  const client = read("tournament-client.mjs");
  const runtime = read("match/match-runtime.mjs");
  const bindings = read("input/bindings.mjs");
  for (const id of [
    "tournament-button", "tournament-screen", "tournament-back", "tournament-bracket",
    "tournament-roster", "start-tournament-match", "tournament-prize-name",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  assert.match(html.match(/<button[^>]+id=["']tournament-button["'][^>]*>/)?.[0] || "", /data-factory-account-feature/);
  assert.ok(html.includes('href="styles/tournament.css"'));
  assert.match(game, /createTournamentClient/);
  assert.match(game, /createTournamentScreen/);
  assert.match(screen, /cpuLevelId/);
  assert.match(screen, /session\.setup\.playType = "tournament"/);
  assert.match(client, /claimGameTournamentRound/);
  assert.match(runtime, /session\.tournamentMatch/);
  assert.match(bindings, /tournamentScreen\.handlePrimaryResultAction/);
  assert.doesNotMatch(client, /Math\.random|localStorage|setItem/,
    "the client must not roll or persist a prize");
});

test("the player reward ladder stores no ownership of its own", () => {
  const code = readCode("player-rewards-core.js");

  // Unlock progress belongs to the account. A node is owned when the synced
  // player level reaches it, so anything that could cache that answer here
  // would be a second source of truth able to disagree with the profile.
  for (const forbidden of [/localStorage/, /sessionStorage/, /setItem/, /getItem/, /STORAGE_KEY/]) {
    assert.doesNotMatch(code, forbidden, "the player ladder must never persist unlock state");
  }
  // A voucher balance is server inventory. This file may say which levels pay
  // one; it may never decide how many an account holds.
  assert.doesNotMatch(code, /balance/i, "the voucher balance is not the cabinet's to keep");
  // progression-core is the only module allowed to name an XP amount.
  assert.doesNotMatch(code, /\bxp\b/i);
});

test("the player ladder is global-only and never reaches the roster or the circuit", () => {
  const code = readCode("player-rewards-core.js");

  assert.doesNotMatch(code, /campaign/i, "circuit unlocks are campaign-core's, not the level ladder's");
  assert.doesNotMatch(code, /CANON_BOWLERS/);
  assert.doesNotMatch(code, /characterSlug/, "a player reward belongs to the player, not to a bowler");
});

test("the profile screen derives the reward path from synced level and says when it is not synced", () => {
  const html = read("index.html");
  const screen = readCode("ui/profile-screen.mjs");
  const model = readCode("profile/profile-model.mjs");

  assert.match(html, /id="profile-reward-tree"/);
  assert.match(html, /id="profile-reward-status"/);
  assert.match(screen, /playerRewardTreeMarkup/);
  // The ladder is a function of the authoritative level and the sync flag, so a
  // cached level 1 is presented as unsynced rather than as earned progress.
  assert.match(model, /buildRewardTree\(\{ currentLevel: level/);
  assert.match(model, /getSyncState/);
  assert.match(screen, /track\.synced/);
});

test("level-earned ownership has one seam and never becomes device state", () => {
  const game = readCode("game.js");
  const loadout = readCode("loadout-core.js");

  // Both sync paths share one definition, for the same reason applyMatchLane
  // does: two callers must not be able to disagree about what is unlocked.
  assert.equal((game.match(/function applyLevelUnlocks\(/g) || []).length, 1);
  assert.ok((game.match(/applyLevelUnlocks\(\)/g) || []).length >= 2);
  // An unsynced device earns nothing: a cached level is not evidence.
  assert.match(game, /getSyncState\(\)\.stale/);
  assert.match(game, /clearLevelEntitlements\(\)/);

  // The earned set is session-only, exactly like the server entitlement set.
  const persistBlock = loadout.slice(loadout.indexOf("function applyLevelEntitlements"), loadout.indexOf("function clearLevelEntitlements"));
  assert.doesNotMatch(persistBlock, /persist\(\)/, "a level unlock must never reach the device record");
});

test("the catalog stays underneath the ladders that read it", () => {
  const cosmetics = readCode("cosmetics-core.js");
  const html = read("index.html");

  // The ladders are built on the catalog, so the catalog cannot reach back for
  // them. Which ladder earns an item is recorded as catalog data instead, and
  // player-rewards-core.test.js asserts the two never drift apart.
  assert.doesNotMatch(cosmetics, /YamPlayerRewards|YamMasteryRewards|player-rewards-core|mastery-rewards-core/);
  assert.ok(html.indexOf("cosmetics-core.js") < html.indexOf("player-rewards-core.js"));
});
