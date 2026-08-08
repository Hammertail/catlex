//* Libraries imports
import path from "node:path";
import { render } from "ink";

//* Local imports
import { ReviewReport } from "../ui/ReviewReport.tsx";
import { promptConfirm, type ConfirmFn } from "../ui/prompt-confirm.tsx";
import { REVIEW_ALPHA_MESSAGE, buildReviewReportView } from "../ui/review-report-view.ts";
import { loadConfig } from "../../core/config/load.ts";
import {
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
  confirm?: ConfirmFn;
  reviewLocale?: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

function printJson(result: ReviewResult): void {
  const view = buildReviewReportView(result);
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

function emitOutput(result: ReviewResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  const instance = render(<ReviewReport result={result} />);
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
  const confirm = options.confirm ?? promptConfirm;
  const env = options.env ?? process.env;

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
  const headers = config.openai?.headers;

  let result = await reviewTranslations({
    cwd,
    messagesDir: options.dir,
    baseLocale: options.base,
    locales: options.locale,
    since: options.since,
    autoFix,
    dryRun: true,
    noConfig,
    reviewLocale:
      options.reviewLocale ??
      createOpenAiReviewer({
        model: options.model,
        baseUrl,
        headers,
        env,
      }),
    translateLocale: autoFix
      ? (options.translateLocale ??
        createOpenAiTranslator({
          model: options.model,
          baseUrl,
          headers,
          env,
        }))
      : undefined,
  });

  const fixCount = countReviewFixes(result);
  if (!autoFix || fixCount === 0) {
    emitOutput(result, json);
    return exitFromReview(result);
  }

  if (!json) {
    emitOutput(result, false);
  }

  if (!yes) {
    const accepted = await confirm(
      `Write ${fixCount} fix(es) to ${result.reports.filter((report) => report.fixes.length > 0).length} locale file(s)?`,
    );
    if (!accepted) {
      emitOutput({ ...result, cancelled: true, dryRun: false, writtenFiles: [] }, json);
      return exitFromReview(result);
    }
  }

  result = await writeReviewFixes(result, { cwd });
  emitOutput(result, json);
  return exitFromReview(result);
}
