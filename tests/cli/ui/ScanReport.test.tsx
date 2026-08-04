//* Libraries imports
import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

//* Local imports
import { ScanReport } from "../../../src/cli/ui/ScanReport.tsx";
import { SCAN_ALPHA_MESSAGE } from "../../../src/cli/ui/scan-report-view.ts";

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

function result(
  issues: HardcodedIssue[],
  rootDir = "/app",
  errors: ScanResult["errors"] = [],
): ScanResult {
  return { rootDir, issues, errors };
}

describe("ScanReport", () => {
  it("renders the alpha banner and a passed verdict when there are no issues", () => {
    const { lastFrame, unmount } = render(<ScanReport result={result([])} />);

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Catlex scan");
    expect(frame).toContain(SCAN_ALPHA_MESSAGE);
    expect(frame).toContain("dir: /app");
    expect(frame).toContain("No hardcoded user-visible strings found");
    expect(frame).toContain("Passed");
    expect(frame).toContain("0 hardcoded");

    unmount();
  });

  it("renders issues and a failed verdict when hardcoded strings are found", () => {
    const { lastFrame, unmount } = render(
      <ScanReport
        result={result([
          issue({
            filePath: "/app/Button.tsx",
            line: 4,
            column: 6,
            text: "Save",
            kind: "jsx-text",
          }),
          issue({
            filePath: "/app/Form.tsx",
            line: 2,
            column: 1,
            text: "Email",
            kind: "jsx-attribute",
            attributeName: "placeholder",
          }),
        ])}
      />,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain(SCAN_ALPHA_MESSAGE);
    expect(frame).toContain("jsx-text");
    expect(frame).toContain("Button.tsx:4:6");
    expect(frame).toContain('"Save"');
    expect(frame).toContain("placeholder");
    expect(frame).toContain("Form.tsx:2:1");
    expect(frame).toContain("Failed");
    expect(frame).toContain("2 hardcoded");

    unmount();
  });

  it("renders file-level scan errors alongside a failed verdict", () => {
    const { lastFrame, unmount } = render(
      <ScanReport
        result={result([], "/app", [
          {
            filePath: "/app/generated/Huge.vue",
            message: "Maximum call stack size exceeded",
          },
        ])}
      />,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("scan-error");
    expect(frame).toContain("generated/Huge.vue");
    expect(frame).toContain("Maximum call stack size exceeded");
    expect(frame).toContain("Failed");
    expect(frame).toContain("1 scan error(s)");

    unmount();
  });
});
