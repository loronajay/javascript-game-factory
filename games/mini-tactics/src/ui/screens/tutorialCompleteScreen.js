import { bindCommonControls, screenRoot } from "./common.js";

export function createTutorialCompleteScreen(ctx) {
  const el = screenRoot("tutorialComplete");
  bindCommonControls(el, ctx);

  const titleEl = el.querySelector("[data-tutorial-complete='title']");
  const rewardEl = el.querySelector("[data-tutorial-complete='reward']");
  const nextBtn = el.querySelector('[data-action="nextTutorial"]');

  nextBtn?.addEventListener("click", () => {
    // Tutorial #2 is not authored yet; keep the button inert but explicit.
  });

  function onEnter(summary = {}) {
    if (titleEl) titleEl.textContent = summary.title || "Tutorial Complete";
    if (rewardEl) {
      rewardEl.textContent = summary.rewardGranted && summary.rewardSkin
        ? `All tutorials complete. Skin unlocked: ${summary.rewardSkin}.`
        : "Tutorial progress saved.";
    }
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Next Tutorial Coming Soon";
    }
  }

  return { el, onEnter };
}

