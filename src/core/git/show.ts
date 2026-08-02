//* Local imports
import { runGit as defaultRunGit, type GitRunner } from "./run.ts";

export type { GitRunner };

export class GitError extends Error {
  readonly stderr: string;
  readonly exitCode: number;

  constructor(message: string, details?: { stderr?: string; exitCode?: number }) {
    super(message);
    this.name = "GitError";
    this.stderr = details?.stderr ?? "";
    this.exitCode = details?.exitCode ?? 1;
  }
}

export type GitCwdOptions = {
  cwd: string;
  runGit?: GitRunner;
};

function resolveRunner(options: GitCwdOptions): GitRunner {
  return options.runGit ?? defaultRunGit;
}

function isMissingPathError(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("exists on disk, but not in") ||
    normalized.includes("path not in")
  );
}

/**
 * Ensures cwd is inside a git work tree.
 */
export async function assertGitRepo(options: GitCwdOptions): Promise<void> {
  const runGit = resolveRunner(options);
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: options.cwd });

  if (result.exitCode !== 0) {
    throw new GitError(
      result.stderr.trim() || "not a git repository (or any of the parent directories)",
      { stderr: result.stderr, exitCode: result.exitCode },
    );
  }
}

/**
 * Ensures a git ref resolves to an object.
 */
export async function assertRefExists(options: GitCwdOptions & { ref: string }): Promise<void> {
  const runGit = resolveRunner(options);
  const result = await runGit(["rev-parse", "--verify", `${options.ref}^{object}`], {
    cwd: options.cwd,
  });

  if (result.exitCode !== 0) {
    throw new GitError(`Git ref not found: "${options.ref}"`, {
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }
}

export type ReadFileAtRefOptions = GitCwdOptions & {
  ref: string;
  path: string;
};

/**
 * Reads a file blob at a git ref. Returns null when the path is absent at that ref.
 */
export async function readFileAtRef(options: ReadFileAtRefOptions): Promise<string | null> {
  const runGit = resolveRunner(options);
  const result = await runGit(["show", `${options.ref}:${options.path}`], {
    cwd: options.cwd,
  });

  if (result.exitCode === 0) {
    return result.stdout;
  }

  if (isMissingPathError(result.stderr)) {
    return null;
  }

  throw new GitError(result.stderr.trim() || `Failed to read ${options.path} at ${options.ref}`, {
    stderr: result.stderr,
    exitCode: result.exitCode,
  });
}

export type ListFilesAtRefOptions = GitCwdOptions & {
  ref: string;
  /**
   * Directory path relative to the repository root.
   */
  directory: string;
};

/**
 * Lists file paths (relative to repo root) under a directory at a git ref.
 */
export async function listFilesAtRef(options: ListFilesAtRefOptions): Promise<string[]> {
  const runGit = resolveRunner(options);
  const result = await runGit(
    ["ls-tree", "-r", "--name-only", options.ref, "--", options.directory],
    { cwd: options.cwd },
  );

  if (result.exitCode !== 0) {
    if (result.stderr.toLowerCase().includes("not a tree") || isMissingPathError(result.stderr)) {
      return [];
    }
    throw new GitError(
      result.stderr.trim() || `Failed to list files at ${options.ref}:${options.directory}`,
      { stderr: result.stderr, exitCode: result.exitCode },
    );
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}
