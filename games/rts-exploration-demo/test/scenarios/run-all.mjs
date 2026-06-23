import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scenarios = [
  'mobile_engagement_slots.mjs',
  'group_move_plan.mjs',
  'choke_map_classification.mjs',
  'level01_reference_layout.mjs',
  'level01_wall_topology.mjs',
  'level01_legend_contract.mjs',
  'level01_wall_roles_and_drifters.mjs',
  'nexus_entity_target.mjs',
  'nexus_collision_and_landmarks.mjs',
  'drifter_patrol_routes.mjs',
  'natural_wall_attack_target.mjs',
  'choke_move_6_grunts.mjs',
  'reservation_cleanup_on_death.mjs',
];

let failed = 0;
for (const scenario of scenarios) {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(scenario, import.meta.url))], { encoding: 'utf8' });
  if (run.stdout.trim()) console.log(run.stdout.trim());
  if (run.stderr.trim()) console.error(run.stderr.trim());
  if (run.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`${failed} scenario(s) failed`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, scenarios: scenarios.length }, null, 2));
