export function fitAspectRect(bounds, aspect) {
    if (bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
        return { left: bounds.left, top: bounds.top, width: 0, height: 0 };
    }
    const boundsAspect = bounds.width / bounds.height;
    if (boundsAspect > aspect) {
        const width = bounds.height * aspect;
        return {
            left: bounds.left + (bounds.width - width) / 2,
            top: bounds.top,
            width,
            height: bounds.height,
        };
    }
    const height = bounds.width / aspect;
    return {
        left: bounds.left,
        top: bounds.top + (bounds.height - height) / 2,
        width: bounds.width,
        height,
    };
}
/**
 * Where the game frame goes: fitted inside the cabinet's projected screen while the player
 * stands at the cabinet, or fitted to the whole viewport in fullscreen. The same fit either
 * way, so the game is never stretched.
 */
export function playScreenRect(options) {
    const bounds = options.fullscreen
        ? { left: 0, top: 0, width: options.viewport.width, height: options.viewport.height }
        : options.projected;
    return fitAspectRect(bounds, options.aspect);
}
