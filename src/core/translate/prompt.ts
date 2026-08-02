//* Types imports
import type { TranslationExample } from "./collect.ts";

export type PromptMissingItem = {
  path: string;
  baseValue: string;
};

export type BuildTranslatePromptOptions = {
  baseLocale: string;
  targetLocale: string;
  missing: PromptMissingItem[];
  examples: TranslationExample[];
};

/**
 * Builds the user prompt for translating missing locale keys.
 */
export function buildTranslatePrompt(options: BuildTranslatePromptOptions): string {
  const exampleLines =
    options.examples.length === 0
      ? "- (no existing examples in this locale)"
      : options.examples
          .map((example) => `- ${example.path}: "${example.baseValue}" -> "${example.localeValue}"`)
          .join("\n");

  const missingLines = options.missing
    .map((item) => `- ${item.path}: "${item.baseValue}"`)
    .join("\n");

  return [
    `Translate missing i18n message strings from the base locale into the target locale.`,
    `base locale: ${options.baseLocale}`,
    `target locale: ${options.targetLocale}`,
    "",
    "Rules:",
    "- Translate only the listed missing keys.",
    "- Preserve ICU placeholders such as {name} exactly.",
    "- Match the tone of the examples when possible.",
    "- Submit results only via the submitTranslations tool.",
    "",
    "Examples from the target locale:",
    exampleLines,
    "",
    "Missing keys to translate:",
    missingLines,
  ].join("\n");
}

export const TRANSLATE_INSTRUCTIONS =
  "You are an i18n translator for next-intl style JSON message files. " +
  "Return translations only by calling the submitTranslations tool. " +
  "Do not invent keys that were not requested.";
