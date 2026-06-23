// Shared helpers for screen modules.

export function screenRoot(name, documentRef = document) {
  const el = documentRef.querySelector(`[data-screen="${name}"]`);
  if (!el) {
    throw new Error(`Missing screen element: [data-screen="${name}"]`);
  }
  return el;
}

// Wire the navigation-only controls every screen shares: `[data-nav]` buttons
// jump to another screen; `[data-action="rules"]` opens the How-to-Play overlay.
// Screen-specific actions are wired by each screen module itself.
export function bindCommonControls(root, { nav, openRules }) {
  root.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => nav(btn.dataset.nav));
  });

  root.querySelectorAll('[data-action="rules"]').forEach((btn) => {
    btn.addEventListener("click", () => openRules());
  });
}
