// Owns idle Drifter patrol intent only. Combat retains control while a Drifter
// has an attack target; respawning and rewards will live in the future neutral
// objective system rather than here.
export class DrifterPatrolController {
  constructor({ getUnits, movement, getSimTime }) {
    this.getUnits = getUnits;
    this.movement = movement;
    this.getSimTime = getSimTime;
  }

  update() {
    for (const unit of this.getUnits()) {
      if (unit.type !== 'drifter' || unit.hp <= 0 || unit.attackTarget || unit.path.length > 0) continue;
      const patrol = unit.neutralPatrol;
      if (!patrol || patrol.waypoints.length < 2) continue;

      const index = patrol.nextWaypointIndex % patrol.waypoints.length;
      const waypoint = patrol.waypoints[index];
      const reached = Math.hypot(waypoint.x - unit.x, waypoint.y - unit.y) <= 2;
      if (reached) patrol.nextWaypointIndex = (index + 1) % patrol.waypoints.length;

      const target = patrol.waypoints[patrol.nextWaypointIndex % patrol.waypoints.length];
      if (this.movement.pathUnitToWorld(unit, target.x, target.y)) {
        patrol.lastIssuedAt = this.getSimTime();
        patrol.nextWaypointIndex = (patrol.nextWaypointIndex + 1) % patrol.waypoints.length;
      }
    }
  }
}
