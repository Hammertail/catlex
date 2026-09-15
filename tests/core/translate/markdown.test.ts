//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import {
  MAX_MARKDOWN_SOURCE_BYTES,
  MarkdownTranslateError,
  translateMarkdownFile,
} from "../../../src/core/translate/markdown.ts";

//* Types imports
import type { TranslateMarkdownFn } from "../../../src/core/translate/markdown.ts";

async function writeSource(cwd: string, relativePath: string, contents: string): Promise<string> {
  const filePath = path.join(cwd, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  return filePath;
}

function createTranslateSpy(
  impl: TranslateMarkdownFn = async (input) => ({
    markdown: `PT:${input.sourceMarkdown}`,
  }),
): { translateMarkdown: TranslateMarkdownFn; calls: number } {
  const spy = {
    calls: 0,
    translateMarkdown: (async (input) => {
      spy.calls += 1;
      return impl(input);
    }) satisfies TranslateMarkdownFn,
  };
  return spy;
}

describe("translateMarkdownFile", () => {
  it("does not call the translator or write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dry-"));
    const sourcePath = await writeSource(cwd, path.join("docs", "en", "example.md"), "# Hello\n");
    const outRelative = path.join("docs", "pt-BR", "example.md");
    const translator = createTranslateSpy();

    const result = await translateMarkdownFile({
      cwd,
      source: path.join("docs", "en", "example.md"),
      from: "en",
      to: "pt-BR",
      out: outRelative,
      dryRun: true,
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.written).toBe(false);
    expect(result.fromLocale).toBe("en");
    expect(result.toLocale).toBe("pt-BR");
    expect(result.sourcePath).toBe(sourcePath);
    expect(result.outPath).toBe(path.join(cwd, outRelative));
    expect(result.sourceBytes).toBe(Buffer.byteLength("# Hello\n", "utf8"));
    await expect(stat(path.join(cwd, outRelative))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes the translated Markdown and creates missing parent directories", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-write-"));
    await writeSource(cwd, path.join("docs", "en", "example.md"), "# Hello\n");
    const translator = createTranslateSpy(async () => ({ markdown: "# Olá\n" }));

    const result = await translateMarkdownFile({
      cwd,
      source: path.join("docs", "en", "example.md"),
      from: "en",
      to: "pt-BR",
      out: path.join("docs", "pt-BR", "example.md"),
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(1);
    expect(result.written).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(await readFile(path.join(cwd, "docs", "pt-BR", "example.md"), "utf8")).toBe("# Olá\n");
  });

  it("overwrites an existing output file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-overwrite-"));
    await writeSource(cwd, "source.md", "Hello");
    const outPath = await writeSource(cwd, "out.md", "old");

    await translateMarkdownFile({
      cwd,
      source: "source.md",
      from: "en",
      to: "pt-BR",
      out: "out.md",
      translateMarkdown: async () => ({ markdown: "new" }),
    });

    expect(await readFile(outPath, "utf8")).toBe("new");
  });

  it("passes locales and source Markdown to the injected translator", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-inject-"));
    await writeSource(cwd, "guide.md", "# Welcome\n");
    let received: Parameters<TranslateMarkdownFn>[0] | undefined;

    await translateMarkdownFile({
      cwd,
      source: "guide.md",
      from: "en",
      to: "pt-BR",
      out: "guide.pt.md",
      translateMarkdown: async (input) => {
        received = input;
        return { markdown: "# Bem-vindo\n" };
      },
    });

    expect(received?.sourceLocale).toBe("en");
    expect(received?.targetLocale).toBe("pt-BR");
    expect(received?.sourceMarkdown).toBe("# Welcome\n");
    expect(received?.prompt).toContain("source locale: en");
    expect(received?.prompt).toContain("target locale: pt-BR");
  });

  it("does not write when the translator throws", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-throw-"));
    await writeSource(cwd, "source.md", "Hello");
    const outPath = path.join(cwd, "out.md");

    await expect(
      translateMarkdownFile({
        cwd,
        source: "source.md",
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => {
          throw new Error("model failed");
        },
      }),
    ).rejects.toThrow("model failed");

    await expect(stat(outPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a missing source file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-missing-"));

    await expect(
      translateMarkdownFile({
        cwd,
        source: "missing.md",
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toBeInstanceOf(MarkdownTranslateError);
  });

  it("rejects a source that is not Markdown", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-ext-"));
    await writeSource(cwd, "notes.txt", "Hello");

    await expect(
      translateMarkdownFile({
        cwd,
        source: "notes.txt",
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/must end with \.md or \.markdown/);
  });

  it("accepts a .markdown source extension", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-markdown-ext-"));
    await writeSource(cwd, "page.markdown", "Hello");

    const result = await translateMarkdownFile({
      cwd,
      source: "page.markdown",
      from: "en",
      to: "fr",
      out: "page.fr.markdown",
      translateMarkdown: async () => ({ markdown: "Bonjour" }),
    });

    expect(result.written).toBe(true);
    expect(await readFile(path.join(cwd, "page.fr.markdown"), "utf8")).toBe("Bonjour");
  });

  it("rejects a source file larger than the prototype byte limit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-oversize-"));
    await writeSource(cwd, "huge.md", "x".repeat(MAX_MARKDOWN_SOURCE_BYTES + 1));

    await expect(
      translateMarkdownFile({
        cwd,
        source: "huge.md",
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(new RegExp(`exceeds the ${MAX_MARKDOWN_SOURCE_BYTES} byte`));
  });

  it("rejects a relative source path that escapes cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-src-escape-"));
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(root, "secret.md"), "# Secret\n", "utf8");

    await expect(
      translateMarkdownFile({
        cwd,
        source: path.join("..", "secret.md"),
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/Refusing to read Markdown file outside/);
  });

  it("rejects a relative output path that escapes cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-out-escape-"));
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    await writeSource(cwd, "source.md", "Hello");

    await expect(
      translateMarkdownFile({
        cwd,
        source: "source.md",
        from: "en",
        to: "pt-BR",
        out: path.join("..", "escaped.md"),
        translateMarkdown: async () => ({ markdown: "Oi" }),
      }),
    ).rejects.toThrow(/Refusing to write Markdown file outside/);
  });

  it("rejects a source file that is a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-symlink-"));
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(root, "secret.md"), "# Secret\n", "utf8");
    await symlink(path.join(root, "secret.md"), path.join(cwd, "source.md"));

    await expect(
      translateMarkdownFile({
        cwd,
        source: "source.md",
        from: "en",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/symbolic link/);
  });

  it("rejects an empty --from locale", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-from-"));
    await writeSource(cwd, "source.md", "Hello");

    await expect(
      translateMarkdownFile({
        cwd,
        source: "source.md",
        from: "   ",
        to: "pt-BR",
        out: "out.md",
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/--from locale must not be empty/);
  });
});
