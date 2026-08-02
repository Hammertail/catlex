//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { getCiWorkflowOption } from "../../../src/core/ci/kinds.ts";
import { resolveWorkflowPath } from "../../../src/core/ci/paths.ts";
import {
  generateValidateMessagesWorkflow,
  generateWorkflow,
} from "../../../src/core/ci/workflows.ts";
import { writeGithubWorkflow, writeGithubWorkflows } from "../../../src/core/ci/write.ts";

describe("writeGithubWorkflows", () => {
  it("writes only the selected workflow kinds", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-write-"));

    const results = await writeGithubWorkflows({
      cwd,
      kinds: ["validate", "translate"],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.contents).toBe(generateValidateMessagesWorkflow());
    expect(results[1]?.contents).toBe(generateWorkflow("translate"));

    const validatePath = resolveWorkflowPath(cwd, getCiWorkflowOption("validate").relativePath);
    const translatePath = resolveWorkflowPath(cwd, getCiWorkflowOption("translate").relativePath);
    const reviewPath = resolveWorkflowPath(cwd, getCiWorkflowOption("review").relativePath);

    expect(await readFile(validatePath, "utf8")).toBe(generateValidateMessagesWorkflow());
    expect(await readFile(translatePath, "utf8")).toBe(generateWorkflow("translate"));

    let reviewExists = true;
    try {
      await readFile(reviewPath, "utf8");
    } catch {
      reviewExists = false;
    }
    expect(reviewExists).toBe(false);
  });

  it("creates nested workflow directories and overwrites existing files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-overwrite-"));
    const relativePath = getCiWorkflowOption("review").relativePath;
    const absolutePath = resolveWorkflowPath(cwd, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "name: old\n", "utf8");

    const results = await writeGithubWorkflows({
      cwd,
      kinds: ["review"],
    });

    expect(results[0]?.absolutePath).toBe(absolutePath);
    expect(await readFile(absolutePath, "utf8")).toBe(generateWorkflow("review"));
  });
});

describe("writeGithubWorkflow", () => {
  it("writes the validate workflow for backward compatibility", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-legacy-write-"));

    const result = await writeGithubWorkflow({ cwd });

    expect(result.contents).toBe(generateValidateMessagesWorkflow());
    expect(await readFile(result.absolutePath, "utf8")).toBe(generateValidateMessagesWorkflow());
  });
});
