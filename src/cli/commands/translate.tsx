//* Libraries imports
import path from "node:path";
import { render } from "ink";

//* Local imports
import { TranslateReport } from "../ui/TranslateReport.tsx";
import { promptConfirm, type ConfirmFn } from "../ui/prompt-confirm.tsx";
import { createTranslateProgressWriter } from "../ui/review-progress.ts";
import {
  TRANSLATE_ALPHA_MESSAGE,
  countPendingKeys,
  countTranslatedKeys,
} from "../ui/translate-report-view.ts";
import { loadConfig } from "../../core/config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../../core/messages/load.ts";
import { collectMissingTranslations } from "../../core/translate/collect.ts";
import {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  MissingOpenAiApiKeyError,
  assertOpenAiApiKey,
  createOpenAiTranslator,
  resolveOpenAiBaseUrl,
} from "../../core/translate/openai.ts";
import { translateMissingKeys } from "../../core/translate/translate.ts";
import { writeTranslatedReports } from "../../core/translate/write-reports.ts";

//* Types imports
import type { CatlexConfig } from "../../core/config/schema.ts";
import type { TranslateLocaleFn } from "../../core/translate/translate.ts";
import type { TranslateResult } from "../../core/translate/translate.ts";

export type { ConfirmFn };

export type TranslateCommandOptions = {
  dir?: string;
  base?: string;
  cwd?: string;
  locale?: string[];
  model?: string;
  baseUrl?: string;
  dryRun?: boolean;
  yes?: boolean;
  noConfig?: boolean;
  json?: boolean;
  concurrency?: number;
  confirm?: ConfirmFn;
  translateLocale?: TranslateLocaleFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

function printJson(result: TranslateResult): void {
  const translatedCount = countTranslatedKeys(result);
  const pendingCount = countPendingKeys(result);
  const payload = {
    ok: !result.cancelled,
    alpha: true,
    alphaMessage: TRANSLATE_ALPHA_MESSAGE,
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    dryRun: result.dryRun,
    cancelled: result.cancelled,
    translatedCount,
    pendingCount,
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
  noConfig?: boolean;
}): Promise<{
  baseLocale: string;
  messagesDir: string;
  missingCount: number;
  localeCount: number;
}> {
  const config = await loadConfig(options.cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    noConfig: options.noConfig,
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
  config: CatlexConfig,
): TranslateLocaleFn {
  return (
    options.translateLocale ??
    createOpenAiTranslator({
      model: options.model,
      baseUrl: resolveOpenAiBaseUrl({
        baseUrl: options.baseUrl,
        configBaseUrl: config.openai?.baseUrl,
        env,
      }),
      headers: config.openai?.headers,
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

  if (!dryRun && !requireApiKey(env)) {
    return 1;
  }

  const noConfig = options.noConfig === true;
  const config = await loadConfig(cwd, {
    messagesDir: options.dir,
    baseLocale: options.base,
    noConfig,
  });
  const plan = await collectMissingTranslationPlan({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
    noConfig,
  });

  if (dryRun) {
    const planResult = await translateMissingKeys({
      cwd,
      messagesDir: options.dir,
      baseLocale: options.base,
      locales: options.locale,
      dryRun: true,
      noConfig,
      concurrency: options.concurrency,
      translateLocale: options.translateLocale ?? (async () => ({ locale: "", translations: [] })),
    });
    emitOutput({ ...planResult, dryRun: true }, json);
    return 0;
  }

  const translateLocale = resolveTranslator(options, env, config);

  if (plan.missingCount === 0) {
    const emptyResult = await translateMissingKeys({
      cwd,
      messagesDir: options.dir,
      baseLocale: options.base,
      locales: options.locale,
      skipWrite: true,
      noConfig,
      concurrency: options.concurrency,
      translateLocale,
    });
    emitOutput({ ...emptyResult, dryRun: false }, json);
    return 0;
  }

  if (!yes && !(await confirmStartTranslation(plan, confirm))) {
    emitOutput(cancelledTranslateResult(plan), json);
    return 0;
  }

  const progressWriter = createTranslateProgressWriter({
    kind: "translate",
    model: options.model ?? DEFAULT_OPENAI_TRANSLATE_MODEL,
    json,
  });
  let result = await translateMissingKeys({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
    skipWrite: true,
    noConfig,
    concurrency: options.concurrency,
    onProgress: progressWriter.onProgress,
    translateLocale,
  });
  progressWriter.finish();

  const translatedCount = countTranslatedKeys(result);
  if (translatedCount === 0) {
    emitOutput({ ...result, dryRun: false }, json);
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
