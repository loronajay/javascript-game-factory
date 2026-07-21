import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { createCampaignMeta } from "../src/campaign/campaignMeta.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

test("campaign match bookkeeping starts fresh for every match", () => {
  const first = createCampaignMeta();
  const second = createCampaignMeta();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.brothersRageWarned, second.brothersRageWarned);
  assert.notStrictEqual(first.hasbeenFatRageWarned, second.hasbeenFatRageWarned);
  assert.notStrictEqual(first.finalBattleStageShown, second.finalBattleStageShown);

  first.brothersRageWarned["big-brother"] = true;
  first.finalBattleStageShown.opening = true;

  assert.equal(second.brothersRageWarned["big-brother"], false);
  assert.deepEqual(second.finalBattleStageShown, {});
});

test("styles live behind purpose-specific entry points instead of the project root", () => {
  for (const legacyName of ["style.css", "menus.css", "responsive.css", "dev.css"]) {
    assert.equal(existsSync(rootFile(legacyName)), false, `${legacyName} should not live at the project root`);
  }

  const gameCss = readFileSync(rootFile("styles/game.css"), "utf8");
  assert.match(gameCss, /@import "\.\/battle\/board\.css"/);
  assert.match(gameCss, /@import "\.\/battle\/overlays\.css"/);
  assert.match(gameCss, /@import "\.\/battle\/effects\.css"/);
  assert.match(gameCss, /@import "\.\/screens\/campaign\.css"/);
  assert.match(gameCss, /@import "\.\/responsive\.css"/);

  const responsiveCss = readFileSync(rootFile("styles/responsive.css"), "utf8");
  for (const layer of ["shell", "touch", "battle", "menus", "performance"]) {
    assert.match(responsiveCss, new RegExp(`@import "\\./responsive/${layer}\\.css"`));
  }

  const html = readFileSync(rootFile("index.html"), "utf8");
  assert.match(html, /href="\.\/styles\/game\.css"/);
  assert.doesNotMatch(html, /href="\.\/(?:style|menus|responsive)\.css"/);
});

test("release hotspots delegate cohesive responsibilities to smaller modules", () => {
  const boundaries = [
    ["src/main.js", 850, ["./ai/cpuTurnController.js", "./online/onlineCommandController.js", "./match/matchLifecycleController.js", "./ui/battleEventPresenter.js", "./ui/commandResolutionController.js", "./ui/matchOutcomeController.js", "./ui/battleInputController.js", "./ui/tutorialPresentationController.js", "./ui/tempoLoopController.js", "./campaign/campaignPresentationController.js", "./campaign/campaignMatchHooks.js"]],
    ["src/ui/commandResolutionController.js", 400, ["./rolledCombatPresenter.js", "./instantArtPresenter.js", "./resolutionGuard.js"]],
    ["src/ui/menuFlow.js", 220, ["./matchSetupScreens.js", "./campaignMapScreen.js", "./resultsScreen.js", "./tutorialMenuScreens.js", "./settingsScreen.js"]],
    ["src/ui/campaignMapScreen.js", 580, ["./campaignMenuModel.js"]],
    ["src/ui/resultsScreen.js", 200, ["./resultsOpponentCard.js"]],
    ["src/ui/resultsOpponentCard.js", 120, []],
    ["src/ui/tutorialMenuScreens.js", 170, []],
    ["src/ui/settingsScreen.js", 250, []],
    ["src/ui/matchSetupScreens.js", 220, []],
    ["src/ui/boardRenderer.js", 560, ["./boardAtmosphere.js"]],
    ["src/ui/boardAtmosphere.js", 450, []],
    ["src/campaign/campaignMatch.js", 320, ["./campaignLayouts.js", "./missions/monk-temple-trial/trial.js", "./missions/void-ridden-castle/trial.js"]],
    ["src/core/reducer.js", 340, ["./basicAttack.js", "./activationPassives.js"]],
    ["src/core/basicAttack.js", 430, []],
    ["src/core/turnEngine.js", 520, ["./turnHazards.js"]],
    ["src/core/unitCatalog.js", 760, ["./unitRegistry.js", "./unitWeather.js", "./kingCommands.js", "./unitAiMetadata.js"]],
    // basics.js stays a pure barrel over the split tutorial subsystem.
    ["src/tutorials/basics.js", 15, ["./tutorialContent.js", "./tutorialMatchSetup.js", "./tutorialValidation.js", "./tutorialCpu.js", "./tutorialProgress.js"]],
    ["src/tutorials/tutorialValidation.js", 1000, ["./tutorialContent.js", "./tutorialRuntimeHelpers.js"]],
    ["src/tutorials/tutorialContent.js", 340, []],
    ["src/tutorials/tutorialMatchSetup.js", 280, []],
    ["src/tutorials/tutorialCpu.js", 180, []],
    ["src/tutorials/tutorialProgress.js", 120, []],
    ["src/tutorials/tutorialRuntimeHelpers.js", 170, []],
    ["src/campaign/campaignLayouts.js", 430, ["./missions/witch-doctor-swamp/layout.js", "./missions/the-final-battle/stages.js"]],
    ["src/ui/matchOutcomeController.js", 220, []],
    ["src/campaign/campaignMatchHooks.js", 150, []],
    // The sandbox must consume the SAME resolve loop as the shipping match, never a fork
    // of it. src/dev/ is currently untracked (the repo-root .gitignore's `dev/` pattern
    // catches it), so this boundary only applies when the folder is present locally.
    ...(existsSync(rootFile("src/dev/sandbox.js"))
      ? [["src/dev/sandbox.js", 520, ["../ui/commandResolutionController.js"]]]
      : []),
    ["src/core/artResolvers.js", 350, [
      "./artResolvers/riotCopResolvers.js",
      "./artResolvers/fatWizardResolvers.js",
      "./artResolvers/treantResolvers.js",
      "./artResolvers/virusResolvers.js",
      "./artResolvers/clodResolvers.js",
      "./artResolvers/nemesisResolvers.js",
      "./artResolvers/motherNatureResolvers.js",
      "./artResolvers/roninResolvers.js",
      "./artResolvers/bigBrotherResolvers.js",
      "./artResolvers/witchDoctorResolvers.js",
      "./artResolvers/fatherTimeResolvers.js",
      "./artResolvers/juggernautResolvers.js",
      "./artResolvers/monkResolvers.js",
      "./artResolvers/targetedArtResolvers.js",
      "./artResolvers/areaArtResolvers.js",
      "./artResolvers/summonResolvers.js",
      "./artResolvers/minerResolvers.js",
      "./artResolvers/supportResolvers.js",
      "./artResolvers/rangedArtResolvers.js",
      "./artResolvers/gargoyleResolvers.js",
    ]],
    ["src/ui/effects.js", 1150, ["./effectProjectiles.js", "./effectWindups.js", "./unitMotionEffects.js", "./diceRollReveal.js"]],
  ];

  for (const [path, maxLines, expectedImports] of boundaries) {
    const source = readFileSync(rootFile(path), "utf8");
    assert.ok(source.split(/\r?\n/).length < maxLines, `${path} should stay below ${maxLines} lines`);
    for (const expectedImport of expectedImports) {
      assert.match(source, new RegExp(expectedImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("ART resolver modules remain focused instead of becoming new monoliths", () => {
  const resolverDirectory = rootFile("src/core/artResolvers/");
  for (const entry of readdirSync(resolverDirectory)) {
    if (!entry.endsWith(".js")) continue;
    const source = readFileSync(new URL(entry, resolverDirectory), "utf8");
    assert.ok(source.split(/\r?\n/).length < 350, `${entry} should stay below 350 lines`);
  }
});
