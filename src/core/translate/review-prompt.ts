export type ReviewPromptItem = {
  path: string;
  baseValue: string;
  localeValue: string;
};

export type BuildReviewPromptOptions = {
  baseLocale: string;
  targetLocale: string;
  items: ReviewPromptItem[];
};

/**
 * Builds the user prompt for reviewing existing locale translations.
 */
export function buildReviewPrompt(options: BuildReviewPromptOptions): string {
  const itemLines = options.items
    .map((item) => `- ${item.path}: base="${item.baseValue}" locale="${item.localeValue}"`)
    .join("\n");

  return [
    `Review existing i18n translations for accuracy against the base locale.`,
    `base locale: ${options.baseLocale}`,
    `target locale: ${options.targetLocale}`,
    "",
    "Rules:",
    "- Review only the listed keys.",
    '- Mark each key as "ok" or "wrong".',
    "- Preserve ICU placeholders such as {name} exactly in any suggestedValue.",
    "- When verdict is wrong, include a short reason and a suggestedValue when possible.",
    "- Submit results only via the submitTranslationReviews tool.",
    "",
    "Keys to review:",
    itemLines,
  ].join("\n");
}

export const REVIEW_INSTRUCTIONS =
  "You are an i18n reviewer for next-intl style JSON message files. " +
  "Return verdicts only by calling the submitTranslationReviews tool. " +
  "Do not invent keys that were not requested.";
