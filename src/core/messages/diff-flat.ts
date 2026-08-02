//* Types imports
import type { FlatMessages } from "../types.ts";

export type FlatDiffAdded = {
  path: string;
  value: unknown;
};

export type FlatDiffModified = {
  path: string;
  before: unknown;
  after: unknown;
};

export type FlatDiffRemoved = {
  path: string;
  value: unknown;
};

export type FlatDiffResult = {
  added: FlatDiffAdded[];
  modified: FlatDiffModified[];
  removed: FlatDiffRemoved[];
};

/**
 * Diffs two flat message maps by path and leaf value.
 */
export function diffFlatMessages(before: FlatMessages, after: FlatMessages): FlatDiffResult {
  const added: FlatDiffAdded[] = [];
  const modified: FlatDiffModified[] = [];
  const removed: FlatDiffRemoved[] = [];

  for (const [path, value] of after) {
    if (!before.has(path)) {
      added.push({ path, value });
      continue;
    }

    const previous = before.get(path);
    if (!Object.is(previous, value)) {
      modified.push({ path, before: previous, after: value });
    }
  }

  for (const [path, value] of before) {
    if (!after.has(path)) {
      removed.push({ path, value });
    }
  }

  added.sort((a, b) => a.path.localeCompare(b.path));
  modified.sort((a, b) => a.path.localeCompare(b.path));
  removed.sort((a, b) => a.path.localeCompare(b.path));

  return { added, modified, removed };
}
