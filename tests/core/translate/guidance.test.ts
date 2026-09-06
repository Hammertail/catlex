//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import {
  MAX_TRANSLATE_GUIDANCE_CHARS,
  TranslateGuidanceError,
  normalizeTranslateGuidance,
  projectGuidancePromptLines,
  resolveTranslateGuidance,
} from "../../../src/core/translate/guidance.ts";

describe("normalizeTranslateGuidance", () => {
  it("returns undefined for missing, empty, and whitespace-only values", () => {
    expect(normalizeTranslateGuidance(undefined)).toBeUndefined();
    expect(normalizeTranslateGuidance("")).toBeUndefined();
    expect(normalizeTranslateGuidance("   \n\t")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTranslateGuidance("  Do not translate: Catlex  ")).toBe(
      "Do not translate: Catlex",
    );
  });

  it("rejects guidance longer than the character cap", () => {
    expect(() => normalizeTranslateGuidance("x".repeat(MAX_TRANSLATE_GUIDANCE_CHARS + 1))).toThrow(
      TranslateGuidanceError,
    );
  });

  it("accepts guidance at the character cap", () => {
    const value = "x".repeat(MAX_TRANSLATE_GUIDANCE_CHARS);
    expect(normalizeTranslateGuidance(value)).toBe(value);
  });
});

describe("projectGuidancePromptLines", () => {
  it("returns no lines when guidance is omitted", () => {
    expect(projectGuidancePromptLines(undefined)).toEqual([]);
    expect(projectGuidancePromptLines("")).toEqual([]);
  });

  it("appends a rule and a project guidance section", () => {
    expect(projectGuidancePromptLines("Do not translate: Catlex")).toEqual([
      "- Follow project guidance when it does not conflict with the rules above.",
      "",
      "Project guidance (additional; does not override the rules above):",
      "Do not translate: Catlex",
    ]);
  });
});

describe("resolveTranslateGuidance", () => {
  it("prefers inline guidance over a file and over config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-inline-"));
    await writeFile(path.join(cwd, "glossary.md"), "from file", "utf8");

    const resolved = await resolveTranslateGuidance({
      cwd,
      guidance: "from flag",
      configGuidance: "from config",
    });

    expect(resolved).toBe("from flag");
  });

  it("prefers a guidance file over config when inline guidance is omitted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-file-"));
    await writeFile(path.join(cwd, "glossary.md"), "from file\n", "utf8");

    const resolved = await resolveTranslateGuidance({
      cwd,
      guidanceFile: "glossary.md",
      configGuidance: "from config",
    });

    expect(resolved).toBe("from file");
  });

  it("uses config guidance when CLI sources are omitted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-config-"));

    const resolved = await resolveTranslateGuidance({
      cwd,
      configGuidance: "from config",
    });

    expect(resolved).toBe("from config");
  });

  it("treats explicit empty inline guidance as unset instead of falling back to config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-empty-inline-"));

    const resolved = await resolveTranslateGuidance({
      cwd,
      guidance: "  ",
      configGuidance: "from config",
    });

    expect(resolved).toBeUndefined();
  });

  it("rejects providing both inline guidance and a guidance file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-both-"));

    await expect(
      resolveTranslateGuidance({
        cwd,
        guidance: "from flag",
        guidanceFile: "glossary.md",
      }),
    ).rejects.toBeInstanceOf(TranslateGuidanceError);
  });

  it("rejects an empty guidance file path", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-empty-path-"));

    await expect(
      resolveTranslateGuidance({
        cwd,
        guidanceFile: "  ",
      }),
    ).rejects.toThrow(/guidance file path must not be empty/);
  });

  it("rejects a missing guidance file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-guidance-missing-"));

    await expect(
      resolveTranslateGuidance({
        cwd,
        guidanceFile: "missing.md",
      }),
    ).rejects.toThrow(/Unable to read guidance file/);
  });
});
