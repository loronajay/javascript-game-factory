// Which screens may present unlock/achievement popups. Pure so it can be tested without
// loading the menu router (menuFlow pulls in the online lobby, which needs a browser).
//
// These are the screens where a popup reads as a reward for what the player just did.
// Everywhere else — a live match, the online lobby, the title screen, the setup screens —
// the queue is HELD, never dropped, and flushed on arrival at the next screen in this set.
export const ANNOUNCEMENT_SCREENS = new Set(["mainMenu", "results", "campaign", "tutorialComplete"]);

// The results screen drains after the confetti beat so the popup doesn't cut the moment.
export const RESULTS_ANNOUNCEMENT_DELAY_MS = 550;

export function progressionAnnouncementScreenPolicy(screenName) {
  const present = ANNOUNCEMENT_SCREENS.has(screenName);
  return { present, delay: screenName === "results" ? RESULTS_ANNOUNCEMENT_DELAY_MS : 0 };
}
