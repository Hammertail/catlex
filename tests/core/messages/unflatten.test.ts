//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { applyTranslationsToTree, setPathInTree } from "../../../src/core/messages/unflatten.ts";

describe("setPathInTree", () => {
  it("sets a top-level path without removing siblings", () => {
    const tree = { welcome: "Welcome", nav: { home: "Home" } };

    const next = setPathInTree(tree, "extra", "Extra");

    expect(next).toEqual({
      welcome: "Welcome",
      nav: { home: "Home" },
      extra: "Extra",
    });
    expect(tree).toEqual({ welcome: "Welcome", nav: { home: "Home" } });
  });

  it("sets a nested path and preserves sibling keys", () => {
    const tree = { nav: { home: "Home" }, welcome: "Welcome" };

    const next = setPathInTree(tree, "nav.about", "About");

    expect(next).toEqual({
      nav: { home: "Home", about: "About" },
      welcome: "Welcome",
    });
  });

  it("creates intermediate objects when nested parents are missing", () => {
    const tree = { welcome: "Welcome" };

    const next = setPathInTree(tree, "nav.about", "About");

    expect(next).toEqual({
      welcome: "Welcome",
      nav: { about: "About" },
    });
  });

  describe("prototype pollution protection", () => {
    it("rejects __proto__ path segments without polluting Object.prototype", () => {
      const marker = `__catlex_proto_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      expect(() => setPathInTree({}, `__proto__.${marker}`, "polluted")).toThrow(
        /Unsafe message key: __proto__/,
      );

      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
      expect(({} as Record<string, unknown>)[marker]).toBeUndefined();
    });

    it("rejects constructor path segments", () => {
      expect(() => setPathInTree({}, "constructor.prototype.x", "bad")).toThrow(
        /Unsafe message key: constructor/,
      );
    });

    it("rejects prototype path segments", () => {
      expect(() => setPathInTree({ nav: {} }, "nav.prototype.x", "bad")).toThrow(
        /Unsafe message key: prototype/,
      );
    });

    it("rejects unsafe keys used as the leaf segment", () => {
      expect(() => setPathInTree({}, "__proto__", "bad")).toThrow(/Unsafe message key: __proto__/);
      expect(() => setPathInTree({}, "constructor", "bad")).toThrow(
        /Unsafe message key: constructor/,
      );
      expect(() => setPathInTree({ nav: {} }, "nav.prototype", "bad")).toThrow(
        /Unsafe message key: prototype/,
      );
    });
  });
});

describe("applyTranslationsToTree", () => {
  it("applies multiple translations into a cloned tree", () => {
    const tree = { nav: { home: "Início" }, welcome: "Bem-vindo" };

    const next = applyTranslationsToTree(tree, [
      { path: "nav.about", value: "Sobre" },
      { path: "bye", value: "Tchau" },
    ]);

    expect(next).toEqual({
      nav: { home: "Início", about: "Sobre" },
      welcome: "Bem-vindo",
      bye: "Tchau",
    });
  });

  it("rejects unsafe keys in any translation patch path", () => {
    const marker = `__catlex_apply_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    expect(() =>
      applyTranslationsToTree({}, [{ path: `__proto__.${marker}`, value: "polluted" }]),
    ).toThrow(/Unsafe message key: __proto__/);

    expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    expect(({} as Record<string, unknown>)[marker]).toBeUndefined();
  });
});
