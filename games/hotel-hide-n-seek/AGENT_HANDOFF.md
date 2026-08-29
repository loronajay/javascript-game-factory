# Agent Handoff — V5.1

Do not reintroduce floor visibility swapping or stair teleports. V5's main architectural goal is continuous vertical traversal.

## Movement

`walkSurfaces` contains flat hotel floors, room floors, secret tunnels, the moving elevator floor, stair landings, and stair ramps. `resolveGroundHeight()` selects only a nearby surface, so overlapping stair flights do not snap the player several meters vertically.

`collidesAt()` checks Y overlap. That specifically fixes the V4 elevator failure where an overhead wall header blocked the doorway because collision was only X/Z.

## Elevator

The cabin floor is dynamic and follows `elevator.car.position.y`. Hall/cabin door colliders disable once the doors are mostly open. The cabin moves in world Y with the player inside it.

## Stairwell

The east service-zone shaft is continuous from Floor 1 through Floor 4. Every floor uses the south entrance and a shared full-width landing. Each transition has two parallel flights and one north switchback landing. Visible stair treads are backed by smooth ramp surfaces. No stair interaction changes floors.

Stair and doorway geometry originates in `layout.js`, which is shared with the Node regression tests. Room openings are framed on all floors. Each room owns a shadow-free fill light that is visible only while its door is open.

## Recommended next work

1. Add hiding volumes and crouch.
2. Add sound events and propagation.
3. Build a navigation graph for the entity with corridor, room, stair landing, elevator lobby, and secret-passage nodes.
4. Add persistence for keys/doors/drawers.
5. Add elevator horror failures only after baseline traversal is stable.
