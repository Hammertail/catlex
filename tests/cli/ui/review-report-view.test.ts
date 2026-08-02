//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  REVIEW_ALPHA_MESSAGE,
  buildReviewReportView,
} from "../../../src/cli/ui/review-report-view.ts";

//* Types imports
import type { LocaleReviewReport, ReviewResult } from "../../../src/core/translate/review.ts";

function emptyResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    ok: true,
    baseLocale: "en",
    messagesDir: "messages",
    since: null,
    autoFix: false,
    dryRun: true,
    cancelled: false,
    reports: [],
    removed: [],
    skipped: [],
    writtenFiles: [],
    ...overrides,
  };
}

function localeReport(overrides: Partial<LocaleReviewReport> = {}): LocaleReviewReport {
  return {
    locale: "pt",
    filePath: "/messages/pt.json",
    items: [],
    fixes: [],
    incompletePaths: [],
    unexpectedPaths: [],
    missingSuggestedPaths: [],
    placeholderWarnings: [],
    ...overrides,
  };
}

describe("buildReviewReportView", () => {
  it("includes the alpha message and empty-scope copy", () => {
    const view = buildReviewReportView(emptyResult());

    expect(view.alphaMessage).toBe(REVIEW_ALPHA_MESSAGE);
    expect(view.emptyMessage).toBe("No translation keys in review scope.");
    expect(view.summaryLabel).toBe("Passed");
  });

  it("marks cancelled runs and explains that nothing was written", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        cancelled: true,
        dryRun: false,
        reports: [
          localeReport({
            items: [
              {
                locale: "pt",
                path: "welcome",
                verdict: "wrong",
                baseValue: "Welcome",
                localeValue: "Welcome",
                changeSources: [],
              },
            ],
            fixes: [{ path: "welcome", value: "Olá", baseValue: "Welcome" }],
          }),
        ],
      }),
    );

    expect(view.cancelled).toBe(true);
    expect(view.emptyMessage).toBe("Cancelled. No files were written.");
    expect(view.summaryLabel).toBe("Cancelled");
  });

  it("labels dry-run auto-fix failures as proposed", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        autoFix: true,
        dryRun: true,
        reports: [
          localeReport({
            items: [
              {
                locale: "pt",
                path: "welcome",
                verdict: "wrong",
                baseValue: "Welcome",
                localeValue: "Welcome",
                changeSources: [],
              },
            ],
            fixes: [{ path: "welcome", value: "Olá", baseValue: "Welcome" }],
          }),
        ],
      }),
    );

    expect(view.summaryLabel).toBe("Auto-fix proposed");
    expect(view.fixCount).toBe(1);
    expect(view.emptyMessage).toBeNull();
  });

  it("labels partial writes when some issues remain after applying fixes", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        autoFix: true,
        dryRun: false,
        writtenFiles: ["/messages/pt.json"],
        reports: [
          localeReport({
            items: [
              {
                locale: "pt",
                path: "welcome",
                verdict: "wrong",
                baseValue: "Welcome",
                localeValue: "Welcome",
                changeSources: [],
              },
            ],
            fixes: [{ path: "welcome", value: "Olá", baseValue: "Welcome" }],
            incompletePaths: ["title"],
          }),
        ],
      }),
    );

    expect(view.summaryLabel).toBe("Partially fixed");
    expect(view.writtenCount).toBe(1);
  });

  it("aggregates ok, wrong, missing, and warning counts per locale section", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        reports: [
          localeReport({
            items: [
              {
                locale: "pt",
                path: "welcome",
                verdict: "ok",
                baseValue: "Welcome",
                localeValue: "Olá",
                changeSources: [],
              },
              {
                locale: "pt",
                path: "title",
                verdict: "wrong",
                baseValue: "Title",
                localeValue: "Title",
                reason: "Not translated",
                changeSources: [],
              },
              {
                locale: "pt",
                path: "about",
                verdict: "missing",
                baseValue: "About",
                changeSources: [],
              },
            ],
            placeholderWarnings: [
              {
                path: "greeting",
                basePlaceholders: ["{name}"],
                valuePlaceholders: ["{user}"],
              },
            ],
          }),
        ],
      }),
    );

    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]).toEqual(
      expect.objectContaining({
        locale: "pt",
        okCount: 1,
        wrongCount: 1,
        missingCount: 1,
        warningCount: 1,
        itemLines: ["ok welcome", "wrong title (Not translated)", 'missing about: "About"'],
        warningLines: ["greeting: placeholders {name} -> {user}"],
      }),
    );
  });
});
