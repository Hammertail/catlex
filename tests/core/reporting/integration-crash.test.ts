//* Libraries imports
import { describe, expect, it, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

//* Local imports
import { registerCrashHandlers } from "../../../src/core/reporting/register-crash-handlers.ts";

const tmpRoot = path.join(os.tmpdir(), `catlex-integration-${process.pid}`);

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

describe("integration: crash handler", () => {
  it("persists a crash when an uncaught exception is emitted", () => {
    registerCrashHandlers({ logDir: tmpRoot });
    // Emit an uncaught exception; the handler writes synchronously.
    const err = new Error("integration-boom");
    // Emit
    process.emit("uncaughtException", err);

    // Expect at least one file in tmpRoot
    const files = fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot) : [];
    expect(files.length).toBeGreaterThan(0);
    //@ts-expect-error
    const contents = fs.readFileSync(path.join(tmpRoot, files[0]), "utf8");
    expect(contents).toContain("integration-boom");
  });
});
