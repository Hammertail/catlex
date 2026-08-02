//* Libraries imports
import { Command } from "commander";

//* Local imports
import { runCiCommand } from "./commands/ci.tsx";
import { runScanCommand } from "./commands/scan.tsx";
import { runTranslateCommand } from "./commands/translate.tsx";
import { runTranslateReviewCommand } from "./commands/translate-review.tsx";
import { runValidateCommand } from "./commands/validate.tsx";

async function setExitCodeFrom(run: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

function parseLocaleOption(value: string, previous: string[]): string[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return previous.concat(parts);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("catlex")
    .description(
      "CLI to validate next-intl translation JSON files and scan JSX/TSX/VUE for hardcoded strings",
    )
    .version("0.3.0");

  program
    .command("validate")
    .description("Validate translation JSON files against the base locale (default: en.json)")
    .option("--dir <path>", "Messages directory relative to cwd")
    .option("--base <locale>", "Base locale file stem (e.g. en)")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .option("--strict-extra", "Treat keys missing from the base locale as errors", false)
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runValidateCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          strictExtra: options.strictExtra === true,
          json: options.json === true,
        }),
      );
    });

  program
    .command("scan")
    .description("Scan JSX/TSX/VUE for hardcoded user-visible strings (alpha)")
    .option("--dir <path>", "Source root directory relative to cwd", ".")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runScanCommand({
          dir: options.dir,
          cwd: options.cwd,
          json: options.json === true,
        }),
      );
    });

  program
    .command("ci")
    .alias("init-ci")
    .description("Interactively add GitHub Actions workflows for catlex")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runCiCommand({
          cwd: options.cwd,
        }),
      );
    });

  const translate = program
    .command("translate")
    .description("Fill missing translation keys with OpenAI (alpha)")
    .option("--dir <path>", "Messages directory relative to cwd")
    .option("--base <locale>", "Base locale file stem (e.g. en)")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .option(
      "--locale <locale>",
      "Target locale (repeatable or comma-separated)",
      parseLocaleOption,
      [] as string[],
    )
    .option("--model <id>", "OpenAI model id (default: gpt-5.4-mini)")
    .option("--dry-run", "Propose translations without writing files", false)
    .option("--yes", "Write files without interactive confirmation", false)
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runTranslateCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          locale: options.locale.length > 0 ? options.locale : undefined,
          model: options.model,
          dryRun: options.dryRun === true,
          yes: options.yes === true,
          json: options.json === true,
        }),
      );
    });

  translate
    .command("review")
    .description(
      "Review translations with OpenAI (alpha). Prefer --since <ref> in CI to limit scope to changed keys.",
    )
    .option("--dir <path>", "Messages directory relative to cwd")
    .option("--base <locale>", "Base locale file stem (e.g. en)")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .option(
      "--locale <locale>",
      "Target locale (repeatable or comma-separated)",
      parseLocaleOption,
      [] as string[],
    )
    .option("--model <id>", "OpenAI model id (default: gpt-5.4-mini)")
    .option("--since <ref>", "Only review keys changed between <ref> and HEAD (recommended in CI)")
    .option("--auto-fix", "Propose fixes for wrong/missing translations", false)
    .option("--yes", "Apply auto-fix writes without interactive confirmation", false)
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runTranslateReviewCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          locale: options.locale.length > 0 ? options.locale : undefined,
          model: options.model,
          since: options.since,
          autoFix: options.autoFix === true,
          yes: options.yes === true,
          json: options.json === true,
        }),
      );
    });

  return program;
}
