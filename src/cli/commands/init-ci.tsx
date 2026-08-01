//* Libraries imports
import { access } from "node:fs/promises";
import { render } from "ink";

//* Local imports
import { Confirm } from "../ui/Confirm.tsx";
import { WORKFLOW_RELATIVE_PATH, resolveWorkflowPath } from "../../core/init-ci/paths.ts";
import { writeGithubWorkflow } from "../../core/init-ci/write.ts";

export type ConfirmFn = (message: string) => Promise<boolean>;

export type InitCiCommandOptions = {
  cwd?: string;
  confirm?: ConfirmFn;
};

async function promptConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const instance = render(
      <Confirm
        message={message}
        onResolve={(accepted) => {
          if (settled) {
            return;
          }
          settled = true;
          instance.unmount();
          resolve(accepted);
        }}
      />,
    );
  });
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function runInitCiCommand(options: InitCiCommandOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const confirm = options.confirm ?? promptConfirm;
  const absolutePath = resolveWorkflowPath(cwd);

  const createMessage = `This will add ${WORKFLOW_RELATIVE_PATH}. Continue?`;
  const createAccepted = await confirm(createMessage);
  if (!createAccepted) {
    console.log("Cancelled. No files were written.");
    return 0;
  }

  if (await fileExists(absolutePath)) {
    const overwriteAccepted = await confirm(`${WORKFLOW_RELATIVE_PATH} already exists. Overwrite?`);
    if (!overwriteAccepted) {
      console.log("Cancelled. Existing workflow was left unchanged.");
      return 0;
    }
  }

  const result = await writeGithubWorkflow({ cwd });
  console.log(`Wrote ${result.absolutePath}`);
  return 0;
}
