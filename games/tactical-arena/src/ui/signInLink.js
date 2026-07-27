// Shared wiring for the "Sign in" anchors that appear on account-gated panels
// (ranked profile, leaderboard, friends, player profile).
//
// On the web these stay ordinary links to the arcade shell's sign-in page. In the
// packaged app that page does not exist, so the click is intercepted and opens the
// in-app auth panel instead. Four panels needed identical behavior, so it lives here
// rather than being copy-pasted into each.

import { createFactoryAccountSignInUrl } from "../platform/factoryAccount.js";
import { handleSignInLinkClick } from "../platform/factorySignIn.js";

export function wireSignInLink(link, options = {}) {
  if (!link) return link;

  try {
    link.href = createFactoryAccountSignInUrl();
  } catch {
    link.href = "#";
  }

  link.addEventListener("click", (event) => {
    if (handleSignInLinkClick(options)) event.preventDefault();
  });

  return link;
}
