//* Libraries imports
import path from "node:path";
import { render } from "ink";

//* Local imports
import { ReviewReport } from "../ui/ReviewReport.tsx";
import { promptConfirm, type ConfirmFn } from "../ui/prompt-confirm.tsx";
import { createReviewProgressWriter } from "../ui/review-progress.ts";
import { REVIEW_ALPHA_MESSAGE, buildReviewReportView } from "../ui/review-report-view.ts";
import { loadConfig } from "../../core/config/load.ts";
import {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  MissingOpenAiApiKeyError,
  assertOpenAiApiKey,
  createOpenAiTranslator,
  resolveOpenAiBaseUrl,
} from "../../core/translate/openai.ts";
import { createOpenAiReviewer } from "../../core/translate/review-openai.ts";
import {
  countReviewFixes,
  reviewTranslations,
  withReviewFixesApplied,
} from "../../core/translate/review.ts";
import { writeTranslatedReports } from "../../core/translate/write-reports.ts";

//* Types imports
import type { ReviewLocaleFn } from "../../core/translate/review-openai.ts";
import type { ReviewResult } from "../../core/translate/review.ts";
import type { TranslateLocaleFn } from "../../core/translate/translate.ts";

export type TranslateReviewCommandOptions = {
  dir?: string;
  base?: string;
  cwd?: string;
  locale?: string[];
  model?: string;
  baseUrl?: string;
  since?: string;
  autoFix?: boolean;
  yes?: boolean;
  noConfig?: boolean;
  json?: boolean;
  verbose?: boolean;
  confirm?: ConfirmFn;
  reviewLocale?: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

function printJson(result: ReviewResult, model: string): void {
  const view = buildReviewReportView(result, { model });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        alpha: true,
        alphaMessage: REVIEW_ALPHA_MESSAGE,
        baseLocale: result.baseLocale,
        messagesDir: result.messagesDir,
        since: result.since,
        sinceContext: result.sinceContext,
        autoFix: result.autoFix,
        dryRun: result.dryRun,
        cancelled: result.cancelled,
        fixCount: view.fixCount,
        keysReviewed: view.keysReviewed,
        issuesFound: view.issuesFound,
        fixesApplied: view.fixesApplied,
        filesChanged: view.filesChanged,
        targetLocales: view.targetLocales,
        model: view.model,
        writtenFiles: result.writtenFiles,
        removed: result.removed,
        skipped: result.skipped,
        reports: result.reports,
      },
      null,
      2,
    ),
  );
}

function emitOutput(result: ReviewResult, options: { json: boolean; model: string }): void {
  if (options.json) {
    printJson(result, options.model);
    return;
  }
  const instance = render(<ReviewReport result={result} model={options.model} />);
  instance.unmount();
}

function exitFromReview(result: ReviewResult): number {
  return result.ok ? 0 : 1;
}

async function writeReviewFixes(
  result: ReviewResult,
  options: { cwd: string },
): Promise<ReviewResult> {
  const writtenFiles = await writeTranslatedReports(
    result.reports.map((report) => ({
      locale: report.locale,
      filePath: report.filePath,
      translated: report.fixes,
      skipped: [],
      incompletePaths: [],
      unexpectedPaths: [],
      placeholderWarnings: [],
    })),
    { allowedDir: path.resolve(options.cwd, result.messagesDir) },
  );
  return withReviewFixesApplied(result, writtenFiles);
}

function resolveOpenAiClients(options: {
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  autoFix: boolean;
  reviewLocale?: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
}): {
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
} {
  const shared = {
    model: options.model,
    baseUrl: options.baseUrl,
    headers: options.headers,
    env: options.env,
  };
  return {
    reviewLocale: options.reviewLocale ?? createOpenAiReviewer(shared),
    translateLocale: options.autoFix
      ? (options.translateLocale ?? createOpenAiTranslator(shared))
      : undefined,
  };
}

async function confirmAndApplyFixes(options: {
  result: ReviewResult;
  cwd: string;
  json: boolean;
  model: string;
  yes: boolean;
  confirm: ConfirmFn;
}): Promise<{ result: ReviewResult; exitCode: number }> {
  const fixCount = countReviewFixes(options.result);
  if (!options.json) {
    emitOutput(options.result, { json: false, model: options.model });
  }

  if (!options.yes) {
    const accepted = await options.confirm(
      `Write ${fixCount} fix(es) to ${options.result.reports.filter((report) => report.fixes.length > 0).length} locale file(s)?`,
    );
    if (!accepted) {
      emitOutput(
        { ...options.result, cancelled: true, dryRun: false, writtenFiles: [] },
        { json: options.json, model: options.model },
      );
      return { result: options.result, exitCode: exitFromReview(options.result) };
    }
  }

  const written = await writeReviewFixes(options.result, { cwd: options.cwd });
  emitOutput(written, { json: options.json, model: options.model });
  return { result: written, exitCode: exitFromReview(written) };
}

/**
 * Runs the alpha AI translate review command.
 */
export async function runTranslateReviewCommand(
  options: TranslateReviewCommandOptions,
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const autoFix = options.autoFix === true;
  const yes = options.yes === true;
  const json = options.json === true;
  const verbose = options.verbose === true;
  const confirm = options.confirm ?? promptConfirm;
  const env = options.env ?? process.env;
  const model = options.model ?? DEFAULT_OPENAI_TRANSLATE_MODEL;

  try {
    assertOpenAiApiKey(env);
  } catch (error) {
    if (error instanceof MissingOpenAiApiKeyError) {
      console.error(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }

  const noConfig = options.noConfig === true;
  const config = await loadConfig(cwd, {
    messagesDir: options.dir,
    baseLocale: options.base,
    noConfig,
  });
  const baseUrl = resolveOpenAiBaseUrl({
    baseUrl: options.baseUrl,
    configBaseUrl: config.openai?.baseUrl,
    env,
  });
  const progressWriter = createReviewProgressWriter({ model, verbose, json });
  const clients = resolveOpenAiClients({
    model,
    baseUrl,
    headers: config.openai?.headers,
    env,
    autoFix,
    reviewLocale: options.reviewLocale,
    translateLocale: options.translateLocale,
  });

  const result = await reviewTranslations({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
    since: options.since,
    autoFix,
    dryRun: true,
    noConfig,
    onProgress: progressWriter.onProgress,
    reviewLocale: clients.reviewLocale,
    translateLocale: clients.translateLocale,
  });
  progressWriter.finish();

  const fixCount = countReviewFixes(result);
  if (!autoFix || fixCount === 0) {
    emitOutput(result, { json, model });
    return exitFromReview(result);
  }

  const applied = await confirmAndApplyFixes({
    result,
    cwd,
    json,
    model,
    yes,
    confirm,
  });
  return applied.exitCode;
}
