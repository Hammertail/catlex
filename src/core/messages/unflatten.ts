//* Types imports
import type { MessageTree } from "../types.ts";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertSafeKey(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) {
    throw new Error(`Unsafe message key: ${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneTree(tree: MessageTree): MessageTree {
  return structuredClone(tree);
}

/**
 * Sets a dot-path value on a cloned message tree without mutating the original.
 */
export function setPathInTree(tree: MessageTree, path: string, value: unknown): MessageTree {
  const next = cloneTree(tree);
  const segments = path.split(".");

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid message path: ${path}`);
  }

  for (const segment of segments) {
    assertSafeKey(segment);
  }

  let cursor: Record<string, unknown> = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      throw new Error(`Invalid message path: ${path}`);
    }

    const existing = cursor[segment];
    if (!isPlainObject(existing)) {
      cursor[segment] = Object.create(null);
    }

    const child = cursor[segment];
    if (!isPlainObject(child)) {
      throw new Error(`Cannot set nested path through non-object: ${path}`);
    }
    cursor = child;
  }

  const leaf = segments[segments.length - 1];
  if (leaf === undefined) {
    throw new Error(`Invalid message path: ${path}`);
  }

  cursor[leaf] = value;
  return next;
}

export type TranslationPatch = {
  path: string;
  value: string;
};

/**
 * Applies multiple translation patches onto a cloned message tree.
 */
export function applyTranslationsToTree(
  tree: MessageTree,
  translations: TranslationPatch[],
): MessageTree {
  let next = cloneTree(tree);

  for (const translation of translations) {
    next = setPathInTree(next, translation.path, translation.value);
  }

  return next;
}
