// The fishing HUD: the power meter, the wait and the strike, the line-tension
// gauge with its safe band, the fish's fight left, which way it pulls, the
// "bow the rod" call on a leap, the net's closing ring — and the catch card.
// It builds its own markup inside the root it is handed and only ever moves
// DOM to match a controller snapshot; the maths is farm-fishing.mts.

import { NET_GOOD, NET_MARK, RED_LINE, leapPending, netRing } from "./farm-fishing.mjs";
import { findFishSpecies, RARITY_COLORS, RARITY_TITLES } from "./farm-catalog/fish.mjs";
import { GRADE_TITLES, SIZE_TITLES, formatLength, formatWeight, specimenTitle, type SizeClass } from "./farm-fish.mjs";
import type { CaughtFish, FishingSnapshot } from "./farm-fishing-controller.mjs";

export type CatchNotes = Readonly<{
  xp: number;
  practice: boolean;
  /** First of its kind in this angler's Fishdex. */
  firstOfKind: boolean;
  /** Heavier than any of its kind this angler had landed. */
  personalBest: boolean;
  levelUp: number | null;
}>;

export type FishingHud = Readonly<{
  render: (snapshot: FishingSnapshot) => void;
  showCatch: (fish: CaughtFish, notes: CatchNotes) => void;
  hideCatch: () => void;
}>;

const percent = (value: number) => `${(Math.min(1, Math.max(0, value)) * 100).toFixed(1)}%`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function createFishingHud(root: HTMLElement, card: HTMLElement): FishingHud {
  root.innerHTML = `
    <div class="fishing-power" data-hud="power" hidden>
      <span>CAST</span>
      <div class="fishing-power__bar"><i data-power></i></div>
      <small>Release Space to cast</small>
    </div>
    <div class="fishing-wait" data-hud="wait" hidden>
      <strong data-wait-word>Waiting for a bite…</strong>
      <small>Strike with <kbd>Space</kbd> on the bite — not the nibbles</small>
    </div>
    <div class="fishing-fight" data-hud="fight" hidden>
      <div class="fishing-fight__row">
        <span class="fishing-fight__label">LINE</span>
        <div class="fishing-gauge">
          <div class="fishing-gauge__band" data-band></div>
          <div class="fishing-gauge__red" style="left:${percent(RED_LINE)}"></div>
          <i class="fishing-gauge__needle" data-needle></i>
        </div>
      </div>
      <div class="fishing-fight__row">
        <span class="fishing-fight__label">FISH</span>
        <div class="fishing-stamina"><i data-stamina></i></div>
        <span class="fishing-fight__distance" data-distance></span>
      </div>
      <div class="fishing-steer">
        <b data-steer="-1">◀ <kbd>A</kbd></b>
        <em data-bow hidden>BOW THE ROD · <kbd>W</kbd></em>
        <b data-steer="1"><kbd>D</kbd> ▶</b>
      </div>
      <small>Hold <kbd>Space</kbd> to reel · keep the needle in the green · steer against the pull</small>
    </div>
    <div class="fishing-net" data-hud="net" hidden>
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="${NET_MARK * 44}" class="fishing-net__mark"></circle>
        <circle r="${(NET_MARK + NET_GOOD) * 44}" class="fishing-net__zone"></circle>
        <circle r="44" class="fishing-net__ring" data-ring></circle>
      </svg>
      <strong>NET IT!</strong>
      <small><kbd>Space</kbd> as the ring meets the mark</small>
    </div>
  `;
  const part = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const power = part<HTMLElement>('[data-hud="power"]');
  const powerFill = part<HTMLElement>("[data-power]");
  const wait = part<HTMLElement>('[data-hud="wait"]');
  const waitWord = part<HTMLElement>("[data-wait-word]");
  const fight = part<HTMLElement>('[data-hud="fight"]');
  const band = part<HTMLElement>("[data-band]");
  const needle = part<HTMLElement>("[data-needle]");
  const stamina = part<HTMLElement>("[data-stamina]");
  const distance = part<HTMLElement>("[data-distance]");
  const steerLeft = part<HTMLElement>('[data-steer="-1"]');
  const steerRight = part<HTMLElement>('[data-steer="1"]');
  const bow = part<HTMLElement>("[data-bow]");
  const net = part<HTMLElement>('[data-hud="net"]');
  const ring = part<SVGCircleElement>("[data-ring]");

  function show(which: HTMLElement | null): void {
    for (const element of [power, wait, fight, net]) element.hidden = element !== which;
    root.hidden = which === null;
  }

  return Object.freeze({
    render(snapshot) {
      switch (snapshot.phase) {
        case "charging":
          show(power);
          powerFill.style.width = percent(snapshot.power);
          powerFill.dataset.sweet = snapshot.power > 0.9 ? "true" : "false";
          return;
        case "flight":
        case "waiting": {
          show(wait);
          const dip = snapshot.plan && snapshot.waited >= snapshot.plan.biteAt;
          waitWord.textContent = dip ? "!! BITE — STRIKE !!" : snapshot.phase === "flight" ? "Cast!" : snapshot.interestedShadowId || snapshot.shadowId ? "A shadow is coming to look…" : "Waiting for a bite…";
          wait.dataset.bite = dip ? "true" : "false";
          return;
        }
        case "fighting": {
          const state = snapshot.fight!;
          show(fight);
          band.style.left = percent(state.band.low);
          band.style.width = percent(state.band.high - state.band.low);
          needle.style.left = percent(state.tension);
          const inside = state.tension >= state.band.low && state.tension <= state.band.high;
          needle.dataset.state = state.tension >= RED_LINE ? "red" : inside ? "good" : state.tension < state.band.low ? "slack" : "high";
          stamina.style.width = percent(state.stamina);
          distance.textContent = `${state.distance.toFixed(1)} m`;
          // The arrow AGAINST the pull lights: that is the way to steer.
          steerLeft.dataset.hot = state.pullSide > 0 ? "true" : "false";
          steerRight.dataset.hot = state.pullSide < 0 ? "true" : "false";
          bow.hidden = !leapPending(state);
          return;
        }
        case "netting": {
          const state = snapshot.fight!;
          show(net);
          ring.setAttribute("r", String(Math.max(1, netRing(state, state.elapsed) * 44)));
          return;
        }
        default:
          show(null);
      }
    },
    showCatch(fish, notes) {
      const species = findFishSpecies(fish.speciesId);
      const rarity = species?.rarity ?? "common";
      const size = fish.sizeClass as SizeClass;
      const badges = [
        `<span class="catch-badge" style="--badge:${RARITY_COLORS[rarity]}">${RARITY_TITLES[rarity]}</span>`,
        size === "trophy" || size === "record" ? `<span class="catch-badge catch-badge--gold">${SIZE_TITLES[size]}!</span>` : "",
        fish.variant !== "normal" ? `<span class="catch-badge catch-badge--${fish.variant}">${fish.variant === "golden" ? "GOLDEN" : "SHINY"}</span>` : "",
        notes.firstOfKind ? `<span class="catch-badge catch-badge--new">NEW</span>` : "",
        notes.personalBest && !notes.firstOfKind ? `<span class="catch-badge catch-badge--best">PERSONAL BEST</span>` : "",
      ].join("");
      card.innerHTML = `
        <span class="eyebrow">${notes.practice ? "PRACTICE CATCH" : "YOU CAUGHT"}</span>
        <h2>${escapeHtml(specimenTitle(fish.speciesId, fish.variant, size))}</h2>
        <div class="catch-card__badges">${badges}</div>
        <dl class="catch-card__stats">
          <div><dt>Weight</dt><dd>${formatWeight(fish.weightG)}</dd></div>
          <div><dt>Length</dt><dd>${formatLength(fish.lengthMm)}</dd></div>
          <div><dt>Size</dt><dd>${SIZE_TITLES[size] ?? size}</dd></div>
          <div><dt>Landed</dt><dd>${GRADE_TITLES[fish.grade]}</dd></div>
        </dl>
        <p class="catch-card__worth"><strong>${fish.value.toLocaleString()}</strong> tickets at the Fishmonger · <strong>+${notes.xp}</strong> Fishing XP${notes.levelUp ? ` · <b>Fishing level ${notes.levelUp}!</b>` : ""}</p>
        ${species ? `<p class="catch-card__blurb">${escapeHtml(species.blurb)}</p>` : ""}
        <small>${notes.practice ? "Sign in to keep what you catch." : "It's in your creel."} <kbd>Space</kbd> to carry on</small>
      `;
      card.dataset.rarity = rarity;
      card.hidden = false;
    },
    hideCatch() {
      card.hidden = true;
    },
  });
}
