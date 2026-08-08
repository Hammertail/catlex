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
    sinceContext: null,
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

  it("aggregates completion summary counts and accepts a model override", () => {
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
            fixes: [
              { path: "title", value: "Título", baseValue: "Title" },
              { path: "about", value: "Sobre", baseValue: "About" },
            ],
          }),
        ],
      }),
      { model: "gpt-test" },
    );

    expect(view.keysReviewed).toBe(3);
    expect(view.issuesFound).toBe(2);
    expect(view.fixesApplied).toBe(2);
    expect(view.filesChanged).toBe(0);
    expect(view.targetLocales).toEqual(["pt"]);
    expect(view.model).toBe("gpt-test");
  });

  it("reports fixesApplied as zero without auto-fix even when issues exist", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        autoFix: false,
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
              {
                locale: "pt",
                path: "about",
                verdict: "missing",
                baseValue: "About",
                changeSources: [],
              },
            ],
          }),
        ],
      }),
    );

    expect(view.keysReviewed).toBe(2);
    expect(view.issuesFound).toBe(2);
    expect(view.fixCount).toBe(0);
    expect(view.fixesApplied).toBe(0);
    expect(view.filesChanged).toBe(0);
  });

  it("counts written fixes as applied and sorts target locales", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: true,
        autoFix: true,
        dryRun: false,
        writtenFiles: ["/messages/es.json", "/messages/pt.json"],
        reports: [
          localeReport({
            locale: "pt",
            filePath: "/messages/pt.json",
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
          localeReport({
            locale: "es",
            filePath: "/messages/es.json",
            items: [
              {
                locale: "es",
                path: "welcome",
                verdict: "wrong",
                baseValue: "Welcome",
                localeValue: "Welcome",
                changeSources: [],
              },
            ],
            fixes: [{ path: "welcome", value: "Hola", baseValue: "Welcome" }],
          }),
        ],
      }),
    );

    expect(view.keysReviewed).toBe(2);
    expect(view.issuesFound).toBe(2);
    expect(view.fixesApplied).toBe(2);
    expect(view.filesChanged).toBe(2);
    expect(view.targetLocales).toEqual(["es", "pt"]);
  });

  it("keeps reviewed counts on cancel but reports zero applied fixes and files", () => {
    const view = buildReviewReportView(
      emptyResult({
        ok: false,
        autoFix: true,
        dryRun: false,
        cancelled: true,
        writtenFiles: [],
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

    expect(view.keysReviewed).toBe(1);
    expect(view.issuesFound).toBe(1);
    expect(view.fixCount).toBe(1);
    expect(view.fixesApplied).toBe(0);
    expect(view.filesChanged).toBe(0);
    expect(view.cancelled).toBe(true);
  });

  it("omits the Scope block when since is not set", () => {
    const view = buildReviewReportView(emptyResult());

    expect(view.scope).toBeNull();
    expect(view.removedLines).toEqual([]);
    expect(view.skippedLines).toEqual([]);
  });

  it("builds Scope lines and surfaces removed/skipped paths for --since", () => {
    const view = buildReviewReportView(
      emptyResult({
        since: "origin/main",
        sinceContext: {
          sinceRef: "origin/main",
          sinceSha: "abcdef0123456789abcdef0123456789abcdef01",
          currentBranch: "feature/review",
          detachedHead: false,
          filesAtRef: ["en.json", "pt.json"],
          filesWorkingTree: ["en.json", "es.json", "pt.json"],
          keyCount: 2,
          removedCount: 1,
          skippedCount: 1,
        },
        removed: [{ locale: "en", path: "old", value: "Old", source: "base" }],
        skipped: [
          {
            locale: "pt",
            path: "meta.count",
            reason: "non-string-base",
            baseValue: 1,
          },
        ],
      }),
    );

    expect(view.scope).toEqual({
      branchLine: "branch: feature/review · since: origin/main (abcdef0) · working tree",
      filesLine: "files: en.json, es.json, pt.json",
      countsLine: "keys: 2 in scope · 1 removed · 1 skipped",
    });
    expect(view.removedLines).toEqual(["en:old (base)"]);
    expect(view.skippedLines).toEqual(["pt:meta.count (non-string-base)"]);
  });

  it("labels detached HEAD in the Scope branch line", () => {
    const view = buildReviewReportView(
      emptyResult({
        since: "main",
        sinceContext: {
          sinceRef: "main",
          sinceSha: null,
          currentBranch: null,
          detachedHead: true,
          filesAtRef: ["en.json"],
          filesWorkingTree: ["en.json"],
          keyCount: 0,
          removedCount: 0,
          skippedCount: 0,
        },
      }),
    );

    expect(view.scope?.branchLine).toBe("branch: (detached HEAD) · since: main · working tree");
  });
});
