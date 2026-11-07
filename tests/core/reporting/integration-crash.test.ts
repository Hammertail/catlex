//* Libraries imports
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const handlersModule = path.join(repoRoot, "src/core/reporting/register-crash-handlers.ts");
const binEntry = path.join(repoRoot, "src/bin/catlex.ts");

const FATAL = {
  uncaughtException: `setTimeout(() => { throw new Error("integration-boom"); }, 0);`,
  unhandledRejection: `Promise.reject(new Error("integration-boom"));`,
  nonErrorRejection: `Promise.reject("integration-boom");`,
  unprintableRejection: `Promise.reject(Object.create(null));`,
  credentialsInMessage: `setTimeout(() => { throw new Error("integration-boom https://user:token@proxy.example/v1?access_token=QUERYSECRET"); }, 0);`,
  hugeMessage: `setTimeout(() => { throw new Error("integration-boom " + "A".repeat(2_000_000)); }, 0);`,
  deletedCwd: `setTimeout(() => {
  const fs = require("node:fs");
  fs.mkdirSync("gone");
  process.chdir("gone");
  fs.rmdirSync("../gone");
  throw new Error("integration-boom");
}, 0);`,
} as const;

const SPAWN_TIMEOUT_MS = 20_000;

type CrashRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
  logs: string[];
};

let root: string;
let logDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "catlex-integration-"));
  logDir = path.join(root, "logs");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Runs a real process that registers the handlers and then crashes: handlers
 * end the process, so they cannot be exercised inside the test runner.
 */
function runCrashingProcess(
  fatal: keyof typeof FATAL,
  options: { args?: string[]; env?: Record<string, string> } = {},
): CrashRun {
  const script = path.join(root, "crash.ts");
  fs.writeFileSync(
    script,
    `import { registerCrashHandlers } from ${JSON.stringify(handlersModule)};
registerCrashHandlers({ logDir: ${JSON.stringify(logDir)} });
${FATAL[fatal]}
setTimeout(() => { console.log("still-running"); }, 200);
`,
  );
  return spawnAndCollect([process.execPath, script, ...(options.args ?? [])], logDir, options.env);
}

function spawnAndCollect(cmd: string[], logsIn: string, env?: Record<string, string>): CrashRun {
  const proc = Bun.spawnSync(cmd, {
    cwd: root,
    env: { ...process.env, CATLEX_NO_CRASH_LOGS: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT_MS,
  });
  const logs = fs.statSync(logsIn, { throwIfNoEntry: false })?.isDirectory()
    ? fs.readdirSync(logsIn).map((name) => fs.readFileSync(path.join(logsIn, name), "utf8"))
    : [];
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    logs,
  };
}

describe("integration: crash handlers", () => {
  describe.each(["uncaughtException", "unhandledRejection"] as const)("on %s", (fatal) => {
    it("persists a crash report", () => {
      const run = runCrashingProcess(fatal);
      expect(run.logs).toHaveLength(1);
      expect(run.logs[0]).toContain("integration-boom");
    });

    it("exits with code 1 without running any further work", () => {
      const run = runCrashingProcess(fatal);
      expect(run.exitCode).toBe(1);
      expect(run.stdout).not.toContain("still-running");
    });

    it("keeps stdout clean so --json consumers are not corrupted", () => {
      const run = runCrashingProcess(fatal);
      expect(run.stdout).toBe("");
    });

    it("prints the error and the saved crash log path to stderr", () => {
      const run = runCrashingProcess(fatal);
      expect(run.stderr).toContain("integration-boom");
      expect(run.stderr).toContain(logDir);
    });

    it("leaves the stack to the crash log when one was saved", () => {
      const run = runCrashingProcess(fatal);
      expect(run.stderr).not.toContain("crash.ts");
    });

    it("redacts sensitive arguments from the persisted report", () => {
      const run = runCrashingProcess(fatal, {
        args: ["--guidance", "secret glossary", "--base-url=https://user:token@proxy.example/v1"],
      });
      expect(run.logs[0]).toContain("--guidance <redacted>");
      expect(run.logs[0]).toContain("--base-url=<redacted>");
      expect(run.logs[0]).not.toContain("secret glossary");
      expect(run.logs[0]).not.toContain("user:token");
    });

    it("never persists environment variables", () => {
      const run = runCrashingProcess(fatal, { env: { CATLEX_TEST_ENV_VALUE: "env-canary-value" } });
      expect(run.logs).toHaveLength(1);
      expect(run.logs[0]).not.toContain("env-canary-value");
    });

    describe("with CATLEX_NO_CRASH_LOGS=1", () => {
      it("writes no report, still fails, and prints the stack instead", () => {
        const run = runCrashingProcess(fatal, { env: { CATLEX_NO_CRASH_LOGS: "1" } });
        expect(run.logs).toHaveLength(0);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain("integration-boom");
        expect(run.stderr).toContain("crash.ts");
      });
    });
  });

  it("handles rejections whose reason is not an Error", () => {
    const run = runCrashingProcess("nonErrorRejection");
    expect(run.exitCode).toBe(1);
    expect(run.logs[0]).toContain("integration-boom");
    expect(run.stderr).toContain("integration-boom");
  });

  it("still fails and reports the error when the crash log cannot be written", () => {
    fs.writeFileSync(logDir, "not a directory");
    const run = runCrashingProcess("uncaughtException");
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("integration-boom");
  });

  describe.each([
    ["logging on", ""],
    ["logging off", "1"],
  ])("with URL credentials in the error message and %s", (_label, noCrashLogs) => {
    it("redacts them from stderr", () => {
      const run = runCrashingProcess("credentialsInMessage", {
        env: { CATLEX_NO_CRASH_LOGS: noCrashLogs },
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("https://<redacted>@proxy.example/v1");
      expect(run.stderr).not.toContain("user:token");
      expect(run.stderr).not.toContain("QUERYSECRET");
      for (const log of run.logs) {
        expect(log).not.toContain("user:token");
        expect(log).not.toContain("QUERYSECRET");
      }
    });
  });

  it(
    "does not hang on a very long error message",
    () => {
      const run = runCrashingProcess("hugeMessage");
      expect(run.exitCode).toBe(1);
      expect(run.logs).toHaveLength(1);
      expect(run.stderr).toContain("integration-boom");
    },
    SPAWN_TIMEOUT_MS + 5_000,
  );

  it("keeps the original error when the working directory no longer exists", () => {
    const run = runCrashingProcess("deletedCwd");
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("integration-boom");
    expect(run.logs[0]).toContain("integration-boom");
  });

  it("fails with a message when the rejection reason cannot be described", () => {
    const run = runCrashingProcess("unprintableRejection");
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("catlex: unexpected error");
  });

  it(
    "is wired into the real CLI entry point",
    () => {
      const home = path.join(root, "home");
      const preload = path.join(root, "preload.ts");
      fs.mkdirSync(home);
      fs.writeFileSync(
        preload,
        `const poll = setInterval(() => {
  if (process.listenerCount("uncaughtException") === 0) return;
  clearInterval(poll);
  setTimeout(() => { throw new Error("integration-boom"); }, 0);
}, 1);
`,
      );
      const run = spawnAndCollect(
        [
          process.execPath,
          "--preload",
          preload,
          binEntry,
          "translate",
          "--no-config",
          "--dry-run",
          "--cwd",
          root,
          "--guidance",
          "secret glossary",
        ],
        path.join(home, ".catlex", "logs"),
        { HOME: home, USERPROFILE: home },
      );
      expect(run.exitCode).toBe(1);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("catlex: unexpected error: integration-boom");
      expect(run.logs).toHaveLength(1);
      expect(run.logs[0]).toContain("--guidance <redacted>");
      expect(run.logs[0]).not.toContain("secret glossary");
    },
    SPAWN_TIMEOUT_MS + 5_000,
  );
});
