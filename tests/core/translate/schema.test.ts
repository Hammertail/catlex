//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  extractIcuPlaceholders,
  submitTranslationsSchema,
  validateSubmittedTranslations,
} from "../../../src/core/translate/schema.ts";

describe("submitTranslationsSchema", () => {
  it("accepts a locale and translation array", () => {
    const parsed = submitTranslationsSchema.parse({
      locale: "pt",
      translations: [{ path: "nav.about", value: "Sobre" }],
    });

    expect(parsed.locale).toBe("pt");
    expect(parsed.translations).toEqual([{ path: "nav.about", value: "Sobre" }]);
  });

  it("rejects empty translation paths", () => {
    expect(() =>
      submitTranslationsSchema.parse({
        locale: "pt",
        translations: [{ path: "", value: "Sobre" }],
      }),
    ).toThrow();
  });
});

describe("validateSubmittedTranslations", () => {
  it("keeps only requested paths and reports unexpected ones", () => {
    const result = validateSubmittedTranslations({
      allowedPaths: new Set(["nav.about", "welcome"]),
      baseValues: new Map([
        ["nav.about", "About"],
        ["welcome", "Welcome {name}"],
      ]),
      submitted: {
        locale: "pt",
        translations: [
          { path: "nav.about", value: "Sobre" },
          { path: "extra", value: "Nope" },
          { path: "welcome", value: "Bem-vindo {name}" },
        ],
      },
    });

    expect(result.accepted).toEqual([
      { path: "nav.about", value: "Sobre" },
      { path: "welcome", value: "Bem-vindo {name}" },
    ]);
    expect(result.unexpectedPaths).toEqual(["extra"]);
    expect(result.missingPaths).toEqual([]);
    expect(result.placeholderWarnings).toEqual([]);
  });

  it("reports requested paths that were not submitted", () => {
    const result = validateSubmittedTranslations({
      allowedPaths: new Set(["nav.about", "welcome"]),
      baseValues: new Map([
        ["nav.about", "About"],
        ["welcome", "Welcome"],
      ]),
      submitted: {
        locale: "pt",
        translations: [{ path: "nav.about", value: "Sobre" }],
      },
    });

    expect(result.missingPaths).toEqual(["welcome"]);
  });

  it("warns when ICU placeholders are changed", () => {
    const result = validateSubmittedTranslations({
      allowedPaths: new Set(["greeting"]),
      baseValues: new Map([["greeting", "Hello {name}"]]),
      submitted: {
        locale: "pt",
        translations: [{ path: "greeting", value: "Olá {nome}" }],
      },
    });

    expect(result.placeholderWarnings).toEqual([
      {
        path: "greeting",
        basePlaceholders: ["{name}"],
        valuePlaceholders: ["{nome}"],
      },
    ]);
  });
});

describe("extractIcuPlaceholders", () => {
  it("extracts simple brace placeholders", () => {
    expect(extractIcuPlaceholders("Hello {name}, you have {count}")).toEqual(["{count}", "{name}"]);
  });
});
