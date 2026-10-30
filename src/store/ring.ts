/**
 * Fixed-capacity ring buffer that drops the oldest entry once full. It is mutable for speed: slices bump a `rev`
 * counter after each change so selectors re-run.
 */
export interface Ring<T> {
  readonly capacity: number;
  readonly size: number;
  push(item: T): void;
  /** Entry `i` counted from the oldest (0); undefined when out of range. */
  at(i: number): T | undefined;
  last(): T | undefined;
  /** Newest entry that matches, or undefined. */
  findLast(match: (item: T) => boolean): T | undefined;
  /** Entries from oldest to newest. */
  toArray(): T[];
  clear(): void;
}

/** Creates an empty ring holding at most `capacity` entries (count). */
export function createRing<T>(capacity: number): Ring<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError(`ring capacity must be > 0: ${capacity}`);
  let items: (T | undefined)[] = new Array<T | undefined>(capacity);
  let head = 0; // index of the oldest entry
  let size = 0;

  const at = (i: number) => (i >= 0 && i < size ? items[(head + i) % capacity] : undefined);

  return {
    capacity,
    get size() {
      return size;
    },
    push(item) {
      items[(head + size) % capacity] = item;
      if (size < capacity) size++;
      else head = (head + 1) % capacity;
    },
    at,
    last: () => at(size - 1),
    findLast(match) {
      for (let i = size - 1; i >= 0; i--) {
        const item = at(i);
        if (item !== undefined && match(item)) return item;
      }
      return undefined;
    },
    toArray: () => Array.from({ length: size }, (_, i) => at(i) as T),
    clear() {
      items = new Array<T | undefined>(capacity);
      head = 0;
      size = 0;
    },
  };
}
