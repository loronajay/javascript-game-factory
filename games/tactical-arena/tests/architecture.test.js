import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
    ["src/main.js", 1325, ["./ai/cpuTurnController.js", "./online/onlineCommandController.js", "./match/matchLifecycleController.js", "./ui/battleEventPresenter.js", "./ui/rolledCombatPresenter.js", "./ui/instantArtPresenter.js", "./ui/battleInputController.js", "./ui/tutorialPresentationController.js", "./ui/tempoLoopController.js", "./campaign/campaignPresentationController.js", "./campaign/campaignRuntime.js"]],
    ["src/core/artResolvers.js", 3000, ["./artResolvers/riotCopResolvers.js"]],
    ["src/ui/effects.js", 1350, ["./unitMotionEffects.js"]],
  ];

  for (const [path, maxLines, expectedImports] of boundaries) {
    const source = readFileSync(rootFile(path), "utf8");
    assert.ok(source.split(/\r?\n/).length < maxLines, `${path} should stay below ${maxLines} lines`);
    for (const expectedImport of expectedImports) {
      assert.match(source, new RegExp(expectedImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
