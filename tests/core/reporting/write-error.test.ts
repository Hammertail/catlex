//* Libraries imports
import { describe, expect, it, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

//* Local imports
import { writeCrashReport, writeCrashReportSync, type CrashReport } from "../../../src/core/reporting/write-error.ts";

const tmpRoot = path.join(os.tmpdir(), `catlex-test-${process.pid}`);

function cleanupDir(dir: string) {
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
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
});
