//* Local imports
import { missingKeysValidator } from "./missing-keys.ts";

//* Types imports
import type { ValidationIssue, ValidatorContext } from "../types.ts";
import type { Validator } from "./types.ts";

const validators: Validator[] = [missingKeysValidator];

export function getValidators(): Validator[] {
  return [...validators];
}

/**
 * Runs all registered validators and returns aggregated issues.
 */
export function runValidators(ctx: ValidatorContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const validator of getValidators()) {
    issues.push(...validator.run(ctx));
  }

  return issues;
}
