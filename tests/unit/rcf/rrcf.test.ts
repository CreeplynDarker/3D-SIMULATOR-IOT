import { describe, expect, it } from 'vitest';
import { type RcfNode, RCTree } from '../../../src/rcf/rrcf.ts';
import { stream } from '../../../src/shared/rng.ts';

const SEED = 20261029;
const DIMS = 3;

/** Checks every invariant below `node`: counts, exact bounding boxes, parent links and the leaf map. */
function checkNode(tree: RCTree, node: RcfNode, seen: Set<string | number>): { n: number; min: number[]; max: number[] } {
  if (node.kind === 'leaf') {
    expect(node.n).toBe(node.keys.length);
    for (const k of node.keys) {
      expect(tree.leaves.get(k)).toBe(node);
      seen.add(k);
    }
    return { n: node.n, min: [...node.point], max: [...node.point] };
  }
  expect(node.left.parent).toBe(node);
  expect(node.right.parent).toBe(node);
  const l = checkNode(tree, node.left, seen);
  const r = checkNode(tree, node.right, seen);
  const min = l.min.map((v, d) => Math.min(v, r.min[d] as number));
  const max = l.max.map((v, d) => Math.max(v, r.max[d] as number));
  expect(node.n).toBe(l.n + r.n);
  expect(node.bboxMin).toEqual(min);
  expect(node.bboxMax).toEqual(max);
  // The cut separates the children: left ≤ cut < right on `dim`.
  expect(l.max[node.dim] as number).toBeLessThanOrEqual(node.cut);
  expect(r.min[node.dim] as number).toBeGreaterThan(node.cut);
  return { n: node.n, min, max };
}

function checkTree(tree: RCTree, keys: Set<string | number>): void {
  const seen = new Set<string | number>();
  if (tree.root === null) expect(keys.size).toBe(0);
  else {
    expect(tree.root.parent).toBeNull();
    expect(checkNode(tree, tree.root, seen).n).toBe(keys.size);
  }
  expect([...seen].sort()).toEqual([...keys].sort());
  expect(tree.leaves.size).toBe(keys.size);
}

/** A tree of `n` standard-normal points with keys 0…n−1. */
function gaussianTree(n: number, name: string): RCTree {
  const data = stream(SEED, `data-${name}`);
  const tree = new RCTree(stream(SEED, `tree-${name}`));
  for (let i = 0; i < n; i++) tree.insertPoint(Array.from({ length: DIMS }, () => data.normal(0, 1)), i);
  return tree;
}

describe('RRCF tree (§9.1)', () => {
  it('keeps n and bounding boxes consistent over 1,000 random insert/forget operations', () => {
    const ops = stream(SEED, 'ops');
    const tree = new RCTree(stream(SEED, 'rcf-tree-0'));
    const keys = new Set<string | number>();
    const pool: number[][] = [];
    let next = 0;
    for (let op = 0; op < 1000; op++) {
      const insert = keys.size === 0 || ops.uniform() < 0.6;
      if (insert) {
        // Every tenth point repeats an earlier one, so duplicates are exercised too.
        const reuse = pool.length > 0 && ops.uniform() < 0.1;
        const point = reuse
          ? [...(pool[Math.floor(ops.uniform() * pool.length)] as number[])]
          : Array.from({ length: DIMS }, () => ops.normal(0, 1));
        pool.push(point);
        tree.insertPoint(point, next);
        keys.add(next++);
      } else {
        const all = [...keys];
        const key = all[Math.floor(ops.uniform() * all.length)] as number;
        tree.forgetPoint(key);
        keys.delete(key);
      }
      checkTree(tree, keys);
    }
  });

  it('a duplicate point joins the existing leaf, and forgetting it restores the leaf', () => {
    const tree = gaussianTree(20, 'dup');
    const leaf = tree.leaves.get(5);
    if (leaf === undefined) throw new Error('missing leaf');
    tree.insertPoint([...leaf.point], 'copy');
    expect(tree.leaves.get('copy')).toBe(leaf);
    expect(leaf.n).toBe(2);
    expect(leaf.keys).toEqual([5, 'copy']);
    expect(tree.root?.n).toBe(21);
    tree.forgetPoint(5);
    expect(leaf.keys).toEqual(['copy']);
    expect(tree.root?.n).toBe(20);
    checkTree(tree, new Set([...Array.from({ length: 20 }, (_, i) => i).filter((i) => i !== 5), 'copy']));
  });

  it('rejects a key already in the tree and forgetting an unknown key', () => {
    const tree = gaussianTree(3, 'keys');
    expect(() => tree.insertPoint([0, 0, 0], 1)).toThrow();
    expect(() => tree.forgetPoint('nope')).toThrow();
    expect(() => tree.codisp('nope')).toThrow();
  });

  it('handles the root edge cases: one leaf, two leaves, back to empty', () => {
    const tree = new RCTree(stream(SEED, 'tiny'));
    tree.insertPoint([1, 2, 3], 'a');
    expect(tree.codisp('a')).toBe(0);
    tree.insertPoint([4, 5, 6], 'b');
    expect(tree.codisp('a')).toBe(1);
    tree.forgetPoint('a');
    expect(tree.root?.kind).toBe('leaf');
    expect(tree.root?.parent).toBeNull();
    tree.forgetPoint('b');
    expect(tree.root).toBeNull();
    checkTree(tree, new Set());
  });

  it('insert then forget of a temporary point leaves the tree as it was', () => {
    const tree = gaussianTree(64, 'tmp');
    const before = JSON.stringify(tree.root, (k, v: unknown) => (k === 'parent' ? undefined : v));
    tree.insertPoint([0.3, -0.2, 0.1], 'tmp');
    tree.forgetPoint('tmp');
    expect(JSON.stringify(tree.root, (k, v: unknown) => (k === 'parent' ? undefined : v))).toBe(before);
  });

  it('a far outlier has codisp ≥ 0.8 · n and a central point ≤ 0.2 · n (mean over 40 trees)', () => {
    const n = 256;
    const trees = Array.from({ length: 40 }, (_, i) => gaussianTree(n, `forest-${i}`));
    const meanCodisp = (point: number[]) => {
      let sum = 0;
      for (const t of trees) {
        t.insertPoint(point, 'q');
        sum += t.codisp('q');
        t.forgetPoint('q');
      }
      return sum / trees.length;
    };
    expect(meanCodisp([25, -25, 25])).toBeGreaterThanOrEqual(0.8 * n);
    expect(meanCodisp([0, 0, 0])).toBeLessThanOrEqual(0.2 * n);
  });

  it('is deterministic: the same stream and points give the same tree', () => {
    const a = JSON.stringify(gaussianTree(50, 'det').root, (k, v: unknown) => (k === 'parent' ? undefined : v));
    const b = JSON.stringify(gaussianTree(50, 'det').root, (k, v: unknown) => (k === 'parent' ? undefined : v));
    expect(a).toBe(b);
  });
});
