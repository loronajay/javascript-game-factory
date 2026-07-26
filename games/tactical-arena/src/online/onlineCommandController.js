import { concede } from "../core/commands.js";
import { applyCommand } from "../core/reducer.js";
import { findUnit } from "../core/state.js";
import { getUnitType } from "../core/unitCatalog.js";

const REMOTE_ACTIVATION_STEP_MS = 260;

export function isRolledArtResult(events = []) {
  return events.some((event) => event.type === "ART_RESOLVED" && "hit" in event && (
    Boolean(event.targetId) || (event.targetIds?.length ?? 0) > 0
  ));
}

export function createOnlineCommandController({
  runtime,
  interaction,
  dispatch = () => false,
  render = () => {},
  setMessage = () => {},
  sleep = async () => {},
  resolveMove = async () => {},
  resolveCombat = async () => {},
  resolveWallAttack = async () => {},
  resolveInstantArt = async () => {},
  turnFlash,
  menu,
  clock = globalThis,
} = {}) {
  async function applyRemoteCommand(command) {
    runtime.applyingRemote = true;
    try {
      switch (command.type) {
        case "BEGIN_ACTIVATION": {
          if (!dispatch(command)) return;
          interaction.selectedId = command.unitId;
          const unit = findUnit(runtime.state, command.unitId);
          if (unit) setMessage(`Opponent activates its ${unit.nickname || getUnitType(unit.type).name}.`);
          render();
          await sleep(REMOTE_ACTIVATION_STEP_MS);
          return;
        }
        case "MOVE_UNIT":
          await resolveMove(command);
          return;
        case "CANCEL_MOVE":
        case "DEFEND":
        case "FINISH_ACTIVATION":
        case "CONCEDE":
          dispatch(command);
          render();
          return;
        case "ATTACK":
          if (command.targetPosition) await resolveWallAttack(command);
          else await resolveCombat(command);
          return;
        case "USE_ART": {
          const peek = applyCommand(runtime.state, command);
          if (isRolledArtResult(peek.events)) await resolveCombat(command);
          else await resolveInstantArt(command);
          return;
        }
        default:
          return;
      }
    } finally {
      runtime.applyingRemote = false;
    }
  }

  // Ends the match from an UNSOLICITED event: the relay closed our socket, or the
  // states diverged. Deliberately does NOT report a ranked loss.
  //
  // Abandonment is reported from the two paths that actually know we abandoned —
  // `leave()` (quit to menu) and the `pagehide` handler (tab closed), both in
  // matchLifecycleController. Everything that reaches here is instead a case where
  // nobody witnessed a result, and self-reporting a loss got it wrong:
  //   - relay outage: both clients close, both report a loss, and the server's
  //     conflicting-report rule marks the match `disputed` — a finished game eaten.
  //   - our own network drop: the opponent still sees us leave, wins on the concede
  //     path, and claims it; the server arms a grace-timed forfeit and we take the
  //     loss from there. That is already the correct outcome without our report.
  //   - desync: neither side knows who won, so no result should be invented.
  //
  // What we DO keep doing is reporting that we are still here. The relay tears the
  // room down when a peer drops, so a crashed opponent takes our socket with it and
  // neither client can attest — which is how a ranked match ends up voided on the TTL
  // with no rating and no history. The heartbeat keeps running through this screen so
  // the server can see which side stayed and settle it as a forfeit. Presence is the
  // one signal that can't be forged in our favour: quitting is what stops it.
  function endOnlineMatch(title, sub) {
    if (!runtime.net) return;
    if (runtime.state?.phase === "playing") {
      try {
        runtime.matchConfig?.ranked?.keepHeartbeatAfterDisconnect?.();
      } catch {
        // Best effort: never block the disconnect UI.
      }
    }
    runtime.net.dispose();
    runtime.net = null;
    runtime.mySeat = null;
    runtime.resolving = true;
    turnFlash.announce({ title, sub, color: "#c4463f", hold: true });
    setMessage(sub, true);
    clock.clearTimeout(runtime.resultsTimer);
    runtime.resultsTimer = clock.setTimeout(() => {
      runtime.resolving = false;
      menu.show("mainMenu");
    }, 2200);
  }

  function concedeLocalMatch() {
    if (!runtime.net || !Number.isInteger(runtime.mySeat)) return false;
    if (runtime.state?.phase !== "playing") return false;
    if (runtime.resolving || runtime.applyingRemote) {
      setMessage("Concede after the current command resolves.", true);
      return true;
    }
    const accepted = dispatch(concede(runtime.mySeat));
    if (!accepted) return false;
    render();
    setMessage("You conceded the match.");
    return true;
  }

  const sessionController = {
    getMatchState: () => runtime.state,
    applyRemoteCommand,
    applyOwnerConcede(seat) {
      if (!runtime.net) return;
      dispatch(concede(seat));
      render();
    },
    endOnDesync() {
      endOnlineMatch("Match desynced", "The game states diverged. Match ended.");
    },
    endOnDisconnect(reason) {
      endOnlineMatch("Disconnected", reason || "Lost connection to the match.");
    },
  };

  return { applyRemoteCommand, concedeLocalMatch, endOnlineMatch, sessionController };
}
