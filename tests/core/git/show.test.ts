//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  GitError,
  assertGitRepo,
  assertRefExists,
  readFileAtRef,
  type GitRunner,
} from "../../../src/core/git/show.ts";

function createFakeRunner(handlers: {
  onArgs: (args: string[]) => { stdout: string; stderr: string; exitCode: number };
}): GitRunner {
  return async (args) => handlers.onArgs(args);
}

describe("assertGitRepo", () => {
  it("resolves when git rev-parse --is-inside-work-tree succeeds", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["rev-parse", "--is-inside-work-tree"]);
        return { stdout: "true\n", stderr: "", exitCode: 0 };
      },
    });

    await expect(assertGitRepo({ cwd: "/repo", runGit })).resolves.toBeUndefined();
  });

  it("throws GitError when the directory is not a git repository", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: not a git repository",
        exitCode: 128,
      }),
    });

    await expect(assertGitRepo({ cwd: "/not-a-repo", runGit })).rejects.toThrow(GitError);
    await expect(assertGitRepo({ cwd: "/not-a-repo", runGit })).rejects.toThrow(
      "not a git repository",
    );
  });
});

describe("assertRefExists", () => {
  it("resolves when the ref can be resolved", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["rev-parse", "--verify", "main^{object}"]);
        return { stdout: "abc123\n", stderr: "", exitCode: 0 };
      },
    });

    await expect(assertRefExists({ cwd: "/repo", ref: "main", runGit })).resolves.toBeUndefined();
  });

  it("throws GitError when the ref does not exist", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: Needed a single revision",
        exitCode: 128,
      }),
    });

    await expect(assertRefExists({ cwd: "/repo", ref: "missing", runGit })).rejects.toThrow(
      GitError,
    );
    await expect(assertRefExists({ cwd: "/repo", ref: "missing", runGit })).rejects.toThrow(
      'Git ref not found: "missing"',
    );
  });
});

describe("readFileAtRef", () => {
  it("returns file contents from git show", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["show", "main:messages/en.json"]);
        return {
          stdout: '{"welcome":"Welcome"}\n',
          stderr: "",
          exitCode: 0,
        };
      },
    });

    const content = await readFileAtRef({
      cwd: "/repo",
      ref: "main",
      path: "messages/en.json",
      runGit,
    });

    expect(content).toBe('{"welcome":"Welcome"}\n');
  });

  it("returns null when the file is missing at the ref", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: path 'messages/pt.json' does not exist in 'main'",
        exitCode: 128,
      }),
    });

    const content = await readFileAtRef({
      cwd: "/repo",
      ref: "main",
      path: "messages/pt.json",
      runGit,
    });

    expect(content).toBeNull();
  });

  it("supports paths that contain spaces", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["show", "HEAD:messages/my locale.json"]);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });

    const content = await readFileAtRef({
      cwd: "/repo",
      ref: "HEAD",
      path: "messages/my locale.json",
      runGit,
    });

    expect(content).toBe("{}");
  });

  it("throws GitError for unexpected non-zero exits", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: bad object",
        exitCode: 128,
      }),
    });

    await expect(
      readFileAtRef({
        cwd: "/repo",
        ref: "bad",
        path: "messages/en.json",
        runGit,
      }),
    ).rejects.toThrow(GitError);
  });
});
