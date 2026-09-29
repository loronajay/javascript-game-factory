// Riding away from the farm, wired (planning-docs/FARM_RIDING_PLAN.md): what
// the Market Square, the Cove and Windrush Downs each plug in so a rider can
// arrive on their horse, ride it about, tie it to a hitching rail and walk,
// take it back up — and see everyone else who is riding.
//
// The pieces are the farm's own: the ride sim through `farm-riding-controller`
// (cosmetic in the square and the Cove, piloted at the Downs), one horse as a
// `farm-horse-tether` (ridden or tied — off the farm it has no life of its
// own), the pets' bodies to draw it, and the saddle view's hands and reins.
// Other riders' horses are drawn under the bodies the visitors module already
// eases, from the `mount` their presence pose carries.
//
// A page hands in its horse (the farm document's pet row, from the server),
// its world and its hitching rails, and asks this module each tick where the
// rider is and what E would do.
import { findAnimal } from "./farm-catalog/animals.mjs";
import { createPetBodies } from "./farm-pet-bodies.mjs";
import { createRiderView } from "./farm-rider-view.mjs";
import { createRidingController } from "./farm-riding-controller.mjs";
import { createTetheredHorse } from "./farm-horse-tether.mjs";
import { rideClip, rideGait } from "./farm-ride.mjs";
/** How near a hitching rail a rider must be to tie up, and how near a tied horse to get back on. */
export const RAIL_REACH = 2.4;
export const TIED_REACH = 2.2;
/** The saddle's height as a share of a horse's (the visitors' seat for a rider). */
export const SEAT_SHARE = 0.78;
function distanceToRail(rail, point) {
    // The rail runs along the row's local x, 2.4 m long.
    const cosine = Math.cos(rail.rotationY);
    const sine = Math.sin(rail.rotationY);
    const dx = point.x - rail.x;
    const dz = point.z - rail.z;
    const along = dx * cosine - dz * sine;
    const across = dx * sine + dz * cosine;
    const clamped = Math.max(-1.2, Math.min(1.2, along));
    return Math.hypot(along - clamped, across);
}
export function createAwayRiding(THREE, scene, options) {
    const species = findAnimal(options.horse?.speciesId);
    const horse = options.horse && species?.ridable ? options.horse : null;
    const size = horse?.profile?.size.current ?? 1;
    const tether = createTetheredHorse(horse && species ? {
        instanceId: horse.instanceId,
        speciesId: horse.speciesId,
        name: horse.name,
        paletteId: horse.profile?.paletteId ?? "standard",
        sizeMultiplier: size,
        radius: species.radius * size,
    } : null);
    const bodies = createPetBodies(THREE, scene);
    const riderView = createRiderView(THREE, scene);
    const riding = createRidingController({
        pets: tether,
        mode: options.mode,
        profile: () => (horse ? options.profile(horse) : options.profile(options.horse)),
        world: options.world,
        canStand: options.canStand,
        horseHeight: species?.height ?? 1.65,
    });
    const height = (species?.height ?? 1.65) * size;
    function tiedPose() {
        const found = horse && tether.state() === "tied" ? tether.find(horse.instanceId) : null;
        return found ? { x: found.x, z: found.z } : null;
    }
    function action(pose) {
        if (!horse)
            return null;
        if (riding.mounted()) {
            if (!options.canTie)
                return null;
            const near = options.rails.some((rail) => distanceToRail(rail, pose) <= RAIL_REACH);
            return near ? { kind: "tie", prompt: `Press E to tie ${horse.name} to the hitching rail and get down` } : null;
        }
        const tied = tiedPose();
        return tied && Math.hypot(tied.x - pose.x, tied.z - pose.z) <= TIED_REACH ? { kind: "mount", prompt: `Press E to untie ${horse.name} and ride` } : null;
    }
    return Object.freeze({
        hasHorse: () => Boolean(horse),
        mounted: () => Boolean(riding.mounted()),
        horseId: () => horse?.instanceId ?? "",
        horseName: () => horse?.name ?? "",
        arrive(pose) {
            if (!horse)
                return false;
            tether.tie({ x: pose.x, z: pose.z, yaw: pose.heading });
            const ok = riding.arrive(horse.instanceId, pose);
            if (ok)
                bodies.setTagVisible(horse.instanceId, false);
            return ok;
        },
        step: (dt, keys) => riding.step(dt, keys),
        state: () => riding.state(),
        profile: () => riding.profile(),
        eye: (time) => riding.eye(time),
        action,
        act(pose) {
            const next = action(pose);
            if (!next || !horse)
                return null;
            if (next.kind === "tie") {
                const spot = riding.dismount();
                if (spot)
                    bodies.setTagVisible(horse.instanceId, true);
                return spot;
            }
            const found = tether.find(horse.instanceId);
            if (!found)
                return null;
            const ok = riding.arrive(horse.instanceId, { x: found.x, z: found.z, heading: found.yaw });
            if (!ok)
                return null;
            bodies.setTagVisible(horse.instanceId, false);
            return { x: found.x, z: found.z };
        },
        draw(dt, time, others) {
            const ride = riding.state();
            const theirs = [];
            for (const placement of others) {
                const mount = placement.member.pose.mount;
                const kind = mount ? findAnimal(mount.speciesId) : undefined;
                if (!mount || !kind)
                    continue;
                theirs.push(Object.freeze({
                    instanceId: `mount-${placement.clientId}`,
                    speciesId: mount.speciesId,
                    name: "",
                    x: placement.x,
                    z: placement.z,
                    yaw: placement.yaw,
                    hover: mount.y,
                    sizeMultiplier: mount.size,
                    paletteId: mount.paletteId,
                    radius: kind.radius * mount.size,
                    state: "ridden",
                    moving: mount.gait !== "idle",
                    pace: 1,
                    gait: mount.gait,
                    gaitRate: 1,
                }));
            }
            bodies.sync([...tether.bodies(), ...theirs], dt);
            for (const body of theirs)
                bodies.setTagVisible(body.instanceId, false);
            riderView.update(ride ? {
                eye: riding.eye(time),
                horse: { x: ride.x, z: ride.z, y: ride.y, heading: ride.heading, height },
                reach: Math.min(1, Math.abs(ride.speed) / 6),
            } : null);
        },
        presenceMount() {
            const ride = riding.state();
            const profile = riding.profile();
            if (!horse || !ride || !profile)
                return null;
            const gait = rideGait(ride.speed, profile);
            return Object.freeze({ speciesId: horse.speciesId, paletteId: horse.profile?.paletteId ?? "standard", gait: rideClip(gait, ride.airborne), y: Number(ride.y.toFixed(2)), size });
        },
        seatFor: (mount) => (findAnimal(mount.speciesId)?.height ?? 1.65) * mount.size * SEAT_SHARE + mount.y - 0.1,
        halt: () => riding.halt(),
        setState: (state) => riding.setState(state),
    });
}
