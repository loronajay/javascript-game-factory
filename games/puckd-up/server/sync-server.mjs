// Mechanical source mirror; --check is read-only and required by network tests.
import { copyFile, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mirrorFiles, cannonSha256 } from './mirror-manifest.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await realpath(resolve(root, '../../../factory-network-server'));
const target = await realpath(resolve(server, 'games/puckd-up'));
const check = process.argv.includes('--check');
const hash = data => createHash('sha256').update(data).digest('hex');
if (hash(await readFile(resolve(server, 'games/yam-bowling/shared/bowl3d/vendor/cannon-es.mjs'))) !== cannonSha256)
    throw new Error('Existing Cannon runtime differs from the verified 0.20 build. Review before syncing.');
for (const [source, destination] of mirrorFiles) {
    const output = resolve(target, destination), rel = relative(target, output);
    if (rel.startsWith(`..${sep}`) || rel === '..') throw new Error('Mirror escaped the game directory');
    const input = resolve(root, source);
    if (check) {
        if (hash(await readFile(input)) !== hash(await readFile(output))) throw new Error(`Server mirror drift: ${destination}`);
    } else {
        await mkdir(dirname(output), { recursive: true });
        await copyFile(input, output);
    }
}
console.log(`${check ? 'Verified' : 'Synced'} ${mirrorFiles.length} Puck'd Up files in ${target}`);
