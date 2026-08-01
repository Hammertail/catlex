//* Libraries imports
import path from "node:path";

//* Types imports
import type { HardcodedIssue, ScanResult } from "../../core/scan/types.ts";

export const SCAN_ALPHA_MESSAGE =
  "Alpha: this scan is experimental. False positives and missed issues may occur.";

const MAX_TEXT_LENGTH = 48;

export type ScanIssueRow = {
  key: string;
  location: string;
  kindLabel: string;
  text: string;
};

export type ScanReportView = {
  rootDir: string;
  displayRootDir: string;
  alphaMessage: string;
  failed: boolean;
  issueCount: number;
  emptyMessage: string | null;
  rows: ScanIssueRow[];
};

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`;
}

function kindLabel(issue: HardcodedIssue): string {
  if (issue.kind === "jsx-attribute") {
    return issue.attributeName ?? "jsx-attribute";
  }

  return "jsx-text";
}

function toRelativePath(filePath: string, rootDir: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative.length > 0 ? relative : filePath;
}

export function buildScanIssueRow(
  issue: HardcodedIssue,
  rootDir: string,
  index: number,
): ScanIssueRow {
  const relativePath = toRelativePath(issue.filePath, rootDir);

  return {
    key: `${relativePath}:${issue.line}:${issue.column}:${index}`,
    location: `${relativePath}:${issue.line}:${issue.column}`,
    kindLabel: kindLabel(issue),
    text: truncateText(issue.text),
  };
}

export function buildScanReportView(result: ScanResult): ScanReportView {
  const failed = result.issues.length > 0;

  return {
    rootDir: result.rootDir,
    displayRootDir: result.rootDir,
    alphaMessage: SCAN_ALPHA_MESSAGE,
    failed,
    issueCount: result.issues.length,
    emptyMessage: failed ? null : "No hardcoded user-visible strings found",
    rows: result.issues.map((issue, index) => buildScanIssueRow(issue, result.rootDir, index)),
  };
}
