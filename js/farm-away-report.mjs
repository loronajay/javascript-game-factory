// "While you were away": the card that says what offline production did, so a
// player never has to infer why their field changed. The words come from the
// pure report (farm-offline.mts); this file only puts them on screen.
import { formatAwayTime } from "./farm-offline.mjs";
export function createAwayReport(root) {
    const heading = root.querySelector("[data-away-heading]");
    const list = root.querySelector("[data-away-lines]");
    const close = root.querySelector("[data-away-close]");
    const hide = () => { root.hidden = true; };
    close?.addEventListener("click", hide);
    return Object.freeze({
        show(report) {
            if (!report.lines.length)
                return;
            if (heading)
                heading.textContent = `While you were away — ${formatAwayTime(report.awayMs)}`;
            if (list) {
                list.replaceChildren(...report.lines.map((line) => {
                    const item = document.createElement("li");
                    item.textContent = line.text;
                    item.dataset.tone = line.tone;
                    return item;
                }));
            }
            root.hidden = false;
        },
        hide,
    });
}
