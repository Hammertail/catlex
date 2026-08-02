//* Types imports
import type { FlatMessages, ValidationIssue } from "../types.ts";

export type CompareResult = {
  missing: string[];
  extra: string[];
};

/**
 * Compares a locale's flat keys against the base locale.
 */
export function compareFlatMessages(base: FlatMessages, locale: FlatMessages): CompareResult {
  const missing: string[] = [];
  const extra: string[] = [];

  for (const path of base.keys()) {
    if (!locale.has(path)) {
      missing.push(path);
    }
  }

  for (const path of locale.keys()) {
    if (!base.has(path)) {
      extra.push(path);
    }
  }

  missing.sort();
  extra.sort();

  return { missing, extra };
}

export function compareResultToIssues(locale: string, result: CompareResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const path of result.missing) {
    issues.push({ locale, path, kind: "missing" });
  }

  for (const path of result.extra) {
    issues.push({ locale, path, kind: "extra" });
  }

  return issues;
}
