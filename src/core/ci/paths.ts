//* Libraries imports
import path from "node:path";

//* Local imports
import { VALIDATE_WORKFLOW_RELATIVE_PATH } from "./kinds.ts";

export function resolveWorkflowPath(cwd: string, relativePath?: string): string {
  return path.resolve(cwd, relativePath ?? VALIDATE_WORKFLOW_RELATIVE_PATH);
}
