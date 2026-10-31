// pnpm gen:model — writes public/models/default-model.json (spec §9.4) and prints the baseline it was trained on.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { trainDefault } from '../src/harness/trainDefault.ts';
import { serialiseModel } from '../src/rcf/model.ts';
import { CONFIG } from '../src/shared/config.ts';

const file = resolve(process.argv[2] ?? join(import.meta.dirname, '../public/models/default-model.json'));
const result = trainDefault(CONFIG);
if (result.status !== 'READY') {
  process.stderr.write(`default model rejected: ${result.reason} (holdout max ${result.holdoutMax.toFixed(3)})\n`);
  process.exit(1);
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${serialiseModel(result.model)}\n`);
const { json } = result.model;
json.features.forEach((k, i) => {
  const floor = json.stdFloor[i] as number;
  process.stdout.write(`${k}: mean ${json.mean[i]} std ${json.std[i]} (floor ${floor})\n`);
});
process.stdout.write(`holdout max ${result.holdoutMax} (limit ${CONFIG.rcf.holdoutMaxRatio * CONFIG.rcf.threshold})\n`);
process.stdout.write(`wrote ${file} (${statSync(file).size} bytes)\n`);
