/**
 * Regenerate the architecture diagrams with Archify (https://github.com/tt-a1i/archify, MIT).
 *
 *   git clone --depth 1 https://github.com/tt-a1i/archify.git ../archify     # once
 *   npm run diagrams                                                           # or ARCHIFY_DIR=path npm run diagrams
 *
 * Reads docs/diagrams/*.json (typed descriptions of the real system), validates them at "showcase" quality,
 * and writes standalone interactive HTML into public/diagrams/, which /architecture embeds.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidates = [process.env.ARCHIFY_DIR, path.join(root, '..', 'archify'), path.join(root, 'scratch', 'archify')].filter(Boolean);
const dir = candidates.find((d) => fs.existsSync(path.join(d, 'archify', 'bin', 'archify.mjs')));
if (!dir) {
  console.error('Archify not found. Run: git clone --depth 1 https://github.com/tt-a1i/archify.git ../archify');
  process.exit(1);
}
const cli = path.join(dir, 'archify', 'bin', 'archify.mjs');
const src = path.join(root, 'docs', 'diagrams');
const out = path.join(root, 'public', 'diagrams');
fs.mkdirSync(out, { recursive: true });

let failed = 0;
for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.json'))) {
  const type = file.split('.').slice(-2, -1)[0]; // system.architecture.json -> architecture
  const target = path.join(out, file.replace(/\.json$/, '.html'));
  const res = spawnSync('node', [cli, 'deliver', type, path.join(src, file), target, '--quality', 'showcase'], { encoding: 'utf8' });
  console.log(res.status === 0 ? `ok    ${file}` : `FAIL  ${file}\n${res.stdout}${res.stderr}`);
  if (res.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
