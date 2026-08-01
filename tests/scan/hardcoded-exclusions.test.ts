//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { fixturesRoot, issuesForFile } from "./helpers.ts";

describe("scanHardcoded exclusions", () => {
  it("does not flag text already passed through t()", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-with-t.tsx");

    expect(issues).toEqual([]);
  });

  it("does not flag non-user-facing attributes like className", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "attr-classname.tsx");

    expect(issues).toEqual([]);
  });

  it("does not flag whitespace, punctuation, emoji, or numeric-only text", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "whitespace-only.tsx");

    expect(issues).toEqual([]);
  });

  it("does not flag text inside a Trans component", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "trans-component.tsx");

    expect(issues).toEqual([]);
  });

  it("does not flag t.rich or t.markup call expressions", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "t-rich.tsx");

    expect(issues).toEqual([]);
  });

  it("skips Trans children but still flags user-facing attributes on Trans", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "trans-with-attrs.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "title",
        text: "Tooltip copy",
      }),
    ]);
  });

  it("does not flag variable bindings, ternaries, or children props", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "out-of-scope-bindings.tsx");

    expect(issues).toEqual([]);
  });
});
