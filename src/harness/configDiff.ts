// Proposed config edits as a unified diff of src/shared/config.ts (P8.4): the calibration never writes the file;
// the team reviews the diff and applies it with `git apply`. Pure.

export interface ConfigChange {
  /** Dotted path such as `sensors.mpu.noise_g`. */
  key: string;
  value: number;
}

/** `source` (config.ts text) with each key's number replaced; throws if a key isn't found where its path says. */
export function patchConfigSource(source: string, changes: readonly ConfigChange[]): string {
  let out = source;
  for (const { key, value } of changes) {
    const path = key.split('.');
    const last = path.pop() as string;
    let at = 0;
    for (const section of path) {
      const m = new RegExp(`\\b${section}: \\{`).exec(out.slice(at));
      if (!m) throw new Error(`config section ${section} of ${key} not found`);
      at += m.index + m[0].length;
    }
    const m = new RegExp(`\\b${last}: (-?[0-9][0-9.e+-]*)`).exec(out.slice(at));
    if (!m) throw new Error(`config key ${key} not found`);
    const start = at + m.index + m[0].length - (m[1] as string).length;
    out = out.slice(0, start) + String(value) + out.slice(start + (m[1] as string).length);
  }
  return out;
}

/** A unified diff (`git apply` format) of two texts with the same line count, `context` lines around each change. */
export function unifiedDiff(before: string, after: string, path: string, context = 2): string {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length !== b.length) throw new Error('unifiedDiff: the texts must have the same number of lines');
  const changed = a.map((line, i) => line !== b[i]).flatMap((c, i) => (c ? [i] : []));
  if (changed.length === 0) return '';
  const hunks: [number, number][] = [];
  for (const i of changed) {
    const [lo, hi] = [Math.max(0, i - context), Math.min(a.length - 1, i + context)];
    const prev = hunks.at(-1);
    if (prev && lo <= prev[1] + 1) prev[1] = hi;
    else hunks.push([lo, hi]);
  }
  const lines = [`--- a/${path}`, `+++ b/${path}`];
  for (const [lo, hi] of hunks) {
    const n = hi - lo + 1;
    lines.push(`@@ -${lo + 1},${n} +${lo + 1},${n} @@`);
    for (let i = lo; i <= hi; i++) {
      if (a[i] === b[i]) lines.push(` ${a[i]}`);
      else lines.push(`-${a[i]}`, `+${b[i]}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** A proposed value rounded for the config: whole rpm, otherwise 3 significant digits. */
export function roundProposal(key: string, value: number): number {
  return key === 'fan.rpmRated' ? Math.round(value) : Number(value.toPrecision(3));
}
