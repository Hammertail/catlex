//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runCiCommand } from "../../../src/cli/commands/ci.tsx";
import { getCiWorkflowOption, type CiWorkflowKind } from "../../../src/core/ci/kinds.ts";
import { resolveWorkflowPath } from "../../../src/core/ci/paths.ts";
import { generateWorkflow } from "../../../src/core/ci/workflows.ts";

describe("runCiCommand", () => {
  const logSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
  });

  function captureLog(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(spy);
    return spy;
  }

  async function fileExists(absolutePath: string): Promise<boolean> {
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  it("writes nothing and exits 0 when no workflows are selected", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-empty-"));
    captureLog();

    const exitCode = await runCiCommand({
      cwd,
      select: async () => [],
      confirm: async () => true,
    });

    expect(exitCode).toBe(0);
    expect(
      await fileExists(resolveWorkflowPath(cwd, getCiWorkflowOption("validate").relativePath)),
    ).toBe(false);
  });

  it("writes selected workflows when files are missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-create-"));
    const log = captureLog();
    const kinds: CiWorkflowKind[] = ["validate", "review"];

    const exitCode = await runCiCommand({
      cwd,
      select: async () => kinds,
      confirm: async () => true,
    });

    expect(exitCode).toBe(0);

    for (const kind of kinds) {
      const absolutePath = resolveWorkflowPath(cwd, getCiWorkflowOption(kind).relativePath);
      expect(await readFile(absolutePath, "utf8")).toBe(generateWorkflow(kind));
      expect(log).toHaveBeenCalledWith(`Wrote ${absolutePath}`);
    }
  });

  it("keeps an existing file when overwrite is declined and still writes others", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-partial-"));
    const validatePath = resolveWorkflowPath(cwd, getCiWorkflowOption("validate").relativePath);
    const reviewPath = resolveWorkflowPath(cwd, getCiWorkflowOption("review").relativePath);
    await mkdir(path.dirname(validatePath), { recursive: true });
    await writeFile(validatePath, "name: keep-me\n", "utf8");
    captureLog();

    const confirmMessages: string[] = [];
    const exitCode = await runCiCommand({
      cwd,
      select: async () => ["validate", "review"],
      confirm: async (message) => {
        confirmMessages.push(message);
        return false;
      },
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toContain("validate-messages.yml");
    expect(confirmMessages[0]).toContain("Overwrite");
    expect(await readFile(validatePath, "utf8")).toBe("name: keep-me\n");
    expect(await readFile(reviewPath, "utf8")).toBe(generateWorkflow("review"));
  });

  it("overwrites an existing file when overwrite is accepted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-replace-"));
    const translatePath = resolveWorkflowPath(cwd, getCiWorkflowOption("translate").relativePath);
    await mkdir(path.dirname(translatePath), { recursive: true });
    await writeFile(translatePath, "name: old\n", "utf8");
    captureLog();

    const exitCode = await runCiCommand({
      cwd,
      select: async () => ["translate"],
      confirm: async () => true,
    });

    expect(exitCode).toBe(0);
    expect(await readFile(translatePath, "utf8")).toBe(generateWorkflow("translate"));
  });

  it("writes nothing when every selected existing file declines overwrite", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-all-decline-"));
    const validatePath = resolveWorkflowPath(cwd, getCiWorkflowOption("validate").relativePath);
    await mkdir(path.dirname(validatePath), { recursive: true });
    await writeFile(validatePath, "name: keep-me\n", "utf8");
    const log = captureLog();

    const exitCode = await runCiCommand({
      cwd,
      select: async () => ["validate"],
      confirm: async () => false,
    });

    expect(exitCode).toBe(0);
    expect(await readFile(validatePath, "utf8")).toBe("name: keep-me\n");
    expect(log).toHaveBeenCalledWith("Cancelled. No files were written.");
  });
});
