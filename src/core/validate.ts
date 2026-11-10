//* Libraries imports
import path from "node:path";

//* Local imports
import { loadConfig } from "./config/load.ts";
import { loadMessagesDir, resolveSafeMessagesDir, splitBaseAndLocales } from "./messages/load.ts";
import { runValidators } from "./validators/registry.ts";

//* Types imports
import type { ConfigFlags } from "./config/schema.ts";
import type { LocaleReport, ValidationIssue, ValidationResult } from "./types.ts";

export type ValidateOptions = ConfigFlags & {
  cwd?: string;
};

function groupIssuesByLocale(
  locales: { locale: string; filePath: string }[],
  issues: ValidationIssue[],
): LocaleReport[] {
  return locales.map((locale) => ({
    locale: locale.locale,
    filePath: locale.filePath,
    issues: issues.filter((issue) => issue.locale === locale.locale),
  }));
}

/**
 * Validates translation JSON files against the base locale.
 */
export async function validateTranslations(
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const config = await loadConfig(cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    strictExtra: options.strictExtra,
    noConfig: options.noConfig,
    allowJsConfig: options.allowJsConfig,
  });

  const messagesDir = await resolveSafeMessagesDir(cwd, config.messagesDir);
  const allLocales = await loadMessagesDir(messagesDir, { allowedRootDir: cwd });
  const { base, others } = splitBaseAndLocales(allLocales, config.baseLocale);

  const issues = runValidators({
    config,
    base,
    locales: others,
    cwd,
  });

  return {
    baseLocale: config.baseLocale,
    messagesDir,
    reports: groupIssuesByLocale(others, issues),
    issues,
  };
}

export function hasFailingIssues(issues: ValidationIssue[], strictExtra: boolean): boolean {
  return issues.some((issue) => {
    if (issue.kind === "missing") {
      return true;
    }

    return strictExtra && issue.kind === "extra";
  });
}
