//* Libraries imports
import { describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import {
  GitError,
  assertGitRepo,
  assertRefExists,
  readFileAtRef,
} from "../../../src/core/git/show.ts";
import { runGit } from "../../../src/core/git/run.ts";
import {
  checkoutBranch,
  commitAll,
  createTempGitRepo,
  whichGit,
  writeRepoFile,
} from "./temp-repo.ts";

const gitAvailable = await whichGit();

describe.skipIf(!gitAvailable)("git show integration", () => {
  it("reads a file at main and HEAD after a branch commit", async () => {
    const { cwd } = await createTempGitRepo();

    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Welcome" }, null, 2)}\n`,
    );
    await commitAll(cwd, "initial messages");

    // Ensure default branch is named main for predictable refs.
    await (await import("../../../src/core/git/run.ts")).runGit(["branch", "-M", "main"], {
      cwd,
    });

    await checkoutBranch(cwd, "feature");
    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Hello", nav: { about: "About" } }, null, 2)}\n`,
    );
    await commitAll(cwd, "update en");

    const atMain = await readFileAtRef({
      cwd,
      ref: "main",
      path: "messages/en.json",
    });
    const atHead = await readFileAtRef({
      cwd,
      ref: "HEAD",
      path: "messages/en.json",
    });

    expect(JSON.parse(atMain ?? "")).toEqual({ welcome: "Welcome" });
    expect(JSON.parse(atHead ?? "")).toEqual({
      welcome: "Hello",
      nav: { about: "About" },
    });
  });

  it("returns null when a file exists only on the feature branch and is read from main", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(cwd, "messages/en.json", "{}\n");
    await commitAll(cwd, "initial");
    await (await import("../../../src/core/git/run.ts")).runGit(["branch", "-M", "main"], {
      cwd,
    });

    await checkoutBranch(cwd, "feature");
    await writeRepoFile(cwd, "messages/pt.json", `${JSON.stringify({ welcome: "Olá" })}\n`);
    await commitAll(cwd, "add pt");

    const missingOnMain = await readFileAtRef({
      cwd,
      ref: "main",
      path: "messages/pt.json",
    });
    const presentOnHead = await readFileAtRef({
      cwd,
      ref: "HEAD",
      path: "messages/pt.json",
    });

    expect(missingOnMain).toBeNull();
    expect(JSON.parse(presentOnHead ?? "")).toEqual({ welcome: "Olá" });
  });

  it("returns null when a file was deleted on the branch", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(cwd, "messages/en.json", "{}\n");
    await writeRepoFile(cwd, "messages/pt.json", `${JSON.stringify({ welcome: "Olá" })}\n`);
    await commitAll(cwd, "initial");
    await (await import("../../../src/core/git/run.ts")).runGit(["branch", "-M", "main"], {
      cwd,
    });

    await checkoutBranch(cwd, "feature");
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(cwd, "messages/pt.json"));
    await commitAll(cwd, "remove pt");

    const atMain = await readFileAtRef({
      cwd,
      ref: "main",
      path: "messages/pt.json",
    });
    const atHead = await readFileAtRef({
      cwd,
      ref: "HEAD",
      path: "messages/pt.json",
    });

    expect(JSON.parse(atMain ?? "")).toEqual({ welcome: "Olá" });
    expect(atHead).toBeNull();
  });

  it("fails assertRefExists for an unknown ref", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(cwd, "messages/en.json", "{}\n");
    await commitAll(cwd, "initial");

    await expect(assertRefExists({ cwd, ref: "definitely-missing-ref" })).rejects.toThrow(GitError);
  });

  it("fails assertGitRepo outside a git directory", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-not-git-"));

    await expect(assertGitRepo({ cwd })).rejects.toThrow(GitError);
  });

  it("ignores dirty working tree content when reading HEAD", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Welcome" }, null, 2)}\n`,
    );
    await commitAll(cwd, "initial");

    await writeFile(
      path.join(cwd, "messages/en.json"),
      `${JSON.stringify({ welcome: "DIRTY" }, null, 2)}\n`,
      "utf8",
    );

    const atHead = await readFileAtRef({
      cwd,
      ref: "HEAD",
      path: "messages/en.json",
    });

    expect(JSON.parse(atHead ?? "")).toEqual({ welcome: "Welcome" });
  });

  it("reads a file when cwd is a subdirectory of the repository", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(
      cwd,
      "packages/app/messages/en.json",
      `${JSON.stringify({ welcome: "Welcome" }, null, 2)}\n`,
    );
    await commitAll(cwd, "initial monorepo messages");
    await runGit(["branch", "-M", "main"], { cwd });

    const packageCwd = path.join(cwd, "packages", "app");
    const atMain = await readFileAtRef({
      cwd: packageCwd,
      ref: "main",
      path: "messages/en.json",
    });

    expect(JSON.parse(atMain ?? "")).toEqual({ welcome: "Welcome" });
  });

  it("returns null for a missing path when cwd is a subdirectory", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(cwd, "packages/app/messages/en.json", "{}\n");
    await commitAll(cwd, "initial");

    const packageCwd = path.join(cwd, "packages", "app");
    const missing = await readFileAtRef({
      cwd: packageCwd,
      ref: "HEAD",
      path: "messages/missing.json",
    });

    expect(missing).toBeNull();
  });
});
