import { describe, expect, it } from 'vitest';
import { CAMERA_ORDER, CAMERA_PRESETS, CAMERA_TRANSITION_ms, easeInOutCubic } from '../../../src/scene/cameras.ts';
import { CAMERA_FOV_deg, POINT_SIZE_PER_SPRITE } from '../../../src/scene/cameras.ts';

describe('camera presets', () => {
  it('has the five M1 presets in button order', () => {
    expect(CAMERA_ORDER).toEqual(['overview', 'fan', 'esp32', 'relay', 'breadboard']);
    expect(Object.keys(CAMERA_PRESETS).sort()).toEqual([...CAMERA_ORDER].sort());
  });

  it('gives every preset a distinct pose above the bench', () => {
    const poses = CAMERA_ORDER.map((k) => JSON.stringify(CAMERA_PRESETS[k].position_m));
    expect(new Set(poses).size).toBe(5);
    for (const k of CAMERA_ORDER) expect(CAMERA_PRESETS[k].position_m[1]).toBeGreaterThan(0.05);
  });

  it('eases over 600 ms from 0 to 1, symmetric about the middle', () => {
    expect(CAMERA_TRANSITION_ms).toBe(600);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe('Points sizing (P7.2)', () => {
  it('scales a sprite size by 1 / tan(fov / 2) so Points pulses match the sprites they replaced', () => {
    expect(CAMERA_FOV_deg).toBe(40);
    expect(POINT_SIZE_PER_SPRITE).toBeCloseTo(2.7475, 4);
  });
});
