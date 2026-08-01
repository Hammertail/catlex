//* Libraries imports
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { resolveWorkflowPath } from "./paths.ts";
import { generateValidateMessagesWorkflow } from "./workflow.ts";

export type WriteGithubWorkflowOptions = {
  cwd: string;
};

export type WriteGithubWorkflowResult = {
  absolutePath: string;
  contents: string;
};

export async function writeGithubWorkflow(
  options: WriteGithubWorkflowOptions,
): Promise<WriteGithubWorkflowResult> {
  const absolutePath = resolveWorkflowPath(options.cwd);
  const contents = generateValidateMessagesWorkflow();

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");

  return { absolutePath, contents };
}
