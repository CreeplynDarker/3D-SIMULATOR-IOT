import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Packet } from '../../../src/shared/protocol.ts';

const MAIN = readFileSync(join(import.meta.dirname, '../../../src/firmware/reference-cpp/main.cpp'), 'utf8');

describe('reference C++ packet (P8.1, §10.1)', () => {
  it('sendPacket writes every protocol field, with the state and reasons as their names', () => {
    const body = MAIN.slice(MAIN.indexOf('static void sendPacket'), MAIN.indexOf('\n}\n', MAIN.indexOf('static void sendPacket'))); // prettier-ignore
    for (const key of Object.keys(Packet.shape)) {
      expect(body, key).toMatch(new RegExp(`(doc\\["${key}"\\]|setReason\\(doc, "${key}")`));
    }
    expect(body).toContain('STATE_NAMES[(int)fsm.state]');
    expect(MAIN).toContain('{"OFF", "CALIBRATING", "STARTING", "NORMAL", "WARNING", "CRITICAL"}');
    expect(MAIN).toMatch(/udp\.beginPacket\(LAPTOP_IP, 4211\)/);
    expect(MAIN).toMatch(/udp\.begin\(4210\)/);
  });
});
