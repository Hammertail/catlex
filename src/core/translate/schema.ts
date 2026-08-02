//* Libraries imports
import { z } from "zod";

const submitTranslationItemSchema = z.object({
  path: z.string().min(1),
  value: z.string(),
});

export const submitTranslationsSchema = z.object({
  locale: z.string().min(1),
  translations: z.array(submitTranslationItemSchema),
});

export type SubmitTranslationsInput = z.infer<typeof submitTranslationsSchema>;

export type PlaceholderWarning = {
  path: string;
  basePlaceholders: string[];
  valuePlaceholders: string[];
};

export type ValidateSubmittedResult = {
  accepted: Array<{ path: string; value: string }>;
  unexpectedPaths: string[];
  missingPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

const PLACEHOLDER_RE = /\{[^{}]+\}/g;

/**
 * Extracts simple `{placeholder}` tokens from a message string.
 */
export function extractIcuPlaceholders(value: string): string[] {
  const matches = value.match(PLACEHOLDER_RE);
  if (!matches) {
    return [];
  }
  return [...new Set(matches)].sort();
}

function samePlaceholders(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

export type ValidateSubmittedOptions = {
  allowedPaths: Set<string>;
  baseValues: Map<string, string>;
  submitted: SubmitTranslationsInput;
};

/**
 * Validates tool-submitted translations against the requested missing paths.
 */
export function validateSubmittedTranslations(
  options: ValidateSubmittedOptions,
): ValidateSubmittedResult {
  const accepted: Array<{ path: string; value: string }> = [];
  const unexpectedPaths: string[] = [];
  const seen = new Set<string>();
  const placeholderWarnings: PlaceholderWarning[] = [];

  for (const item of options.submitted.translations) {
    if (!options.allowedPaths.has(item.path)) {
      unexpectedPaths.push(item.path);
      continue;
    }

    if (seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    accepted.push({ path: item.path, value: item.value });

    const baseValue = options.baseValues.get(item.path);
    if (baseValue === undefined) {
      continue;
    }

    const basePlaceholders = extractIcuPlaceholders(baseValue);
    const valuePlaceholders = extractIcuPlaceholders(item.value);
    if (!samePlaceholders(basePlaceholders, valuePlaceholders)) {
      placeholderWarnings.push({
        path: item.path,
        basePlaceholders,
        valuePlaceholders,
      });
    }
  }

  const missingPaths = [...options.allowedPaths].filter((path) => !seen.has(path)).sort();

  unexpectedPaths.sort();
  accepted.sort((a, b) => a.path.localeCompare(b.path));
  placeholderWarnings.sort((a, b) => a.path.localeCompare(b.path));

  return {
    accepted,
    unexpectedPaths,
    missingPaths,
    placeholderWarnings,
  };
}
