// Mobile detection for the profile surfaces (/me, /player) and the layout editor.
//
// Every other breakpoint in the repo is width-only, which is exactly why landscape
// phones broke: a phone on its side is ~844x390, so it clears every `max-width`
// query and gets served the desktop layout inside 390px of height. These helpers
// key off `pointer: coarse` instead, so a narrow or short *desktop* window keeps
// the full desktop experience and only real touch devices take the mobile path.
//
// Keep the media queries here in sync with the `pointer: coarse` blocks in
// css/mobile-landscape.css — the CSS compacts shared page chrome, these helpers
// switch the JS-driven profile layout and gate the editor.
// Widest viewport still treated as a phone. Covers portrait phones (~412px) and
// landscape phones (~932px on the largest handsets) without catching tablets in
// landscape (>=1024px), which have room for the real composition layout.
const MOBILE_MAX_WIDTH = 960;
const MOBILE_PROFILE_QUERY = `(pointer: coarse) and (max-width: ${MOBILE_MAX_WIDTH}px)`;
// True when profile surfaces should render the fixed single-column mobile stack
// instead of the saved composition layout.
export function isMobileProfileViewport(win = globalThis) {
    if (!win)
        return false;
    if (typeof win.matchMedia === "function") {
        try {
            return !!win.matchMedia(MOBILE_PROFILE_QUERY)?.matches;
        }
        catch {
            /* jsdom / test doubles without matchMedia support fall through to width */
        }
    }
    // No matchMedia (older test doubles): width alone is the best signal available.
    // Deliberately conservative — without a pointer signal we only treat clearly
    // phone-sized viewports as mobile.
    return Number.isFinite(win.innerWidth) && win.innerWidth <= MOBILE_MAX_WIDTH;
}
// Calls `onChange` whenever the viewport crosses the mobile boundary (rotation,
// window resize) so the caller can re-render. Returns an unsubscribe function.
export function watchMobileProfileViewport(onChange, win = globalThis) {
    if (typeof win?.matchMedia !== "function")
        return () => { };
    let query = null;
    try {
        query = win.matchMedia(MOBILE_PROFILE_QUERY);
    }
    catch {
        return () => { };
    }
    if (!query)
        return () => { };
    const handler = () => onChange(!!query.matches);
    if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handler);
        return () => query.removeEventListener("change", handler);
    }
    // Safari < 14 only has the deprecated listener API.
    if (typeof query.addListener === "function") {
        query.addListener(handler);
        return () => query.removeListener(handler);
    }
    return () => { };
}
