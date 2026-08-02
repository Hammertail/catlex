//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { flattenMessages } from "../../../src/core/messages/flatten.ts";
import { reviewTranslations } from "../../../src/core/translate/review.ts";

//* Types imports
import type { ReviewLocaleFn } from "../../../src/core/translate/review-openai.ts";
import type { TranslateLocaleFn } from "../../../src/core/translate/translate.ts";
import type { LocaleMessages } from "../../../src/core/types.ts";

async function writeMessages(root: string, files: Record<string, unknown>): Promise<string> {
  const messagesDir = path.join(root, "messages");
  await mkdir(messagesDir, { recursive: true });
  for (const [name, tree] of Object.entries(files)) {
    await writeFile(
      path.join(messagesDir, `${name}.json`),
      `${JSON.stringify(tree, null, 2)}\n`,
      "utf8",
    );
  }
  return messagesDir;
}

function localeMessages(
  locale: string,
  tree: Record<string, unknown>,
  filePath = `/messages/${locale}.json`,
): LocaleMessages {
  return {
    locale,
    filePath,
    tree,
    flat: flattenMessages(tree),
  };
}

describe("reviewTranslations", () => {
  it("returns ok when every present translation is approved", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-ok-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Olá" },
    });

    let reviewCalls = 0;
    const reviewLocale: ReviewLocaleFn = async (input) => {
      reviewCalls += 1;
      return {
        locale: input.targetLocale,
        reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
      };
    };

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      reviewLocale,
    });

    expect(reviewCalls).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.writtenFiles).toEqual([]);
    expect(result.reports[0]?.items).toEqual([
      {
        locale: "pt",
        path: "welcome",
        verdict: "ok",
        baseValue: "Welcome",
        localeValue: "Olá",
        changeSources: [],
      },
    ]);
  });

  it("marks missing keys as failing without calling the reviewer for them", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-missing-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Olá" },
    });

    const reviewedPaths: string[] = [];
    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      reviewLocale: async (input) => {
        reviewedPaths.push(...input.items.map((item) => item.path));
        return {
          locale: input.targetLocale,
          reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
        };
      },
    });

    expect(reviewedPaths).toEqual(["welcome"]);
    expect(result.ok).toBe(false);
    expect(result.reports[0]?.items.find((item) => item.path === "about")?.verdict).toBe("missing");
  });

  it("fails when the reviewer marks a translation as wrong", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-wrong-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Welcome" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Bem-vindo",
          },
        ],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.reports[0]?.items[0]?.verdict).toBe("wrong");
    expect(result.reports[0]?.items[0]?.suggestedValue).toBe("Bem-vindo");
  });

  it("collects auto-fix proposals without writing in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-autofix-dry-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Welcome" },
    });
    const before = await readFile(path.join(messagesDir, "pt.json"), "utf8");

    const translateLocale: TranslateLocaleFn = async (input) => ({
      locale: input.targetLocale,
      translations: input.missing.map((item) => ({
        path: item.path,
        value: `PT:${item.baseValue}`,
      })),
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      autoFix: true,
      dryRun: true,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Olá",
          },
        ],
      }),
      translateLocale,
    });

    const after = await readFile(path.join(messagesDir, "pt.json"), "utf8");
    expect(after).toBe(before);
    expect(result.ok).toBe(false);
    expect(result.reports[0]?.fixes).toEqual([
      { path: "about", value: "PT:About", baseValue: "About" },
      { path: "welcome", value: "Olá", baseValue: "Welcome" },
    ]);
  });

  it("writes auto-fix proposals and becomes ok when every issue is fixed", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-autofix-write-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Welcome" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      autoFix: true,
      dryRun: false,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Olá",
          },
        ],
      }),
      translateLocale: async (input) => ({
        locale: input.targetLocale,
        translations: [{ path: "about", value: "Sobre" }],
      }),
    });

    const onDisk = JSON.parse(await readFile(path.join(messagesDir, "pt.json"), "utf8"));
    expect(onDisk).toEqual({ welcome: "Olá", about: "Sobre" });
    expect(result.writtenFiles).toEqual([path.join(messagesDir, "pt.json")]);
    expect(result.ok).toBe(true);
  });

  it("fails when the reviewer omits a requested path", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-incomplete-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", title: "Title" },
      pt: { welcome: "Olá", title: "Título" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      chunkSize: 50,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "ok" }],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.reports[0]?.incompletePaths).toEqual(["title"]);
  });

  it("chunks review requests by chunkSize", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-chunk-"));
    await writeMessages(cwd, {
      en: { a: "A", b: "B", c: "C" },
      pt: { a: "A", b: "B", c: "C" },
    });

    const chunkSizes: number[] = [];
    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      chunkSize: 2,
      reviewLocale: async (input) => {
        chunkSizes.push(input.items.length);
        return {
          locale: input.targetLocale,
          reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
        };
      },
    });

    expect(chunkSizes).toEqual([2, 1]);
    expect(result.ok).toBe(true);
  });

  it("scopes reviews with --since and surfaces changeSources and removed paths", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-since-"));
    const previous = [
      localeMessages("en", { welcome: "Welcome", old: "Old" }, path.join(cwd, "messages/en.json")),
      localeMessages("pt", { welcome: "Olá", old: "Antigo" }, path.join(cwd, "messages/pt.json")),
    ];
    const current = [
      localeMessages("en", { welcome: "Hello" }, path.join(cwd, "messages/en.json")),
      localeMessages("pt", { welcome: "Olá" }, path.join(cwd, "messages/pt.json")),
    ];

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      dryRun: true,
      loadWorkingTree: async () => current,
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return previous;
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      reviewLocale: async (input) => ({
        locale: input.targetLocale,
        reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
      }),
    });

    expect(result.since).toBe("main");
    expect(result.sinceContext).toEqual({
      sinceRef: "main",
      sinceSha: null,
      currentBranch: null,
      detachedHead: false,
      filesAtRef: ["en.json", "pt.json"],
      filesWorkingTree: ["en.json", "pt.json"],
      keyCount: 1,
      removedCount: 2,
      skippedCount: 0,
    });
    expect(result.reports[0]?.items).toEqual([
      {
        locale: "pt",
        path: "welcome",
        verdict: "ok",
        baseValue: "Hello",
        localeValue: "Olá",
        changeSources: ["base"],
      },
    ]);
    expect(result.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "old", source: "base" }),
        expect.objectContaining({ path: "old", locale: "pt", source: "locale" }),
      ]),
    );
  });

  it("returns ok with empty reports when --since finds no changed keys", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-empty-scope-"));
    const locales = [
      localeMessages("en", { welcome: "Welcome" }, path.join(cwd, "messages/en.json")),
      localeMessages("pt", { welcome: "Olá" }, path.join(cwd, "messages/pt.json")),
    ];

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      dryRun: true,
      loadWorkingTree: async () => locales,
      loadAtRef: async () => locales,
      reviewLocale: async () => {
        throw new Error("reviewer should not be called for empty scope");
      },
    });

    expect(result.since).toBe("main");
    expect(result.sinceContext).toEqual(
      expect.objectContaining({
        sinceRef: "main",
        keyCount: 0,
        removedCount: 0,
        skippedCount: 0,
      }),
    );
    expect(result.reports).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails when the reviewer returns an unexpected path", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-unexpected-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Olá" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          { path: "welcome", verdict: "ok" },
          { path: "extra", verdict: "ok" },
        ],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.reports[0]?.unexpectedPaths).toEqual(["extra"]);
  });

  it("fails auto-fix when wrong verdicts omit suggestedValue", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-missing-suggestion-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Welcome" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      autoFix: true,
      dryRun: true,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "wrong", reason: "Not translated" }],
      }),
      translateLocale: async () => ({ locale: "pt", translations: [] }),
    });

    expect(result.ok).toBe(false);
    expect(result.reports[0]?.missingSuggestedPaths).toEqual(["welcome"]);
    expect(result.reports[0]?.fixes).toEqual([]);
    expect(result.reports[0]?.items).toEqual([]);
  });

  it("surfaces placeholder warnings without treating them as structural failures", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-placeholder-"));
    const messagesDir = await writeMessages(cwd, {
      en: { greeting: "Hello {name}" },
      pt: { greeting: "Hello {name}" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      autoFix: true,
      dryRun: false,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "greeting",
            verdict: "wrong",
            reason: "Needs translation",
            suggestedValue: "Olá {user}",
          },
        ],
      }),
      translateLocale: async () => ({ locale: "pt", translations: [] }),
    });

    expect(result.writtenFiles).toEqual([path.join(messagesDir, "pt.json")]);
    expect(result.ok).toBe(true);
    expect(result.reports[0]?.placeholderWarnings).toEqual([
      {
        path: "greeting",
        basePlaceholders: ["{name}"],
        valuePlaceholders: ["{user}"],
      },
    ]);
  });

  it("throws when auto-fixing missing keys without a translator", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-no-translator-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Olá" },
    });

    await expect(
      reviewTranslations({
        cwd,
        messagesDir: "messages",
        baseLocale: "en",
        autoFix: true,
        dryRun: true,
        reviewLocale: async (input) => ({
          locale: input.targetLocale,
          reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
        }),
      }),
    ).rejects.toThrow(
      "translateLocale is required when auto-fixing missing translations during review",
    );
  });

  it("writes available fixes but stays failed when structural issues remain", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-partial-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", title: "Title" },
      pt: { welcome: "Welcome", title: "Title" },
    });

    const result = await reviewTranslations({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      autoFix: true,
      dryRun: false,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Olá",
          },
        ],
      }),
      translateLocale: async () => ({ locale: "pt", translations: [] }),
    });

    const onDisk = JSON.parse(await readFile(path.join(messagesDir, "pt.json"), "utf8"));
    expect(onDisk.welcome).toBe("Olá");
    expect(result.writtenFiles).toEqual([path.join(messagesDir, "pt.json")]);
    expect(result.reports[0]?.incompletePaths).toEqual(["title"]);
    expect(result.ok).toBe(false);
  });
});
