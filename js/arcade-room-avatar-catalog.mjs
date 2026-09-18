function avatar(id, title, family, assetFile) {
    return Object.freeze({
        id,
        title,
        family,
        assetFile,
        assetUrl: new URL(`../room/assets/avatars/${assetFile}`, import.meta.url).toString(),
    });
}
export const ARCADE_AVATAR_CATALOG = Object.freeze([
    avatar("avatar.hero-f", "Hero F", "hero", "hero_f.glb"),
    avatar("avatar.hero-m", "Hero M", "hero", "hero_m.glb"),
    avatar("avatar.ogre-heavy", "Ogre Heavy Guard", "ogre", "ogre_guard_heavy.glb"),
    avatar("avatar.ogre-light", "Ogre Light Guard", "ogre", "ogre_guard_light.glb"),
    avatar("avatar.ogre-mage", "Ogre Mage", "ogre", "ogre_guard_mage.glb"),
    avatar("avatar.ogre", "Ogre", "ogre", "ogre.glb"),
    avatar("avatar.skeleton-heavy", "Skeleton Heavy Guard", "skeleton", "skeleton_guard_heavy.glb"),
    avatar("avatar.skeleton-light", "Skeleton Light Guard", "skeleton", "skeleton_guard_light.glb"),
    avatar("avatar.skeleton-mage", "Skeleton Mage", "skeleton", "skeleton_mage.glb"),
    avatar("avatar.skeleton-reaper", "Skeleton Reaper", "skeleton", "skeleton_reaper.glb"),
    avatar("avatar.villager-f", "Villager F", "villager", "villager_f.glb"),
    avatar("avatar.villager-m", "Villager M", "villager", "villager_m.glb"),
]);
export const DEFAULT_ARCADE_AVATAR_ID = "avatar.hero-m";
export function findArcadeAvatar(id) {
    return typeof id === "string" ? ARCADE_AVATAR_CATALOG.find((entry) => entry.id === id) : undefined;
}
export function normalizeArcadeAvatarId(id) {
    return findArcadeAvatar(id)?.id ?? DEFAULT_ARCADE_AVATAR_ID;
}
