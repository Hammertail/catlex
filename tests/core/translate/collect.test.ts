//* Libraries imports
import { describe, expect, it } from "bun:test";
import path from "node:path";

//* Local imports
import {
  collectMissingTranslations,
  collectTranslationExamples,
} from "../../../src/core/translate/collect.ts";
import { loadMessagesDir, splitBaseAndLocales } from "../../../src/core/messages/load.ts";

const fixturesMessages = path.join(import.meta.dir, "../../fixtures/messages");

describe("collectMissingTranslations", () => {
  it("lists missing string keys with locale, path, and base value", async () => {
    const locales = await loadMessagesDir(fixturesMessages);
    const { base, others } = splitBaseAndLocales(locales, "en");

    const result = collectMissingTranslations({ base, locales: others });

    expect(result.missing).toContainEqual({
      locale: "pt",
      path: "nav.about",
      baseValue: "About",
    });
    expect(result.missing.every((item) => item.locale === "pt")).toBe(true);
    expect(result.missing.some((item) => item.locale === "es")).toBe(false);
  });

  it("records non-string missing leaves as skipped", async () => {
    const base = {
      locale: "en",
      filePath: "en.json",
      tree: { title: "Hello", flags: ["a", "b"], count: 3 },
      flat: new Map<string, unknown>([
        ["title", "Hello"],
        ["flags", ["a", "b"]],
        ["count", 3],
      ]),
    };
    const locale = {
      locale: "pt",
      filePath: "pt.json",
      tree: {},
      flat: new Map<string, unknown>(),
    };

    const result = collectMissingTranslations({
      base,
      locales: [locale],
    });

    expect(result.missing).toEqual([{ locale: "pt", path: "title", baseValue: "Hello" }]);
    expect(result.skipped).toEqual([
      {
        locale: "pt",
        path: "count",
        reason: "non-string",
        baseValue: 3,
      },
      {
        locale: "pt",
        path: "flags",
        reason: "non-string",
        baseValue: ["a", "b"],
      },
    ]);
  });

  it("respects a locale filter", async () => {
    const locales = await loadMessagesDir(fixturesMessages);
    const { base, others } = splitBaseAndLocales(locales, "en");

    const result = collectMissingTranslations({
      base,
      locales: others,
      localeFilter: ["es"],
    });

    expect(result.missing).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe("collectTranslationExamples", () => {
  it("returns base-to-locale string pairs already present in the target locale", async () => {
    const locales = await loadMessagesDir(fixturesMessages);
    const { base, others } = splitBaseAndLocales(locales, "en");
    const pt = others.find((locale) => locale.locale === "pt");
    if (!pt) {
      throw new Error("expected pt fixture");
    }

    const examples = collectTranslationExamples({
      base,
      locale: pt,
      limit: 10,
    });

    expect(examples).toContainEqual({
      path: "nav.home",
      baseValue: "Home",
      localeValue: "Início",
    });
    expect(examples).toContainEqual({
      path: "welcome",
      baseValue: "Welcome",
      localeValue: "Bem-vindo",
    });
    expect(examples.every((example) => typeof example.baseValue === "string")).toBe(true);
    expect(examples.every((example) => typeof example.localeValue === "string")).toBe(true);
  });

  it("respects the example limit", async () => {
    const locales = await loadMessagesDir(fixturesMessages);
    const { base, others } = splitBaseAndLocales(locales, "en");
    const pt = others.find((locale) => locale.locale === "pt");
    if (!pt) {
      throw new Error("expected pt fixture");
    }

    const examples = collectTranslationExamples({
      base,
      locale: pt,
      limit: 1,
    });

    expect(examples).toHaveLength(1);
  });
});
