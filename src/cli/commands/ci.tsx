//* Libraries imports
import { access } from "node:fs/promises";

//* Local imports
import { promptConfirm, type ConfirmFn } from "../ui/prompt-confirm.tsx";
import { promptMultiSelect, type MultiSelectFn } from "../ui/prompt-multi-select.tsx";
import {
  CI_WORKFLOW_OPTIONS,
  getCiWorkflowOption,
  type CiWorkflowKind,
} from "../../core/ci/kinds.ts";
import { resolveWorkflowPath } from "../../core/ci/paths.ts";
import { writeGithubWorkflows } from "../../core/ci/write.ts";

export type { ConfirmFn, MultiSelectFn };

export type CiCommandOptions = {
  cwd?: string;
  select?: MultiSelectFn<CiWorkflowKind>;
  confirm?: ConfirmFn;
};

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function runCiCommand(options: CiCommandOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const select = options.select ?? promptMultiSelect;
  const confirm = options.confirm ?? promptConfirm;

  const selectOptions = CI_WORKFLOW_OPTIONS.map((option) => ({
    value: option.kind,
    title: option.title,
    description: option.description,
  }));

  const selectedKinds = await select(
    "Select GitHub Actions workflows to add (Space toggle, Enter confirm):",
    selectOptions,
  );

  if (selectedKinds.length === 0) {
    console.log("Cancelled. No files were written.");
    return 0;
  }

  const kindsToWrite: CiWorkflowKind[] = [];

  for (const kind of selectedKinds) {
    const option = getCiWorkflowOption(kind);
    const absolutePath = resolveWorkflowPath(cwd, option.relativePath);
    if (await fileExists(absolutePath)) {
      const overwriteAccepted = await confirm(`${option.relativePath} already exists. Overwrite?`);
      if (!overwriteAccepted) {
        continue;
      }
    }

    kindsToWrite.push(kind);
  }

  if (kindsToWrite.length === 0) {
    console.log("Cancelled. No files were written.");
    return 0;
  }

  const results = await writeGithubWorkflows({ cwd, kinds: kindsToWrite });
  for (const result of results) {
    console.log(`Wrote ${result.absolutePath}`);
  }

  return 0;
}
