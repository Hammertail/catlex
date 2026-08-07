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

/**
 * Returns whether a path (blob or tree) exists at a git ref.
 * Uses exit status only so it stays locale-independent.
 */
async function pathExistsAtRef(
  options: GitCwdOptions & { ref: string; path: string },
): Promise<boolean> {
  const runGit = resolveRunner(options);
  const result = await runGit(["cat-file", "-e", `${options.ref}:${options.path}`], {
    cwd: options.cwd,
  });
  return result.exitCode === 0;
}

/**
 * Returns the current branch name, or null when HEAD is detached.
 */
export async function resolveCurrentBranch(options: GitCwdOptions): Promise<string | null> {
  const runGit = resolveRunner(options);
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: options.cwd,
  });

  if (result.exitCode !== 0) {
    throw new GitError(result.stderr.trim() || "Failed to resolve current branch", {
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  const name = result.stdout.trim();
  if (name.length === 0 || name === "HEAD") {
    return null;
  }

  return name;
}

/**
 * Resolves a git ref to a full commit SHA.
 */
export async function resolveRefSha(options: GitCwdOptions & { ref: string }): Promise<string> {
  const runGit = resolveRunner(options);
  const result = await runGit(["rev-parse", "--verify", `${options.ref}^{commit}`], {
    cwd: options.cwd,
  });

  if (result.exitCode !== 0) {
    throw new GitError(`Git ref not found: "${options.ref}"`, {
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  const sha = result.stdout.trim();
  if (sha.length === 0) {
    throw new GitError(`Git ref not found: "${options.ref}"`, {
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  return sha;
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
  const object = `${options.ref}:${options.path}`;

  const exists = await pathExistsAtRef(options);
  if (!exists) {
    return null;
  }

  const result = await runGit(["show", object], {
    cwd: options.cwd,
  });

  if (result.exitCode === 0) {
    return result.stdout;
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

  const exists = await pathExistsAtRef({
    cwd: options.cwd,
    ref: options.ref,
    path: options.directory,
    runGit: options.runGit,
  });
  if (!exists) {
    return [];
  }

  const result = await runGit(
    ["ls-tree", "-r", "--name-only", options.ref, "--", options.directory],
    { cwd: options.cwd },
  );

  if (result.exitCode !== 0) {
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
