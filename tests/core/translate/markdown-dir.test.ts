//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { MarkdownTranslateError } from "../../../src/core/translate/markdown.ts";
import { translateMarkdownDirectory } from "../../../src/core/translate/markdown-dir.ts";

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

describe("translateMarkdownDirectory", () => {
  it("does not call the translator or create the output directory in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-dry-"));
    const sourceDir = path.join("example", "en");
    await writeSource(cwd, path.join(sourceDir, "guide", "setup.md"), "# Setup\n");
    await writeSource(cwd, path.join(sourceDir, "index.md"), "# Hello\n");
    const outRelative = path.join("example", "pt-BR");
    const translator = createTranslateSpy();

    const result = await translateMarkdownDirectory({
      cwd,
      source: sourceDir,
      from: "en",
      targets: [{ to: "pt-BR", out: outRelative }],
      dryRun: true,
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.targets[0]?.fileCount).toBe(2);
    expect(result.targets[0]?.files.every((file) => file.written === false)).toBe(true);
    expect(result.fromLocale).toBe("en");
    expect(result.targets[0]?.toLocale).toBe("pt-BR");
    expect(result.targets[0]?.files.map((file) => path.basename(file.sourcePath))).toEqual([
      "setup.md",
      "index.md",
    ]);
    await expect(stat(path.join(cwd, outRelative))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates a missing output directory and preserves nested relative paths", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-nested-"));
    await writeSource(cwd, path.join("example", "en", "guide", "setup.md"), "# Setup\n");
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const translator = createTranslateSpy(async (input) => ({
      markdown: `PT:${input.sourceMarkdown}`,
    }));

    const result = await translateMarkdownDirectory({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(2);
    expect(result.targets[0]?.files.every((file) => file.written)).toBe(true);
    expect(result.targets[0]?.fileCount).toBe(2);
    expect(await readFile(path.join(cwd, "example", "pt-BR", "guide", "setup.md"), "utf8")).toBe(
      "PT:# Setup\n",
    );
    expect(await readFile(path.join(cwd, "example", "pt-BR", "index.md"), "utf8")).toBe(
      "PT:# Hello\n",
    );
  });

  it("overwrites matching files and leaves extra files in the output directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-overwrite-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");
    const outFile = await writeSource(cwd, path.join("example", "pt-BR", "index.md"), "old");
    const extraFile = await writeSource(cwd, path.join("example", "pt-BR", "extra.md"), "keep");

    await translateMarkdownDirectory({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
      translateMarkdown: async () => ({ markdown: "new" }),
    });

    expect(await readFile(outFile, "utf8")).toBe("new");
    expect(await readFile(extraFile, "utf8")).toBe("keep");
  });

  it("skips files that are not Markdown", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-skip-"));
    await writeSource(cwd, path.join("docs", "en", "page.md"), "# Page\n");
    await writeSource(cwd, path.join("docs", "en", "notes.txt"), "ignore");
    await writeSource(cwd, path.join("docs", "en", "image.png"), "png");
    const translator = createTranslateSpy(async () => ({ markdown: "# Página\n" }));

    await translateMarkdownDirectory({
      cwd,
      source: path.join("docs", "en"),
      from: "en",
      targets: [{ to: "pt-BR", out: path.join("docs", "pt-BR") }],
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(1);
    expect(await readFile(path.join(cwd, "docs", "pt-BR", "page.md"), "utf8")).toBe("# Página\n");
    await expect(stat(path.join(cwd, "docs", "pt-BR", "notes.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a missing source directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-missing-"));

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toBeInstanceOf(MarkdownTranslateError);
  });

  it("rejects a source path that is not a directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-file-"));
    await writeSource(cwd, "notes.md", "Hello");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: "notes.md",
        from: "en",
        targets: [{ to: "pt-BR", out: "out" }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/not a directory/);
  });

  it("rejects an empty source directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-empty-"));
    await mkdir(path.join(cwd, "example", "en"), { recursive: true });

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/No Markdown files found/);
  });

  it("rejects an empty --from locale", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-from-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "   ",
        targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/--from locale must not be empty/);
  });

  it("rejects a comma-separated --to locale", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-comma-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [{ to: "pt-BR,es", out: path.join("example", "pt-BR") }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/--to accepts a single locale/);
  });

  it("rejects an output path that is a file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-out-file-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");
    await writeSource(cwd, path.join("example", "pt-BR"), "not-a-directory");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [{ to: "pt-BR", out: path.join("example", "pt-BR") }],
        translateMarkdown: async () => ({ markdown: "new" }),
      }),
    ).rejects.toThrow(/not a directory/);
  });

  it("rejects a source directory that is a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-symlink-src-"));
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    const realSource = path.join(root, "en");
    await writeSource(realSource, "index.md", "Hello");
    await symlink(realSource, path.join(cwd, "en"));

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: "en",
        from: "en",
        targets: [{ to: "pt-BR", out: "pt-BR" }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/symbolic link/);
  });

  it("rejects a Markdown file that is a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-symlink-file-"));
    const cwd = path.join(root, "project");
    await mkdir(path.join(cwd, "en"), { recursive: true });
    await writeFile(path.join(root, "secret.md"), "# Secret\n", "utf8");
    await symlink(path.join(root, "secret.md"), path.join(cwd, "en", "index.md"));

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: "en",
        from: "en",
        targets: [{ to: "pt-BR", out: "pt-BR" }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/symbolic link/);
  });

  it("does not follow a symlinked subdirectory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-symlink-subdir-"));
    const cwd = path.join(root, "project");
    await writeSource(cwd, path.join("en", "index.md"), "# Hello\n");
    await writeSource(root, path.join("secret", "hidden.md"), "# Secret\n");
    await symlink(path.join(root, "secret"), path.join(cwd, "en", "linked"));
    const translator = createTranslateSpy();

    const result = await translateMarkdownDirectory({
      cwd,
      source: "en",
      from: "en",
      targets: [{ to: "pt-BR", out: "pt-BR" }],
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(1);
    expect(result.targets[0]?.fileCount).toBe(1);
    expect(await readFile(path.join(cwd, "pt-BR", "index.md"), "utf8")).toBe("PT:# Hello\n");
    await expect(stat(path.join(cwd, "pt-BR", "linked", "hidden.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a source directory outside the working directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-escape-"));
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    await writeSource(root, path.join("outside", "index.md"), "Hello");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("..", "outside"),
        from: "en",
        targets: [{ to: "pt-BR", out: "pt-BR" }],
        translateMarkdown: async () => ({ markdown: "" }),
      }),
    ).rejects.toThrow(/outside the working directory/);
  });

  it("leaves files already written when a later translation fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-partial-"));
    await writeSource(cwd, path.join("en", "a.md"), "A");
    await writeSource(cwd, path.join("en", "b.md"), "B");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: "en",
        from: "en",
        targets: [{ to: "pt-BR", out: "pt-BR" }],
        translateMarkdown: async (input) => {
          if (input.sourceMarkdown === "B") {
            throw new Error("model failed");
          }
          return { markdown: "translated-a" };
        },
      }),
    ).rejects.toThrow("model failed");

    expect(await readFile(path.join(cwd, "pt-BR", "a.md"), "utf8")).toBe("translated-a");
    await expect(stat(path.join(cwd, "pt-BR", "b.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("translates each source file into every target locale", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-multi-"));
    await writeSource(cwd, path.join("example", "en", "guide", "setup.md"), "# Setup\n");
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const seenLocales: string[] = [];
    const translator = createTranslateSpy(async (input) => {
      seenLocales.push(input.targetLocale);
      return { markdown: `${input.targetLocale}:${input.sourceMarkdown}` };
    });

    const result = await translateMarkdownDirectory({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      targets: [
        { to: "pt-BR", out: path.join("example", "pt-BR") },
        { to: "fr", out: path.join("example", "fr") },
      ],
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(4);
    expect(seenLocales.filter((locale) => locale === "pt-BR")).toHaveLength(2);
    expect(seenLocales.filter((locale) => locale === "fr")).toHaveLength(2);
    expect(result.targets.map((target) => target.toLocale)).toEqual(["pt-BR", "fr"]);
    expect(result.targets.every((target) => target.fileCount === 2)).toBe(true);
    expect(await readFile(path.join(cwd, "example", "pt-BR", "index.md"), "utf8")).toBe(
      "pt-BR:# Hello\n",
    );
    expect(await readFile(path.join(cwd, "example", "fr", "guide", "setup.md"), "utf8")).toBe(
      "fr:# Setup\n",
    );
  });

  it("does not create output directories in dry-run mode when several locales are requested", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-multi-dry-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "# Hello\n");
    const translator = createTranslateSpy();

    const result = await translateMarkdownDirectory({
      cwd,
      source: path.join("example", "en"),
      from: "en",
      targets: [
        { to: "pt-BR", out: path.join("example", "pt-BR") },
        { to: "fr", out: path.join("example", "fr") },
      ],
      dryRun: true,
      translateMarkdown: translator.translateMarkdown,
    });

    expect(translator.calls).toBe(0);
    expect(result.targets).toHaveLength(2);
    expect(
      result.targets.every(
        (target) => target.fileCount === 1 && target.files[0]?.written === false,
      ),
    ).toBe(true);
    await expect(stat(path.join(cwd, "example", "pt-BR"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(cwd, "example", "fr"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a duplicate --to locale before calling the translator", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-dup-locale-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");
    const translator = createTranslateSpy();

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [
          { to: "pt-BR", out: path.join("example", "pt-BR") },
          { to: " pt-BR ", out: path.join("example", "pt") },
        ],
        translateMarkdown: translator.translateMarkdown,
      }),
    ).rejects.toThrow(/Duplicate --to locale: pt-BR/);
    expect(translator.calls).toBe(0);
  });

  it("rejects two targets that resolve to the same output directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-dup-out-"));
    await writeSource(cwd, path.join("example", "en", "index.md"), "Hello");
    const translator = createTranslateSpy();

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: path.join("example", "en"),
        from: "en",
        targets: [
          { to: "pt-BR", out: path.join("example", "pt-BR") },
          { to: "fr", out: path.join("example", "pt-BR") },
        ],
        translateMarkdown: translator.translateMarkdown,
      }),
    ).rejects.toThrow(/Duplicate --to output directory/);
    expect(translator.calls).toBe(0);
    await expect(stat(path.join(cwd, "example", "pt-BR"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("leaves the first locale written when a later locale fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-later-locale-"));
    await writeSource(cwd, path.join("en", "index.md"), "Hello");

    await expect(
      translateMarkdownDirectory({
        cwd,
        source: "en",
        from: "en",
        targets: [
          { to: "pt-BR", out: "pt-BR" },
          { to: "fr", out: "fr" },
        ],
        translateMarkdown: async (input) => {
          if (input.targetLocale === "fr") {
            throw new Error("model failed");
          }
          return { markdown: "olá" };
        },
      }),
    ).rejects.toThrow("model failed");

    expect(await readFile(path.join(cwd, "pt-BR", "index.md"), "utf8")).toBe("olá");
    await expect(stat(path.join(cwd, "fr", "index.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps several file translations in flight up to the concurrency limit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-parallel-files-"));
    await writeSource(cwd, path.join("en", "a.md"), "A");
    await writeSource(cwd, path.join("en", "b.md"), "B");
    await writeSource(cwd, path.join("en", "c.md"), "C");
    let inFlight = 0;
    let maxInFlight = 0;

    await translateMarkdownDirectory({
      cwd,
      source: "en",
      from: "en",
      targets: [{ to: "pt-BR", out: "pt-BR" }],
      concurrency: 3,
      noConfig: true,
      translateMarkdown: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 30));
        inFlight -= 1;
        return { markdown: "x" };
      },
    });

    expect(maxInFlight).toBe(3);
  });

  it("translates one file into several locales at the same time", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-parallel-locales-"));
    await writeSource(cwd, path.join("en", "index.md"), "Hello");
    let inFlight = 0;
    let maxInFlight = 0;

    await translateMarkdownDirectory({
      cwd,
      source: "en",
      from: "en",
      targets: [
        { to: "pt-BR", out: "pt-BR" },
        { to: "fr", out: "fr" },
      ],
      concurrency: 2,
      noConfig: true,
      translateMarkdown: async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 30));
        inFlight -= 1;
        return { markdown: input.targetLocale };
      },
    });

    expect(maxInFlight).toBe(2);
    expect(await readFile(path.join(cwd, "pt-BR", "index.md"), "utf8")).toBe("pt-BR");
    expect(await readFile(path.join(cwd, "fr", "index.md"), "utf8")).toBe("fr");
  });

  it("uses config concurrency when the option is omitted and lets the option override it", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-md-dir-config-concurrency-"));
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({ translate: { concurrency: 1 } }),
    );
    await writeSource(cwd, path.join("en", "a.md"), "A");
    await writeSource(cwd, path.join("en", "b.md"), "B");

    let inFlight = 0;
    let maxInFlight = 0;
    const translateMarkdown: TranslateMarkdownFn = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return { markdown: "x" };
    };

    await translateMarkdownDirectory({
      cwd,
      source: "en",
      from: "en",
      targets: [{ to: "pt-BR", out: "pt-BR" }],
      translateMarkdown,
    });
    expect(maxInFlight).toBe(1);

    inFlight = 0;
    maxInFlight = 0;
    await translateMarkdownDirectory({
      cwd,
      source: "en",
      from: "en",
      targets: [{ to: "fr", out: "fr" }],
      concurrency: 2,
      translateMarkdown,
    });
    expect(maxInFlight).toBe(2);
  });
});
