export type GitRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GitRunner = (args: string[], options: { cwd: string }) => Promise<GitRunResult>;

/**
 * Runs a git command with the given args in cwd.
 *
 * Inherits the process environment (including `GIT_DIR`, `GIT_WORK_TREE`, and
 * `GIT_CONFIG_*`) so callers can use standard git configuration. Refs passed in
 * `args` must already be validated (see `assertSafeGitRef`) and placed after
 * `--end-of-options` / `--` so they cannot be parsed as options.
 */
export const runGit: GitRunner = async (args, options) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
};
