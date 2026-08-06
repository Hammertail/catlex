//* Libraries imports
import path from "node:path";

//* Local imports
import { loadConfig } from "../config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../messages/load.ts";
import { collectTranslationExamples } from "./collect.ts";
import { buildTranslatePrompt } from "./prompt.ts";
import { buildReviewPrompt } from "./review-prompt.ts";
import { validateSubmittedReviews } from "./review-schema.ts";
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
import type { ReviewLocaleFn } from "./review-openai.ts";

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
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
  runGit?: GitRunner;
  loadWorkingTree?: () => Promise<LocaleMessages[]>;
  loadAtRef?: (ref: string) => Promise<LocaleMessages[]>;
};

function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
  accepted: {
    path: string;
    verdict: "ok" | "wrong";
    reason?: string;
    suggestedValue?: string;
  },
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
  if (accepted.reason !== undefined) {
    item.reason = accepted.reason;
  }
  if (accepted.suggestedValue !== undefined) {
    item.suggestedValue = accepted.suggestedValue;
  }
  return item;
}

function maybeAutoFixFromReview(
  accepted: { path: string; verdict: "ok" | "wrong"; suggestedValue?: string },
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

async function reviewPresentTargets(options: {
  baseLocale: string;
  targetLocale: string;
  present: ReviewTarget[];
  chunkSize: number;
  autoFix: boolean;
  reviewLocale: ReviewLocaleFn;
}): Promise<{
  items: ReviewItemResult[];
  fixes: TranslatedItem[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  missingSuggestedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
}> {
  const items: ReviewItemResult[] = [];
  const fixes: TranslatedItem[] = [];
  const incompletePaths: string[] = [];
  const unexpectedPaths: string[] = [];
  const missingSuggestedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];

  for (const chunk of chunkItems(options.present, options.chunkSize)) {
    const promptItems = chunk.map((target) => ({
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

    const targetByPath = new Map(chunk.map((target) => [target.path, target] as const));
    const validated = validateSubmittedReviews({
      allowedPaths: new Set(chunk.map((target) => target.path)),
      baseValues: new Map(chunk.map((target) => [target.path, target.baseValue] as const)),
      requireSuggestedValue: options.autoFix,
      submitted,
    });

    incompletePaths.push(...validated.missingPaths);
    unexpectedPaths.push(...validated.unexpectedPaths);
    missingSuggestedPaths.push(...validated.missingSuggestedPaths);
    placeholderWarnings.push(...validated.placeholderWarnings);

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
  }

  return {
    items,
    fixes,
    incompletePaths,
    unexpectedPaths,
    missingSuggestedPaths,
    placeholderWarnings,
  };
}

async function translateMissingTargets(options: {
  baseLocale: string;
  targetLocale: string;
  base: LocaleMessages;
  locale: LocaleMessages;
  missing: ReviewTarget[];
  chunkSize: number;
  translateLocale: TranslateLocaleFn;
}): Promise<{
  items: ReviewItemResult[];
  fixes: TranslatedItem[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
}> {
  const items: ReviewItemResult[] = options.missing.map((target) => ({
    locale: options.targetLocale,
    path: target.path,
    verdict: "missing" as const,
    baseValue: target.baseValue,
    changeSources: target.changeSources,
  }));

  const fixes: TranslatedItem[] = [];
  const incompletePaths: string[] = [];
  const unexpectedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];

  const examples = collectTranslationExamples({
    base: options.base,
    locale: options.locale,
    limit: 8,
  });

  for (const chunk of chunkItems(options.missing, options.chunkSize)) {
    const missingPayload = chunk.map((target) => ({
      path: target.path,
      baseValue: target.baseValue,
    }));
    const prompt = buildTranslatePrompt({
      baseLocale: options.baseLocale,
      targetLocale: options.targetLocale,
      missing: missingPayload,
      examples,
    });

    const submitted = await options.translateLocale({
      baseLocale: options.baseLocale,
      targetLocale: options.targetLocale,
      missing: missingPayload,
      examples,
      prompt,
    });

    const allowedPaths = new Set(chunk.map((target) => target.path));
    const baseValues = new Map(chunk.map((target) => [target.path, target.baseValue] as const));
    const validated = validateSubmittedTranslations({
      allowedPaths,
      baseValues,
      submitted,
    });

    incompletePaths.push(...validated.missingPaths);
    unexpectedPaths.push(...validated.unexpectedPaths);
    placeholderWarnings.push(...validated.placeholderWarnings);

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
  }

  return {
    items,
    fixes,
    incompletePaths,
    unexpectedPaths,
    placeholderWarnings,
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

async function buildLocaleReviewReport(options: {
  localeId: string;
  targets: ReviewTarget[];
  locale: LocaleMessages | undefined;
  filePath: string;
  base: LocaleMessages;
  baseLocale: string;
  autoFix: boolean;
  chunkSize: number;
  reviewLocale: ReviewLocaleFn;
  translateLocale?: TranslateLocaleFn;
}): Promise<LocaleReviewReport> {
  const missing = options.targets.filter((target) => target.localeValue === undefined);
  const present = options.targets.filter((target) => target.localeValue !== undefined);

  const items: ReviewItemResult[] = [];
  const fixes: TranslatedItem[] = [];
  const incompletePaths: string[] = [];
  const unexpectedPaths: string[] = [];
  const missingSuggestedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];

  if (present.length > 0) {
    const reviewed = await reviewPresentTargets({
      baseLocale: options.baseLocale,
      targetLocale: options.localeId,
      present,
      chunkSize: options.chunkSize,
      autoFix: options.autoFix,
      reviewLocale: options.reviewLocale,
    });
    items.push(...reviewed.items);
    fixes.push(...reviewed.fixes);
    incompletePaths.push(...reviewed.incompletePaths);
    unexpectedPaths.push(...reviewed.unexpectedPaths);
    missingSuggestedPaths.push(...reviewed.missingSuggestedPaths);
    placeholderWarnings.push(...reviewed.placeholderWarnings);
  }

  if (missing.length === 0) {
    return {
      locale: options.localeId,
      filePath: options.filePath,
      items: sortItems(items),
      fixes: sortFixes(fixes),
      incompletePaths: [...new Set(incompletePaths)].sort(),
      unexpectedPaths: [...new Set(unexpectedPaths)].sort(),
      missingSuggestedPaths: [...new Set(missingSuggestedPaths)].sort(),
      placeholderWarnings: [...placeholderWarnings].sort((a, b) => a.path.localeCompare(b.path)),
    };
  }

  if (!options.autoFix) {
    items.push(
      ...missing.map((target) => ({
        locale: options.localeId,
        path: target.path,
        verdict: "missing" as const,
        baseValue: target.baseValue,
        changeSources: target.changeSources,
      })),
    );
  } else {
    if (options.translateLocale === undefined) {
      throw new Error(
        "translateLocale is required when auto-fixing missing translations during review",
      );
    }
    if (options.locale === undefined) {
      throw new Error(`Locale file not found in working tree: ${options.localeId}.json`);
    }

    const translated = await translateMissingTargets({
      baseLocale: options.baseLocale,
      targetLocale: options.localeId,
      base: options.base,
      locale: options.locale,
      missing,
      chunkSize: options.chunkSize,
      translateLocale: options.translateLocale,
    });
    items.push(...translated.items);
    fixes.push(...translated.fixes);
    incompletePaths.push(...translated.incompletePaths);
    unexpectedPaths.push(...translated.unexpectedPaths);
    placeholderWarnings.push(...translated.placeholderWarnings);
  }

  return {
    locale: options.localeId,
    filePath: options.filePath,
    items: sortItems(items),
    fixes: sortFixes(fixes),
    incompletePaths: [...new Set(incompletePaths)].sort(),
    unexpectedPaths: [...new Set(unexpectedPaths)].sort(),
    missingSuggestedPaths: [...new Set(missingSuggestedPaths)].sort(),
    placeholderWarnings: [...placeholderWarnings].sort((a, b) => a.path.localeCompare(b.path)),
  };
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
  const reports: LocaleReviewReport[] = [];

  for (const localeId of [...targetsByLocale.keys()].sort()) {
    const locale = localeById.get(localeId);
    reports.push(
      await buildLocaleReviewReport({
        localeId,
        targets: targetsByLocale.get(localeId) ?? [],
        locale,
        filePath: locale?.filePath ?? path.join(messagesDir, `${localeId}.json`),
        base,
        baseLocale: config.baseLocale,
        autoFix,
        chunkSize,
        reviewLocale: options.reviewLocale,
        translateLocale: options.translateLocale,
      }),
    );
  }

  const shouldWrite = autoFix && !dryRun;
  const writtenFiles = shouldWrite
    ? await writeTranslatedReports(
        reports.map((report) => ({
          locale: report.locale,
          filePath: report.filePath,
          translated: report.fixes,
          skipped: [],
          incompletePaths: [],
          unexpectedPaths: [],
          placeholderWarnings: [],
        })),
      )
    : [];

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
