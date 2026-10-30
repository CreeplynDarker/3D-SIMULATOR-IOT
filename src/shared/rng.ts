/** A named, seeded random stream (sfc32). Methods are bound, so they can be passed around on their own. */
export interface RngStream {
  /** Next 32-bit unsigned integer. */
  nextU32: () => number;
  /** Uniform draw in [0, 1). */
  uniform: () => number;
  /** Gaussian draw with mean `mu` and standard deviation `sigma` (same unit as both), Box–Muller with a spare. */
  normal: (mu: number, sigma: number) => number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const TWO_POW_32 = 4294967296;
const MURMUR3_C1 = 0x85ebca6b; // spreads seed ⊕ hash into the third state word
const WARMUP_ROUNDS = 15;
const utf8 = new TextEncoder();

/** 32-bit FNV-1a hash of the UTF-8 bytes of `text` (unitless). */
export function fnv1a32(text: string): number {
  let h = FNV_OFFSET;
  for (const byte of utf8.encode(text)) {
    h ^= byte;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

/** sfc32 generator over a 128-bit state; returns 32-bit unsigned integers. */
function sfc32(a0: number, b0: number, c0: number, d0: number): () => number {
  let a = a0 >>> 0;
  let b = b0 >>> 0;
  let c = c0 >>> 0;
  let d = d0 >>> 0;
  return () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t;
  };
}

/** Independent stream for `name` under the run `seed` (unitless); same inputs always give the same sequence. */
export function stream(seed: number, name: string): RngStream {
  const s = seed >>> 0;
  const h = fnv1a32(name);
  const nextU32 = sfc32(s, h, Math.imul(s ^ h, MURMUR3_C1), 1);
  for (let i = 0; i < WARMUP_ROUNDS; i++) nextU32();

  const uniform = () => nextU32() / TWO_POW_32;
  let spare: number | null = null;

  const normal = (mu: number, sigma: number) => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return mu + sigma * z;
    }
    const u1 = 1 - uniform(); // (0, 1], so the log is finite
    const u2 = uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return mu + sigma * r * Math.cos(2 * Math.PI * u2);
  };

  return { nextU32, uniform, normal };
}
