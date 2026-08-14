(function exposeGameCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamGameCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGameCore() {
  const MODES = Object.freeze({
    quick: Object.freeze({ id: "quick", name: "Quick Bowl", frames: 3, description: "Three fast frames" }),
    classic: Object.freeze({ id: "classic", name: "Classic Ten", frames: 10, description: "A regulation game" }),
  });

  const CPU_LEVELS = Object.freeze({
    casual: Object.freeze({ id: "casual", name: "Casual", noise: 0.18 }),
    pro: Object.freeze({ id: "pro", name: "Pro", noise: 0.07 }),
  });

  // The canon bowlers are all women, so every CPU nickname is a feminine name spin.
  const CPU_NAMES = Object.freeze([
    "Yamanda",
    "Yamantha",
    "Yamelia",
    "Yamigail",
    "Yamivia",
    "Yamabella",
    "Yamophia",
    "Yamvelyn",
    "Yamarie",
    "Yamaria",
    "Yamargaret",
    "Yamatherine",
    "Yamictoria",
    "Yamifer",
    "Yamessica",
    "Yamizabeth",
    "Yamatalie",
    "Yamatasha",
    "Yamrissa",
    "Yamranda",
    "Yamanessa",
    "Yamalerie",
    "Yamianna",
    "Yamrianna",
    "Yamrielle",
    "Yamabriella",
    "Yamenelope",
    "Yamtricia",
    "Yamarbara",
    "Yamlorence",
    "Yamorgia",
    "Yamrace",
    "Yamelen",
    "Yamaren",
    "Yaminda",
    "Yamusan",
    "Yamonna",
    "Yamuth",
    "Yamnet",
    "Yamlice",
    "Yamlaire",
    "Yamloe",
    "Yamoey",
    "Yambecca",
    "Yamachel",
    "Yamtephanie",
    "Yamshley",
    "Yamrittany",
    "Yamica",
    "Yamchelle",
    "Yamadeline",
    "Yameline",
    "Yamelanie",
    "Yamelissa",
    "Yamegan",
    "Yamolly",
    "Yamiley",
    "Yamannah",
    "Yamiper",
    "Yamillow",
    "Yamiolet",
    "Yamarlett",
    "Yamuby",
    "Yamazel",
    "Yamuna",
    "Yamora",
    "Yamleanor",
    "Yamloise",
    "Yamose",
    "Yamosalie",
    "Yamaisy",
    "Yamaphne",
    "Yamhoebe",
    "Yamenna",
    "Yamma",
    "Yamily",
    "Yammia",
    "Yamva",
    "Yamila",
    "Yamayla",
    "Yamylie",
    "Yamacey",
    "Yamelsey",
    "Yamristen",
    "Yamristina",
    "Yamristine",
    "Yamlaudia",
    "Yamlarissa",
    "Yamandra",
    "Yamalexa",
    "Yamndrea",
    "Yamngela",
    "Yamgelina",
    "Yamella",
    "Yamaya",
    "Yammala",
    "Yamira",
    "Yamilah",
    "Yamzmine",
    "Yamzelle",
    "Yamceline",
    "Yameresa",
    "Yamolene",
    "Yamodora",
    "Yamatrice",
    "Yamernice",
    "Yamnadette",
    "Yamnelia",
    "Yamdelia",
    "Yameleste",
    "Yamylvia",
    "Yamabrina",
    "Yamavannah",
    "Yamienna",
    "Yamerena",
    "Yamierra",
    "Yamkira",
    "Yamara",
    "Yamalia",
    "Yamonya",
    "Yamonia",
    "Yamadia",
    "Yamvera",
    "Yammy",
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chooseCpuName(random = Math.random) {
    const roll = clamp(Number(random()) || 0, 0, 0.9999999999999999);
    return CPU_NAMES[Math.floor(roll * CPU_NAMES.length)];
  }

  function isFinalFrameComplete(rolls) {
    if (rolls.length < 2) return false;
    const earnedBonus = rolls[0] === 10 || rolls[0] + rolls[1] === 10;
    return earnedBonus ? rolls.length >= 3 : true;
  }

  function isFrameComplete(rolls, isFinal) {
    if (isFinal) return isFinalFrameComplete(rolls);
    return rolls[0] === 10 || rolls.length >= 2;
  }

  function pinsStandingForRolls(rolls, isFinal) {
    if (!rolls.length) return 10;
    if (!isFinal) return rolls[0] === 10 ? 0 : 10 - rolls[0];
    if (rolls.length === 1) return rolls[0] === 10 ? 10 : 10 - rolls[0];
    if (rolls.length === 2) {
      if (rolls[0] === 10) return rolls[1] === 10 ? 10 : 10 - rolls[1];
      if (rolls[0] + rolls[1] === 10) return 10;
    }
    return 0;
  }

  function futureRolls(frames, frameIndex) {
    const rolls = [];
    for (let i = frameIndex + 1; i < frames.length; i += 1) rolls.push(...frames[i]);
    return rolls;
  }

  function scoreFrames(frames) {
    const cumulative = Array(frames.length).fill(null);
    let total = 0;
    for (let i = 0; i < frames.length; i += 1) {
      const rolls = frames[i];
      const isFinal = i === frames.length - 1;
      if (!isFrameComplete(rolls, isFinal)) break;
      if (isFinal) {
        total += rolls.slice(0, 3).reduce((sum, pins) => sum + pins, 0);
        cumulative[i] = total;
        break;
      }

      if (rolls[0] === 10) {
        const bonus = futureRolls(frames, i).slice(0, 2);
        if (bonus.length < 2) break;
        total += 10 + bonus[0] + bonus[1];
      } else if (rolls[0] + rolls[1] === 10) {
        const bonus = futureRolls(frames, i)[0];
        if (bonus == null) break;
        total += 10 + bonus;
      } else {
        total += rolls[0] + rolls[1];
      }
      cumulative[i] = total;
    }
    return { total, cumulative };
  }

  function createMatch({ modeId = "quick", playType = "cpu", cpuLevelId = "casual", players = [] } = {}) {
    const mode = MODES[modeId];
    if (!mode) throw new RangeError(`Unknown mode: ${modeId}`);
    if (!CPU_LEVELS[cpuLevelId]) throw new RangeError(`Unknown CPU level: ${cpuLevelId}`);
    if (!Array.isArray(players) || players.length !== 2) throw new TypeError("A match requires exactly two players.");

    return {
      modeId,
      playType,
      cpuLevelId,
      frameIndex: 0,
      activePlayer: 0,
      status: "playing",
      winnerIds: [],
      players: players.map((player, index) => ({
        id: String(player.id || `p${index + 1}`),
        name: String(player.name || `Player ${index + 1}`),
        characterSlug: String(player.characterSlug || "daisy-monroe"),
        type: player.type === "cpu" ? "cpu" : "human",
        frames: Array.from({ length: mode.frames }, () => []),
        score: { total: 0, cumulative: Array(mode.frames).fill(null) },
      })),
    };
  }

  function pinsStandingForTurn(match) {
    if (match.status !== "playing") return 0;
    const rolls = match.players[match.activePlayer].frames[match.frameIndex];
    return pinsStandingForRolls(rolls, match.frameIndex === MODES[match.modeId].frames - 1);
  }

  function recordRoll(match, pins) {
    if (match.status !== "playing") throw new Error("The match is already complete.");
    const standing = pinsStandingForTurn(match);
    if (!Number.isInteger(pins) || pins < 0 || pins > standing) {
      throw new RangeError(`Roll must knock down between 0 and ${standing} standing pins.`);
    }

    const next = {
      ...match,
      players: match.players.map((player) => ({
        ...player,
        frames: player.frames.map((frame) => frame.slice()),
        score: { ...player.score, cumulative: player.score.cumulative.slice() },
      })),
      winnerIds: match.winnerIds.slice(),
    };
    const player = next.players[next.activePlayer];
    const rolls = player.frames[next.frameIndex];
    rolls.push(pins);
    player.score = scoreFrames(player.frames);

    const finalFrame = next.frameIndex === MODES[next.modeId].frames - 1;
    if (isFrameComplete(rolls, finalFrame)) {
      if (next.activePlayer < next.players.length - 1) {
        next.activePlayer += 1;
      } else if (!finalFrame) {
        next.activePlayer = 0;
        next.frameIndex += 1;
      } else {
        next.status = "complete";
        next.players.forEach((entry) => { entry.score = scoreFrames(entry.frames); });
        const high = Math.max(...next.players.map((entry) => entry.score.total));
        next.winnerIds = next.players.filter((entry) => entry.score.total === high).map((entry) => entry.id);
      }
    }
    return next;
  }

  function notation(rolls, index, isFinal) {
    const pins = rolls[index];
    if (pins == null) return "";
    if (pins === 0) return "–";
    if (pins === 10) return "X";
    if (index > 0) {
      const previous = rolls[index - 1];
      const canSpare = !isFinal || index === 1 || (index === 2 && rolls[0] === 10 && previous !== 10);
      if (canSpare && previous !== 10 && previous + pins === 10) return "/";
    }
    return String(pins);
  }

  function createCpuShot({ levelId = "casual", standingPins = 10, random = Math.random } = {}) {
    const level = CPU_LEVELS[levelId];
    if (!level) throw new RangeError(`Unknown CPU level: ${levelId}`);
    const leaveBias = standingPins < 10 ? (5 - standingPins) * 0.018 : 0;
    const centeredNoise = () => (random() - 0.5) * 2;
    const round = (value) => Math.round(value * 100) / 100;
    return {
      position: round(clamp(-0.08 + leaveBias + centeredNoise() * level.noise, -0.46, 0.46)),
      aim: round(clamp(0.12 - leaveBias * 0.8 + centeredNoise() * level.noise, -0.45, 0.45)),
      hook: round(clamp(-0.2 + centeredNoise() * level.noise * 2.2, -1, 1)),
      power: round(clamp(0.91 + centeredNoise() * level.noise * 0.45, 0.55, 1)),
    };
  }

  return {
    MODES,
    CPU_LEVELS,
    CPU_NAMES,
    createMatch,
    recordRoll,
    scoreFrames,
    pinsStandingForTurn,
    pinsStandingForRolls,
    isFrameComplete,
    notation,
    createCpuShot,
    chooseCpuName,
  };
});
