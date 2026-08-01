//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  buildLocaleSectionView,
  buildReportView,
  issuesOfKind,
} from "../../../src/cli/ui/report-view.ts";

//* Types imports
import type { LocaleReport, ValidationIssue, ValidationResult } from "../../../src/core/types.ts";

function issue(locale: string, path: string, kind: ValidationIssue["kind"]): ValidationIssue {
  return { locale, path, kind };
}

function localeReport(locale: string, issues: ValidationIssue[]): LocaleReport {
  return {
    locale,
    filePath: `/messages/${locale}.json`,
    issues,
  };
}

function validationResult(reports: LocaleReport[], issues: ValidationIssue[]): ValidationResult {
  return {
    baseLocale: "en",
    messagesDir: "/messages",
    reports,
    issues,
  };
}

describe("issuesOfKind", () => {
  it("returns only issues matching the requested kind", () => {
    const issues = [
      issue("pt", "nav.home", "missing"),
      issue("pt", "extraOnly", "extra"),
      issue("es", "nav.about", "missing"),
    ];

    expect(issuesOfKind(issues, "missing")).toEqual([
      issue("pt", "nav.home", "missing"),
      issue("es", "nav.about", "missing"),
    ]);
    expect(issuesOfKind(issues, "extra")).toEqual([issue("pt", "extraOnly", "extra")]);
  });
});

describe("buildLocaleSectionView", () => {
  it("marks a locale as ok when it has no failing issues", () => {
    const report = localeReport("es", []);

    expect(buildLocaleSectionView(report, false)).toEqual({
      locale: "es",
      ok: true,
      missingCount: 0,
      extraCount: 0,
      rows: [],
    });
  });

  it("marks a locale as failed when missing keys exist", () => {
    const report = localeReport("pt", [issue("pt", "nav.about", "missing")]);
    const view = buildLocaleSectionView(report, false);

    expect(view.ok).toBe(false);
    expect(view.missingCount).toBe(1);
    expect(view.rows).toEqual([
      {
        key: "missing-nav.about",
        label: "missing",
        path: "nav.about",
        tone: "error",
      },
    ]);
  });

  it("keeps extra keys as warnings unless strictExtra is enabled", () => {
    const report = localeReport("pt", [issue("pt", "extraOnly", "extra")]);

    expect(buildLocaleSectionView(report, false).ok).toBe(true);
    expect(buildLocaleSectionView(report, false).rows[0]?.tone).toBe("warning");

    expect(buildLocaleSectionView(report, true).ok).toBe(false);
    expect(buildLocaleSectionView(report, true).rows[0]?.tone).toBe("error");
  });
});

describe("buildReportView", () => {
  it("builds a passed summary with per-locale sections", () => {
    const issues = [issue("pt", "extraOnly", "extra")];
    const result = validationResult([localeReport("pt", issues)], issues);
    const view = buildReportView(result, false);

    expect(view.failed).toBe(false);
    expect(view.totalMissing).toBe(0);
    expect(view.totalExtra).toBe(1);
    expect(view.emptyLocalesMessage).toBeNull();
    expect(view.locales).toHaveLength(1);
    expect(view.locales[0]?.locale).toBe("pt");
  });

  it("builds a failed summary when missing keys exist", () => {
    const issues = [issue("pt", "nav.about", "missing")];
    const result = validationResult([localeReport("pt", issues)], issues);
    const view = buildReportView(result, false);

    expect(view.failed).toBe(true);
    expect(view.totalMissing).toBe(1);
    expect(view.totalExtra).toBe(0);
  });

  it("explains when there are no locale files to compare", () => {
    const result = validationResult([], []);
    const view = buildReportView(result, false);

    expect(view.emptyLocalesMessage).toBe("No other locale files to compare against en.json");
    expect(view.locales).toEqual([]);
  });

  it("fails on extra keys only when strictExtra is enabled", () => {
    const issues = [issue("pt", "extraOnly", "extra")];
    const result = validationResult([localeReport("pt", issues)], issues);

    expect(buildReportView(result, false).failed).toBe(false);
    expect(buildReportView(result, true).failed).toBe(true);
  });
});
