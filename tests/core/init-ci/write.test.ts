//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { WORKFLOW_RELATIVE_PATH } from "../../../src/core/init-ci/paths.ts";
import { generateValidateMessagesWorkflow } from "../../../src/core/init-ci/workflow.ts";
import { writeGithubWorkflow } from "../../../src/core/init-ci/write.ts";

describe("writeGithubWorkflow", () => {
  it("creates nested workflow directories and writes the template", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-write-"));

    const result = await writeGithubWorkflow({ cwd });

    expect(result.absolutePath).toBe(path.resolve(cwd, WORKFLOW_RELATIVE_PATH));
    expect(result.contents).toBe(generateValidateMessagesWorkflow());

    const onDisk = await readFile(result.absolutePath, "utf8");
    expect(onDisk).toBe(result.contents);
  });

  it("overwrites an existing workflow file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-init-ci-overwrite-"));
    const absolutePath = path.resolve(cwd, WORKFLOW_RELATIVE_PATH);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "name: old\n", "utf8");

    const result = await writeGithubWorkflow({ cwd });

    const onDisk = await readFile(absolutePath, "utf8");
    expect(onDisk).toBe(result.contents);
    expect(onDisk).not.toContain("name: old");
  });
});
