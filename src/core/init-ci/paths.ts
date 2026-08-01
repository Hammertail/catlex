//* Libraries imports
import path from "node:path";

export const WORKFLOW_RELATIVE_PATH = ".github/workflows/validate-messages.yml";

export function resolveWorkflowPath(cwd: string): string {
  return path.resolve(cwd, WORKFLOW_RELATIVE_PATH);
}
