// "While you're away": the owner's choice of how fast the farm grows when they
// are not on it. A switch (grow, or wait for me) and a rate up to the farm's
// ceiling. The rule and the ceiling are farm-offline.mts; this is the control,
// and it hands the chosen rate to the page, which saves it on the layout.
import { MAX_OFFLINE_PRODUCTION_RATE, OFFLINE_PRODUCTION_RATE, clampOfflineRate } from "./farm-offline.mjs";
const STEP_PERCENT = 1;
const percent = (rate) => Math.round(rate * 100);
export function createFarmAwaySettings({ root, onChange }) {
    root.replaceChildren();
    root.classList.add("away-settings");
    const heading = document.createElement("header");
    heading.className = "away-settings__head";
    const title = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "WHILE YOU'RE AWAY";
    const name = document.createElement("h3");
    name.textContent = "Away growth";
    title.append(eyebrow, name);
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "away-settings__switch";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("aria-label", "Keep growing while I'm away");
    const toggleText = document.createElement("span");
    toggleLabel.append(toggle, toggleText);
    heading.append(title, toggleLabel);
    const rateRow = document.createElement("label");
    rateRow.className = "away-settings__rate";
    const rateText = document.createElement("span");
    rateText.textContent = "Growth speed";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(STEP_PERCENT);
    slider.max = String(percent(MAX_OFFLINE_PRODUCTION_RATE));
    slider.step = String(STEP_PERCENT);
    slider.setAttribute("aria-label", "Away growth speed, percent of normal");
    const value = document.createElement("strong");
    rateRow.append(rateText, slider, value);
    const description = document.createElement("p");
    description.className = "away-settings__description";
    const status = document.createElement("small");
    status.className = "away-settings__status";
    status.setAttribute("aria-live", "polite");
    root.append(heading, rateRow, description, status);
    // The rate the slider returns to when growth is switched back on.
    let lastOnRate = OFFLINE_PRODUCTION_RATE;
    let current = OFFLINE_PRODUCTION_RATE;
    function paint(rate) {
        const on = rate > 0;
        if (on)
            lastOnRate = rate;
        toggle.checked = on;
        toggleText.textContent = on ? "On" : "Off";
        slider.disabled = !on;
        slider.value = String(percent(on ? rate : lastOnRate));
        value.textContent = on ? `${percent(rate)}%` : "—";
        rateRow.classList.toggle("is-off", !on);
        description.textContent = on
            ? `Crops and trees keep growing at ${percent(rate)}% of normal speed while you're away, for up to your first 24 hours. They can still get thirsty and wilt, but never die while you're gone.`
            : "Your farm waits for you: crops and trees stay exactly as you left them until you come back.";
    }
    async function choose(rate) {
        const next = clampOfflineRate(rate);
        if (next === current)
            return;
        current = next;
        paint(next);
        status.textContent = "Saving…";
        try {
            const said = await onChange(next);
            status.textContent = typeof said === "string" && said ? said : "Saved.";
        }
        catch {
            status.textContent = "Could not save that just now.";
        }
    }
    toggle.addEventListener("change", () => { void choose(toggle.checked ? lastOnRate : 0); });
    // Show the number while dragging; save once, on release.
    slider.addEventListener("input", () => { value.textContent = `${slider.value}%`; });
    slider.addEventListener("change", () => { void choose(Number(slider.value) / 100); });
    // Keys typed into the controls belong to them, not to the farm's WASD/shortcut listener.
    root.addEventListener("keydown", (event) => event.stopPropagation());
    return Object.freeze({
        render(rate) {
            current = clampOfflineRate(rate);
            paint(current);
        },
    });
}
