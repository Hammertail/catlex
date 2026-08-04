//* Libraries imports
import { render } from "ink";

//* Local imports
import { Report } from "../ui/Report.tsx";
import { hasFailingIssues, validateTranslations } from "../../core/validate.ts";
import { loadConfig } from "../../core/config/load.ts";

//* Types imports
import type { ValidationResult } from "../../core/types.ts";

export type ValidateCommandOptions = {
  dir?: string;
  base?: string;
  cwd?: string;
  strictExtra?: boolean;
  noConfig?: boolean;
  json?: boolean;
};

function printJson(result: ValidationResult, strictExtra: boolean, failed: boolean): void {
  const payload = {
    ok: !failed,
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    strictExtra,
    issues: result.issues,
    reports: result.reports,
  };

  console.log(JSON.stringify(payload, null, 2));
}

export async function runValidateCommand(options: ValidateCommandOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const noConfig = options.noConfig === true;

  const config = await loadConfig(cwd, {
    messagesDir: options.dir,
    baseLocale: options.base,
    strictExtra: options.strictExtra,
    noConfig,
  });

  const result = await validateTranslations({
    cwd,
    messagesDir: config.messagesDir,
    baseLocale: config.baseLocale,
    strictExtra: config.strictExtra,
    // Config was already resolved above; skip a second import of project modules.
    noConfig: true,
  });

  const failed = hasFailingIssues(result.issues, config.strictExtra);

  if (options.json) {
    printJson(result, config.strictExtra, failed);
  } else {
    const instance = render(<Report result={result} strictExtra={config.strictExtra} />);
    instance.unmount();
  }

  return failed ? 1 : 0;
}
