//* Local imports
import { REVIEW_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";
import { countReviewFixes } from "../../core/translate/review.ts";

//* Types imports
import type { ReviewResult } from "../../core/translate/review.ts";

export { REVIEW_ALPHA_MESSAGE };

export type ReviewLocaleSectionView = {
  locale: string;
  okCount: number;
  wrongCount: number;
  missingCount: number;
  fixCount: number;
  incompleteCount: number;
  warningCount: number;
  itemLines: string[];
  fixLines: string[];
  incompleteLines: string[];
  warningLines: string[];
};

export type ReviewReportView = {
  baseLocale: string;
  messagesDir: string;
  since: string | null;
  alphaMessage: string;
  autoFix: boolean;
  dryRun: boolean;
  cancelled: boolean;
  ok: boolean;
  writtenCount: number;
  fixCount: number;
  emptyMessage: string | null;
  sections: ReviewLocaleSectionView[];
  summaryLabel: string;
};

/**
 * Builds a terminal-friendly view model for review results.
 */
export function buildReviewReportView(result: ReviewResult): ReviewReportView {
  const fixCount = countReviewFixes(result);
  const sections = result.reports.map((report) => {
    const okCount = report.items.filter((item) => item.verdict === "ok").length;
    const wrongCount = report.items.filter((item) => item.verdict === "wrong").length;
    const missingCount = report.items.filter((item) => item.verdict === "missing").length;

    return {
      locale: report.locale,
      okCount,
      wrongCount,
      missingCount,
      fixCount: report.fixes.length,
      incompleteCount: report.incompletePaths.length,
      warningCount: report.placeholderWarnings.length,
      itemLines: report.items.map((item) => {
        if (item.verdict === "ok") {
          return `ok ${item.path}`;
        }
        if (item.verdict === "missing") {
          return `missing ${item.path}: "${item.baseValue}"`;
        }
        const reason = item.reason ? ` (${item.reason})` : "";
        return `wrong ${item.path}${reason}`;
      }),
      fixLines: report.fixes.map((fix) => `${fix.path}: "${fix.baseValue}" -> "${fix.value}"`),
      incompleteLines: [...report.incompletePaths],
      warningLines: report.placeholderWarnings.map(
        (warning) =>
          `${warning.path}: placeholders ${warning.basePlaceholders.join(", ")} -> ${warning.valuePlaceholders.join(", ")}`,
      ),
    };
  });

  let emptyMessage: string | null = null;
  if (result.cancelled) {
    emptyMessage = "Cancelled. No files were written.";
  } else if (result.reports.length === 0) {
    emptyMessage = "No translation keys in review scope.";
  }

  let summaryLabel = result.ok ? "Passed" : "Failed";
  if (result.cancelled) {
    summaryLabel = "Cancelled";
  } else if (result.autoFix && result.dryRun) {
    summaryLabel = result.ok ? "Passed" : "Auto-fix proposed";
  } else if (result.writtenFiles.length > 0) {
    summaryLabel = result.ok ? "Fixed" : "Partially fixed";
  }

  return {
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    since: result.since,
    alphaMessage: REVIEW_ALPHA_MESSAGE,
    autoFix: result.autoFix,
    dryRun: result.dryRun,
    cancelled: result.cancelled,
    ok: result.ok,
    writtenCount: result.writtenFiles.length,
    fixCount,
    emptyMessage,
    sections,
    summaryLabel,
  };
}
