//* Local imports
import { REVIEW_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";
import { countReviewFixes } from "../../core/translate/review.ts";

//* Types imports
import type { ReviewResult } from "../../core/translate/review.ts";
import type { ReviewSinceContext } from "../../core/translate/review-scope.ts";

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

export type ReviewScopeView = {
  branchLine: string;
  filesLine: string;
  countsLine: string;
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
  scope: ReviewScopeView | null;
  removedLines: string[];
  skippedLines: string[];
  sections: ReviewLocaleSectionView[];
  summaryLabel: string;
};

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function comparedFiles(context: ReviewSinceContext): string[] {
  return [...new Set([...context.filesAtRef, ...context.filesWorkingTree])].sort();
}

/**
 * Builds Ink-friendly lines for --since scope context.
 */
function buildReviewScopeView(context: ReviewSinceContext): ReviewScopeView {
  const branchLabel = context.detachedHead
    ? "(detached HEAD)"
    : (context.currentBranch ?? "(unknown)");
  const sinceLabel =
    context.sinceSha === null
      ? context.sinceRef
      : `${context.sinceRef} (${shortSha(context.sinceSha)})`;
  const files = comparedFiles(context);

  return {
    branchLine: `branch: ${branchLabel} · since: ${sinceLabel} · working tree`,
    filesLine: files.length === 0 ? "files: (none)" : `files: ${files.join(", ")}`,
    countsLine: `keys: ${context.keyCount} in scope · ${context.removedCount} removed · ${context.skippedCount} skipped`,
  };
}

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
    scope: result.sinceContext === null ? null : buildReviewScopeView(result.sinceContext),
    removedLines: result.removed.map(
      (item) => `${item.locale}:${item.path} (${item.source})`,
    ),
    skippedLines: result.skipped.map(
      (item) => `${item.locale}:${item.path} (${item.reason})`,
    ),
    sections,
    summaryLabel,
  };
}
