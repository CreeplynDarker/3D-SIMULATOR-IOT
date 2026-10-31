// pnpm calibrate — fits fan.*, thermal.* and sensor noise to a recorded healthy session (P8.4) and writes a
// proposed diff of src/shared/config.ts. It never edits config.ts: review the diff, then `git apply` it.
//
//   pnpm calibrate <session.jsonl | m7-export.json> [--out proposal.diff]
//       The session is a bridge session file (bridge-py/sessions/) or an M7 JSON export, recorded as
//       CALIBRATION_SCENARIO (src/shared/calibration.ts): fan at rest and cold for 10 s, START, 10 min running,
//       E-STOP, 30 s more. The diff goes to <session>.config.diff unless --out says otherwise.
//   pnpm calibrate --record <out.jsonl> [--set key=value]... [--seed N]
//       Writes a simulated recording of that protocol in the bridge's format, from config.ts with the --set
//       values (for trying the fit on known parameters).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSession } from '../src/bridge/session.ts';
import { calibrate, recordCalibration, withValues } from '../src/harness/calibrate.ts';
import { patchConfigSource, roundProposal, unifiedDiff } from '../src/harness/configDiff.ts';
import { KEPT_KEYS } from '../src/shared/calibration.ts';
import { CONFIG } from '../src/shared/config.ts';

const CONFIG_PATH = 'src/shared/config.ts';
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};

function record(out: string) {
  const sets: Record<string, number> = {};
  args.forEach((a, i) => {
    if (a !== '--set') return;
    const [key, value] = (args[i + 1] ?? '').split('=');
    if (!key || value === undefined || !Number.isFinite(Number(value))) throw new Error(`--set needs key=number, got ${args[i + 1]}`); // prettier-ignore
    sets[key] = Number(value);
  });
  const packets = recordCalibration(withValues(CONFIG, sets), Number(flag('--seed') ?? CONFIG.seed));
  writeFileSync(out, packets.map((p) => JSON.stringify({ t_ms: p.ts_ms, dir: 'up', msg: p })).join('\n') + '\n');
  process.stdout.write(`wrote ${out}: ${packets.length} packets${Object.keys(sets).length ? ` with ${JSON.stringify(sets)}` : ''}\n`); // prettier-ignore
}

function fit(file: string) {
  const { packets, skipped } = parseSession(readFileSync(file, 'utf8'));
  const result = calibrate(packets, CONFIG);
  const w = result.windows;
  const lines = [
    `session ${file}: ${packets.length} packets${skipped ? ` (${skipped} skipped)` : ''}`,
    `windows: rest ${w.rest}, spin-up ${w.spinUp}, running ${w.steady}, coast ${w.coast}, current noise ${w.currentNoise}, heating ${w.heating}`, // prettier-ignore
    `relay closed at ${result.switch_s.on.toFixed(3)} s, opened at ${result.switch_s.off?.toFixed(3) ?? '— (no E-STOP)'} s`,
    '',
    `${'key'.padEnd(28)}${'config'.padStart(10)}${'proposed'.padStart(11)}${'change'.padStart(9)}  from`,
  ];
  const changes = [];
  for (const e of result.entries) {
    if (e.proposed === null) {
      lines.push(`${e.key.padEnd(28)}${String(e.current).padStart(10)}${'—'.padStart(11)}${''.padStart(9)}  not in this recording (${e.basis})`); // prettier-ignore
      continue;
    }
    const value = roundProposal(e.key, e.proposed);
    const change = `${(((value - e.current) / e.current) * 100).toFixed(1)}%`;
    lines.push(`${e.key.padEnd(28)}${String(e.current).padStart(10)}${String(value).padStart(11)}${change.padStart(9)}  ${e.basis}${e.outOfRange ? '  ⚠ outside its §5.2 range' : ''}`); // prettier-ignore
    if (value !== e.current) changes.push({ key: e.key, value });
  }
  lines.push('', 'kept (a healthy session cannot separate them):', ...KEPT_KEYS.map((k) => `  ${k.keys}: ${k.why}`));
  const source = readFileSync(join(import.meta.dirname, '..', CONFIG_PATH), 'utf8');
  const diff = unifiedDiff(source, patchConfigSource(source, changes), CONFIG_PATH);
  const out = flag('--out') ?? `${file.replace(/\.(jsonl|json)$/, '')}.config.diff`;
  writeFileSync(out, diff);
  lines.push('', diff ? `proposed diff: ${out} (review it, then: git apply ${out})` : 'no change proposed');
  process.stdout.write(`${lines.join('\n')}\n`);
}

const rec = flag('--record');
if (rec) record(rec);
else if (args[0] && !args[0].startsWith('--')) fit(args[0]);
else {
  process.stderr.write('usage: pnpm calibrate <session.jsonl|export.json> [--out file.diff]\n       pnpm calibrate --record <out.jsonl> [--set key=value]... [--seed N]\n'); // prettier-ignore
  process.exit(2);
}
