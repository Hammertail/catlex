//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runTranslateMarkdownCommand } from "../../../src/cli/commands/translate-markdown.tsx";
import { MARKDOWN_TRANSLATE_ALPHA_MESSAGE } from "../../../src/core/translate/alpha.ts";

//* Types imports
import type { TranslateMarkdownFn } from "../../../src/core/translate/markdown.ts";

async function writeSource(cwd: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(cwd, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function createTranslateSpy(
  impl: TranslateMarkdownFn = async (input) => ({
    markdown: `PT:${input.sourceMarkdown}`,
  }),
): { translateMarkdown: TranslateMarkdownFn; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    translateMarkdown: async (input) => {
      calls += 1;
      return impl(input);
    },
  };
}

describe("runTranslateMarkdownCommand", () => {
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
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-alpha-"));
    await writeSource(cwd, "example.md", "# Hello\n");
    const log = captureLog();

    const exitCode = await runTranslateMarkdownCommand({
      cwd,
      file: "example.md",
      from: "en",
      to: "pt-BR",
      out: "example.pt.md",
      json: true,
      dryRun: true,
      env: {},
      translateMarkdown: async () => ({ markdown: "" }),
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.alpha).toBe(true);
    expect(payload.alphaMessage).toBe(MARKDOWN_TRANSLATE_ALPHA_MESSAGE);
    expect(payload.dryRun).toBe(true);
    expect(payload.written).toBe(false);
    expect(payload.fromLocale).toBe("en");
    expect(payload.toLocale).toBe("pt-BR");
  });

  it("returns 1 when OPENAI_API_KEY is missing for a non-dry-run translate", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-key-"));
    await writeSource(cwd, "example.md", "# Hello\n");
    const error = captureError();

    const exitCode = await runTranslateMarkdownCommand({
      cwd,
      file: "example.md",
      from: "en",
      to: "pt-BR",
      out: "example.pt.md",
      json: true,
      env: {},
      translateMarkdown: async () => ({ markdown: "# Olá\n" }),
    });

    expect(exitCode).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("OPENAI_API_KEY");
  });

  it("does not call the translator or write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-dry-"));
    await writeSource(cwd, path.join("docs", "en", "example.md"), "# Hello\n");
    const translator = createTranslateSpy();
    const log = captureLog();

    const exitCode = await runTranslateMarkdownCommand({
      cwd,
      file: path.join("docs", "en", "example.md"),
      from: "en",
      to: "pt-BR",
      out: path.join("docs", "pt-BR", "example.md"),
      json: true,
      dryRun: true,
      env: {},
      translateMarkdown: translator.translateMarkdown,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.dryRun).toBe(true);
    expect(payload.written).toBe(false);
    await expect(
      readFile(path.join(cwd, "docs", "pt-BR", "example.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes the translated Markdown when an API key is present", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-write-"));
    await writeSource(cwd, path.join("docs", "en", "example.md"), "# Hello\n");
    const translator = createTranslateSpy(async () => ({ markdown: "# Olá\n" }));
    captureLog();

    const exitCode = await runTranslateMarkdownCommand({
      cwd,
      file: path.join("docs", "en", "example.md"),
      from: "en",
      to: "pt-BR",
      out: path.join("docs", "pt-BR", "example.md"),
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      translateMarkdown: translator.translateMarkdown,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(1);
    expect(await readFile(path.join(cwd, "docs", "pt-BR", "example.md"), "utf8")).toBe("# Olá\n");
  });

  describe("with a JavaScript project config", () => {
    async function createJsConfigProject(prefix: string): Promise<string> {
      const cwd = await mkdtemp(path.join(tmpdir(), prefix));
      await writeSource(cwd, "docs/en/example.md", "# Hello\n");
      await writeFile(path.join(cwd, "catlex.config.js"), 'export default { baseLocale: "en" };\n');
      return cwd;
    }

    it("refuses the config without allowJsConfig", async () => {
      const cwd = await createJsConfigProject("catlex-md-cli-js-refused-");

      await expect(
        runTranslateMarkdownCommand({
          file: "docs/en/example.md",
          from: "en",
          to: "pt-BR",
          out: "docs/pt-BR/example.md",
          cwd,
          dryRun: true,
          json: true,
          env: {},
        }),
      ).rejects.toThrow(/allow-js-config|allowJsConfig/);
    });

    it("translates the file when allowJsConfig is true", async () => {
      const cwd = await createJsConfigProject("catlex-md-cli-js-run-");
      captureLog();
      const spy = createTranslateSpy();

      const exitCode = await runTranslateMarkdownCommand({
        file: "docs/en/example.md",
        from: "en",
        to: "pt-BR",
        out: "docs/pt-BR/example.md",
        cwd,
        json: true,
        allowJsConfig: true,
        env: { OPENAI_API_KEY: "sk-test" },
        translateMarkdown: spy.translateMarkdown,
      });

      expect(exitCode).toBe(0);
      expect(spy.callCount()).toBe(1);
      expect(await readFile(path.join(cwd, "docs/pt-BR/example.md"), "utf8")).toContain("PT:");
    });
  });

  describe("with an insecure OpenAI base URL", () => {
    const options = {
      file: "docs/en/example.md",
      from: "en",
      to: "pt-BR",
      out: "docs/pt-BR/example.md",
      json: true,
      baseUrl: "http://127.0.0.1:8080/v1",
      env: { OPENAI_API_KEY: "sk-test" },
    };

    it("rejects the URL by default", async () => {
      const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-url-refused-"));
      await writeSource(cwd, "docs/en/example.md", "# Hello\n");

      await expect(runTranslateMarkdownCommand({ ...options, cwd })).rejects.toThrow(
        /allow-insecure-base-url/,
      );
    });

    it("sends the request to that URL when allowInsecureBaseUrl is true", async () => {
      const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-cli-url-allowed-"));
      await writeSource(cwd, "docs/en/example.md", "# Hello\n");
      const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network stubbed"));

      try {
        await runTranslateMarkdownCommand({ ...options, cwd, allowInsecureBaseUrl: true }).catch(
          () => {},
        );
        const requested = String(fetchSpy.mock.calls[0]?.[0]);
        expect(requested.startsWith("http://127.0.0.1:8080/v1")).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
