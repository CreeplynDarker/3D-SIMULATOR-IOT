import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Command, Packet, PROTOCOL_VERSION, Verdict } from '../../../src/shared/protocol.ts';

const packet: Packet = {
  v: PROTOCOL_VERSION,
  kind: 'packet',
  seq: 42,
  ts_ms: 42_000,
  win_ms: 1000,
  a_rms_g: 0.031,
  cf: 2.9,
  i_rms_A: 0.181,
  t_C: 31.25,
  dtdt_C_per_min: 0.01,
  rpm: 3790,
  state: 'NORMAL',
  relay_ch2: 'ON',
  link_lost: false,
  sensor_fault: false,
  warn_reason: null,
  trip_reason: null,
};

const verdict: Verdict = {
  v: PROTOCOL_VERSION,
  kind: 'verdict',
  seq_ref: 42,
  score: 0.21,
  threshold: 0.5,
  alert: false,
  clear: true,
  dominant: 'a_rms_g',
  z: { a_rms_g: 0.4, cf: -0.2, i_rms_A: 0.1, t_C: 0, dtdt_C_per_min: 0.05, rpm: -0.3 },
  model: 'READY',
};

const command: Command = { v: PROTOCOL_VERSION, kind: 'command', seq: 0, cmd: 'START' };

describe('protocol', () => {
  it('parses a valid packet, verdict and command', () => {
    expect(Packet.parse(packet)).toEqual(packet);
    expect(Verdict.parse(verdict)).toEqual(verdict);
    expect(Command.parse(command)).toEqual(command);
  });

  it('accepts nulls where the spec allows them', () => {
    expect(Packet.safeParse({ ...packet, t_C: null, dtdt_C_per_min: null, trip_reason: 'RCF' }).success).toBe(true);
    const untrained = { ...verdict, score: null, dominant: null, z: null, model: 'UNTRAINED' };
    expect(Verdict.safeParse(untrained).success).toBe(true);
  });

  it('rejects a missing field', () => {
    const { rpm: _rpm, ...noRpm } = packet;
    expect(Packet.safeParse(noRpm).success).toBe(false);
    const { cmd: _cmd, ...noCmd } = command;
    expect(Command.safeParse(noCmd).success).toBe(false);
    const { threshold: _threshold, ...noThreshold } = verdict;
    expect(Verdict.safeParse(noThreshold).success).toBe(false);
  });

  it('rejects a wrong enum', () => {
    expect(Packet.safeParse({ ...packet, state: 'BROKEN' }).success).toBe(false);
    expect(Packet.safeParse({ ...packet, relay_ch2: 'CLOSED' }).success).toBe(false);
    expect(Verdict.safeParse({ ...verdict, dominant: 'humidity' }).success).toBe(false);
    expect(Command.safeParse({ ...command, cmd: 'STOP' }).success).toBe(false);
  });

  it('rejects NaN and infinities', () => {
    expect(Packet.safeParse({ ...packet, a_rms_g: Number.NaN }).success).toBe(false);
    expect(Packet.safeParse({ ...packet, t_C: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(Verdict.safeParse({ ...verdict, score: Number.NaN }).success).toBe(false);
  });

  it('rejects a negative or fractional seq', () => {
    expect(Packet.safeParse({ ...packet, seq: -1 }).success).toBe(false);
    expect(Packet.safeParse({ ...packet, seq: 1.5 }).success).toBe(false);
    expect(Command.safeParse({ ...command, seq: -1 }).success).toBe(false);
    expect(Verdict.safeParse({ ...verdict, seq_ref: -1 }).success).toBe(false);
  });

  it('rejects another protocol version', () => {
    expect(Packet.safeParse({ ...packet, v: PROTOCOL_VERSION + 1 }).success).toBe(false);
  });
});

describe('pnpm gen:schema', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'pdm-schema-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('writes three JSON Schema files', { timeout: 60_000 }, () => {
    const root = resolve(import.meta.dirname, '../../..');
    execFileSync(process.execPath, [join(root, 'scripts/export-schema.ts'), outDir], { cwd: root, stdio: 'pipe' });
    const files = readdirSync(outDir).sort();
    expect(files).toEqual(['command.schema.json', 'packet.schema.json', 'verdict.schema.json']);
    for (const file of files) {
      const schema = JSON.parse(readFileSync(join(outDir, file), 'utf8')) as Record<string, unknown>;
      expect(schema['$schema']).toMatch(/json-schema\.org/);
      expect(schema['type']).toBe('object');
    }
  });
});
