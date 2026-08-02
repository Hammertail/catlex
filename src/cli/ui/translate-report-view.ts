//* Local imports
import { TRANSLATE_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";

//* Types imports
import type { TranslateResult } from "../../core/translate/translate.ts";

export { TRANSLATE_ALPHA_MESSAGE };

export type TranslateLocaleSectionView = {
  locale: string;
  translatedCount: number;
  skippedCount: number;
  incompleteCount: number;
  warningCount: number;
  translatedLines: string[];
  skippedLines: string[];
  incompleteLines: string[];
  warningLines: string[];
};

export type TranslateReportView = {
  baseLocale: string;
  messagesDir: string;
  alphaMessage: string;
  dryRun: boolean;
  cancelled: boolean;
  writtenCount: number;
  translatedCount: number;
  emptyMessage: string | null;
  sections: TranslateLocaleSectionView[];
  summaryLabel: string;
};

export function countTranslatedKeys(result: TranslateResult): number {
  return result.reports.reduce((total, report) => total + report.translated.length, 0);
}

/**
 * Builds a terminal-friendly view model for translate results.
 */
export function buildTranslateReportView(result: TranslateResult): TranslateReportView {
  const translatedCount = countTranslatedKeys(result);
  const sections = result.reports.map((report) => ({
    locale: report.locale,
    translatedCount: report.translated.length,
    skippedCount: report.skipped.length,
    incompleteCount: report.incompletePaths.length,
    warningCount: report.placeholderWarnings.length,
    translatedLines: report.translated.map(
      (item) => `${item.path}: "${item.baseValue}" -> "${item.value}"`,
    ),
    skippedLines: report.skipped.map((item) => `${item.path} (${item.reason})`),
    incompleteLines: report.incompletePaths.map((path) => path),
    warningLines: report.placeholderWarnings.map(
      (warning) =>
        `${warning.path}: placeholders ${warning.basePlaceholders.join(", ")} -> ${warning.valuePlaceholders.join(", ")}`,
    ),
  }));

  let emptyMessage: string | null = null;
  if (result.cancelled) {
    emptyMessage = "Cancelled. No files were written.";
  } else if (translatedCount === 0 && sections.every((section) => section.skippedCount === 0)) {
    emptyMessage = "No missing string translations to fill.";
  }

  let summaryLabel = "Done";
  if (result.cancelled) {
    summaryLabel = "Cancelled";
  } else if (result.dryRun) {
    summaryLabel = "Dry run";
  } else if (result.writtenFiles.length > 0) {
    summaryLabel = "Wrote files";
  }

  return {
    baseLocale: result.baseLocale,
    messagesDir: result.messagesDir,
    alphaMessage: TRANSLATE_ALPHA_MESSAGE,
    dryRun: result.dryRun,
    cancelled: result.cancelled,
    writtenCount: result.writtenFiles.length,
    translatedCount,
    emptyMessage,
    sections,
    summaryLabel,
  };
}
