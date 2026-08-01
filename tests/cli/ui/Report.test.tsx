//* Libraries imports
import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

//* Local imports
import { Report } from "../../../src/cli/ui/Report.tsx";

//* Types imports
import type { ValidationIssue, ValidationResult } from "../../../src/core/types.ts";

function issue(locale: string, path: string, kind: ValidationIssue["kind"]): ValidationIssue {
  return { locale, path, kind };
}

function result(
  partial: Partial<ValidationResult> & { issues: ValidationIssue[] },
): ValidationResult {
  const reports =
    partial.reports ??
    Object.entries(
      partial.issues.reduce<Record<string, ValidationIssue[]>>((acc, current) => {
        const bucket = acc[current.locale] ?? [];
        bucket.push(current);
        acc[current.locale] = bucket;
        return acc;
      }, {}),
    ).map(([locale, issues]) => ({
      locale,
      filePath: `/messages/${locale}.json`,
      issues,
    }));

  return {
    baseLocale: partial.baseLocale ?? "en",
    messagesDir: partial.messagesDir ?? "/messages",
    reports,
    issues: partial.issues,
  };
}

describe("Report", () => {
  it("renders a passed verdict with locale summaries", () => {
    const { lastFrame, unmount } = render(
      <Report
        result={result({
          issues: [issue("pt", "extraOnly", "extra")],
        })}
        strictExtra={false}
      />,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Catlex validate");
    expect(frame).toContain("base: en.json");
    expect(frame).toContain("pt");
    expect(frame).toContain("extraOnly");
    expect(frame).toContain("Passed");
    expect(frame).toContain("0 missing");
    expect(frame).toContain("1 extra");

    unmount();
  });

  it("renders a failed verdict when missing keys exist", () => {
    const { lastFrame, unmount } = render(
      <Report
        result={result({
          issues: [issue("pt", "nav.about", "missing")],
        })}
        strictExtra={false}
      />,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("✗");
    expect(frame).toContain("missing");
    expect(frame).toContain("nav.about");
    expect(frame).toContain("Failed");

    unmount();
  });

  it("renders an empty-locales message when there is nothing to compare", () => {
    const { lastFrame, unmount } = render(
      <Report
        result={result({
          issues: [],
          reports: [],
        })}
        strictExtra={false}
      />,
    );

    expect(lastFrame()).toContain("No other locale files to compare against en.json");
    expect(lastFrame()).toContain("Passed");

    unmount();
  });

  it("treats extra keys as failures when strictExtra is enabled", () => {
    const { lastFrame, unmount } = render(
      <Report
        result={result({
          issues: [issue("pt", "extraOnly", "extra")],
        })}
        strictExtra={true}
      />,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Failed");
    expect(frame).toContain("extraOnly");

    unmount();
  });
});
