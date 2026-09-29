// Races at Windrush Downs, on the page (planning-docs/FARM_RIDING_PLAN.md):
// the race board (post a race, enter one, start the one you posted), the
// betting booth (back a rider in a race still taking bets), and — for a rider
// in a race that is starting — the race itself: a `downs-race-session` joined
// to the network server's race room, the rider's horse predicted on the room's
// sim, everything outside the race hidden, and the signed result handed to the
// API to settle. The board is read from the API every few seconds; every move
// is an API call and the panels redraw from its answer.
import { findDownsCourse } from "./downs-course.mjs";
import { COUNTDOWN_TICKS } from "./downs-race.mjs";
import { createRaceSession } from "./downs-race-session.mjs";
import { resolveFactoryNetworkUrl } from "./platform/api/factory-network-url.mjs";
const MESSAGES = Object.freeze({
    races_unavailable: "Races are closed today — the race room is not set up.",
    too_many_races: "The board is full. Enter one of the races on it.",
    already_racing: "You are already in a race.",
    daily_spend_limit: "That would pass today's 10,000-ticket limit on races.",
    gate_closed: "The gate has closed on that race.",
    race_full: "That race is full.",
    backed_this_race: "You have backed a rider in that race, so you cannot ride in it.",
    riding_this_race: "You are riding in that race — you cannot bet on it.",
    not_poster: "Only the rider who posted it can start it.",
    too_few_riders: "It needs at least two riders.",
    betting_closed: "Betting has closed on that race.",
    too_many_bets: "That is as many bets as one person may place on a race.",
    insufficient_tickets: "Not enough tickets.",
    no_horse: "Your horse could not be found on your farm.",
    invalid_stake: "A stake is 0 to 500 tickets.",
    invalid_bet: "A bet is 1 to 1,000 tickets.",
});
const COURSE_TITLES = Object.freeze({ gallop: "The Gallop", "oval-1": "The Oval · 1 lap", "oval-2": "The Oval · 2 laps", xc: "Cross-Country" });
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
function button(text, onClick, accent = false) {
    const node = element("button", accent ? "farm-button farm-button--accent" : "farm-button", text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
}
export function createDownsRacing(options) {
    const now = options.now ?? (() => Date.now());
    const elements = options.elements;
    let races = [];
    let busy = false;
    let started = false;
    let pollTimer = null;
    let session = null;
    let sessionRace = null;
    let settledRaceIds = new Set();
    let lastRideState = null;
    const mine = (race) => race.entries.some((entry) => entry.playerId === options.selfPlayerId);
    const title = (race) => COURSE_TITLES[race.courseId] ?? findDownsCourse(race.courseId)?.title ?? race.courseId;
    const nameOf = (race, playerId) => race.entries.find((entry) => entry.playerId === playerId)?.name ?? "A rider";
    async function load() {
        const answer = await options.api.fetchFarmRaces().catch(() => null);
        if (Array.isArray(answer?.races))
            races = answer.races;
        joinIfDue();
        render();
    }
    function schedule() {
        if (pollTimer)
            clearTimeout(pollTimer);
        const urgent = races.some((race) => mine(race) && (race.status === "closing" || race.status === "running"));
        pollTimer = setTimeout(() => { void load().finally(schedule); }, urgent || isOpen() ? 1500 : 4000);
    }
    function status(target, text) {
        target.textContent = text;
    }
    async function act(target, work, done) {
        if (busy)
            return;
        busy = true;
        render();
        const result = await work().catch(() => null);
        busy = false;
        if (result?.ok) {
            if (Number.isSafeInteger(result.balance))
                options.takeBalance(result.balance);
            status(target, done(result));
            await load();
        }
        else {
            status(target, MESSAGES[result?.error] ?? "That did not go through. Try again in a moment.");
            render();
        }
    }
    // ---------------------------------------------------------------- joining and settling the rider's race
    function joinIfDue() {
        if (session)
            return;
        const race = races.find((entry) => mine(entry) && (entry.status === "closing" || entry.status === "running") && entry.ticket && entry.seat && !settledRaceIds.has(entry.id));
        if (!race || !race.startsAt || now() < race.startsAt - 12_000)
            return;
        sessionRace = race;
        session = createRaceSession({
            ticket: race.ticket,
            seat: race.seat,
            selfPlayerId: options.selfPlayerId,
            url: options.networkUrl ?? resolveFactoryNetworkUrl(),
            now,
            onResult: (signed) => { void settle(race.id, signed); },
            onError: (code) => { if (code !== "TOO_FAST")
                options.hud.toast("The race room had a problem.", code, 3); },
        });
    }
    async function settle(raceId, signed) {
        if (settledRaceIds.has(raceId))
            return;
        settledRaceIds.add(raceId);
        const answer = await options.api.farmRaceAction(raceId, "settle", { result: signed.result, signature: signed.signature }).catch(() => null);
        const race = answer?.race ?? sessionRace;
        const order = signed.result.order ?? [];
        const place = order.indexOf(options.selfPlayerId) + 1;
        const won = (answer?.race?.myPayouts ?? []).reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);
        const xp = Number(answer?.race?.myXp) || 0;
        const words = place === 1 ? "You won!" : place > 0 ? `You finished ${place}${place === 2 ? "nd" : place === 3 ? "rd" : "th"} of ${race?.entries?.length ?? order.length}` : "You did not finish.";
        const winner = order[0] ? nameOf(race, order[0]) : "nobody";
        options.hud.toast(`${words}`, `${place === 1 ? "" : `Winner: ${winner}. `}${won ? `+${won.toLocaleString()} tickets · ` : ""}${xp ? `+${xp} Riding XP` : ""}`, 7);
        options.refreshBalance?.();
        if (answer?.race)
            options.takeFarm(null);
        session?.close();
        session = null;
        sessionRace = null;
        await load();
    }
    // ---------------------------------------------------------------- the panels
    function isOpen() {
        return !elements.racePanel.hidden || !elements.boothPanel.hidden;
    }
    function renderCompose() {
        const horse = options.horse();
        const course = element("select", "");
        for (const id of ["gallop", "oval-1", "oval-2", "xc"]) {
            const option = element("option", "", COURSE_TITLES[id]);
            option.value = id;
            course.append(option);
        }
        const riders = element("select", "");
        for (let count = 2; count <= 6; count += 1) {
            const option = element("option", "", `${count} riders`);
            option.value = String(count);
            if (count === 4)
                option.selected = true;
            riders.append(option);
        }
        const stake = element("input", "");
        stake.type = "number";
        stake.min = "0";
        stake.max = "500";
        stake.step = "10";
        stake.value = "0";
        for (const field of [stake])
            field.addEventListener("keydown", (event) => event.stopPropagation());
        const labelled = (text, control) => {
            const label = element("label", "", text);
            label.append(control);
            return label;
        };
        const post = button(horse ? `Post a race on ${horse.name}` : "Ride here on a horse to race", () => {
            if (!horse)
                return;
            void act(elements.raceStatus, () => options.api.postFarmRace({ courseId: course.value, maxRiders: Number(riders.value), stake: Math.max(0, Math.min(500, Math.floor(Number(stake.value) || 0))), horseId: horse.instanceId, name: options.selfName ?? "" }), () => "Posted. Whoever is here can enter — start it when the field is ready.");
        }, true);
        post.disabled = busy || !horse || !options.signedIn;
        if (!options.signedIn)
            post.textContent = "Sign in to race";
        elements.raceCompose.replaceChildren(labelled("Course", course), labelled("Field", riders), labelled("Stake (tickets)", stake), post);
    }
    function countdownWords(race) {
        const at = now();
        if (race.status === "open")
            return `${race.entries.length}/${race.maxRiders} riders · waiting for the poster`;
        if (race.status === "closing" && race.gateClosesAt && at < race.gateClosesAt)
            return `Gate closes in ${Math.ceil((race.gateClosesAt - at) / 1000)}s`;
        if ((race.status === "closing" || race.status === "running") && race.startsAt && at < race.startsAt)
            return `Starts in ${Math.ceil((race.startsAt - at) / 1000)}s`;
        if (race.status === "running")
            return "Running now";
        if (race.status === "settled")
            return "Result";
        return "Taken down";
    }
    function raceCard(race, booth) {
        const card = element("li", `downs-race${mine(race) ? " is-mine" : ""}`);
        const head = element("div", "downs-race__head");
        head.append(element("strong", "", `${title(race)}${race.stake ? ` · ${race.stake.toLocaleString()} stake` : " · friendly"}`), element("span", "", countdownWords(race)));
        const riders = element("ul", "downs-race__riders");
        const order = race.result?.order ?? [];
        for (const entry of race.entries) {
            const row = element("li", "");
            const place = order.indexOf(entry.playerId) + 1;
            const odds = race.odds?.[entry.playerId];
            row.append(element("span", "", `${place ? `${place}. ` : ""}${entry.name} on ${entry.horseName}`), element("small", "", booth ? `${(race.byRider?.[entry.playerId] ?? 0).toLocaleString()} backed${odds ? ` · pays ${odds}×` : ""}` : race.status === "settled" && !place ? "DNF" : ""));
            if (booth && race.bettingOpen && !mine(race)) {
                const amount = element("input", "");
                amount.type = "number";
                amount.min = "1";
                amount.max = "1000";
                amount.value = "50";
                amount.addEventListener("keydown", (event) => event.stopPropagation());
                const back = button("Back", () => {
                    void act(elements.boothStatus, () => options.api.farmRaceAction(race.id, "bets", { riderId: entry.playerId, amount: Math.floor(Number(amount.value) || 0), name: options.selfName ?? "" }), () => `You backed ${entry.name}. Good luck!`);
                }, true);
                back.disabled = busy || !options.signedIn;
                const actions = element("div", "downs-race__actions");
                actions.append(amount, back);
                row.append(actions);
            }
            riders.append(row);
        }
        card.append(head, riders);
        if (booth) {
            const lines = [];
            if (race.pool)
                lines.push(`Pool: ${race.pool.toLocaleString()} tickets`);
            for (const bet of race.myBets ?? [])
                lines.push(`You: ${bet.amount.toLocaleString()} on ${nameOf(race, bet.riderId)}`);
            for (const payout of race.myPayouts ?? [])
                lines.push(`Paid you ${payout.amount.toLocaleString()} (${payout.kind})`);
            if (lines.length)
                card.append(element("small", "", lines.join(" · ")));
            return card;
        }
        const actions = element("div", "downs-race__actions");
        const horse = options.horse();
        if (race.status === "open" || (race.status === "closing" && race.bettingOpen)) {
            if (!mine(race) && race.entries.length < race.maxRiders) {
                const enter = button(`Enter${race.stake ? ` · ${race.stake.toLocaleString()}` : ""}`, () => {
                    if (!horse)
                        return;
                    void act(elements.raceStatus, () => options.api.farmRaceAction(race.id, "entries", { horseId: horse.instanceId, name: options.selfName ?? "" }), () => "You're in. Stay near the start — you'll be put on the line when it begins.");
                }, true);
                enter.disabled = busy || !horse || !options.signedIn;
                actions.append(enter);
            }
            if (mine(race) && race.status === "open") {
                actions.append(button(race.posterId === options.selfPlayerId ? "Take down" : "Leave", () => void act(elements.raceStatus, () => options.api.farmRaceAction(race.id, "leave"), () => "Done. Your stake is back.")));
            }
            if (race.status === "open" && race.posterId === options.selfPlayerId) {
                const go = button("Start — close the gate", () => void act(elements.raceStatus, () => options.api.farmRaceAction(race.id, "start"), () => "The gate closes in 20 seconds. Get ready!"), true);
                go.disabled = busy || race.entries.length < 2;
                actions.append(go);
            }
        }
        for (const payout of race.myPayouts ?? [])
            actions.append(element("small", "", `Paid you ${payout.amount.toLocaleString()} (${payout.kind})`));
        if (actions.childElementCount)
            card.append(actions);
        return card;
    }
    function render() {
        if (!elements.racePanel.hidden) {
            renderCompose();
            elements.raceList.replaceChildren(...(races.length ? races.map((race) => raceCard(race, false)) : [element("li", "sale-note", "No races on the board. Post one!")]));
        }
        if (!elements.boothPanel.hidden) {
            const open = races.filter((race) => race.status !== "cancelled");
            elements.boothList.replaceChildren(...(open.length ? open.map((race) => raceCard(race, true)) : [element("li", "sale-note", "No races to bet on right now.")]));
        }
    }
    function closePanels() {
        const was = isOpen();
        elements.racePanel.hidden = true;
        elements.boothPanel.hidden = true;
        if (was)
            options.onClose?.();
    }
    elements.closeRaces.addEventListener("click", closePanels);
    elements.closeBooth.addEventListener("click", closePanels);
    // ---------------------------------------------------------------- the race itself
    function racingNow() {
        return Boolean(session && session.role() === "rider" && session.tick() >= 0 && !session.result());
    }
    function run() {
        const predicted = session?.predicted();
        if (!session || !predicted || !sessionRace)
            return null;
        return Object.freeze({
            courseId: sessionRace.courseId,
            phase: "running",
            ticks: Math.max(0, session.tick() - COUNTDOWN_TICKS),
            next: Math.max(0, predicted.next),
            faults: predicted.faults,
            knocked: Object.freeze([]),
            missed: "",
            start: Object.freeze({ x: 0, z: 0, y: 0, vy: 0, heading: 0, speed: 0, stamina: 0, winded: false, airborne: false, stumble: 0, jumpHeld: false }),
            inputs: Object.freeze([]),
        });
    }
    return Object.freeze({
        start() {
            if (started)
                return;
            started = true;
            void load().finally(schedule);
        },
        panelOpen: isOpen,
        openRaces() {
            elements.boothPanel.hidden = true;
            elements.racePanel.hidden = false;
            status(elements.raceStatus, "");
            render();
            void load();
        },
        openBooth() {
            elements.racePanel.hidden = true;
            elements.boothPanel.hidden = false;
            status(elements.boothStatus, "");
            render();
            void load();
        },
        closePanels,
        activity() {
            if (racingNow() && sessionRace)
                return `racing ${title(sessionRace)}`;
            return isOpen() ? (elements.boothPanel.hidden ? "at the race board" : "at the betting booth") : "";
        },
        prompt() {
            const race = races.find((entry) => mine(entry) && (entry.status === "closing" || entry.status === "running") && !settledRaceIds.has(entry.id));
            if (session && session.role() === "rider") {
                const tick = session.tick();
                if (tick < 0)
                    return `${title(sessionRace)} starts in ${Math.ceil(-tick / 60)}s — you'll be put on the line`;
                if (tick < COUNTDOWN_TICKS)
                    return `${Math.ceil((COUNTDOWN_TICKS - tick) / 60)}…`;
                if (tick < COUNTDOWN_TICKS + 60)
                    return "GO!";
                if (session.finished() && !session.result())
                    return "Across the line — waiting for the others";
                return "";
            }
            if (race?.startsAt) {
                const left = Math.ceil((race.startsAt - now()) / 1000);
                if (left > 0)
                    return `${title(race)} starts in ${left}s`;
            }
            return "";
        },
        interact: () => false,
        racing: racingNow,
        stepLocal(input) {
            if (!session)
                return null;
            const state = session.step(input);
            if (state)
                lastRideState = state;
            return state;
        },
        run,
        courseId: () => (sessionRace ? sessionRace.courseId : null),
        visibleMembers(members) {
            if (!racingNow() || !sessionRace)
                return members;
            const riders = new Set(sessionRace.entries.map((entry) => entry.playerId));
            return members.filter((member) => riders.has(member.playerId));
        },
        tick() {
            if (!session)
                joinIfDue();
            // A race the room never finished: let the deadline take it back.
            if (session && sessionRace?.deadlineAt && now() > sessionRace.deadlineAt + 5000) {
                session.close();
                session = null;
                options.hud.toast("The race was abandoned.", "Every stake and bet is refunded.", 5);
                sessionRace = null;
            }
        },
        draw() {
            // The race is drawn by the riders' own presence poses; nothing extra to draw.
        },
        debug: () => ({ races: races.map((race) => ({ id: race.id, status: race.status, entries: race.entries.length })), session: session ? { raceId: session.raceId(), tick: session.tick(), role: session.role() } : null, last: lastRideState }),
    });
}
