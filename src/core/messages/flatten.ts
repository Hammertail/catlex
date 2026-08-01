//* Types imports
import type { FlatMessages, MessageTree } from "../types.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Flattens nested message objects into dot-path keys.
 * Arrays and primitives are treated as leaf values.
 */
export function flattenMessages(
  tree: MessageTree,
  prefix = "",
): FlatMessages {
  const result: FlatMessages = new Map();

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      const nested = flattenMessages(value as MessageTree, path);
      for (const [nestedPath, nestedValue] of nested) {
        result.set(nestedPath, nestedValue);
      }
      continue;
    }

    result.set(path, value);
  }

  return result;
}
