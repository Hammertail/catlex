//* Libraries imports
import { z } from "zod";

//* Local imports
import { extractIcuPlaceholders, type PlaceholderWarning } from "./schema.ts";

const submitTranslationReviewItemSchema = z.object({
  path: z.string().min(1),
  verdict: z.enum(["ok", "wrong"]),
  reason: z.string().optional(),
  suggestedValue: z.string().optional(),
});

export const submitTranslationReviewsSchema = z.object({
  locale: z.string().min(1),
  reviews: z.array(submitTranslationReviewItemSchema),
});

export type SubmitTranslationReviewsInput = z.infer<typeof submitTranslationReviewsSchema>;

export type AcceptedReview = {
  path: string;
  verdict: "ok" | "wrong";
  reason?: string;
  suggestedValue?: string;
};

export type ValidateSubmittedReviewsResult = {
  accepted: AcceptedReview[];
  unexpectedPaths: string[];
  missingPaths: string[];
  missingSuggestedPaths: string[];
  placeholderWarnings: PlaceholderWarning[];
};

export type ValidateSubmittedReviewsOptions = {
  allowedPaths: Set<string>;
  baseValues: Map<string, string>;
  requireSuggestedValue: boolean;
  submitted: SubmitTranslationReviewsInput;
};

function samePlaceholders(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

function needsSuggestedValue(
  item: SubmitTranslationReviewsInput["reviews"][number],
  requireSuggestedValue: boolean,
): boolean {
  return (
    item.verdict === "wrong" &&
    requireSuggestedValue &&
    (item.suggestedValue === undefined || item.suggestedValue.length === 0)
  );
}

function toAcceptedReview(item: SubmitTranslationReviewsInput["reviews"][number]): AcceptedReview {
  const acceptedItem: AcceptedReview = {
    path: item.path,
    verdict: item.verdict,
  };
  if (item.reason !== undefined) {
    acceptedItem.reason = item.reason;
  }
  if (item.suggestedValue !== undefined) {
    acceptedItem.suggestedValue = item.suggestedValue;
  }
  return acceptedItem;
}

function maybePlaceholderWarning(
  path: string,
  suggestedValue: string | undefined,
  baseValues: Map<string, string>,
): PlaceholderWarning | null {
  if (suggestedValue === undefined) {
    return null;
  }
  const baseValue = baseValues.get(path);
  if (baseValue === undefined) {
    return null;
  }
  const basePlaceholders = extractIcuPlaceholders(baseValue);
  const valuePlaceholders = extractIcuPlaceholders(suggestedValue);
  if (samePlaceholders(basePlaceholders, valuePlaceholders)) {
    return null;
  }
  return { path, basePlaceholders, valuePlaceholders };
}

/**
 * Validates tool-submitted translation reviews against the requested paths.
 */
export function validateSubmittedReviews(
  options: ValidateSubmittedReviewsOptions,
): ValidateSubmittedReviewsResult {
  const accepted: AcceptedReview[] = [];
  const unexpectedPaths: string[] = [];
  const missingSuggestedPaths: string[] = [];
  const placeholderWarnings: PlaceholderWarning[] = [];
  const seen = new Set<string>();

  for (const item of options.submitted.reviews) {
    if (!options.allowedPaths.has(item.path)) {
      unexpectedPaths.push(item.path);
      continue;
    }
    if (seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);

    if (needsSuggestedValue(item, options.requireSuggestedValue)) {
      missingSuggestedPaths.push(item.path);
      continue;
    }

    accepted.push(toAcceptedReview(item));
    const warning = maybePlaceholderWarning(item.path, item.suggestedValue, options.baseValues);
    if (warning !== null) {
      placeholderWarnings.push(warning);
    }
  }

  return {
    accepted: accepted.sort((a, b) => a.path.localeCompare(b.path)),
    unexpectedPaths: unexpectedPaths.sort(),
    missingPaths: [...options.allowedPaths].filter((path) => !seen.has(path)).sort(),
    missingSuggestedPaths: missingSuggestedPaths.sort(),
    placeholderWarnings: placeholderWarnings.sort((a, b) => a.path.localeCompare(b.path)),
  };
}
