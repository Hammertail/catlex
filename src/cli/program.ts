//* Libraries imports
import { Command, InvalidArgumentError } from "commander";

//* Local imports
import { resolveTranslateConcurrency } from "../core/translate/pool.ts";
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

function parseConcurrencyOption(value: string): number {
  const parsed = Number(value);
  try {
    return resolveTranslateConcurrency(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidArgumentError(message);
  }
}

export function createProgram(): Command {
  const program = new Command();

  // Required so nested commands (translate → review) can share option names;
  // each level that has children also needs enablePositionalOptions().
  program.enablePositionalOptions();

  program
    .name("catlex")
    .description(
      "CLI to validate next-intl translation JSON files and scan JSX/TSX/VUE for hardcoded strings",
    )
    .version("0.4.0");

  program
    .command("validate")
    .description("Validate translation JSON files against the base locale (default: en.json)")
    .option("--dir <path>", "Messages directory relative to cwd")
    .option("--base <locale>", "Base locale file stem (e.g. en)")
    .option("--cwd <path>", "Project root directory", process.cwd())
    .option("--strict-extra", "Treat keys missing from the base locale as errors", false)
    .option("--no-config", "Do not load or execute project catlex.config.* files")
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runValidateCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          strictExtra: options.strictExtra === true,
          noConfig: options.config === false,
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
    .option(
      "--base-url <url>",
      "OpenAI-compatible API base URL (default: official OpenAI endpoint)",
    )
    .option("--dry-run", "List missing keys without calling the API or writing files", false)
    .option("--yes", "Write files without interactive confirmation", false)
    .option("--no-config", "Do not load or execute project catlex.config.* files")
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .option(
      "--concurrency <n>",
      "Max parallel translation API calls (default: 4)",
      parseConcurrencyOption,
    )
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runTranslateCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          locale: options.locale.length > 0 ? options.locale : undefined,
          model: options.model,
          baseUrl: options.baseUrl,
          dryRun: options.dryRun === true,
          yes: options.yes === true,
          noConfig: options.config === false,
          json: options.json === true,
          concurrency: options.concurrency,
        }),
      );
    });

  // Allow review to reuse the same option names without the parent stealing them
  // (also requires program.enablePositionalOptions() above).
  translate.enablePositionalOptions();

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
    .option(
      "--base-url <url>",
      "OpenAI-compatible API base URL (default: official OpenAI endpoint)",
    )
    .option(
      "--since <ref>",
      "Only review keys changed between <ref> and the working tree (recommended in CI)",
    )
    .option("--auto-fix", "Propose fixes for wrong/missing translations", false)
    .option("--yes", "Apply auto-fix writes without interactive confirmation", false)
    .option("--no-config", "Do not load or execute project catlex.config.* files")
    .option("--json", "Print machine-readable JSON instead of Ink UI", false)
    .option("--verbose", "Print per-chunk review progress details", false)
    .option(
      "--concurrency <n>",
      "Max parallel translation API calls (default: 4)",
      parseConcurrencyOption,
    )
    .action(async (options) => {
      await setExitCodeFrom(() =>
        runTranslateReviewCommand({
          dir: options.dir,
          base: options.base,
          cwd: options.cwd,
          locale: options.locale.length > 0 ? options.locale : undefined,
          model: options.model,
          baseUrl: options.baseUrl,
          since: options.since,
          autoFix: options.autoFix === true,
          yes: options.yes === true,
          noConfig: options.config === false,
          json: options.json === true,
          verbose: options.verbose === true,
          concurrency: options.concurrency,
        }),
      );
    });

  return program;
}
