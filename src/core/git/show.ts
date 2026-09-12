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
 * Rejects git refs that can be confused with options or `rev:path` / reflog syntax.
 *
 * Callers pass user-controlled values (e.g. `--since`) into argv arrays. Leading
 * dashes can be parsed as git options (`git show --output=…` writes a file).
 * Colons collide with `rev:path`; whitespace and `@{` enable awkward / reflog forms.
 */
export function assertSafeGitRef(ref: string): void {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new GitError('Invalid git ref: "". Refs must be a non-empty revision name.');
  }

  if (ref !== trimmed || /\s/.test(ref)) {
    throw new GitError(
      `Invalid git ref: "${ref}". Refs must not contain leading/trailing or internal whitespace.`,
    );
  }

  if (ref.startsWith("-")) {
    throw new GitError(
      `Invalid git ref: "${ref}". Refs must not start with "-" (git would treat them as options).`,
    );
  }

  if (ref.includes(":")) {
    throw new GitError(
      `Invalid git ref: "${ref}". Refs must not contain ":" (reserved for rev:path syntax).`,
    );
  }

  if (ref.includes("@{")) {
    throw new GitError(
      `Invalid git ref: "${ref}". Refs must not contain "@{" (reflog syntax is not allowed).`,
    );
  }
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
  assertSafeGitRef(options.ref);
  const runGit = resolveRunner(options);
  const result = await runGit(
    ["rev-parse", "--verify", "--end-of-options", `${options.ref}^{object}`],
    {
      cwd: options.cwd,
    },
  );

  if (result.exitCode !== 0) {
    throw new GitError(`Git ref not found: "${options.ref}"`, {
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }
}

/**
 * Normalizes a path for `git show <ref>:<path>` / `git cat-file -e <ref>:<path>`.
 *
 * Git resolves bare paths after `:` from the repository root. Prefixing with `./`
 * makes the path relative to `cwd`, which is required when Catlex runs from a
 * subdirectory (e.g. a monorepo package). Also normalizes Windows separators.
 *
 * Rejects empty paths, `:` (which would confuse `rev:path`), and `..` segments
 * so callers cannot escape the intended tree even if path arguments become
 * user-controlled later.
 */
export function toGitTreePath(relativePath: string): string {
  const normalized = relativePath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim();

  if (normalized.length === 0) {
    throw new GitError(
      `Invalid git tree path: "${relativePath}". Paths must be a non-empty tree-relative path.`,
    );
  }

  if (normalized.includes(":")) {
    throw new GitError(
      `Invalid git tree path: "${relativePath}". Paths must not contain ":" (reserved for rev:path syntax).`,
    );
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new GitError(
      `Invalid git tree path: "${relativePath}". Paths must not contain ".." segments.`,
    );
  }

  return `./${normalized}`;
}

/**
 * Returns whether a path (blob or tree) exists at a git ref.
 * Uses exit status only so it stays locale-independent.
 * Paths are normalized with `toGitTreePath` so resolution is relative to cwd.
 */
async function pathExistsAtRef(
  options: GitCwdOptions & { ref: string; path: string },
): Promise<boolean> {
  assertSafeGitRef(options.ref);
  const runGit = resolveRunner(options);
  const gitPath = toGitTreePath(options.path);
  const result = await runGit(["cat-file", "-e", "--end-of-options", `${options.ref}:${gitPath}`], {
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
  assertSafeGitRef(options.ref);
  const runGit = resolveRunner(options);
  const result = await runGit(
    ["rev-parse", "--verify", "--end-of-options", `${options.ref}^{commit}`],
    {
      cwd: options.cwd,
    },
  );

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
  assertSafeGitRef(options.ref);
  const runGit = resolveRunner(options);
  const gitPath = toGitTreePath(options.path);
  const object = `${options.ref}:${gitPath}`;

  const exists = await pathExistsAtRef(options);
  if (!exists) {
    return null;
  }

  const result = await runGit(["show", "--end-of-options", object], {
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
   * Directory path relative to cwd (resolved from the repository root when bare).
   */
  directory: string;
};

/**
 * Lists file paths (relative to repo root) under a directory at a git ref.
 */
export async function listFilesAtRef(options: ListFilesAtRefOptions): Promise<string[]> {
  assertSafeGitRef(options.ref);
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
    ["ls-tree", "-r", "--name-only", "--end-of-options", options.ref, "--", options.directory],
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
