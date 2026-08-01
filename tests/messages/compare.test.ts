//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  compareFlatMessages,
  compareResultToIssues,
} from "../../src/core/messages/compare.ts";
import { flattenMessages } from "../../src/core/messages/flatten.ts";

describe("compareFlatMessages", () => {
  it("returns missing keys present in the base but absent in the locale", () => {
    const base = flattenMessages({
      nav: { home: "Home", about: "About" },
      welcome: "Welcome",
    });
    const locale = flattenMessages({
      nav: { home: "Início" },
      welcome: "Bem-vindo",
    });

    const result = compareFlatMessages(base, locale);

    expect(result.missing).toEqual(["nav.about"]);
    expect(result.extra).toEqual([]);
  });

  it("returns extra keys present in the locale but absent in the base", () => {
    const base = flattenMessages({ welcome: "Welcome" });
    const locale = flattenMessages({
      welcome: "Bem-vindo",
      extraOnly: "Só no PT",
    });

    const result = compareFlatMessages(base, locale);

    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(["extraOnly"]);
  });

  it("returns empty arrays when nested keys match", () => {
    const tree = {
      nav: { home: "Home", about: "About" },
      welcome: "Welcome",
    };
    const base = flattenMessages(tree);
    const locale = flattenMessages({
      nav: { home: "Inicio", about: "Acerca" },
      welcome: "Bienvenido",
    });

    const result = compareFlatMessages(base, locale);

    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });
});

describe("compareResultToIssues", () => {
  it("maps compare results into validation issues for a locale", () => {
    const issues = compareResultToIssues("pt", {
      missing: ["nav.about"],
      extra: ["extraOnly"],
    });

    expect(issues).toEqual([
      { locale: "pt", path: "nav.about", kind: "missing" },
      { locale: "pt", path: "extraOnly", kind: "extra" },
    ]);
  });
});
