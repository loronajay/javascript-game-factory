// Public progression claims come from an installed game client, so every field in them is
// attacker-controlled. This catalog is the server's allow-list for Tactical Arena rewards.
// Keep it in lockstep with games/tactical-arena/src/progression/unlocks.js and
// games/tactical-arena/src/platform/gameProgressClient.js.
export const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";
export const TACTICAL_ARENA_TUTORIAL_IDS = Object.freeze([
    "basics",
    "arts-mp",
    "damage-types",
    "rage-status",
    "status-effects",
]);
const TUTORIAL_VALOR_REWARD = 500;
const TUTORIAL_SKINS = new Set([
    "juggernaut:bio-mech",
    "swordsman:arcane",
    "archer:desert-warrior",
    "mystic:enlightened",
    "magician:summer-vibes",
]);
const CAMPAIGN_REWARDS = Object.freeze({
    "clod-trial": Object.freeze({ valor: 55, units: Object.freeze(["clod"]) }),
    "necromancer-rise": Object.freeze({ valor: 60, units: Object.freeze(["necromancer"]) }),
    "witch-doctor-swamp": Object.freeze({ valor: 65, units: Object.freeze(["witch-doctor"]) }),
    "timeless-woods": Object.freeze({ valor: 70, units: Object.freeze(["father-time"]) }),
    "virus-root": Object.freeze({ valor: 75, units: Object.freeze(["virus"]) }),
    "wandering-paladin": Object.freeze({ valor: 80, units: Object.freeze(["paladin"]) }),
    "monk-temple-trial": Object.freeze({ valor: 90, units: Object.freeze(["monk"]) }),
    "mechs-on-the-farm": Object.freeze({ valor: 105 }),
    "gargoyle-inferno": Object.freeze({ valor: 120, units: Object.freeze(["gargoyle"]) }),
    "sniper-highground": Object.freeze({ valor: 135, units: Object.freeze(["sniper"]) }),
    "wandering-party": Object.freeze({ valor: 150 }),
    "dug-your-own-grave": Object.freeze({ valor: 165, units: Object.freeze(["miner"]) }),
    "hasbeen-heroes": Object.freeze({ valor: 180 }),
    "battle-for-the-bridge": Object.freeze({ valor: 195, units: Object.freeze(["ronin"]) }),
    "wrong-place-wrong-time": Object.freeze({ valor: 210, units: Object.freeze(["riot-cop"]) }),
    "out-of-retirement": Object.freeze({
        valor: 230,
        units: Object.freeze(["angel"]),
        skins: Object.freeze(["angel:summer-vibes", "paladin:summer-vibes"]),
    }),
    "voidwood-forest": Object.freeze({
        valor: 250,
        units: Object.freeze(["treant"]),
        skins: Object.freeze(["treant:voidroot"]),
    }),
    "spirit-of-the-woods": Object.freeze({ valor: 270, units: Object.freeze(["mother-nature"]) }),
    "the-showdown": Object.freeze({
        valor: 295,
        units: Object.freeze(["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]),
    }),
    "not-my-king": Object.freeze({ valor: 320, units: Object.freeze(["king"]) }),
    "void-ridden-castle": Object.freeze({ valor: 350, units: Object.freeze(["nemesis"]) }),
    "the-final-battle": Object.freeze({ valor: 405, units: Object.freeze(["blacksword"]) }),
});
const CAMPAIGN_UNIT_PACKS = Object.freeze({
    brothers: Object.freeze({ missionId: "mechs-on-the-farm", choices: Object.freeze(["big-brother", "little-brother"]) }),
});
const CAMPAIGN_SKIN_PACKS = Object.freeze({
    wandering: Object.freeze({
        missionId: "wandering-party",
        choices: Object.freeze(["swordsman:wandering", "archer:wandering", "mystic:wandering", "magician:wandering"]),
    }),
    "hasbeen-mystic": Object.freeze({
        missionId: "hasbeen-heroes",
        choices: Object.freeze(["mystic:sun-goddess", "mystic:lunar-goddess"]),
    }),
});
function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function cleanInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number))
        return min;
    return Math.max(min, Math.min(max, number));
}
function accepted(payload, sourceId, prerequisite = null, valorBase = 0) {
    return { ok: true, payload, sourceId, prerequisite, valorBase };
}
function rejected() {
    return { ok: false, statusCode: 400, error: "invalid_claim" };
}
export function validateTacticalArenaPublicClaim(params = {}) {
    if (cleanText(params.gameSlug, 60) !== TACTICAL_ARENA_GAME_SLUG)
        return rejected();
    const claimId = cleanText(params.claimId);
    const kind = cleanText(params.kind, 80);
    const input = params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
        ? params.payload
        : {};
    if (kind === "tutorial-complete") {
        const tutorialId = cleanText(input.tutorialId || params.sourceId);
        if (!TACTICAL_ARENA_TUTORIAL_IDS.includes(tutorialId) || claimId !== `tutorial-complete:${tutorialId}`)
            return rejected();
        return accepted({ tutorialId }, tutorialId);
    }
    if (kind === "tutorial-valor") {
        if (claimId !== "tutorial-valor:all-tutorials")
            return rejected();
        return accepted({ amount: TUTORIAL_VALOR_REWARD, completedTutorials: [...TACTICAL_ARENA_TUTORIAL_IDS] }, "all-tutorials", { kind: "all-tutorials" }, TUTORIAL_VALOR_REWARD);
    }
    if (kind === "tutorial-unit-reward") {
        if (claimId !== "tutorial-unit-reward:all-tutorials:juggernaut")
            return rejected();
        return accepted({ type: "juggernaut", entitlementId: "unit:juggernaut" }, "all-tutorials", { kind: "all-tutorials" });
    }
    if (kind === "tutorial-skin-choice") {
        const type = cleanText(input.type, 80);
        const slug = cleanText(input.slug, 120);
        if (!TUTORIAL_SKINS.has(`${type}:${slug}`) || claimId !== `tutorial-skin-choice:${type}:${slug}`)
            return rejected();
        return accepted({ type, slug, entitlementId: `skin:${type}:${slug}` }, "all-tutorials", { kind: "all-tutorials" });
    }
    const missionId = cleanText(input.missionId || params.sourceId);
    const mission = CAMPAIGN_REWARDS[missionId];
    if (!mission)
        return rejected();
    const stars = cleanInt(input.stars, { min: 0, max: 3 });
    if (kind === "campaign-progress") {
        const campaignEpoch = cleanInt(input.campaignEpoch, { min: 0, max: 1_000_000 });
        const epochSegment = campaignEpoch > 0 ? `e${campaignEpoch}:` : "";
        if (claimId !== `campaign-progress:${epochSegment}${missionId}:${stars}`)
            return rejected();
        return accepted({ missionId, stars, campaignEpoch }, missionId);
    }
    if (kind === "campaign-valor") {
        if (claimId !== `campaign-valor:${missionId}`)
            return rejected();
        return accepted({ missionId, amount: mission.valor, stars }, missionId, null, mission.valor);
    }
    if (kind === "campaign-unit-choice") {
        const type = cleanText(input.type, 80);
        const packId = cleanText(input.packId, 120);
        const pack = CAMPAIGN_UNIT_PACKS[packId];
        if (pack) {
            if (pack.missionId !== missionId || !pack.choices.includes(type)
                || claimId !== `campaign-unit-choice:${packId}:${type}`)
                return rejected();
        }
        else if (!mission.units?.includes(type) || claimId !== `campaign-unit-reward:${missionId}:${type}`) {
            return rejected();
        }
        return accepted({ ...(pack ? { packId } : {}), missionId, type, entitlementId: `unit:${type}`, stars }, missionId, { kind: "campaign-mission", missionId });
    }
    if (kind === "campaign-skin-choice") {
        const type = cleanText(input.type, 80);
        const slug = cleanText(input.slug, 120);
        const key = `${type}:${slug}`;
        const packId = cleanText(input.packId, 120);
        const pack = CAMPAIGN_SKIN_PACKS[packId];
        if (pack) {
            if (pack.missionId !== missionId || !pack.choices.includes(key)
                || claimId !== `campaign-skin-choice:${packId}:${type}:${slug}`)
                return rejected();
        }
        else if (!mission.skins?.includes(key) || claimId !== `campaign-skin-reward:${missionId}:${type}:${slug}`) {
            return rejected();
        }
        return accepted({ ...(pack ? { packId } : {}), missionId, type, slug, entitlementId: `skin:${type}:${slug}`, stars }, missionId, { kind: "campaign-mission", missionId });
    }
    return rejected();
}
export function getTacticalArenaCampaignRewardCatalog() {
    return CAMPAIGN_REWARDS;
}
