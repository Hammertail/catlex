//* Libraries imports
import path from "node:path";

//* Local imports
import { loadConfig } from "../config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../messages/load.ts";
import { applyTranslationsToTree } from "../messages/unflatten.ts";
import { writeLocaleMessages } from "../messages/write.ts";
import { collectMissingTranslations, collectTranslationExamples } from "./collect.ts";
import { chunkItems, mapWithConcurrency, resolveTranslateConcurrency } from "./pool.ts";
import { createProgressAccumulator } from "./progress.ts";
import { buildTranslatePrompt } from "./prompt.ts";
import {
  validateSubmittedTranslations,
  type PlaceholderWarning,
  type SubmitTranslationsInput,
} from "./schema.ts";

//* Types imports
import type { ConfigFlags } from "../config/schema.ts";
import type { LocaleMessages } from "../types.ts";
import type { MissingTranslation, SkippedTranslation, TranslationExample } from "./collect.ts";
import type { TranslateProgressFn } from "./progress.ts";

export { DEFAULT_TRANSLATE_CONCURRENCY } from "./pool.ts";

export const DEFAULT_TRANSLATE_CHUNK_SIZE = 50;

export type TranslatedItem = {
  path: string;
  value: string;
  baseValue: string;
};

export type PendingTranslation = {
  path: string;
  baseValue: string;
};

export type LocaleTranslateReport = {
  locale: string;
  filePath: string;
  translated: TranslatedItem[];
  pending: PendingTranslation[];
  skipped: SkippedTranslation[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

export type TranslateResult = {
  baseLocale: string;
  messagesDir: string;
  reports: LocaleTranslateReport[];
  writtenFiles: string[];
  cancelled: boolean;
  dryRun: boolean;
};

export type TranslateLocaleInput = {
  baseLocale: string;
  targetLocale: string;
  missing: Array<{ path: string; baseValue: string }>;
  examples: TranslationExample[];
  prompt: string;
};

export type TranslateLocaleFn = (input: TranslateLocaleInput) => Promise<SubmitTranslationsInput>;

export type TranslateMissingKeysOptions = ConfigFlags & {
  cwd?: string;
  locales?: string[];
  /**
   * Plan-only mode: collect missing/skipped keys without calling the translator
   * or writing files. Does not incur API usage.
   */
  dryRun?: boolean;
  /**
   * Call the translator but do not write locale files. Used by the CLI to
   * separate proposal generation from the interactive write confirmation.
   */
  skipWrite?: boolean;
  chunkSize?: number;
  concurrency?: number;
  translateLocale: TranslateLocaleFn;
  onProgress?: TranslateProgressFn;
  writeLocale?: (filePath: string, tree: LocaleMessages["tree"]) => Promise<void>;
};

function groupByLocale<T extends { locale: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const current = grouped.get(item.locale) ?? [];
    current.push(item);
    grouped.set(item.locale, current);
  }

  return grouped;
}

type LocaleTranslationAccumulator = {
  translated: TranslatedItem[];
  incompletePaths: string[];
  unexpectedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

type TranslateWorkItem = {
  localeId: string;
  chunk: MissingTranslation[];
  examples: TranslationExample[];
};

function emptyAccumulator(): LocaleTranslationAccumulator {
  return {
    translated: [],
    incompletePaths: [],
    unexpectedPaths: [],
    placeholderWarnings: [],
  };
}

function mergeAccumulators(parts: LocaleTranslationAccumulator[]): LocaleTranslationAccumulator {
  const merged = emptyAccumulator();
  for (const part of parts) {
    merged.translated.push(...part.translated);
    merged.incompletePaths.push(...part.incompletePaths);
    merged.unexpectedPaths.push(...part.unexpectedPaths);
    merged.placeholderWarnings.push(...part.placeholderWarnings);
  }
  return merged;
}

async function translateOneChunk(options: {
  baseLocale: string;
  targetLocale: string;
  chunk: MissingTranslation[];
  examples: TranslationExample[];
  translateLocale: TranslateLocaleFn;
}): Promise<LocaleTranslationAccumulator> {
  const translated: TranslatedItem[] = [];
  const incompletePaths: string[] = [];
  const unexpectedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];
  const missingPayload = options.chunk.map((item) => ({
    path: item.path,
    baseValue: item.baseValue,
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

  const allowedPaths = new Set(options.chunk.map((item) => item.path));
  const baseValues = new Map(options.chunk.map((item) => [item.path, item.baseValue] as const));
  const validated = validateSubmittedTranslations({
    allowedPaths,
    baseValues,
    submitted: {
      locale: submitted.locale,
      translations: submitted.translations,
    },
  });

  for (const item of validated.accepted) {
    translated.push({
      path: item.path,
      value: item.value,
      baseValue: baseValues.get(item.path) ?? "",
    });
  }

  incompletePaths.push(...validated.missingPaths);
  unexpectedPaths.push(...validated.unexpectedPaths);
  placeholderWarnings.push(...validated.placeholderWarnings);

  return { translated, incompletePaths, unexpectedPaths, placeholderWarnings };
}

function finalizeLocaleReport(options: {
  localeId: string;
  filePath: string;
  skipped: SkippedTranslation[];
  pending: PendingTranslation[];
  accumulator: LocaleTranslationAccumulator;
}): LocaleTranslateReport {
  const translated = [...options.accumulator.translated].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const pending = [...options.pending].sort((a, b) => a.path.localeCompare(b.path));
  const incompletePaths = [...new Set(options.accumulator.incompletePaths)].sort();
  const unexpectedPaths = [...new Set(options.accumulator.unexpectedPaths)].sort();
  const placeholderWarnings = [...options.accumulator.placeholderWarnings].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  return {
    locale: options.localeId,
    filePath: options.filePath,
    translated,
    pending,
    skipped: options.skipped,
    incompletePaths,
    unexpectedPaths,
    placeholderWarnings,
  };
}

function pendingFromMissing(missing: MissingTranslation[]): PendingTranslation[] {
  return missing.map((item) => ({ path: item.path, baseValue: item.baseValue }));
}

function groupChunkResultsByLocale<T>(
  chunkResults: Array<{ localeId: string; result: T }>,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const { localeId, result } of chunkResults) {
    const parts = grouped.get(localeId) ?? [];
    parts.push(result);
    grouped.set(localeId, parts);
  }
  return grouped;
}

function buildTranslateWorkItems(options: {
  localeIds: string[];
  localeById: Map<string, LocaleMessages>;
  missingByLocale: Map<string, MissingTranslation[]>;
  base: LocaleMessages;
  chunkSize: number;
}): TranslateWorkItem[] {
  const workItems: TranslateWorkItem[] = [];
  for (const localeId of options.localeIds) {
    const locale = options.localeById.get(localeId);
    const missing = options.missingByLocale.get(localeId) ?? [];
    if (!locale || missing.length === 0) {
      continue;
    }
    const examples = collectTranslationExamples({
      base: options.base,
      locale,
      limit: 8,
    });
    for (const chunk of chunkItems(missing, options.chunkSize)) {
      workItems.push({ localeId, chunk, examples });
    }
  }
  return workItems;
}

async function runTranslateWorkPool(options: {
  workItems: TranslateWorkItem[];
  concurrency: number;
  baseLocale: string;
  messagesDir: string;
  locales: string[];
  translateLocale: TranslateLocaleFn;
  totalKeys: number;
  onProgress?: TranslateProgressFn;
}): Promise<Map<string, LocaleTranslationAccumulator[]>> {
  options.onProgress?.({
    type: "start",
    baseLocale: options.baseLocale,
    messagesDir: options.messagesDir,
    locales: options.locales,
    totalKeys: options.totalKeys,
    since: null,
  });

  const progress = createProgressAccumulator({
    totalKeys: options.totalKeys,
    onProgress: options.onProgress,
  });

  const chunkResults = await mapWithConcurrency({
    items: options.workItems,
    concurrency: options.concurrency,
    mapper: async (item) => {
      const result = await translateOneChunk({
        baseLocale: options.baseLocale,
        targetLocale: item.localeId,
        chunk: item.chunk,
        examples: item.examples,
        translateLocale: options.translateLocale,
      });
      return { localeId: item.localeId, result };
    },
    onItemComplete: ({ item, inFlight }) => {
      progress.completeChunk({
        locale: item.localeId,
        phase: "translate",
        chunkPaths: item.chunk.map((entry) => entry.path),
        inFlight,
      });
    },
  });

  return groupChunkResultsByLocale(chunkResults);
}

async function writeLocaleReportIfNeeded(options: {
  skipWrite: boolean;
  report: LocaleTranslateReport;
  locale: LocaleMessages;
  writeLocale: (filePath: string, tree: LocaleMessages["tree"]) => Promise<void>;
  writtenFiles: string[];
}): Promise<void> {
  if (options.skipWrite || options.report.translated.length === 0) {
    return;
  }

  const nextTree = applyTranslationsToTree(
    options.locale.tree,
    options.report.translated.map((item) => ({ path: item.path, value: item.value })),
  );
  await options.writeLocale(options.locale.filePath, nextTree);
  options.writtenFiles.push(options.locale.filePath);
}

async function finalizeAndWriteLocaleReports(options: {
  localeIds: string[];
  localeById: Map<string, LocaleMessages>;
  missingByLocale: Map<string, MissingTranslation[]>;
  skippedByLocale: Map<string, SkippedTranslation[]>;
  accumulatorsByLocale: Map<string, LocaleTranslationAccumulator[]>;
  dryRun: boolean;
  skipWrite: boolean;
  writeLocale: (filePath: string, tree: LocaleMessages["tree"]) => Promise<void>;
}): Promise<{ reports: LocaleTranslateReport[]; writtenFiles: string[] }> {
  const reports: LocaleTranslateReport[] = [];
  const writtenFiles: string[] = [];

  for (const localeId of options.localeIds) {
    const locale = options.localeById.get(localeId);
    if (!locale) {
      continue;
    }

    const missing = options.missingByLocale.get(localeId) ?? [];
    const parts = options.accumulatorsByLocale.get(localeId) ?? [];
    const accumulator = options.dryRun ? emptyAccumulator() : mergeAccumulators(parts);
    const report = finalizeLocaleReport({
      localeId,
      filePath: locale.filePath,
      skipped: options.skippedByLocale.get(localeId) ?? [],
      pending: options.dryRun ? pendingFromMissing(missing) : [],
      accumulator,
    });
    reports.push(report);

    await writeLocaleReportIfNeeded({
      skipWrite: options.skipWrite,
      report,
      locale,
      writeLocale: options.writeLocale,
      writtenFiles,
    });
  }

  return { reports, writtenFiles };
}

/**
 * Translates missing string keys using an injected per-locale translator.
 *
 * When `dryRun` is true, only the missing/skipped plan is collected — the
 * translator is not called and no files are written.
 */
export async function translateMissingKeys(
  options: TranslateMissingKeysOptions,
): Promise<TranslateResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    strictExtra: options.strictExtra,
    noConfig: options.noConfig,
  });
  const messagesDir = path.resolve(cwd, config.messagesDir);
  const dryRun = options.dryRun === true;
  const skipWrite = options.skipWrite === true || dryRun;
  const chunkSize = options.chunkSize ?? DEFAULT_TRANSLATE_CHUNK_SIZE;
  const concurrency = resolveTranslateConcurrency(
    options.concurrency ?? config.translate?.concurrency,
  );
  const writeLocale =
    options.writeLocale ??
    ((filePath, tree) => writeLocaleMessages(filePath, tree, { allowedDir: messagesDir }));

  const allLocales = await loadMessagesDir(messagesDir);
  const { base, others } = splitBaseAndLocales(allLocales, config.baseLocale);
  const collected = collectMissingTranslations({
    base,
    locales: others,
    localeFilter: options.locales,
  });

  const localeById = new Map(others.map((locale) => [locale.locale, locale]));
  const missingByLocale = groupByLocale(collected.missing);
  const skippedByLocale = groupByLocale(collected.skipped);
  const localeIds = [...new Set([...missingByLocale.keys(), ...skippedByLocale.keys()])].sort();

  const accumulatorsByLocale = dryRun
    ? new Map<string, LocaleTranslationAccumulator[]>()
    : await runTranslateWorkPool({
        workItems: buildTranslateWorkItems({
          localeIds,
          localeById,
          missingByLocale,
          base,
          chunkSize,
        }),
        concurrency,
        baseLocale: config.baseLocale,
        messagesDir: config.messagesDir,
        locales: localeIds,
        translateLocale: options.translateLocale,
        totalKeys: collected.missing.length,
        onProgress: options.onProgress,
      });

  const { reports, writtenFiles } = await finalizeAndWriteLocaleReports({
    localeIds,
    localeById,
    missingByLocale,
    skippedByLocale,
    accumulatorsByLocale,
    dryRun,
    skipWrite,
    writeLocale,
  });

  return {
    baseLocale: config.baseLocale,
    messagesDir: config.messagesDir,
    reports,
    writtenFiles,
    cancelled: false,
    dryRun,
  };
}
