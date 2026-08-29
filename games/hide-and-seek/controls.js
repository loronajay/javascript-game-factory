(function attachHotelControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelControls = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelControlsApi() {
  'use strict';

  async function requestPreferredLookMode(requestPointerLock) {
    if (typeof requestPointerLock !== 'function') return 'drag-look';
    try {
      const result = requestPointerLock();
      if (result && typeof result.then === 'function') await result;
      return 'pointer-lock-requested';
    } catch (_error) {
      return 'drag-look';
    }
  }

  function shouldAutoStartDragLook(search = '') {
    return new URLSearchParams(search).get('controls') === 'drag';
  }

  return { requestPreferredLookMode, shouldAutoStartDragLook };
});
