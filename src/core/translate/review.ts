//* Libraries imports
import path from "node:path";

//* Local imports
import { loadConfig } from "../config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../messages/load.ts";
import { collectTranslationExamples } from "./collect.ts";
import { chunkItems, mapWithConcurrency, resolveTranslateConcurrency } from "./pool.ts";
import { createProgressAccumulator } from "./progress.ts";
import { buildTranslatePrompt } from "./prompt.ts";
import { buildReviewPrompt } from "./review-prompt.ts";
import { validateSubmittedReviews, type AcceptedReview } from "./review-schema.ts";
import {
  resolveReviewScope,
  type ReviewChangeSource,
  type ReviewRemovedPath,
  type ReviewScopeSkipped,
  type ReviewSinceContext,
  type ReviewTarget,
} from "./review-scope.ts";
import { validateSubmittedTranslations, type PlaceholderWarning } from "./schema.ts";
import {
  DEFAULT_TRANSLATE_CHUNK_SIZE,
  type TranslateLocaleFn,
  type TranslatedItem,
} from "./translate.ts";
import { writeTranslatedReports } from "./write-reports.ts";

//* Types imports
import type { ConfigFlags } from "../config/schema.ts";
import type { GitRunner } from "../git/run.ts";
import type { LocaleMessages } from "../types.ts";
import type { TranslationExample } from "./collect.ts";
import type { TranslateProgressAccumulator, TranslateProgressFn } from "./progress.ts";
import type { ReviewLocaleFn } from "./review-openai.ts";

export type {
  ReviewProgressEvent,
  ReviewProgressFn,
  ReviewProgressStartEvent,
  ReviewProgressUpdateEvent,
} from "./progress.ts";

export type ReviewItemVerdict = "ok" | "wrong" | "missing";

export type ReviewItemResult = {
  locale: string;
  path: string;
  verdict: ReviewItemVerdict;
  baseValue: string;
  localeValue?: string;
  reason?: string;
  suggestedValue?: string;
  changeSources: ReviewChangeSource[];
};

export type LocaleReviewReport = {
  locale: string;
  filePath: string;
  items: ReviewItemResult[];
  fixes: TranslatedItem[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  missingSuggestedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

export type ReviewResult = {
  ok: boolean;
  baseLocale: string;
  messagesDir: string;
  since: string | null;
  sinceContext: ReviewSinceContext | null;
  autoFix: boolean;
  dryRun: boolean;
  cancelled: boolean;
  reports: LocaleReviewReport[];
  removed: ReviewRemovedPath[];
  skipped: ReviewScopeSkipped[];
  writtenFiles: string[];
};

export type ReviewTranslationsOptions = ConfigFlags & {
  cwd?: string;
  locales?: string[];
  since?: string;
  autoFix?: boolean;
  dryRun?: boolean;
  chunkSize?: number;
  concurrency?: number;
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
  onProgress?: TranslateProgressFn;
  runGit?: GitRunner;
  loadWorkingTree?: () => Promise<LocaleMessages[]>;
  loadAtRef?: (ref: string) => Promise<LocaleMessages[]>;
};

type ReviewChunkOutcome = {
  items: ReviewItemResult[];
  fixes: TranslatedItem[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  missingSuggestedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

type ReviewApiWorkItem =
  | {
      kind: "review";
      localeId: string;
      chunk: ReviewTarget[];
    }
  | {
      kind: "translate-missing";
      localeId: string;
      chunk: ReviewTarget[];
      examples: TranslationExample[];
    };

function emptyReviewChunkOutcome(): ReviewChunkOutcome {
  return {
    items: [],
    fixes: [],
    incompletePaths: [],
    unexpectedPaths: [],
    missingSuggestedPaths: [],
    placeholderWarnings: [],
  };
}

function mergeReviewChunkOutcomes(parts: ReviewChunkOutcome[]): ReviewChunkOutcome {
  const merged = emptyReviewChunkOutcome();
  for (const part of parts) {
    merged.items.push(...part.items);
    merged.fixes.push(...part.fixes);
    merged.incompletePaths.push(...part.incompletePaths);
    merged.unexpectedPaths.push(...part.unexpectedPaths);
    merged.missingSuggestedPaths.push(...part.missingSuggestedPaths);
    merged.placeholderWarnings.push(...part.placeholderWarnings);
  }
  return merged;
}

function groupTargetsByLocale(targets: ReviewTarget[]): Map<string, ReviewTarget[]> {
  const grouped = new Map<string, ReviewTarget[]>();
  for (const target of targets) {
    const current = grouped.get(target.locale) ?? [];
    current.push(target);
    grouped.set(target.locale, current);
  }
  return grouped;
}

function sortItems(items: ReviewItemResult[]): ReviewItemResult[] {
  return [...items].sort((a, b) => a.path.localeCompare(b.path));
}

function sortFixes(fixes: TranslatedItem[]): TranslatedItem[] {
  return [...fixes].sort((a, b) => a.path.localeCompare(b.path));
}

function acceptedReviewToItem(
  accepted: AcceptedReview,
  target: ReviewTarget,
  targetLocale: string,
): ReviewItemResult {
  const item: ReviewItemResult = {
    locale: targetLocale,
    path: accepted.path,
    verdict: accepted.verdict,
    baseValue: target.baseValue,
    localeValue: target.localeValue,
    changeSources: target.changeSources,
  };
  if (accepted.verdict === "wrong") {
    if (accepted.reason !== undefined) {
      item.reason = accepted.reason;
    }
    if (accepted.suggestedValue !== undefined) {
      item.suggestedValue = accepted.suggestedValue;
    }
  }
  return item;
}

function maybeAutoFixFromReview(
  accepted: AcceptedReview,
  target: ReviewTarget,
  autoFix: boolean,
): TranslatedItem | null {
  if (!autoFix || accepted.verdict !== "wrong" || accepted.suggestedValue === undefined) {
    return null;
  }
  return {
    path: accepted.path,
    value: accepted.suggestedValue,
    baseValue: target.baseValue,
  };
}

async function reviewPresentChunk(options: {
  baseLocale: string;
  targetLocale: string;
  chunk: ReviewTarget[];
  autoFix: boolean;
  reviewLocale: ReviewLocaleFn;
}): Promise<ReviewChunkOutcome> {
  const items: ReviewItemResult[] = [];
  const fixes: TranslatedItem[] = [];
  const promptItems = options.chunk.map((target) => ({
    path: target.path,
    baseValue: target.baseValue,
    localeValue: target.localeValue ?? "",
  }));
  const submitted = await options.reviewLocale({
    baseLocale: options.baseLocale,
    targetLocale: options.targetLocale,
    items: promptItems,
    prompt: buildReviewPrompt({
      baseLocale: options.baseLocale,
      targetLocale: options.targetLocale,
      items: promptItems,
    }),
  });

  const targetByPath = new Map(options.chunk.map((target) => [target.path, target] as const));
  const validated = validateSubmittedReviews({
    allowedPaths: new Set(options.chunk.map((target) => target.path)),
    baseValues: new Map(options.chunk.map((target) => [target.path, target.baseValue] as const)),
    requireSuggestedValue: options.autoFix,
    submitted,
  });

  for (const accepted of validated.accepted) {
    const target = targetByPath.get(accepted.path);
    if (!target) {
      continue;
    }
    items.push(acceptedReviewToItem(accepted, target, options.targetLocale));
    const fix = maybeAutoFixFromReview(accepted, target, options.autoFix);
    if (fix !== null) {
      fixes.push(fix);
    }
  }

  return {
    items,
    fixes,
    incompletePaths: validated.missingPaths,
    unexpectedPaths: validated.unexpectedPaths,
    missingSuggestedPaths: validated.missingSuggestedPaths,
    placeholderWarnings: validated.placeholderWarnings,
  };
}

async function translateMissingChunk(options: {
  baseLocale: string;
  targetLocale: string;
  chunk: ReviewTarget[];
  examples: TranslationExample[];
  translateLocale: TranslateLocaleFn;
}): Promise<ReviewChunkOutcome> {
  const items: ReviewItemResult[] = options.chunk.map((target) => ({
    locale: options.targetLocale,
    path: target.path,
    verdict: "missing" as const,
    baseValue: target.baseValue,
    changeSources: target.changeSources,
  }));

  const missingPayload = options.chunk.map((target) => ({
    path: target.path,
    baseValue: target.baseValue,
  }));
  const prompt = buildTranslatePrompt({
    baseLocale: options.baseLocale,
    targetLocale: options.targetLocale,
    missing: missingPayload,
    examples: options.examples,
  });

  const submitted = await options.translateLocale({
    baseLocale: options.baseLocale,
    targetLocale: options.targetLocale,
    missing: missingPayload,
    examples: options.examples,
    prompt,
  });

  const allowedPaths = new Set(options.chunk.map((target) => target.path));
  const baseValues = new Map(
    options.chunk.map((target) => [target.path, target.baseValue] as const),
  );
  const validated = validateSubmittedTranslations({
    allowedPaths,
    baseValues,
    submitted,
  });

  const fixes: TranslatedItem[] = [];
  for (const accepted of validated.accepted) {
    const baseValue = baseValues.get(accepted.path) ?? "";
    fixes.push({
      path: accepted.path,
      value: accepted.value,
      baseValue,
    });

    const item = items.find((entry) => entry.path === accepted.path);
    if (item) {
      item.suggestedValue = accepted.value;
    }
  }

  return {
    items,
    fixes,
    incompletePaths: validated.missingPaths,
    unexpectedPaths: validated.unexpectedPaths,
    missingSuggestedPaths: [],
    placeholderWarnings: validated.placeholderWarnings,
  };
}

function finalizeLocaleReviewReport(options: {
  localeId: string;
  filePath: string;
  outcome: ReviewChunkOutcome;
}): LocaleReviewReport {
  return {
    locale: options.localeId,
    filePath: options.filePath,
    items: sortItems(options.outcome.items),
    fixes: sortFixes(options.outcome.fixes),
    incompletePaths: [...new Set(options.outcome.incompletePaths)].sort(),
    unexpectedPaths: [...new Set(options.outcome.unexpectedPaths)].sort(),
    missingSuggestedPaths: [...new Set(options.outcome.missingSuggestedPaths)].sort(),
    placeholderWarnings: [...options.outcome.placeholderWarnings].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  };
}

function reportHasStructuralFailures(report: LocaleReviewReport): boolean {
  return (
    report.incompletePaths.length > 0 ||
    report.unexpectedPaths.length > 0 ||
    report.missingSuggestedPaths.length > 0
  );
}

function itemIsResolved(
  report: LocaleReviewReport,
  item: ReviewItemResult,
  wroteFixes: boolean,
): boolean {
  if (item.verdict === "ok") {
    return true;
  }
  return wroteFixes && report.fixes.some((fix) => fix.path === item.path);
}

function computeOk(reports: LocaleReviewReport[], wroteFixes: boolean): boolean {
  return reports.every(
    (report) =>
      !reportHasStructuralFailures(report) &&
      report.items.every((item) => itemIsResolved(report, item, wroteFixes)),
  );
}

/**
 * Returns a result marked as written with ok recomputed after applying fixes.
 */
export function withReviewFixesApplied(result: ReviewResult, writtenFiles: string[]): ReviewResult {
  return {
    ...result,
    dryRun: false,
    cancelled: false,
    writtenFiles,
    ok: computeOk(result.reports, true),
  };
}

export function countReviewFixes(result: ReviewResult): number {
  return result.reports.reduce((total, report) => total + report.fixes.length, 0);
}

function collectReviewWork(options: {
  locales: string[];
  targetsByLocale: Map<string, ReviewTarget[]>;
  localeById: Map<string, LocaleMessages>;
  base: LocaleMessages;
  chunkSize: number;
  autoFix: boolean;
  translateLocale?: TranslateLocaleFn;
}): {
  workItems: ReviewApiWorkItem[];
  missingWithoutFixByLocale: Map<string, ReviewTarget[]>;
} {
  const workItems: ReviewApiWorkItem[] = [];
  const missingWithoutFixByLocale = new Map<string, ReviewTarget[]>();

  for (const localeId of options.locales) {
    const targets = options.targetsByLocale.get(localeId) ?? [];
    const missing = targets.filter((target) => target.localeValue === undefined);
    const present = targets.filter((target) => target.localeValue !== undefined);

    for (const chunk of chunkItems(present, options.chunkSize)) {
      workItems.push({ kind: "review", localeId, chunk });
    }

    if (missing.length === 0) {
      continue;
    }

    enqueueMissingReviewWork({
      localeId,
      missing,
      locale: options.localeById.get(localeId),
      base: options.base,
      chunkSize: options.chunkSize,
      autoFix: options.autoFix,
      translateLocale: options.translateLocale,
      workItems,
      missingWithoutFixByLocale,
    });
  }

  return { workItems, missingWithoutFixByLocale };
}

function enqueueMissingReviewWork(options: {
  localeId: string;
  missing: ReviewTarget[];
  locale: LocaleMessages | undefined;
  base: LocaleMessages;
  chunkSize: number;
  autoFix: boolean;
  translateLocale?: TranslateLocaleFn;
  workItems: ReviewApiWorkItem[];
  missingWithoutFixByLocale: Map<string, ReviewTarget[]>;
}): void {
  if (!options.autoFix) {
    options.missingWithoutFixByLocale.set(options.localeId, options.missing);
    return;
  }

  if (options.translateLocale === undefined) {
    throw new Error(
      "translateLocale is required when auto-fixing missing translations during review",
    );
  }
  if (options.locale === undefined) {
    throw new Error(`Locale file not found in working tree: ${options.localeId}.json`);
  }

  const examples = collectTranslationExamples({
    base: options.base,
    locale: options.locale,
    limit: 8,
  });
  for (const chunk of chunkItems(options.missing, options.chunkSize)) {
    options.workItems.push({
      kind: "translate-missing",
      localeId: options.localeId,
      chunk,
      examples,
    });
  }
}

async function runReviewChunk(options: {
  item: ReviewApiWorkItem;
  baseLocale: string;
  autoFix: boolean;
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
}): Promise<ReviewChunkOutcome> {
  if (options.item.kind === "review") {
    return reviewPresentChunk({
      baseLocale: options.baseLocale,
      targetLocale: options.item.localeId,
      chunk: options.item.chunk,
      autoFix: options.autoFix,
      reviewLocale: options.reviewLocale,
    });
  }

  const translateLocale = options.translateLocale;
  if (translateLocale === undefined) {
    throw new Error(
      "translateLocale is required when auto-fixing missing translations during review",
    );
  }

  return translateMissingChunk({
    baseLocale: options.baseLocale,
    targetLocale: options.item.localeId,
    chunk: options.item.chunk,
    examples: options.item.examples,
    translateLocale,
  });
}

async function runReviewWorkPool(options: {
  workItems: ReviewApiWorkItem[];
  concurrency: number;
  baseLocale: string;
  autoFix: boolean;
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
  progress: TranslateProgressAccumulator;
}): Promise<Map<string, ReviewChunkOutcome[]>> {
  const chunkResults = await mapWithConcurrency({
    items: options.workItems,
    concurrency: options.concurrency,
    mapper: async (item) => {
      const result = await runReviewChunk({
        item,
        baseLocale: options.baseLocale,
        autoFix: options.autoFix,
        reviewLocale: options.reviewLocale,
        translateLocale: options.translateLocale,
      });
      return { localeId: item.localeId, result };
    },
    onItemComplete: ({ item, inFlight }) => {
      options.progress.completeChunk({
        locale: item.localeId,
        phase: item.kind === "review" ? "review" : "translate-missing",
        chunkPaths: item.chunk.map((target) => target.path),
        inFlight,
      });
    },
  });

  const outcomesByLocale = new Map<string, ReviewChunkOutcome[]>();
  for (const { localeId, result } of chunkResults) {
    const parts = outcomesByLocale.get(localeId) ?? [];
    parts.push(result);
    outcomesByLocale.set(localeId, parts);
  }
  return outcomesByLocale;
}

function missingItemsWithoutFix(localeId: string, missing: ReviewTarget[]): ReviewItemResult[] {
  return missing.map((target) => ({
    locale: localeId,
    path: target.path,
    verdict: "missing" as const,
    baseValue: target.baseValue,
    changeSources: target.changeSources,
  }));
}

function appendMissingWithoutFix(options: {
  outcomesByLocale: Map<string, ReviewChunkOutcome[]>;
  missingWithoutFixByLocale: Map<string, ReviewTarget[]>;
  progress: TranslateProgressAccumulator;
}): void {
  for (const [localeId, missing] of options.missingWithoutFixByLocale) {
    const parts = options.outcomesByLocale.get(localeId) ?? [];
    parts.push({
      ...emptyReviewChunkOutcome(),
      items: missingItemsWithoutFix(localeId, missing),
    });
    options.outcomesByLocale.set(localeId, parts);
    options.progress.completeChunk({
      locale: localeId,
      phase: "review",
      chunkPaths: missing.map((target) => target.path),
      inFlight: 0,
    });
  }
}

function assembleLocaleReviewReports(options: {
  locales: string[];
  localeById: Map<string, LocaleMessages>;
  messagesDir: string;
  outcomesByLocale: Map<string, ReviewChunkOutcome[]>;
}): LocaleReviewReport[] {
  return options.locales.map((localeId) => {
    const locale = options.localeById.get(localeId);
    return finalizeLocaleReviewReport({
      localeId,
      filePath: locale?.filePath ?? path.join(options.messagesDir, `${localeId}.json`),
      outcome: mergeReviewChunkOutcomes(options.outcomesByLocale.get(localeId) ?? []),
    });
  });
}

async function writeReviewReportsIfNeeded(options: {
  reports: LocaleReviewReport[];
  autoFix: boolean;
  dryRun: boolean;
  messagesDir: string;
}): Promise<string[]> {
  if (!options.autoFix || options.dryRun) {
    return [];
  }

  return writeTranslatedReports(
    options.reports.map((report) => ({
      locale: report.locale,
      filePath: report.filePath,
      translated: report.fixes,
      pending: [],
      skipped: [],
      incompletePaths: [],
      unexpectedPaths: [],
      placeholderWarnings: [],
    })),
    { allowedDir: options.messagesDir },
  );
}

/**
 * Reviews locale translations (optionally scoped by git --since) using an injected reviewer.
 */
export async function reviewTranslations(
  options: ReviewTranslationsOptions,
): Promise<ReviewResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    strictExtra: options.strictExtra,
    noConfig: options.noConfig,
  });
  const messagesDir = path.resolve(cwd, config.messagesDir);
  const autoFix = options.autoFix === true;
  const dryRun = options.dryRun === true;
  const chunkSize = options.chunkSize ?? DEFAULT_TRANSLATE_CHUNK_SIZE;
  const concurrency = resolveTranslateConcurrency(
    options.concurrency ?? config.translate?.concurrency,
  );

  const workingTree =
    options.loadWorkingTree !== undefined
      ? await options.loadWorkingTree()
      : await loadMessagesDir(messagesDir);
  const { base, others } = splitBaseAndLocales(workingTree, config.baseLocale);
  const localeById = new Map(others.map((locale) => [locale.locale, locale]));

  const scope = await resolveReviewScope({
    cwd,
    messagesDir: config.messagesDir,
    baseLocale: config.baseLocale,
    since: options.since,
    locales: options.locales,
    runGit: options.runGit,
    loadWorkingTree: options.loadWorkingTree ?? (async () => workingTree),
    loadAtRef: options.loadAtRef,
  });

  const targetsByLocale = groupTargetsByLocale(scope.targets);
  const locales = [...targetsByLocale.keys()].sort();

  options.onProgress?.({
    type: "start",
    baseLocale: config.baseLocale,
    messagesDir: config.messagesDir,
    locales,
    totalKeys: scope.targets.length,
    since: scope.since,
  });

  const { workItems, missingWithoutFixByLocale } = collectReviewWork({
    locales,
    targetsByLocale,
    localeById,
    base,
    chunkSize,
    autoFix,
    translateLocale: options.translateLocale,
  });
  const progress = createProgressAccumulator({
    totalKeys: scope.targets.length,
    onProgress: options.onProgress,
  });
  const outcomesByLocale = await runReviewWorkPool({
    workItems,
    concurrency,
    baseLocale: config.baseLocale,
    autoFix,
    reviewLocale: options.reviewLocale,
    translateLocale: options.translateLocale,
    progress,
  });
  appendMissingWithoutFix({
    outcomesByLocale,
    missingWithoutFixByLocale,
    progress,
  });
  const reports = assembleLocaleReviewReports({
    locales,
    localeById,
    messagesDir,
    outcomesByLocale,
  });
  const shouldWrite = autoFix && !dryRun;
  const writtenFiles = await writeReviewReportsIfNeeded({
    reports,
    autoFix,
    dryRun,
    messagesDir,
  });

  return {
    ok: computeOk(reports, shouldWrite),
    baseLocale: config.baseLocale,
    messagesDir: config.messagesDir,
    since: scope.since,
    sinceContext: scope.sinceContext,
    autoFix,
    dryRun,
    cancelled: false,
    reports,
    removed: scope.removed,
    skipped: scope.skipped,
    writtenFiles,
  };
}
