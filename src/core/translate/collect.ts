//* Local imports
import { compareFlatMessages } from "../messages/compare.ts";
import { sortByLocalePath } from "./locale-path.ts";

//* Types imports
import type { LocaleMessages } from "../types.ts";

export type MissingTranslation = {
  locale: string;
  path: string;
  baseValue: string;
};

export type SkippedTranslation = {
  locale: string;
  path: string;
  reason: "non-string";
  baseValue: unknown;
};

export type CollectMissingResult = {
  missing: MissingTranslation[];
  skipped: SkippedTranslation[];
};

export type TranslationExample = {
  path: string;
  baseValue: string;
  localeValue: string;
};

export type CollectMissingOptions = {
  base: LocaleMessages;
  locales: LocaleMessages[];
  localeFilter?: string[];
};

/**
 * Collects missing string translations and skips non-string missing leaves.
 */
export function collectMissingTranslations(options: CollectMissingOptions): CollectMissingResult {
  const filter = options.localeFilter === undefined ? null : new Set(options.localeFilter);

  const missing: MissingTranslation[] = [];
  const skipped: SkippedTranslation[] = [];

  for (const locale of options.locales) {
    if (filter !== null && !filter.has(locale.locale)) {
      continue;
    }

    const comparison = compareFlatMessages(options.base.flat, locale.flat);

    for (const path of comparison.missing) {
      const baseValue = options.base.flat.get(path);

      if (typeof baseValue === "string") {
        missing.push({
          locale: locale.locale,
          path,
          baseValue,
        });
        continue;
      }

      skipped.push({
        locale: locale.locale,
        path,
        reason: "non-string",
        baseValue,
      });
    }
  }

  return {
    missing: sortByLocalePath(missing),
    skipped: sortByLocalePath(skipped),
  };
}

export type CollectExamplesOptions = {
  base: LocaleMessages;
  locale: LocaleMessages;
  limit?: number;
};

/**
 * Collects existing string translation pairs for few-shot prompting.
 */
export function collectTranslationExamples(options: CollectExamplesOptions): TranslationExample[] {
  const limit = options.limit ?? 8;
  const examples: TranslationExample[] = [];

  const paths = [...options.base.flat.keys()].sort();

  for (const path of paths) {
    if (examples.length >= limit) {
      break;
    }

    if (!options.locale.flat.has(path)) {
      continue;
    }

    const baseValue = options.base.flat.get(path);
    const localeValue = options.locale.flat.get(path);

    if (typeof baseValue !== "string" || typeof localeValue !== "string") {
      continue;
    }

    examples.push({ path, baseValue, localeValue });
  }

  return examples;
}
