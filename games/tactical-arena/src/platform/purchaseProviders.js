// Which payment rail a premium purchase should use.
//
// Web keeps Stripe. The packaged Android app uses Google Play Billing, because
// Google's US policy (post-Epic-settlement) charges a 10% service fee on ALL billing
// paths and adds 5% only for Play Billing — while the alternative-billing programs
// additionally require PCI-DSS scope, reporting every transaction to Google within
// 24 hours, and owning refunds and support. For a game this size that ~2-point
// saving is not worth the compliance surface.
//
// The important rule is the fallback: if the app cannot reach the Play bridge it
// reports UNAVAILABLE rather than quietly running Stripe checkout inside the app.
// In-app Stripe is a different Play program with its own enrollment; falling back to
// it because a plugin failed to load would ship an unenrolled payment flow.

export const PURCHASE_PROVIDERS = Object.freeze({
  stripe: "stripe",
  play: "play",
  unavailable: "unavailable",
});

const PROVIDER_MESSAGES = Object.freeze({
  [PURCHASE_PROVIDERS.stripe]: "",
  [PURCHASE_PROVIDERS.play]: "",
  [PURCHASE_PROVIDERS.unavailable]:
    "Purchases are unavailable right now. Please make sure Google Play is up to date and try again.",
});

export function selectPurchaseProvider(options) {
  // Explicit null-guard: a default parameter only covers `undefined`.
  const { nativeApp = false, plugins = null } = options && typeof options === "object" ? options : {};
  if (!nativeApp) return PURCHASE_PROVIDERS.stripe;
  const bridge = plugins && typeof plugins === "object" ? plugins.PlayBilling : null;
  return bridge ? PURCHASE_PROVIDERS.play : PURCHASE_PROVIDERS.unavailable;
}

export function purchaseProviderMessage(provider) {
  return PROVIDER_MESSAGES[provider] ?? PROVIDER_MESSAGES[PURCHASE_PROVIDERS.unavailable];
}
