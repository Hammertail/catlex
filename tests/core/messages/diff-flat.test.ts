//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { diffFlatMessages } from "../../../src/core/messages/diff-flat.ts";
import { flattenMessages } from "../../../src/core/messages/flatten.ts";

describe("diffFlatMessages", () => {
  it("returns added keys present only in after", () => {
    const before = flattenMessages({ welcome: "Welcome" });
    const after = flattenMessages({
      welcome: "Welcome",
      nav: { about: "About" },
    });

    const result = diffFlatMessages(before, after);

    expect(result.added).toEqual([{ path: "nav.about", value: "About" }]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("returns modified keys when the leaf value changes", () => {
    const before = flattenMessages({ welcome: "Welcome" });
    const after = flattenMessages({ welcome: "Hello" });

    const result = diffFlatMessages(before, after);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([{ path: "welcome", before: "Welcome", after: "Hello" }]);
    expect(result.removed).toEqual([]);
  });

  it("returns removed keys present only in before", () => {
    const before = flattenMessages({
      nav: { home: "Home", about: "About" },
    });
    const after = flattenMessages({
      nav: { home: "Home" },
    });

    const result = diffFlatMessages(before, after);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([{ path: "nav.about", value: "About" }]);
  });

  it("returns empty collections when maps are equal", () => {
    const tree = {
      nav: { home: "Home" },
      welcome: "Welcome",
    };

    const result = diffFlatMessages(flattenMessages(tree), flattenMessages(tree));

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("treats value-type changes as modifications", () => {
    const before = flattenMessages({ flag: "yes" });
    const after = flattenMessages({ flag: true });

    const result = diffFlatMessages(before, after);

    expect(result.modified).toEqual([{ path: "flag", before: "yes", after: true }]);
  });

  it("sorts paths in each collection", () => {
    const before = flattenMessages({
      z: "Z",
      a: "A",
      m: "M",
    });
    const after = flattenMessages({
      z: "Z2",
      b: "B",
      m: "M2",
    });

    const result = diffFlatMessages(before, after);

    expect(result.added.map((item) => item.path)).toEqual(["b"]);
    expect(result.modified.map((item) => item.path)).toEqual(["m", "z"]);
    expect(result.removed.map((item) => item.path)).toEqual(["a"]);
  });
});
