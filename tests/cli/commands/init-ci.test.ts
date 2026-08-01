//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runInitCiCommand } from "../../../src/cli/commands/init-ci.tsx";
import { WORKFLOW_RELATIVE_PATH } from "../../../src/core/init-ci/paths.ts";
import { generateValidateMessagesWorkflow } from "../../../src/core/init-ci/workflow.ts";

describe("runInitCiCommand", () => {
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

  it("writes nothing and exits 0 when the create prompt is declined", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-decline-"));
    const confirmMessages: string[] = [];
    captureLog();

    const exitCode = await runInitCiCommand({
      cwd,
      confirm: async (message) => {
        confirmMessages.push(message);
        return false;
      },
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toContain("validate-messages.yml");
    expect(await fileExists(path.resolve(cwd, WORKFLOW_RELATIVE_PATH))).toBe(false);
  });

  it("writes the workflow when create is accepted and the file is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-create-"));
    const log = captureLog();

    const exitCode = await runInitCiCommand({
      cwd,
      confirm: async () => true,
    });

    const absolutePath = path.resolve(cwd, WORKFLOW_RELATIVE_PATH);
    expect(exitCode).toBe(0);
    expect(await readFile(absolutePath, "utf8")).toBe(generateValidateMessagesWorkflow());
    expect(log).toHaveBeenCalledWith(`Wrote ${absolutePath}`);
  });

  it("keeps the existing file when overwrite is declined", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-keep-"));
    const absolutePath = path.resolve(cwd, WORKFLOW_RELATIVE_PATH);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "name: keep-me\n", "utf8");

    const confirmMessages: string[] = [];
    captureLog();

    const exitCode = await runInitCiCommand({
      cwd,
      confirm: async (message) => {
        confirmMessages.push(message);
        return confirmMessages.length === 1;
      },
    });

    expect(exitCode).toBe(0);
    expect(confirmMessages).toHaveLength(2);
    expect(confirmMessages[1]).toContain("Overwrite");
    expect(await readFile(absolutePath, "utf8")).toBe("name: keep-me\n");
  });

  it("overwrites the existing file when overwrite is accepted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-replace-"));
    const absolutePath = path.resolve(cwd, WORKFLOW_RELATIVE_PATH);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "name: old\n", "utf8");
    captureLog();

    const exitCode = await runInitCiCommand({
      cwd,
      confirm: async () => true,
    });

    expect(exitCode).toBe(0);
    expect(await readFile(absolutePath, "utf8")).toBe(generateValidateMessagesWorkflow());
  });
});
