//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  GitError,
  assertGitRepo,
  assertRefExists,
  readFileAtRef,
  resolveCurrentBranch,
  resolveRefSha,
  toGitTreePath,
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

describe("resolveCurrentBranch", () => {
  it("returns the branch name when HEAD points at a branch", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
        return { stdout: "feature/review-feedback\n", stderr: "", exitCode: 0 };
      },
    });

    await expect(resolveCurrentBranch({ cwd: "/repo", runGit })).resolves.toBe(
      "feature/review-feedback",
    );
  });

  it("returns null when HEAD is detached", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({ stdout: "HEAD\n", stderr: "", exitCode: 0 }),
    });

    await expect(resolveCurrentBranch({ cwd: "/repo", runGit })).resolves.toBeNull();
  });

  it("throws GitError when git cannot resolve HEAD", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: not a git repository",
        exitCode: 128,
      }),
    });

    await expect(resolveCurrentBranch({ cwd: "/not-a-repo", runGit })).rejects.toThrow(GitError);
  });
});

describe("resolveRefSha", () => {
  it("returns the full commit SHA for a ref", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["rev-parse", "--verify", "origin/main^{commit}"]);
        return {
          stdout: "abcdef0123456789abcdef0123456789abcdef01\n",
          stderr: "",
          exitCode: 0,
        };
      },
    });

    await expect(resolveRefSha({ cwd: "/repo", ref: "origin/main", runGit })).resolves.toBe(
      "abcdef0123456789abcdef0123456789abcdef01",
    );
  });

  it("throws GitError when the ref does not resolve to a commit", async () => {
    const runGit = createFakeRunner({
      onArgs: () => ({
        stdout: "",
        stderr: "fatal: Needed a single revision",
        exitCode: 128,
      }),
    });

    await expect(resolveRefSha({ cwd: "/repo", ref: "missing", runGit })).rejects.toThrow(GitError);
    await expect(resolveRefSha({ cwd: "/repo", ref: "missing", runGit })).rejects.toThrow(
      'Git ref not found: "missing"',
    );
  });
});

describe("toGitTreePath", () => {
  it("prefixes relative paths with ./ so git resolves them from cwd", () => {
    expect(toGitTreePath("messages/en.json")).toBe("./messages/en.json");
  });

  it("normalizes Windows separators and strips an existing ./ prefix", () => {
    expect(toGitTreePath("messages\\en.json")).toBe("./messages/en.json");
    expect(toGitTreePath("./messages/en.json")).toBe("./messages/en.json");
  });
});

describe("readFileAtRef", () => {
  it("returns file contents from git show", async () => {
    const runGit = createFakeRunner({
      onArgs: (args) => {
        expect(args).toEqual(["show", "main:./messages/en.json"]);
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
        expect(args).toEqual(["show", "HEAD:./messages/my locale.json"]);
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
