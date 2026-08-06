//* Libraries imports
import path from "node:path";
import { render } from "ink";

//* Local imports
import { TranslateReport } from "../ui/TranslateReport.tsx";
import { promptConfirm, type ConfirmFn } from "../ui/prompt-confirm.tsx";
import { TRANSLATE_ALPHA_MESSAGE, countTranslatedKeys } from "../ui/translate-report-view.ts";
import { loadConfig } from "../../core/config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../../core/messages/load.ts";
import { collectMissingTranslations } from "../../core/translate/collect.ts";
import {
  MissingOpenAiApiKeyError,
  assertOpenAiApiKey,
  createOpenAiTranslator,
} from "../../core/translate/openai.ts";
import { translateMissingKeys } from "../../core/translate/translate.ts";
import { writeTranslatedReports } from "../../core/translate/write-reports.ts";

//* Types imports
import type { TranslateLocaleFn } from "../../core/translate/translate.ts";
import type { TranslateResult } from "../../core/translate/translate.ts";

export type { ConfirmFn };

export type TranslateCommandOptions = {
  dir?: string;
  base?: string;
  cwd?: string;
  locale?: string[];
  model?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  confirm?: ConfirmFn;
  translateLocale?: TranslateLocaleFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

function printJson(result: TranslateResult): void {
  const translatedCount = countTranslatedKeys(result);
  const payload = {
    ok: !result.cancelled,
    alpha: true,
    alphaMessage: TRANSLATE_ALPHA_MESSAGE,
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    dryRun: result.dryRun,
    cancelled: result.cancelled,
    translatedCount,
    writtenFiles: result.writtenFiles,
    reports: result.reports,
  };

  console.log(JSON.stringify(payload, null, 2));
}

function renderReport(result: TranslateResult): void {
  const instance = render(<TranslateReport result={result} />);
  instance.unmount();
}

function emitOutput(result: TranslateResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  renderReport(result);
}

async function collectMissingTranslationPlan(options: {
  cwd: string;
  messagesDir?: string;
  baseLocale?: string;
  locales?: string[];
}): Promise<{
  baseLocale: string;
  messagesDir: string;
  missingCount: number;
  localeCount: number;
}> {
  const config = await loadConfig(options.cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
  });
  const messagesDir = path.resolve(options.cwd, config.messagesDir);
  const allLocales = await loadMessagesDir(messagesDir);
  const { base, others } = splitBaseAndLocales(allLocales, config.baseLocale);
  const collected = collectMissingTranslations({
    base,
    locales: others,
    localeFilter: options.locales,
  });
  const localeCount = new Set(collected.missing.map((item) => item.locale)).size;

  return {
    baseLocale: config.baseLocale,
    messagesDir: config.messagesDir,
    missingCount: collected.missing.length,
    localeCount,
  };
}

function resolveTranslator(
  options: TranslateCommandOptions,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): TranslateLocaleFn {
  return (
    options.translateLocale ??
    createOpenAiTranslator({
      model: options.model,
      env,
    })
  );
}

function requireApiKey(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  try {
    assertOpenAiApiKey(env);
    return true;
  } catch (error) {
    if (error instanceof MissingOpenAiApiKeyError) {
      console.error(`Error: ${error.message}`);
      return false;
    }
    throw error;
  }
}

async function confirmStartTranslation(
  plan: { missingCount: number; localeCount: number },
  confirm: ConfirmFn,
): Promise<boolean> {
  return confirm(
    `Run automatic translation for ${plan.missingCount} missing key(s) across ${plan.localeCount} locale(s)?`,
  );
}

async function confirmWriteTranslations(
  result: TranslateResult,
  translatedCount: number,
  confirm: ConfirmFn,
): Promise<boolean> {
  return confirm(
    `Write ${translatedCount} translation(s) to ${result.reports.filter((report) => report.translated.length > 0).length} locale file(s)?`,
  );
}

function cancelledTranslateResult(plan: {
  baseLocale: string;
  messagesDir: string;
}): TranslateResult {
  return {
    baseLocale: plan.baseLocale,
    messagesDir: plan.messagesDir,
    reports: [],
    writtenFiles: [],
    cancelled: true,
    dryRun: false,
  };
}

/**
 * Runs the alpha AI translate command.
 */
export async function runTranslateCommand(options: TranslateCommandOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun === true;
  const yes = options.yes === true;
  const json = options.json === true;
  const confirm = options.confirm ?? promptConfirm;
  const env = options.env ?? process.env;

  if (!requireApiKey(env)) {
    return 1;
  }

  const plan = await collectMissingTranslationPlan({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
  });
  const translateLocale = resolveTranslator(options, env);

  if (plan.missingCount === 0) {
    const emptyResult = await translateMissingKeys({
      cwd,
      messagesDir: options.dir,
      baseLocale: options.base,
      locales: options.locale,
      dryRun: true,
      translateLocale,
    });
    emitOutput({ ...emptyResult, dryRun }, json);
    return 0;
  }

  if (!dryRun && !yes && !(await confirmStartTranslation(plan, confirm))) {
    emitOutput(cancelledTranslateResult(plan), json);
    return 0;
  }

  let result = await translateMissingKeys({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
    dryRun: true,
    translateLocale,
  });

  const translatedCount = countTranslatedKeys(result);
  if (translatedCount === 0 || dryRun) {
    emitOutput({ ...result, dryRun }, json);
    return 0;
  }

  if (!json) {
    emitOutput(result, false);
  }

  if (!yes && !(await confirmWriteTranslations(result, translatedCount, confirm))) {
    emitOutput({ ...result, cancelled: true, dryRun: false, writtenFiles: [] }, json);
    return 0;
  }

  const writtenFiles = await writeTranslatedReports(result.reports, {
    allowedDir: path.resolve(cwd, result.messagesDir),
  });
  result = { ...result, dryRun: false, cancelled: false, writtenFiles };
  emitOutput(result, json);
  return 0;
}
