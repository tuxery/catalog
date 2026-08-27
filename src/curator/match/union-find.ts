/**
 * Standard disjoint-set / union-find, with path compression. Backs
 * `groupPackages`'s clustering: every package starts as its own singleton
 * set, and each detected match (manual, exact, or fuzzy) unions two sets
 * together — the final groups are just the sets at the end. Near-O(n) for
 * the union/find operations themselves; the actual cost of grouping is in
 * how many `union` calls get made, not in this structure.
 */
export class UnionFind<T> {
  private parent = new Map<T, T>();

  find(x: T): T {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }

    const p = this.parent.get(x) as T;
    if (p === x) return x;

    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(x: T, y: T): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX !== rootY) this.parent.set(rootX, rootY);
  }

  connected(x: T, y: T): boolean {
    return this.find(x) === this.find(y);
  }
}
