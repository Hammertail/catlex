//* Libraries imports
import path from "node:path";

//* Local imports
import { loadConfig } from "../config/load.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../messages/load.ts";
import { applyTranslationsToTree } from "../messages/unflatten.ts";
import { writeLocaleMessages } from "../messages/write.ts";
import { collectMissingTranslations, collectTranslationExamples } from "./collect.ts";
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

export const DEFAULT_TRANSLATE_CHUNK_SIZE = 50;

export type TranslatedItem = {
  path: string;
  value: string;
  baseValue: string;
};

export type LocaleTranslateReport = {
  locale: string;
  filePath: string;
  translated: TranslatedItem[];
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
  dryRun?: boolean;
  chunkSize?: number;
  translateLocale: TranslateLocaleFn;
  writeLocale?: (filePath: string, tree: LocaleMessages["tree"]) => Promise<void>;
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

async function translateLocaleChunks(options: {
  baseLocale: string;
  targetLocale: string;
  base: LocaleMessages;
  locale: LocaleMessages;
  missing: MissingTranslation[];
  chunkSize: number;
  translateLocale: TranslateLocaleFn;
}): Promise<LocaleTranslationAccumulator> {
  const translated: TranslatedItem[] = [];
  const incompletePaths: string[] = [];
  const unexpectedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];

  if (options.missing.length === 0) {
    return { translated, incompletePaths, unexpectedPaths, placeholderWarnings };
  }

  const examples = collectTranslationExamples({
    base: options.base,
    locale: options.locale,
    limit: 8,
  });

  for (const chunk of chunkItems(options.missing, options.chunkSize)) {
    const missingPayload = chunk.map((item) => ({
      path: item.path,
      baseValue: item.baseValue,
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

    const allowedPaths = new Set(chunk.map((item) => item.path));
    const baseValues = new Map(chunk.map((item) => [item.path, item.baseValue] as const));
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
  }

  return { translated, incompletePaths, unexpectedPaths, placeholderWarnings };
}

function finalizeLocaleReport(options: {
  localeId: string;
  filePath: string;
  skipped: SkippedTranslation[];
  accumulator: LocaleTranslationAccumulator;
}): LocaleTranslateReport {
  const translated = [...options.accumulator.translated].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const incompletePaths = [...new Set(options.accumulator.incompletePaths)].sort();
  const unexpectedPaths = [...new Set(options.accumulator.unexpectedPaths)].sort();
  const placeholderWarnings = [...options.accumulator.placeholderWarnings].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  return {
    locale: options.localeId,
    filePath: options.filePath,
    translated,
    skipped: options.skipped,
    incompletePaths,
    unexpectedPaths,
    placeholderWarnings,
  };
}

/**
 * Translates missing string keys using an injected per-locale translator.
 */
export async function translateMissingKeys(
  options: TranslateMissingKeysOptions,
): Promise<TranslateResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd, {
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    strictExtra: options.strictExtra,
  });
  const messagesDir = path.resolve(cwd, config.messagesDir);
  const dryRun = options.dryRun === true;
  const chunkSize = options.chunkSize ?? DEFAULT_TRANSLATE_CHUNK_SIZE;
  const writeLocale = options.writeLocale ?? writeLocaleMessages;

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

  const reports: LocaleTranslateReport[] = [];
  const writtenFiles: string[] = [];

  for (const localeId of localeIds) {
    const locale = localeById.get(localeId);
    if (!locale) {
      continue;
    }

    const accumulator = await translateLocaleChunks({
      baseLocale: config.baseLocale,
      targetLocale: localeId,
      base,
      locale,
      missing: missingByLocale.get(localeId) ?? [],
      chunkSize,
      translateLocale: options.translateLocale,
    });

    const report = finalizeLocaleReport({
      localeId,
      filePath: locale.filePath,
      skipped: skippedByLocale.get(localeId) ?? [],
      accumulator,
    });
    reports.push(report);

    if (!dryRun && report.translated.length > 0) {
      const nextTree = applyTranslationsToTree(
        locale.tree,
        report.translated.map((item) => ({ path: item.path, value: item.value })),
      );
      await writeLocale(locale.filePath, nextTree);
      writtenFiles.push(locale.filePath);
    }
  }

  return {
    baseLocale: config.baseLocale,
    messagesDir: config.messagesDir,
    reports,
    writtenFiles,
    cancelled: false,
    dryRun,
  };
}
