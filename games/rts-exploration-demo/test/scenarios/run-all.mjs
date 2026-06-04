import { spawnSync } from 'node:child_process';

const scenarios = [
  'mobile_engagement_slots.mjs',
  'group_move_plan.mjs',
  'choke_map_classification.mjs',
  'choke_move_6_grunts.mjs',
  'reservation_cleanup_on_death.mjs',
];

let failed = 0;
for (const scenario of scenarios) {
  const run = spawnSync(process.execPath, [new URL(scenario, import.meta.url).pathname], { encoding: 'utf8' });
  if (run.stdout.trim()) console.log(run.stdout.trim());
  if (run.stderr.trim()) console.error(run.stderr.trim());
  if (run.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`${failed} scenario(s) failed`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, scenarios: scenarios.length }, null, 2));
