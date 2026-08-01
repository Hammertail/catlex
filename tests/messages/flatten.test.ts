//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { flattenMessages } from "../../src/core/messages/flatten.ts";

describe("flattenMessages", () => {
  it("flattens nested objects into dot-path keys", () => {
    const flat = flattenMessages({
      nav: {
        home: "Home",
        about: "About",
      },
      welcome: "Welcome",
    });

    expect(flat.get("nav.home")).toBe("Home");
    expect(flat.get("nav.about")).toBe("About");
    expect(flat.get("welcome")).toBe("Welcome");
    expect(flat.size).toBe(3);
  });

  it("treats arrays as leaf values", () => {
    const flat = flattenMessages({
      items: ["one", "two"],
      nested: {
        tags: ["a", "b"],
      },
    });

    expect(flat.get("items")).toEqual(["one", "two"]);
    expect(flat.get("nested.tags")).toEqual(["a", "b"]);
    expect(flat.has("items.0")).toBe(false);
    expect(flat.size).toBe(2);
  });

  it("handles deeply nested objects", () => {
    const flat = flattenMessages({
      a: {
        b: {
          c: "value",
        },
      },
    });

    expect(flat.get("a.b.c")).toBe("value");
    expect(flat.size).toBe(1);
  });
});
