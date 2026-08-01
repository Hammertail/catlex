//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { fixturesRoot, issuesForFile } from "./helpers.ts";

describe("scanHardcoded detection", () => {
  it("flags hardcoded JSX text in a button", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-basic.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Save",
        line: 2,
      }),
    ]);
  });

  it("flags hardcoded JSX text in a .jsx file", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-basic.jsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Cancel",
        line: 2,
      }),
    ]);
  });

  it("flags user-facing attribute string literals", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "attr-placeholder.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Email",
        line: 2,
      }),
    ]);
  });

  it("flags string literals inside JSX expression containers", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "expression-string.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Hello",
        line: 2,
      }),
    ]);
  });

  it("reports every obvious hardcoded string in a mixed file", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "mixed.tsx");

    expect(issues).toHaveLength(4);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-text",
        text: "Welcome",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Your name",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Name field",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "alt",
        text: "Logo",
      }),
    );
  });

  it("flags title and remaining aria-* user-facing attributes", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "attr-title-aria.tsx");

    expect(issues).toHaveLength(5);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "title",
        text: "Open help center",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-description",
        text: "Used for invoices",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-placeholder",
        text: "Search invoices",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-roledescription",
        text: "Search field",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-valuetext",
        text: "Fifty percent",
      }),
    );
  });

  it("flags user-facing attributes written as JSX expressions", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "attr-expression.tsx");

    expect(issues).toHaveLength(2);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Email",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Close",
      }),
    );
  });

  it("flags no-substitution template literals but not templates with substitutions", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "template-literal.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Hello",
      }),
    ]);
  });
});
