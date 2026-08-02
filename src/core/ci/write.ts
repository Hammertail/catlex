//* Libraries imports
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { getCiWorkflowOption, type CiWorkflowKind } from "./kinds.ts";
import { resolveWorkflowPath } from "./paths.ts";
import { generateWorkflow } from "./workflows.ts";

export type WriteGithubWorkflowOptions = {
  cwd: string;
};

export type WriteGithubWorkflowResult = {
  absolutePath: string;
  contents: string;
  kind?: CiWorkflowKind;
};

export type WriteGithubWorkflowsOptions = {
  cwd: string;
  kinds: readonly CiWorkflowKind[];
};

export async function writeGithubWorkflows(
  options: WriteGithubWorkflowsOptions,
): Promise<WriteGithubWorkflowResult[]> {
  const results: WriteGithubWorkflowResult[] = [];

  for (const kind of options.kinds) {
    const option = getCiWorkflowOption(kind);
    const absolutePath = resolveWorkflowPath(options.cwd, option.relativePath);
    const contents = generateWorkflow(kind);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");

    results.push({ absolutePath, contents, kind });
  }

  return results;
}

/** Writes the validate workflow (legacy single-file API). */
export async function writeGithubWorkflow(
  options: WriteGithubWorkflowOptions,
): Promise<WriteGithubWorkflowResult> {
  const [result] = await writeGithubWorkflows({
    cwd: options.cwd,
    kinds: ["validate"],
  });
  if (!result) {
    throw new Error("Failed to write validate workflow");
  }
  return result;
}
