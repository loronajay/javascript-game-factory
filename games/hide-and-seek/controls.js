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

  // A momentary key as the network sees it. `press`/`release` are the two edges from the keyboard or
  // the touch button; `sample` is what goes into the next sent frame. A release is deferred until the
  // press has been sampled once, and a re-press behind an unsampled release queues so the key is
  // seen up before it is seen down again — the authority is edge-triggered, and a press that never
  // appears in a sent frame never happened.
  function createPressLatch() {
    let down = false;
    // Edges not yet sampled, in order. At most two matter: [release] or [release, press].
    let pending = [];
    function press() { if (down) return; down = true; if (pending.length) pending.push('press'); else pending = ['press']; }
    function release() { if (!down) return; down = false; pending.push('release'); }
    function sample() {
      if (!pending.length) return down;
      const edge = pending.shift();
      // The first sample of a press reports down and leaves any later release for the next sample.
      if (edge === 'press') return true;
      // A release reports up; if a press already followed it, that press waits for the next sample.
      return false;
    }
    function isDown() { return down; }
    function reset() { down = false; pending = []; }
    return { press, release, sample, isDown, reset };
  }

  return { requestPreferredLookMode, shouldAutoStartDragLook, createPressLatch };
});
