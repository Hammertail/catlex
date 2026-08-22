//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runTranslateCommand } from "../../../src/cli/commands/translate.tsx";
import { TRANSLATE_ALPHA_MESSAGE } from "../../../src/cli/ui/translate-report-view.ts";

//* Types imports
import type { TranslateLocaleFn } from "../../../src/core/translate/translate.ts";

async function writeMessages(root: string, files: Record<string, unknown>): Promise<void> {
  const messagesDir = path.join(root, "messages");
  await mkdir(messagesDir, { recursive: true });
  for (const [name, tree] of Object.entries(files)) {
    await writeFile(
      path.join(messagesDir, `${name}.json`),
      `${JSON.stringify(tree, null, 2)}\n`,
      "utf8",
    );
  }
}

function createTranslateSpy(
  impl: TranslateLocaleFn = async (input) => ({
    locale: input.targetLocale,
    translations: input.missing.map((item) => ({
      path: item.path,
      value: `PT:${item.baseValue}`,
    })),
  }),
): { translateLocale: TranslateLocaleFn; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    translateLocale: async (input) => {
      calls += 1;
      return impl(input);
    },
  };
}

describe("runTranslateCommand", () => {
  const logSpies: Array<ReturnType<typeof spyOn>> = [];
  const errorSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    for (const spy of errorSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
    errorSpies.length = 0;
  });

  function captureLog(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(spy);
    return spy;
  }

  function captureError(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    errorSpies.push(spy);
    return spy;
  }

  it("includes alpha fields in JSON output", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-alpha-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const log = captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      dryRun: true,
      env: {},
      translateLocale: async () => ({ locale: "pt", translations: [] }),
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.alpha).toBe(true);
    expect(payload.alphaMessage).toBe(TRANSLATE_ALPHA_MESSAGE);
    expect(payload.translatedCount).toBe(0);
    expect(payload.pendingCount).toBe(0);
  });

  it("returns 1 when OPENAI_API_KEY is missing for a non-dry-run translate", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-key-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: {},
    });
    const error = captureError();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      env: {},
      translateLocale: async () => ({ locale: "pt", translations: [] }),
    });

    expect(exitCode).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("OPENAI_API_KEY");
  });

  it("lists pending keys without calling the translator or requiring an API key in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-dry-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy();
    const log = captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      dryRun: true,
      env: {},
      confirm: async (message) => {
        confirmMessages.push(message);
        return false;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toEqual([]);
    expect(translator.callCount()).toBe(0);
    expect(await readFile(path.join(cwd, "messages", "pt.json"), "utf8")).toBe(before);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.dryRun).toBe(true);
    expect(payload.translatedCount).toBe(0);
    expect(payload.pendingCount).toBe(1);
    expect(payload.reports[0].pending).toEqual([{ path: "about", baseValue: "About" }]);
    expect(payload.writtenFiles).toEqual([]);
  });

  it("does not call the translator or write files when dry-run is combined with yes", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-dry-yes-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy(async () => ({
      locale: "pt",
      translations: [{ path: "about", value: "Sobre" }],
    }));
    const log = captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      dryRun: true,
      yes: true,
      env: {},
      confirm: async (message) => {
        confirmMessages.push(message);
        return true;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toEqual([]);
    expect(translator.callCount()).toBe(0);
    expect(await readFile(path.join(cwd, "messages", "pt.json"), "utf8")).toBe(before);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.dryRun).toBe(true);
    expect(payload.translatedCount).toBe(0);
    expect(payload.pendingCount).toBe(1);
    expect(payload.writtenFiles).toEqual([]);
  });

  it("writes files when --yes is set without prompting", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-yes-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy(async () => ({
      locale: "pt",
      translations: [{ path: "about", value: "Sobre" }],
    }));
    captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      yes: true,
      env: { OPENAI_API_KEY: "sk-test" },
      confirm: async (message) => {
        confirmMessages.push(message);
        return false;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toEqual([]);
    expect(translator.callCount()).toBe(1);
    expect(JSON.parse(await readFile(path.join(cwd, "messages", "pt.json"), "utf8"))).toEqual({
      welcome: "Bem-vindo",
      about: "Sobre",
    });
  });

  it("leaves files unchanged and skips the AI when automatic translation is declined", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-pre-no-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy();
    const log = captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      confirm: async (message) => {
        confirmMessages.push(message);
        return false;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(0);
    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toMatch(/automatic translation/i);
    expect(confirmMessages[0]).toMatch(/missing key/i);
    expect(confirmMessages[0]).not.toMatch(/^Write /);
    expect(await readFile(path.join(cwd, "messages", "pt.json"), "utf8")).toBe(before);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.cancelled).toBe(true);
    expect(payload.writtenFiles).toEqual([]);
  });

  it("calls the AI then leaves files unchanged when save is declined", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-save-no-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const before = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy(async () => ({
      locale: "pt",
      translations: [{ path: "about", value: "Sobre" }],
    }));
    const log = captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      confirm: async (message) => {
        confirmMessages.push(message);
        return confirmMessages.length === 1;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(1);
    expect(confirmMessages).toHaveLength(2);
    expect(confirmMessages[0]).toMatch(/automatic translation/i);
    expect(confirmMessages[1]).toMatch(/^Write /);
    expect(await readFile(path.join(cwd, "messages", "pt.json"), "utf8")).toBe(before);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.cancelled).toBe(true);
    expect(payload.translatedCount).toBe(1);
    expect(payload.reports[0].translated).toEqual([
      { path: "about", value: "Sobre", baseValue: "About" },
    ]);
    expect(payload.writtenFiles).toEqual([]);
  });

  it("writes files when automatic translation and save are both accepted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-translate-cli-both-yes-"));
    await writeMessages(cwd, {
      en: { about: "About", welcome: "Welcome" },
      pt: { welcome: "Bem-vindo" },
    });
    const confirmMessages: string[] = [];
    const translator = createTranslateSpy(async () => ({
      locale: "pt",
      translations: [{ path: "about", value: "Sobre" }],
    }));
    captureLog();

    const exitCode = await runTranslateCommand({
      cwd,
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      confirm: async (message) => {
        confirmMessages.push(message);
        return true;
      },
      translateLocale: translator.translateLocale,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(1);
    expect(confirmMessages).toHaveLength(2);
    expect(confirmMessages[0]).toMatch(/automatic translation/i);
    expect(confirmMessages[1]).toMatch(/^Write /);
    expect(JSON.parse(await readFile(path.join(cwd, "messages", "pt.json"), "utf8"))).toEqual({
      welcome: "Bem-vindo",
      about: "Sobre",
    });
  });
});
