//* Libraries imports
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runGit as defaultRunGit } from "../../../src/core/git/run.ts";

export type TempRepo = {
  cwd: string;
};

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await defaultRunGit(args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

/**
 * Creates an initialized git repository with a local identity for commits.
 */
export async function createTempGitRepo(): Promise<TempRepo> {
  const cwd = await mkdtemp(path.join(tmpdir(), "catlex-git-"));

  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "catlex-test@example.com"]);
  await git(cwd, ["config", "user.name", "catlex-test"]);
  await git(cwd, ["config", "commit.gpgsign", "false"]);

  return { cwd };
}

export async function writeRepoFile(
  cwd: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolute = path.join(cwd, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
}

export async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-m", message]);
}

export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
  await git(cwd, ["checkout", "-b", branch]);
}

export async function whichGit(): Promise<boolean> {
  const proc = Bun.spawn(["which", "git"], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  return exitCode === 0;
}
