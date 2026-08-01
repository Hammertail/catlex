//* Local imports
import { hasFailingIssues } from "../../core/validate.ts";

//* Types imports
import type { LocaleReport, ValidationIssue, ValidationResult } from "../../core/types.ts";

export type IssueTone = "error" | "warning";

export type ReportIssueRow = {
  key: string;
  label: "missing" | "extra";
  path: string;
  tone: IssueTone;
};

export type LocaleSectionView = {
  locale: string;
  ok: boolean;
  missingCount: number;
  extraCount: number;
  rows: ReportIssueRow[];
};

export type ReportView = {
  baseLocale: string;
  messagesDir: string;
  failed: boolean;
  totalMissing: number;
  totalExtra: number;
  emptyLocalesMessage: string | null;
  locales: LocaleSectionView[];
};

export function issuesOfKind(
  issues: ValidationIssue[],
  kind: "missing" | "extra",
): ValidationIssue[] {
  return issues.filter((issue) => issue.kind === kind);
}

function extraTone(strictExtra: boolean): IssueTone {
  return strictExtra ? "error" : "warning";
}

function toIssueRows(
  issues: ValidationIssue[],
  kind: "missing" | "extra",
  tone: IssueTone,
): ReportIssueRow[] {
  return issues.map((issue) => ({
    key: `${kind}-${issue.path}`,
    label: kind,
    path: issue.path,
    tone,
  }));
}

export function buildLocaleSectionView(
  report: LocaleReport,
  strictExtra: boolean,
): LocaleSectionView {
  const missing = issuesOfKind(report.issues, "missing");
  const extra = issuesOfKind(report.issues, "extra");

  return {
    locale: report.locale,
    ok: !hasFailingIssues(report.issues, strictExtra),
    missingCount: missing.length,
    extraCount: extra.length,
    rows: [
      ...toIssueRows(missing, "missing", "error"),
      ...toIssueRows(extra, "extra", extraTone(strictExtra)),
    ],
  };
}

export function buildReportView(result: ValidationResult, strictExtra: boolean): ReportView {
  const missing = issuesOfKind(result.issues, "missing");
  const extra = issuesOfKind(result.issues, "extra");
  const hasLocales = result.reports.length > 0;

  return {
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    failed: hasFailingIssues(result.issues, strictExtra),
    totalMissing: missing.length,
    totalExtra: extra.length,
    emptyLocalesMessage: hasLocales
      ? null
      : `No other locale files to compare against ${result.baseLocale}.json`,
    locales: result.reports.map((report) => buildLocaleSectionView(report, strictExtra)),
  };
}
