import { describe, expect, it } from 'vitest';
import { createRing } from '../../../src/store/ring.ts';

describe('ring buffer', () => {
  it('keeps insertion order below capacity', () => {
    const ring = createRing<number>(4);
    ring.push(1);
    ring.push(2);
    expect(ring.size).toBe(2);
    expect(ring.toArray()).toEqual([1, 2]);
    expect(ring.last()).toBe(2);
  });

  it('drops the oldest entries past capacity', () => {
    const ring = createRing<number>(3);
    for (let i = 1; i <= 7; i++) ring.push(i);
    expect(ring.size).toBe(3);
    expect(ring.toArray()).toEqual([5, 6, 7]);
    expect(ring.at(0)).toBe(5);
    expect(ring.at(2)).toBe(7);
    expect(ring.at(3)).toBeUndefined();
  });

  it('finds the newest match and clears', () => {
    const ring = createRing<{ seq: number }>(3);
    for (let seq = 0; seq < 5; seq++) ring.push({ seq });
    expect(ring.findLast((x) => x.seq % 2 === 1)?.seq).toBe(3);
    expect(ring.findLast((x) => x.seq === 0)).toBeUndefined(); // already dropped
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.toArray()).toEqual([]);
    expect(ring.last()).toBeUndefined();
  });

  it('rejects a non-positive capacity', () => {
    expect(() => createRing(0)).toThrow();
  });
});
