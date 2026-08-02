//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { translateMissingKeys } from "../../../src/core/translate/translate.ts";

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

describe("translateMissingKeys", () => {
  it("returns an empty result when there is nothing to translate", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-empty-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });

    let translatorCalls = 0;
    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      translateLocale: async () => {
        translatorCalls += 1;
        return { locale: "pt", translations: [] };
      },
    });

    expect(translatorCalls).toBe(0);
    expect(result.reports).toEqual([]);
    expect(result.writtenFiles).toEqual([]);
    expect(result.cancelled).toBe(false);
  });

  it("does not write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-dry-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(messagesDir, "pt.json"), "utf8");

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      translateLocale: async (input) => ({
        locale: input.targetLocale,
        translations: input.missing.map((item) => ({
          path: item.path,
          value: `PT:${item.baseValue}`,
        })),
      }),
    });

    const after = await readFile(path.join(messagesDir, "pt.json"), "utf8");
    expect(after).toBe(before);
    expect(result.writtenFiles).toEqual([]);
    expect(result.reports[0]?.translated).toEqual([
      { path: "about", value: "PT:About", baseValue: "About" },
    ]);
  });

  it("writes merged translations when not dry-run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-write-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Bem-vindo" },
    });

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: false,
      translateLocale: async (input) => ({
        locale: input.targetLocale,
        translations: [{ path: "about", value: "Sobre" }],
      }),
    });

    const onDisk = JSON.parse(await readFile(path.join(messagesDir, "pt.json"), "utf8"));
    expect(onDisk).toEqual({ welcome: "Bem-vindo", about: "Sobre" });
    expect(result.writtenFiles).toEqual([path.join(messagesDir, "pt.json")]);
  });

  it("reports skipped non-string missing leaves and incomplete submissions", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-skip-"));
    await writeMessages(cwd, {
      en: { title: "Hello", flags: ["a", "b"], other: "Other" },
      pt: {},
    });

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      translateLocale: async (input) => ({
        locale: input.targetLocale,
        translations: [{ path: "title", value: "Olá" }],
      }),
    });

    const report = result.reports[0];
    expect(report?.skipped).toEqual([
      {
        locale: "pt",
        path: "flags",
        reason: "non-string",
        baseValue: ["a", "b"],
      },
    ]);
    expect(report?.incompletePaths).toEqual(["other"]);
    expect(report?.translated).toEqual([{ path: "title", value: "Olá", baseValue: "Hello" }]);
  });

  it("reports placeholder warnings without rejecting the translation", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-icu-"));
    await writeMessages(cwd, {
      en: { greeting: "Hello {name}" },
      pt: {},
    });

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      translateLocale: async () => ({
        locale: "pt",
        translations: [{ path: "greeting", value: "Olá {nome}" }],
      }),
    });

    expect(result.reports[0]?.placeholderWarnings).toEqual([
      {
        path: "greeting",
        basePlaceholders: ["{name}"],
        valuePlaceholders: ["{nome}"],
      },
    ]);
  });
});
