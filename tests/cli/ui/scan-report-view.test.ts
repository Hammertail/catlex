//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  SCAN_ALPHA_MESSAGE,
  buildScanIssueRow,
  buildScanReportView,
} from "../../../src/cli/ui/scan-report-view.ts";

//* Types imports
import type { HardcodedIssue, ScanResult } from "../../../src/core/scan/types.ts";

function issue(
  partial: Partial<HardcodedIssue> & Pick<HardcodedIssue, "text" | "kind">,
): HardcodedIssue {
  return {
    filePath: partial.filePath ?? "/app/Button.tsx",
    line: partial.line ?? 1,
    column: partial.column ?? 1,
    text: partial.text,
    kind: partial.kind,
    attributeName: partial.attributeName,
  };
}

function scanResult(issues: HardcodedIssue[], rootDir = "/app"): ScanResult {
  return { rootDir, issues };
}

describe("buildScanIssueRow", () => {
  it("formats a relative location and jsx-text kind label", () => {
    const row = buildScanIssueRow(
      issue({
        filePath: "/app/components/Button.tsx",
        line: 12,
        column: 5,
        text: "Save",
        kind: "jsx-text",
      }),
      "/app",
      0,
    );

    expect(row.location).toBe("components/Button.tsx:12:5");
    expect(row.kindLabel).toBe("jsx-text");
    expect(row.text).toBe("Save");
  });

  it("uses the attribute name as the kind label for jsx-attribute issues", () => {
    const row = buildScanIssueRow(
      issue({
        text: "Email",
        kind: "jsx-attribute",
        attributeName: "placeholder",
      }),
      "/app",
      1,
    );

    expect(row.kindLabel).toBe("placeholder");
  });

  it("truncates long issue text for display", () => {
    const longText = "A".repeat(60);
    const row = buildScanIssueRow(issue({ text: longText, kind: "jsx-text" }), "/app", 0);

    expect(row.text.length).toBe(48);
    expect(row.text.endsWith("…")).toBe(true);
  });
});

describe("buildScanReportView", () => {
  it("builds a passed summary when there are no issues", () => {
    const view = buildScanReportView(scanResult([]));

    expect(view.failed).toBe(false);
    expect(view.issueCount).toBe(0);
    expect(view.emptyMessage).toBe("No hardcoded user-visible strings found");
    expect(view.rows).toEqual([]);
    expect(view.alphaMessage).toBe(SCAN_ALPHA_MESSAGE);
  });

  it("builds a failed summary with one row per issue", () => {
    const issues = [
      issue({
        filePath: "/app/Button.tsx",
        line: 3,
        column: 8,
        text: "Save",
        kind: "jsx-text",
      }),
      issue({
        filePath: "/app/Form.tsx",
        line: 10,
        column: 2,
        text: "Email",
        kind: "jsx-attribute",
        attributeName: "placeholder",
      }),
    ];
    const view = buildScanReportView(scanResult(issues));

    expect(view.failed).toBe(true);
    expect(view.issueCount).toBe(2);
    expect(view.emptyMessage).toBeNull();
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]?.location).toBe("Button.tsx:3:8");
    expect(view.rows[1]?.kindLabel).toBe("placeholder");
  });
});
