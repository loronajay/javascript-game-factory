// The readouts around the table, redrawn from one snapshot.
//
// A pure-ish renderer: it takes `match.snapshot()` and writes text and classes.
// It never asks the match a question, never reads the DOM back, and holds no
// state of its own — which is what makes it safe to call on every change without
// worrying about what order things happened in.
//
// THE DISABLED STATE HAS ONE SOURCE. Every control on the deck is enabled off
// `snapshot.humanCanAct`, computed once in `match.js`. In the demo each button
// re-derived it from five separate flags and they drifted: there were states
// where the shot button was live during a CPU turn.

import { groupLabel } from "../sim/rules.js";
import { describeContact } from "../sim/shot.js";
import { ZONE_KITCHEN, ZONE_NONE } from "../sim/placement.js";
import { angleToDegrees } from "../sim/aim.js";

export function createHud(elements) {
  const setText = (element, text) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  const setDisabled = (element, disabled) => {
    if (element) element.disabled = disabled;
  };

  return {
    /** Everything except the charge meter, which updates per frame in `controls.js`. */
    render(snapshot) {
      const [p1, p2] = snapshot.seats;
      const placing = snapshot.ballInHand !== ZONE_NONE && snapshot.humanCanAct;

      // --- plaques -------------------------------------------------------
      // Both plaques read their seat's own name. Offline that is "Player 1" and
      // "CPU" exactly as before; online it is who is actually at the table, which
      // is the entire reason the seat carries a name at all.
      setText(elements.p1Label, `${p1.name.toUpperCase()} · ${groupLabel(p1.group)}`);
      setText(elements.p2Label, `${p2.name.toUpperCase()} · ${groupLabel(p2.group)}`);
      setText(elements.p2Kicker, p2.isCpu ? "CPU opponent" : p2.you === false && p1.you ? "Opponent" : "Player two");
      setText(elements.p1Count, seatCount(p1));
      setText(elements.p2Count, seatCount(p2));
      elements.p1Plaque?.classList.toggle("active", snapshot.started && !snapshot.winner && p1.active);
      elements.p2Plaque?.classList.toggle("active", snapshot.started && !snapshot.winner && p2.active);

      // --- headline ------------------------------------------------------
      const shooter = snapshot.seats[snapshot.shooter];
      setText(
        elements.status,
        !snapshot.started
          ? "Table ready"
          : snapshot.winnerName
            ? `${snapshot.winnerName} wins`
            : snapshot.moving
              ? "Balls in motion"
              : `${shooter.name} to shoot`,
      );

      setText(
        elements.turnChip,
        !snapshot.started
          ? "8 Ball"
          : snapshot.winner !== null
            ? "Rack complete"
            : snapshot.moving
              ? "Live"
              : snapshot.isBreak
                ? "Break"
                : `${shooter.isCpu ? "CPU" : `P${snapshot.shooter + 1}`} turn`,
      );

      setText(elements.sub, subline(snapshot, placing));

      // --- ball in hand ---------------------------------------------------
      elements.placementBanner?.classList.toggle("show", placing);
      setText(
        elements.placementBanner,
        snapshot.ballInHand === ZONE_KITCHEN
          ? "Place the cue ball behind the head string, then release to confirm."
          : "Ball in hand · place the cue ball, then release to confirm.",
      );

      // --- controls -------------------------------------------------------
      const live = snapshot.humanCanAct && !placing;
      for (const control of [elements.aim, elements.nudgeLeft, elements.nudgeRight, elements.resetAim, elements.camBtn]) {
        setDisabled(control, !live);
      }
      setDisabled(elements.shoot, !live);
      setDisabled(elements.pauseBtn, !snapshot.started || snapshot.winner !== null);

      setText(elements.aimText, `${angleToDegrees(snapshot.angle).toFixed(1)}°`);
      setText(elements.spinText, describeContact(snapshot.spinX, snapshot.spinY));
      if (elements.aim) elements.aim.value = String(angleToDegrees(snapshot.angle));
    },

    /** The event strip along the bottom. Its own method: it changes on its own beat. */
    message(text) {
      setText(elements.log, text);
    },

    /** The between-turns card. Shown and hidden by the match's phase, never by a timer here. */
    turnCard(card) {
      if (!elements.turnCard) return;
      if (!card) {
        elements.turnCard.classList.remove("show");
        return;
      }
      setText(elements.turnCardKicker, card.kicker);
      setText(elements.turnCardName, card.name);
      setText(elements.turnCardReason, card.reason);
      elements.turnCard.classList.add("show");
    },

    /**
     * The hover readout: what ball the cursor is over, floating beside it.
     *
     * Positioned against the canvas rather than the page, and nudged back inside
     * it near the right edge, so the readout cannot hang off the table. Pass
     * null to hide it.
     */
    ballTip(info) {
      const tip = elements.ballTip;
      if (!tip) return;
      if (!info) {
        tip.classList.remove("show");
        return;
      }

      setText(elements.ballTipName, info.name);
      setText(elements.ballTipOwner, info.owner || "");
      if (elements.ballTipSwatch) {
        // backgroundColor, never the `background` shorthand: the shorthand is
        // inline and would wipe out the stripe gradient the stylesheet layers
        // over it, so a stripe would read as a solid in the very readout that
        // exists to tell them apart.
        elements.ballTipSwatch.style.backgroundColor = info.color;
        // A stripe is drawn as a stripe, because that is the whole question the
        // player is asking when they hover it.
        elements.ballTipSwatch.classList.toggle("striped", info.kind === "stripe");
      }
      tip.classList.toggle("theirs", info.mine === false);
      tip.classList.toggle("mine", info.mine === true);

      const bounds = tip.parentElement?.getBoundingClientRect();
      if (bounds) {
        const x = info.clientX - bounds.left;
        const y = info.clientY - bounds.top;
        tip.style.left = `${Math.min(Math.max(x + 16, 8), Math.max(8, bounds.width - 8))}px`;
        tip.style.top = `${Math.max(y - 34, 6)}px`;
        // Flip to the cursor's left when there is no room on its right.
        tip.classList.toggle("flip", x + 16 + tip.offsetWidth > bounds.width - 8);
      }
      tip.classList.add("show");
    },

    /** The shot button's label, which doubles as the charge readout. */
    shootLabel(text) {
      setText(elements.shoot, text);
    },

    charge(percent) {
      if (elements.chargeFill) elements.chargeFill.style.width = `${percent}%`;
      setText(elements.powerText, percent > 0 ? `${percent}%` : "Hold to charge");
    },
  };
}

function seatCount(seat) {
  // A seat whose player has dropped says so first. Everything else about the
  // rack is still true, but it is not the thing the other player needs to read.
  if (seat.connected === false) return "Reconnecting…";
  if (!seat.group) return "Table open";
  if (seat.onTheEight) return "On the 8";
  return `${seat.remaining} remaining`;
}

function subline(snapshot, placing) {
  if (!snapshot.started) return "Choose a match from the menu";
  if (snapshot.paused) return "Match paused";
  if (placing) {
    return snapshot.ballInHand === ZONE_KITCHEN
      ? "Place behind the head string · release to confirm"
      : "Ball in hand · release to confirm placement";
  }
  // A race is the one piece of state the plaques have no room for, and it is
  // the one a player checks between racks. Absent offline, where every match is
  // a single rack and `raceTo` is never set.
  if (snapshot.raceTo > 1 && !snapshot.winnerName) {
    const [p1, p2] = snapshot.seats;
    return `Rack ${snapshot.rackNumber} · race to ${snapshot.raceTo} · ${p1.wins}-${p2.wins}`;
  }
  if (snapshot.isBreak && !snapshot.moving) return "Break shot";
  return "Tap or drag on the cloth to aim";
}
