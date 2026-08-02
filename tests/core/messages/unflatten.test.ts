//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  applyTranslationsToTree,
  setPathInTree,
} from "../../../src/core/messages/unflatten.ts";

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
});
