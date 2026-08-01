//* Libraries imports
import path from "node:path";

//* Types imports
import type { HardcodedIssue } from "../../src/core/scan/types.ts";

export const fixturesRoot = path.join(import.meta.dir, "..", "fixtures", "source", "hardcoded");

export const discoveryRoot = path.join(fixturesRoot, "discovery");

export const brokenRoot = path.join(
  import.meta.dir,
  "..",
  "fixtures",
  "source",
  "hardcoded-broken",
);

export function issuesForFile(issues: HardcodedIssue[], fileName: string): HardcodedIssue[] {
  return issues.filter((issue) => path.basename(issue.filePath) === fileName);
}
