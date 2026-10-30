export type GitRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GitRunner = (args: string[], options: { cwd: string }) => Promise<GitRunResult>;

/**
 * Low-level git spawn helper. Prefer `assertRefExists`, `resolveRefSha`,
 * `readFileAtRef`, and `listFilesAtRef` for user-controlled refs/paths — those
 * APIs validate inputs and place them after `--end-of-options`.
 *
 * `runGit` itself does not validate `args`. Callers that pass user-controlled
 * values must validate refs with `assertSafeGitRef` (and avoid unsafe tree
 * paths via `toGitTreePath`) and place them after `--end-of-options` / `--`.
 *
 * Inherits the process environment (including `GIT_DIR`, `GIT_WORK_TREE`, and
 * `GIT_CONFIG_*`) so standard git configuration keeps working.
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
