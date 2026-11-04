//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runTranslateMarkdownDirCommand } from "../../../src/cli/commands/translate-markdown-dir.tsx";
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

describe("runTranslateMarkdownDirCommand", () => {
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

  it("includes directory fields in JSON output", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-cli-json-"));
    await writeSource(cwd, path.join("example", "en", "guide", "setup.md"), "# Setup\n");
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const log = captureLog();

    const exitCode = await runTranslateMarkdownDirCommand({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      to: "pt-BR",
      out: path.join("example", "pt-BR"),
      json: true,
      dryRun: true,
      env: {},
      translateMarkdown: async () => ({ markdown: "" }),
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.ok).toBe(true);
    expect(payload.alpha).toBe(true);
    expect(payload.alphaMessage).toBe(MARKDOWN_TRANSLATE_ALPHA_MESSAGE);
    expect(payload.dryRun).toBe(true);
    expect(payload.fromLocale).toBe("en");
    expect(payload.toLocale).toBe("pt-BR");
    expect(payload.fileCount).toBe(2);
    expect(payload.files).toHaveLength(2);
    expect(payload.files.every((file: { written: boolean }) => file.written === false)).toBe(true);
    expect(
      payload.files.map((file: { sourcePath: string }) => path.basename(file.sourcePath)),
    ).toEqual(["setup.md", "index.md"]);
  });

  it("returns 1 when OPENAI_API_KEY is missing for a non-dry-run translate", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-cli-key-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const error = captureError();

    const exitCode = await runTranslateMarkdownDirCommand({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      to: "pt-BR",
      out: path.join("example", "pt-BR"),
      json: true,
      env: {},
      translateMarkdown: async () => ({ markdown: "# Olá\n" }),
    });

    expect(exitCode).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("OPENAI_API_KEY");
  });

  it("does not call the translator or write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-cli-dry-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const translator = createTranslateSpy();
    const log = captureLog();

    const exitCode = await runTranslateMarkdownDirCommand({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      to: "pt-BR",
      out: path.join("example", "pt-BR"),
      json: true,
      dryRun: true,
      env: {},
      translateMarkdown: translator.translateMarkdown,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.dryRun).toBe(true);
    expect(payload.fileCount).toBe(1);
    expect(payload.files[0]?.written).toBe(false);
  });

  it("writes translated Markdown files when an API key is present", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-cli-write-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    await writeSource(cwd, path.join("example", "en", "guide", "setup.md"), "# Setup\n");
    const translator = createTranslateSpy(async (input) => ({
      markdown: `PT:${input.sourceMarkdown}`,
    }));
    captureLog();

    const exitCode = await runTranslateMarkdownDirCommand({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      to: "pt-BR",
      out: path.join("example", "pt-BR"),
      json: false,
      env: { OPENAI_API_KEY: "sk-test" },
      translateMarkdown: translator.translateMarkdown,
    });

    expect(exitCode).toBe(0);
    expect(translator.callCount()).toBe(2);
    expect(await readFile(path.join(cwd, "example", "pt-BR", "index.md"), "utf8")).toBe(
      "PT:# Hello\n",
    );
    expect(await readFile(path.join(cwd, "example", "pt-BR", "guide", "setup.md"), "utf8")).toBe(
      "PT:# Setup\n",
    );
  });

  describe("with a JavaScript project config", () => {
    async function createJsConfigProject(prefix: string): Promise<string> {
      const cwd = await mkdtemp(path.join(tmpdir(), prefix));
      await writeSource(cwd, "docs/en/example.md", "# Hello\n");
      await writeFile(path.join(cwd, "catlex.config.js"), 'export default { baseLocale: "en" };\n');
      return cwd;
    }

    it("refuses the config without allowJsConfig", async () => {
      const cwd = await createJsConfigProject("catlex-md-dir-cli-js-refused-");

      await expect(
        runTranslateMarkdownDirCommand({
          source: "docs/en",
          from: "en",
          to: "pt-BR",
          out: "docs/pt-BR",
          cwd,
          dryRun: true,
          json: true,
          env: {},
        }),
      ).rejects.toThrow(/allow-js-config|allowJsConfig/);
    });

    it("translates the directory when allowJsConfig is true", async () => {
      const cwd = await createJsConfigProject("catlex-md-dir-cli-js-run-");
      captureLog();
      const spy = createTranslateSpy();

      const exitCode = await runTranslateMarkdownDirCommand({
        source: "docs/en",
        from: "en",
        to: "pt-BR",
        out: "docs/pt-BR",
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

  it("rejects an insecure OpenAI base URL unless allowInsecureBaseUrl is true", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-cli-url-"));
    await writeSource(cwd, "docs/en/example.md", "# Hello\n");
    const options = {
      source: "docs/en",
      from: "en",
      to: "pt-BR",
      out: "docs/pt-BR",
      cwd,
      json: true,
      baseUrl: "http://127.0.0.1:8080/v1",
      env: { OPENAI_API_KEY: "sk-test" },
    };

    await expect(runTranslateMarkdownDirCommand(options)).rejects.toThrow(
      /allow-insecure-base-url/,
    );

    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network stubbed"));
    try {
      await runTranslateMarkdownDirCommand({ ...options, allowInsecureBaseUrl: true }).catch(
        () => {},
      );
      const requested = String(fetchSpy.mock.calls[0]?.[0]);
      expect(requested.startsWith("http://127.0.0.1:8080/v1")).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
