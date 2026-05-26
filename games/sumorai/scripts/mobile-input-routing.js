function isMobileControllerMounted(doc = globalThis.document) {
  return !!doc?.querySelector?.('[data-mobile-controller-root="sumorai-touch"]');
}

function getHumanInputBindings(side, bindings, options = {}) {
  if (options.mobileControlsActive) return { ...options.defaultMobileBindings };
  return bindings[side];
}

export { getHumanInputBindings, isMobileControllerMounted };
