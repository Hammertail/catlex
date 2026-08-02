//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { fixturesRoot, issuesForFile } from "./helpers.ts";

describe("scanHardcoded exclusions", () => {
  it("does not flag text already passed through t()", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "text-with-t.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "text-with-t.vue")).toEqual([]);
  });

  it("does not flag non-user-facing attributes like className", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "attr-classname.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "attr-classname.vue")).toEqual([]);
  });

  it("does not flag whitespace, punctuation, emoji, or numeric-only text", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "whitespace-only.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "whitespace-only.vue")).toEqual([]);
  });

  it("does not flag text inside a Trans component", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "trans-component.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "trans-component.vue")).toEqual([]);
  });

  it("does not flag t.rich or t.markup call expressions", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "t-rich.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "t-rich.vue")).toEqual([]);
  });

  it("skips Trans children but still flags user-facing attributes on Trans", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "trans-with-attrs.tsx")).toEqual([
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "title",
        text: "Tooltip copy",
      }),
    ]);
    expect(issuesForFile(result.issues, "trans-with-attrs.vue")).toEqual([
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "title",
        text: "Tooltip copy",
      }),
    ]);
  });

  it("does not flag variable bindings, ternaries, or children props", async () => {
    const result = await scanHardcoded(fixturesRoot);

    expect(issuesForFile(result.issues, "out-of-scope-bindings.tsx")).toEqual([]);
    expect(issuesForFile(result.issues, "out-of-scope-bindings.vue")).toEqual([]);
  });
});
