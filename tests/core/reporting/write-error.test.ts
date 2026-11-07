//* Libraries imports
import { describe, expect, it, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

//* Local imports
import {
  writeCrashReport,
  writeCrashReportSync,
  type CrashReport,
} from "../../../src/core/reporting/write-error.ts";

const tmpRoot = path.join(os.tmpdir(), `catlex-test-${process.pid}`);

function cleanupDir(dir: string) {
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch {}
      }
      fs.rmdirSync(dir);
    }
  } catch (_e) {
    // ignore
  }
}

afterEach(() => {
  cleanupDir(tmpRoot);
});

function sampleReport(): CrashReport {
  return {
    timestamp: new Date().toISOString(),
    argv: ["node", "-e", "boom"],
    cwd: "/tmp",
    node: process.version,
    error: { message: "boom", stack: "Error: boom\n at <test>" },
  };
}

describe("writeCrashReport", () => {
  it("writes an async crash report file", async () => {
    const report = sampleReport();
    const saved = await writeCrashReport(report, tmpRoot);
    expect(fs.existsSync(saved)).toBe(true);
    const contents = fs.readFileSync(saved, "utf8");
    expect(contents).toContain("Error: boom");
    expect(contents).toContain("Stack:");
  });

  it("writes a sync crash report file", () => {
    const report = sampleReport();
    const saved = writeCrashReportSync(report, tmpRoot);
    expect(fs.existsSync(saved)).toBe(true);
    const contents = fs.readFileSync(saved, "utf8");
    expect(contents).toContain("Error: boom");
  });

  describe("when the report carries sensitive values", () => {
    function sensitiveReport(): CrashReport {
      return {
        ...sampleReport(),
        argv: ["bun", "catlex", "translate", "--guidance", "secret glossary", "--json"],
        error: {
          message: "fetch failed: https://user:token@proxy.example/v1",
          stack: "Error: fetch failed: https://user:token@proxy.example/v1\n at <test>",
        },
      };
    }

    function expectRedacted(contents: string) {
      expect(contents).not.toContain("secret glossary");
      expect(contents).not.toContain("user:token");
      expect(contents).toContain("Command: bun catlex translate --guidance <redacted> --json");
      expect(contents).toContain("https://<redacted>@proxy.example/v1");
    }

    it("redacts them from the async report", async () => {
      const saved = await writeCrashReport(sensitiveReport(), tmpRoot);
      expectRedacted(fs.readFileSync(saved, "utf8"));
    });

    it("redacts them from the sync report", () => {
      const saved = writeCrashReportSync(sensitiveReport(), tmpRoot);
      expectRedacted(fs.readFileSync(saved, "utf8"));
    });
  });
});
