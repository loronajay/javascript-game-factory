export const FARM_EFFECTS = Object.freeze({
    "normal-catch": "normal-catch.mp3", "big-catch": "big-catch.mp3", "shiny-catch": "shiny-catch.mp3",
    "breed-complete": "breed-complete.mp3", "five-star-animal-birth": "five-star-animal-birth.mp3",
    "level-up": "level-up.mp3", "perfect-harvest": "perfect-harvest.mp3", "three-star": "three-star.mp3",
});
export function farmResultEffects(result) {
    if (!result?.ok || result.duplicate)
        return [];
    const effects = [];
    if (Array.isArray(result.births) && result.births.length)
        effects.push(result.births.some((birth) => Number(birth.grade) >= 5) ? "five-star-animal-birth" : "breed-complete");
    if (Number(result.stars) === 3 && (result.cooking || result.carpentry))
        effects.push("three-star");
    if (result.quality === "perfect" && result.quantity > 0)
        effects.push("perfect-harvest");
    if ([result, result.farming, result.husbandry, result.cooking, result.carpentry, result.woodcutting, result.fishing].some((skill) => skill && Number(skill.level ?? skill.levelAfter) > Number(skill.levelBefore)))
        effects.push("level-up");
    return effects;
}
export function catchEffect(fish) {
    if (fish.variant !== "normal")
        return "shiny-catch";
    return ["large", "trophy", "record"].includes(fish.sizeClass) ? "big-catch" : "normal-catch";
}
/** One bounded cue queue, muted separately from background music. */
export function createFarmSoundEffects() {
    const queue = [];
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = 0.55;
    let unlocked = false, busy = false, muted = false, destroyed = false;
    try {
        muted = localStorage.getItem("jgf.farm.effects-muted") === "true";
    }
    catch { }
    function next() {
        busy = false;
        if (destroyed || !unlocked || muted || !queue.length || document.hidden)
            return;
        const effect = queue.shift();
        audio.src = new URL(`../farm/assets/sounds/effects/${FARM_EFFECTS[effect]}`, import.meta.url).href;
        busy = true;
        void audio.play().catch(() => { busy = false; });
    }
    const unlock = () => { unlocked = true; if (!busy)
        next(); };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    audio.addEventListener("ended", next);
    audio.addEventListener("error", next);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "farm-button";
    const paint = () => { button.textContent = muted ? "SFX off" : "SFX on"; button.setAttribute("aria-label", muted ? "Turn sound effects on" : "Mute sound effects"); button.setAttribute("aria-pressed", String(!muted)); };
    paint();
    document.querySelector('[role="toolbar"]')?.append(button);
    button.addEventListener("click", () => {
        muted = !muted;
        if (muted) {
            queue.length = 0;
            audio.pause();
            busy = false;
        }
        try {
            localStorage.setItem("jgf.farm.effects-muted", String(muted));
        }
        catch { }
        paint();
    });
    return {
        play(effect) { if (destroyed || muted || !unlocked || document.hidden)
            return; if (queue.length < 5)
            queue.push(effect); if (!busy)
            next(); },
        result(result) { for (const effect of farmResultEffects(result))
            this.play(effect); },
        destroy() { destroyed = true; audio.pause(); queue.length = 0; document.removeEventListener("pointerdown", unlock); document.removeEventListener("keydown", unlock); button.remove(); },
    };
}
