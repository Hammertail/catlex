//* Types imports
import type { ValidationIssue, ValidatorContext } from "../types.ts";

export type Validator = {
  id: string;
  run: (ctx: ValidatorContext) => ValidationIssue[];
};
