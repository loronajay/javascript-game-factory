(function exposeCampaignCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const api = factory(root, animation);
  if (isCommonJs) module.exports = api;
  root.YamCampaign = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCampaignCore(root, animation) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const CAMPAIGN_STORAGE_KEY = "yam-bowling.campaign.v1";

  const STARTER_BOWLER_SLUGS = Object.freeze([
    "daisy-monroe",
    "nia-brooks",
    "tessa-quinn",
    "zuri-banks",
    "amara-reed",
  ]);

  const DIVISIONS = Object.freeze([
    Object.freeze({ id: "local", name: "Local Alley", shortName: "Local", cpuLevelId: "rookie", venues: Object.freeze(["oak-and-onyx"]) }),
    Object.freeze({ id: "city", name: "City League", shortName: "City", cpuLevelId: "casual", venues: Object.freeze(["neon-carnival", "blue-circuit"]) }),
    Object.freeze({ id: "regional", name: "Regional Series", shortName: "Regional", cpuLevelId: "competitive", venues: Object.freeze(["sunset-strip", "emerald-vault"]) }),
    Object.freeze({ id: "nationals", name: "National Tour", shortName: "Nationals", cpuLevelId: "pro", venues: Object.freeze(["liberty-lanes", "royal-gold"]) }),
    Object.freeze({ id: "championship", name: "Yam Championship", shortName: "Championship", cpuLevelId: "champion", venues: Object.freeze(["cosmic-bowl", "crimson-crown"]) }),
  ]);

  const DIVISION_BY_ID = new Map(DIVISIONS.map((division) => [division.id, division]));

  function circuitMatch({ divisionId, opponent, venue, title, achievementTitle, rivalLine, final = false }) {
    return Object.freeze({
      id: `${divisionId}-${opponent}`,
      divisionId,
      opponentSlug: opponent,
      unlockBowlerSlug: opponent,
      venueSlug: venue,
      modeId: final ? "classic" : "quick",
      cpuLevelId: DIVISION_BY_ID.get(divisionId)?.cpuLevelId || "casual",
      title,
      rivalLine,
      isPromotionMatch: final,
      achievement: Object.freeze({
        id: `beat-${opponent}`,
        title: achievementTitle,
        description: `Defeat ${opponent.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")} in sanctioned circuit play.`,
      }),
    });
  }

  // Circuit wins introduce characters. Tournaments deliberately do not appear
  // here: their brackets and cosmetic rewards belong to a separate event domain.
  const CIRCUIT_MATCHES = Object.freeze([
    circuitMatch({ divisionId: "local", opponent: "hazel-ward", venue: "oak-and-onyx", title: "The Fundamentals", achievementTitle: "Every Pin Counts", rivalLine: "Flash is optional. Making the spare isn't." }),
    circuitMatch({ divisionId: "local", opponent: "piper-hart", venue: "oak-and-onyx", title: "Soft Touch", achievementTitle: "Quiet Competition", rivalLine: "Don't mistake a gentle release for a friendly scorecard." }),
    circuitMatch({ divisionId: "local", opponent: "skye-bennett", venue: "oak-and-onyx", title: "No Backing Down", achievementTitle: "Challenge Accepted", rivalLine: "You made the circuit. Now prove you belong on it." }),
    circuitMatch({ divisionId: "local", opponent: "marisol-cruz", venue: "oak-and-onyx", title: "Clean Frames", achievementTitle: "Patient Pressure", rivalLine: "Take your time. I'll still be here when the tenth pin falls." }),
    circuitMatch({ divisionId: "local", opponent: "talia-dodson", venue: "oak-and-onyx", title: "Local Title Match", achievementTitle: "Local Alley Champion", rivalLine: "Everybody starts local. Not everybody leaves with the seal.", final: true }),

    circuitMatch({ divisionId: "city", opponent: "lumi-vega", venue: "neon-carnival", title: "After-Hours Roll-Off", achievementTitle: "City Lights", rivalLine: "Try to keep up. The camera loves a fast match." }),
    circuitMatch({ divisionId: "city", opponent: "cassy-cruz", venue: "neon-carnival", title: "Changing Angles", achievementTitle: "Draw a New Line", rivalLine: "The obvious shot works. The interesting one works better." }),
    circuitMatch({ divisionId: "city", opponent: "lillie-chen", venue: "blue-circuit", title: "Center Stage", achievementTitle: "No Stage Fright", rivalLine: "If this gets embarrassing, at least make it photogenic." }),
    circuitMatch({ divisionId: "city", opponent: "roxy-chen", venue: "blue-circuit", title: "Machine Precision", achievementTitle: "Run It Clean", rivalLine: "Bad equipment is an excuse. Bad timing is evidence." }),
    circuitMatch({ divisionId: "city", opponent: "carmen-blaze", venue: "blue-circuit", title: "City Title Match", achievementTitle: "Own the Spotlight", rivalLine: "This crowd came for a show. Try not to disappear.", final: true }),

    circuitMatch({ divisionId: "regional", opponent: "sage-holloway", venue: "sunset-strip", title: "Still Waters", achievementTitle: "Break the Calm", rivalLine: "There is plenty of time for the score to become uncomfortable." }),
    circuitMatch({ divisionId: "regional", opponent: "claire-rowan", venue: "sunset-strip", title: "Fine Margins", achievementTitle: "One Pin Better", rivalLine: "We can skip the spectacle. The total will explain everything." }),
    circuitMatch({ divisionId: "regional", opponent: "mina-park", venue: "emerald-vault", title: "Perfect Timing", achievementTitle: "Out of the Spreadsheet", rivalLine: "I already modeled this matchup. You are the error bar." }),
    circuitMatch({ divisionId: "regional", opponent: "kevya-desai", venue: "emerald-vault", title: "Late Break", achievementTitle: "Read the Hook", rivalLine: "Loose doesn't mean lucky. Watch the last ten feet." }),
    circuitMatch({ divisionId: "regional", opponent: "aaliyah-storm", venue: "emerald-vault", title: "Regional Title Match", achievementTitle: "Pressure Tested", rivalLine: "Pressure only matters if you let it change the shot.", final: true }),

    circuitMatch({ divisionId: "nationals", opponent: "fiona-vale", venue: "liberty-lanes", title: "Match Management", achievementTitle: "No Contingency", rivalLine: "I have a plan for every frame, including your good ones." }),
    circuitMatch({ divisionId: "nationals", opponent: "imani-cole", venue: "liberty-lanes", title: "Perfect Geometry", achievementTitle: "Alter the Blueprint", rivalLine: "The lane is a solved problem. You are the new variable." }),
    circuitMatch({ divisionId: "nationals", opponent: "simone-carter", venue: "royal-gold", title: "Prime Time", achievementTitle: "Take the Production", rivalLine: "Everything is in position. All that remains is execution." }),
    circuitMatch({ divisionId: "nationals", opponent: "rei-nakamura", venue: "royal-gold", title: "Pattern Recognition", achievementTitle: "Break the Pattern", rivalLine: "You rush after a miss. I was wondering when you'd notice." }),
    circuitMatch({ divisionId: "nationals", opponent: "naomi-okafor", venue: "royal-gold", title: "National Title Match", achievementTitle: "Nationally Ranked", rivalLine: "Bring your best plan. I brought several.", final: true }),

    circuitMatch({ divisionId: "championship", opponent: "echo-sterling", venue: "cosmic-bowl", title: "Midnight Broadcast", achievementTitle: "Find the Tempo", rivalLine: "Listen closely. Every match tells you how it wants to move." }),
    circuitMatch({ divisionId: "championship", opponent: "nyx-calder", venue: "cosmic-bowl", title: "The Pressure Table", achievementTitle: "Call the Bluff", rivalLine: "Relax. Close matches are supposed to feel like this." }),
    circuitMatch({ divisionId: "championship", opponent: "sabrina-wilde", venue: "crimson-crown", title: "Main Event", achievementTitle: "Steal the Scene", rivalLine: "If you're going to end my run, at least make it dramatic." }),
    circuitMatch({ divisionId: "championship", opponent: "scarlett-voss", venue: "crimson-crown", title: "The Gatekeeper", achievementTitle: "No False Modesty", rivalLine: "You have done very well. That is not the same as being ready." }),
    circuitMatch({ divisionId: "championship", opponent: "reina-sato", venue: "crimson-crown", title: "Yam Championship Final", achievementTitle: "The Yam Crown", rivalLine: "You earned this lane. Now earn the title.", final: true }),
  ]);

  const MATCH_BY_ID = new Map(CIRCUIT_MATCHES.map((match) => [match.id, match]));
  const MATCH_BY_ACHIEVEMENT = new Map(CIRCUIT_MATCHES.map((match) => [match.achievement.id, match]));
  const CANON_SLUGS = new Set(animation.CANON_BOWLERS.map((bowler) => bowler.slug));

  function emptyRecord() {
    return {
      version: SCHEMA_VERSION,
      earnedAchievementIds: [],
      selectedBowlerSlug: STARTER_BOWLER_SLUGS[0],
    };
  }

  function unlockedSlugsFor(earnedAchievementIds) {
    const unlocked = [...STARTER_BOWLER_SLUGS];
    for (const achievementId of earnedAchievementIds) {
      const slug = MATCH_BY_ACHIEVEMENT.get(achievementId)?.unlockBowlerSlug;
      if (slug && !unlocked.includes(slug)) unlocked.push(slug);
    }
    return unlocked;
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) return emptyRecord();
    const earnedAchievementIds = [];
    for (const id of Array.isArray(raw.earnedAchievementIds) ? raw.earnedAchievementIds : []) {
      if (MATCH_BY_ACHIEVEMENT.has(id) && !earnedAchievementIds.includes(id)) earnedAchievementIds.push(id);
    }
    const unlocked = unlockedSlugsFor(earnedAchievementIds);
    const selectedBowlerSlug = unlocked.includes(raw.selectedBowlerSlug)
      ? raw.selectedBowlerSlug
      : STARTER_BOWLER_SLUGS[0];
    return { version: SCHEMA_VERSION, earnedAchievementIds, selectedBowlerSlug };
  }

  function defaultStorage() {
    try {
      return root.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function createCampaignStore({ storage = defaultStorage() } = {}) {
    let record;
    try {
      record = normalizeRecord(JSON.parse(storage?.getItem?.(CAMPAIGN_STORAGE_KEY) || "null"));
    } catch (_error) {
      record = emptyRecord();
    }

    function persist() {
      try {
        storage?.setItem?.(CAMPAIGN_STORAGE_KEY, JSON.stringify(record));
      } catch (_error) {
        // Campaign progress remains usable for this session if storage is unavailable.
      }
    }

    function getUnlockedBowlerSlugs() {
      return unlockedSlugsFor(record.earnedAchievementIds);
    }

    function getSelectedBowlerSlug() {
      return record.selectedBowlerSlug;
    }

    function selectBowler(slug) {
      if (!CANON_SLUGS.has(slug) || !getUnlockedBowlerSlugs().includes(slug)) return false;
      record.selectedBowlerSlug = slug;
      persist();
      return true;
    }

    function getCurrentMatch() {
      return CIRCUIT_MATCHES.find((match) => !record.earnedAchievementIds.includes(match.achievement.id)) || null;
    }

    function getDivisionProgress(divisionId) {
      const matches = CIRCUIT_MATCHES.filter((match) => match.divisionId === divisionId);
      return {
        cleared: matches.filter((match) => record.earnedAchievementIds.includes(match.achievement.id)).length,
        total: matches.length,
      };
    }

    function recordMatchResult(matchId, { won = false } = {}) {
      const match = MATCH_BY_ID.get(matchId);
      const refused = { recorded: false, firstClear: false, won: Boolean(won), achievement: null, unlockedBowlerSlug: null };
      if (!match || !won || getCurrentMatch()?.id !== match.id
        || record.earnedAchievementIds.includes(match.achievement.id)) return refused;

      record.earnedAchievementIds.push(match.achievement.id);
      persist();
      return {
        recorded: true,
        firstClear: true,
        won: true,
        achievement: match.achievement,
        unlockedBowlerSlug: match.unlockBowlerSlug,
      };
    }

    function getSnapshot() {
      return {
        version: record.version,
        earnedAchievementIds: [...record.earnedAchievementIds],
        selectedBowlerSlug: record.selectedBowlerSlug,
      };
    }

    return {
      getCurrentMatch,
      getDivisionProgress,
      getSelectedBowlerSlug,
      getSnapshot,
      getUnlockedBowlerSlugs,
      recordMatchResult,
      selectBowler,
    };
  }

  return {
    CAMPAIGN_STORAGE_KEY,
    CIRCUIT_MATCHES,
    DIVISIONS,
    SCHEMA_VERSION,
    STARTER_BOWLER_SLUGS,
    createCampaignStore,
  };
});
