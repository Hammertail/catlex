//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { UnsafeLocaleWritePathError } from "../../../src/core/messages/write.ts";
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

  it("does not call the translator or write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-dry-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(messagesDir, "pt.json"), "utf8");
    let translatorCalls = 0;

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      dryRun: true,
      translateLocale: async (input) => {
        translatorCalls += 1;
        return {
          locale: input.targetLocale,
          translations: input.missing.map((item) => ({
            path: item.path,
            value: `PT:${item.baseValue}`,
          })),
        };
      },
    });

    const after = await readFile(path.join(messagesDir, "pt.json"), "utf8");
    expect(translatorCalls).toBe(0);
    expect(after).toBe(before);
    expect(result.writtenFiles).toEqual([]);
    expect(result.dryRun).toBe(true);
    expect(result.reports[0]?.translated).toEqual([]);
    expect(result.reports[0]?.pending).toEqual([{ path: "about", baseValue: "About" }]);
  });

  it("reports skipped non-string leaves in dry-run without calling the translator", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-dry-skip-"));
    await writeMessages(cwd, {
      en: { title: "Hello", flags: ["a", "b"] },
      pt: {},
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
    expect(result.reports[0]?.pending).toEqual([{ path: "title", baseValue: "Hello" }]);
    expect(result.reports[0]?.skipped).toEqual([
      {
        locale: "pt",
        path: "flags",
        reason: "non-string",
        baseValue: ["a", "b"],
      },
    ]);
  });

  it("calls the translator but skips writing when skipWrite is set", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-skip-write-"));
    const messagesDir = await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(messagesDir, "pt.json"), "utf8");
    let translatorCalls = 0;

    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      skipWrite: true,
      translateLocale: async (input) => {
        translatorCalls += 1;
        return {
          locale: input.targetLocale,
          translations: input.missing.map((item) => ({
            path: item.path,
            value: `PT:${item.baseValue}`,
          })),
        };
      },
    });

    expect(translatorCalls).toBe(1);
    expect(await readFile(path.join(messagesDir, "pt.json"), "utf8")).toBe(before);
    expect(result.writtenFiles).toEqual([]);
    expect(result.dryRun).toBe(false);
    expect(result.reports[0]?.pending).toEqual([]);
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
      skipWrite: true,
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
      skipWrite: true,
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

  it("refuses to overwrite files outside the messages directory through a locale symlink", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-symlink-"));
    const messagesDir = path.join(cwd, "messages");
    const victimPath = path.join(cwd, "package.json");

    await mkdir(messagesDir);
    await writeFile(
      path.join(messagesDir, "en.json"),
      `${JSON.stringify({ welcome: "Welcome", about: "About" }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(victimPath, `${JSON.stringify({ name: "victim" }, null, 2)}\n`, "utf8");
    await symlink(victimPath, path.join(messagesDir, "pt.json"));

    const victimBefore = await readFile(victimPath, "utf8");

    await expect(
      translateMissingKeys({
        cwd,
        messagesDir: "messages",
        baseLocale: "en",
        dryRun: false,
        translateLocale: async (input) => ({
          locale: input.targetLocale,
          translations: input.missing.map((item) => ({
            path: item.path,
            value: `PT:${item.baseValue}`,
          })),
        }),
      }),
    ).rejects.toBeInstanceOf(UnsafeLocaleWritePathError);

    expect(await readFile(victimPath, "utf8")).toBe(victimBefore);
  });

  it("runs translation chunks concurrently across locales", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-concurrent-"));
    await writeMessages(cwd, {
      en: { a: "A" },
      pt: {},
      es: {},
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const result = await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      skipWrite: true,
      concurrency: 2,
      translateLocale: async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(30);
        inFlight -= 1;
        return {
          locale: input.targetLocale,
          translations: input.missing.map((item) => ({
            path: item.path,
            value: `${input.targetLocale}:${item.baseValue}`,
          })),
        };
      },
    });

    expect(maxInFlight).toBe(2);
    expect(result.reports.map((report) => report.locale)).toEqual(["es", "pt"]);
    expect(result.reports[0]?.translated[0]?.value).toBe("es:A");
    expect(result.reports[1]?.translated[0]?.value).toBe("pt:A");
  });

  it("uses translate.concurrency from the project config when the option is omitted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-config-concurrency-"));
    await writeMessages(cwd, {
      en: { a: "A" },
      pt: {},
      es: {},
      de: {},
      fr: {},
    });
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      `${JSON.stringify({ translate: { concurrency: 2 } })}\n`,
    );

    let inFlight = 0;
    let maxInFlight = 0;
    await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      skipWrite: true,
      translateLocale: async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(25);
        inFlight -= 1;
        return {
          locale: input.targetLocale,
          translations: input.missing.map((item) => ({
            path: item.path,
            value: `${input.targetLocale}:${item.baseValue}`,
          })),
        };
      },
    });

    expect(maxInFlight).toBe(2);
  });

  it("emits progress with an in-flight count while translating", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-progress-"));
    await writeMessages(cwd, {
      en: { a: "A", b: "B" },
      pt: {},
    });

    const events: Array<{ type: string; completedKeys?: number; inFlight?: number }> = [];
    await translateMissingKeys({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      skipWrite: true,
      chunkSize: 1,
      concurrency: 1,
      onProgress: (event) => {
        events.push(event);
      },
      translateLocale: async (input) => ({
        locale: input.targetLocale,
        translations: input.missing.map((item) => ({
          path: item.path,
          value: `PT:${item.baseValue}`,
        })),
      }),
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "start",
        totalKeys: 2,
        locales: ["pt"],
        since: null,
      }),
    );
    const progress = events.filter((event) => event.type === "progress");
    expect(progress.map((event) => event.completedKeys)).toEqual([1, 2]);
    expect(progress.at(-1)).toEqual(
      expect.objectContaining({
        type: "progress",
        completedKeys: 2,
        totalKeys: 2,
        locale: "pt",
        phase: "translate",
        inFlight: 0,
      }),
    );
  });
});
