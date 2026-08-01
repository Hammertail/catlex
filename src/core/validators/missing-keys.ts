//* Local imports
import { compareFlatMessages, compareResultToIssues } from "../messages/compare.ts";

//* Types imports
import type { ValidationIssue } from "../types.ts";
import type { Validator } from "./types.ts";

/**
 * Reports keys present in the base locale but missing in other locales,
 * and keys present in other locales but absent from the base.
 */
export const missingKeysValidator: Validator = {
  id: "missing-keys",
  run(ctx) {
    const issues: ValidationIssue[] = [];

    for (const locale of ctx.locales) {
      const result = compareFlatMessages(ctx.base.flat, locale.flat);
      issues.push(...compareResultToIssues(locale.locale, result));
    }

    return issues;
  },
};
