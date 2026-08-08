//* Local imports
import { REVIEW_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";
import { countReviewFixes } from "../../core/translate/review.ts";

//* Types imports
import type {
  LocaleReviewReport,
  ReviewItemResult,
  ReviewResult,
} from "../../core/translate/review.ts";
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
  keysReviewed: number;
  issuesFound: number;
  fixesApplied: number;
  filesChanged: number;
  targetLocales: string[];
  model: string | null;
  emptyMessage: string | null;
  scope: ReviewScopeView | null;
  removedLines: string[];
  skippedLines: string[];
  sections: ReviewLocaleSectionView[];
  summaryLabel: string;
};

export type BuildReviewReportViewOptions = {
  model?: string;
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

function formatItemLine(item: ReviewItemResult): string {
  if (item.verdict === "ok") {
    return `ok ${item.path}`;
  }
  if (item.verdict === "missing") {
    return `missing ${item.path}: "${item.baseValue}"`;
  }
  const reason = item.reason ? ` (${item.reason})` : "";
  return `wrong ${item.path}${reason}`;
}

function buildLocaleSection(report: LocaleReviewReport): ReviewLocaleSectionView {
  return {
    locale: report.locale,
    okCount: report.items.filter((item) => item.verdict === "ok").length,
    wrongCount: report.items.filter((item) => item.verdict === "wrong").length,
    missingCount: report.items.filter((item) => item.verdict === "missing").length,
    fixCount: report.fixes.length,
    incompleteCount: report.incompletePaths.length,
    warningCount: report.placeholderWarnings.length,
    itemLines: report.items.map(formatItemLine),
    fixLines: report.fixes.map((fix) => `${fix.path}: "${fix.baseValue}" -> "${fix.value}"`),
    incompleteLines: [...report.incompletePaths],
    warningLines: report.placeholderWarnings.map(
      (warning) =>
        `${warning.path}: placeholders ${warning.basePlaceholders.join(", ")} -> ${warning.valuePlaceholders.join(", ")}`,
    ),
  };
}

function resolveEmptyMessage(result: ReviewResult): string | null {
  if (result.cancelled) {
    return "Cancelled. No files were written.";
  }
  if (result.reports.length === 0) {
    return "No translation keys in review scope.";
  }
  return null;
}

function resolveSummaryLabel(result: ReviewResult): string {
  if (result.cancelled) {
    return "Cancelled";
  }
  if (result.autoFix && result.dryRun) {
    return result.ok ? "Passed" : "Auto-fix proposed";
  }
  if (result.writtenFiles.length > 0) {
    return result.ok ? "Fixed" : "Partially fixed";
  }
  return result.ok ? "Passed" : "Failed";
}

function countKeysReviewed(result: ReviewResult): number {
  return result.reports.reduce((total, report) => total + report.items.length, 0);
}

function countIssuesFound(result: ReviewResult): number {
  return result.reports.reduce(
    (total, report) =>
      total +
      report.items.filter((item) => item.verdict === "wrong" || item.verdict === "missing").length,
    0,
  );
}

function countFixesApplied(result: ReviewResult, fixCount: number): number {
  const filesChanged = result.writtenFiles.length;
  if (filesChanged > 0 || (result.autoFix && result.dryRun && !result.cancelled)) {
    return fixCount;
  }
  return 0;
}

/**
 * Builds a terminal-friendly view model for review results.
 */
export function buildReviewReportView(
  result: ReviewResult,
  options: BuildReviewReportViewOptions = {},
): ReviewReportView {
  const fixCount = countReviewFixes(result);
  const filesChanged = result.writtenFiles.length;

  return {
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    since: result.since,
    alphaMessage: REVIEW_ALPHA_MESSAGE,
    autoFix: result.autoFix,
    dryRun: result.dryRun,
    cancelled: result.cancelled,
    ok: result.ok,
    writtenCount: filesChanged,
    fixCount,
    keysReviewed: countKeysReviewed(result),
    issuesFound: countIssuesFound(result),
    fixesApplied: countFixesApplied(result, fixCount),
    filesChanged,
    targetLocales: result.reports.map((report) => report.locale).sort(),
    model: options.model ?? null,
    emptyMessage: resolveEmptyMessage(result),
    scope: result.sinceContext === null ? null : buildReviewScopeView(result.sinceContext),
    removedLines: result.removed.map((item) => `${item.locale}:${item.path} (${item.source})`),
    skippedLines: result.skipped.map((item) => `${item.locale}:${item.path} (${item.reason})`),
    sections: result.reports.map(buildLocaleSection),
    summaryLabel: resolveSummaryLabel(result),
  };
}
