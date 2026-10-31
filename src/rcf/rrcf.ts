// Robust Random Cut Forest tree (spec §9.1), after Guha et al. 2016 and Python `rrcf` 0.4.4. Points are unitless
// (z-scores); each tree draws its cuts from its own seeded stream.
import type { RngStream } from '../shared/rng.ts';

export type RcfKey = string | number;

export interface Leaf {
  kind: 'leaf';
  keys: RcfKey[];
  point: number[];
  /** Number of points in the leaf (duplicates share one leaf). */
  n: number;
  parent: Branch | null;
}

export interface Branch {
  kind: 'branch';
  /** Cut dimension and value: points with `x[dim] ≤ cut` go left. */
  dim: number;
  cut: number;
  left: RcfNode;
  right: RcfNode;
  /** Number of points below this branch. */
  n: number;
  bboxMin: number[];
  bboxMax: number[];
  parent: Branch | null;
}

export type RcfNode = Leaf | Branch;

const boxMin = (node: RcfNode) => (node.kind === 'leaf' ? node.point : node.bboxMin);
const boxMax = (node: RcfNode) => (node.kind === 'leaf' ? node.point : node.bboxMax);
const sibling = (child: RcfNode, parent: Branch) => (parent.left === child ? parent.right : parent.left);

/** Replaces `oldChild` of `parent` with `newChild`; a null parent means `newChild` becomes the root. */
function relink(tree: RCTree, parent: Branch | null, oldChild: RcfNode, newChild: RcfNode): void {
  newChild.parent = parent;
  if (parent === null) tree.root = newChild;
  else if (parent.left === oldChild) parent.left = newChild;
  else parent.right = newChild;
}

/** Recomputes a branch's bounding box from its two children. */
function refreshBox(b: Branch): void {
  const lMin = boxMin(b.left);
  const lMax = boxMax(b.left);
  const rMin = boxMin(b.right);
  const rMax = boxMax(b.right);
  for (let d = 0; d < lMin.length; d++) {
    b.bboxMin[d] = Math.min(lMin[d] as number, rMin[d] as number);
    b.bboxMax[d] = Math.max(lMax[d] as number, rMax[d] as number);
  }
}

/** One random cut tree. Keys identify points; `leaves` maps each key to its leaf. */
export class RCTree {
  root: RcfNode | null = null;
  readonly leaves = new Map<RcfKey, Leaf>();
  private readonly rng: RngStream;

  constructor(rng: RngStream) {
    this.rng = rng;
  }

  /** Inserts `point` (unitless vector) under `key`; an equal point joins the existing leaf. */
  insertPoint(point: readonly number[], key: RcfKey): void {
    if (this.leaves.has(key)) throw new Error(`rrcf: key ${String(key)} already in the tree`);
    const p = [...point];
    if (this.root === null) {
      const leaf: Leaf = { kind: 'leaf', keys: [key], point: p, n: 1, parent: null };
      this.root = leaf;
      this.leaves.set(key, leaf);
      return;
    }
    const nearest = this.query(p);
    if (nearest.point.every((v, d) => v === p[d])) {
      nearest.keys.push(key);
      this.leaves.set(key, nearest);
      for (let node: RcfNode | null = nearest; node !== null; node = node.parent) node.n++;
      return;
    }
    this.leaves.set(key, this.insertNew(p, key));
  }

  /** Descends from the root and splits off a new leaf at the first random cut that separates `p`. */
  private insertNew(p: number[], key: RcfKey): Leaf {
    const leaf: Leaf = { kind: 'leaf', keys: [key], point: p, n: 1, parent: null };
    let node = this.root as RcfNode;
    for (;;) {
      const nMin = boxMin(node);
      const nMax = boxMax(node);
      const { dim, cut } = this.drawCut(p, nMin, nMax);
      const leftLeaf = cut < (nMin[dim] as number);
      if (leftLeaf || cut >= (nMax[dim] as number)) {
        const parent = node.parent;
        const branch: Branch = {
          kind: 'branch',
          dim,
          cut,
          left: leftLeaf ? leaf : node,
          right: leftLeaf ? node : leaf,
          n: node.n + 1,
          bboxMin: nMin.map((v, d) => Math.min(v, p[d] as number)),
          bboxMax: nMax.map((v, d) => Math.max(v, p[d] as number)),
          parent: null,
        };
        relink(this, parent, node, branch);
        leaf.parent = branch;
        node.parent = branch;
        for (let up = parent; up !== null; up = up.parent) {
          up.n++;
          for (let d = 0; d < p.length; d++) {
            up.bboxMin[d] = Math.min(up.bboxMin[d] as number, p[d] as number);
            up.bboxMax[d] = Math.max(up.bboxMax[d] as number, p[d] as number);
          }
        }
        return leaf;
      }
      // Within the node's box on this dimension: follow the existing cut (node is a branch here).
      const b = node as Branch;
      node = (p[b.dim] as number) <= b.cut ? b.left : b.right;
    }
  }

  /** r ~ U(0, Σ span) over the box of the node plus `p`; the dimension where the cumulative span passes r. */
  private drawCut(p: number[], nMin: number[], nMax: number[]): { dim: number; cut: number } {
    const lo = p.map((v, d) => Math.min(v, nMin[d] as number));
    const span = p.map((v, d) => Math.max(v, nMax[d] as number) - (lo[d] as number));
    const total = span.reduce((a, b) => a + b, 0);
    const r = this.rng.uniform() * total;
    let d = 0;
    let before = 0;
    while (d < span.length - 1 && before + (span[d] as number) <= r) before += span[d++] as number;
    return { dim: d, cut: (lo[d] as number) + (r - before) };
  }

  /** The leaf reached by following the cuts for `p`. */
  query(p: readonly number[]): Leaf {
    let node = this.root;
    if (node === null) throw new Error('rrcf: empty tree');
    while (node.kind === 'branch') node = (p[node.dim] as number) <= node.cut ? node.left : node.right;
    return node;
  }

  /** Removes `key`; a leaf left empty is removed and its sibling takes its parent's place. */
  forgetPoint(key: RcfKey): void {
    const leaf = this.leaves.get(key);
    if (leaf === undefined) throw new Error(`rrcf: key ${String(key)} not in the tree`);
    this.leaves.delete(key);
    if (leaf.n > 1) {
      leaf.keys.splice(leaf.keys.indexOf(key), 1);
      for (let node: RcfNode | null = leaf; node !== null; node = node.parent) node.n--;
      return;
    }
    const parent = leaf.parent;
    if (parent === null) {
      this.root = null;
      return;
    }
    const grand = parent.parent;
    relink(this, grand, parent, sibling(leaf, parent));
    for (let up = grand; up !== null; up = up.parent) {
      up.n--;
      refreshBox(up);
    }
  }

  /** Collusive displacement of `key` (unitless, 0…n): max over its ancestors of n(sibling) / n(subtree). */
  codisp(key: RcfKey): number {
    const leaf = this.leaves.get(key);
    if (leaf === undefined) throw new Error(`rrcf: key ${String(key)} not in the tree`);
    let best = 0;
    let node: RcfNode = leaf;
    for (let parent = node.parent; parent !== null; node = parent, parent = parent.parent) {
      best = Math.max(best, sibling(node, parent).n / node.n);
    }
    return best;
  }
}
