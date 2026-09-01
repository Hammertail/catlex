//* Libraries imports
import { writeFile, rename, mkdir, readdir, stat, unlink, chmod } from "node:fs/promises";
import { writeFileSync, renameSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export type CrashReport = {
  timestamp: string;
  argv: string[];
  cwd: string;
  node?: string;
  error: {
    message: string;
    stack?: string;
  };
};

const LOG_RETENTION_DAYS = 30;

function defaultLogDir(): string {
  const home = os.homedir();
  return path.join(home, ".catlex", "logs");
}

function filenameFor(timestamp: Date): string {
  const y = timestamp.getFullYear();
  const mm = String(timestamp.getMonth() + 1).padStart(2, "0");
  const d = String(timestamp.getDate()).padStart(2, "0");
  const hh = String(timestamp.getHours()).padStart(2, "0");
  const min = String(timestamp.getMinutes()).padStart(2, "0");
  const ss = String(timestamp.getSeconds()).padStart(2, "0");
  return `${y}-${mm}-${d}_${hh}-${min}-${ss}_${process.pid}.txt`;
}

function formatReport(report: CrashReport): string {
  const header = `Timestamp: ${report.timestamp}\nCommand: ${report.argv.join(" ")}\nCwd: ${report.cwd}\nNode: ${report.node ?? "unknown"}\n\n`;
  const err = `Error: ${report.error.message}\n\nStack:\n${report.error.stack ?? "<no stack>"}\n`;
  return header + err;
}

async function pruneOldLogs(dir: string): Promise<void> {
  try {
    const files = await readdir(dir);
    const now = Date.now();
    const cutoff = now - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    await Promise.all(files.map(async (f) => {
      try {
        const p = path.join(dir, f);
        const s = await stat(p);
        if (s.mtimeMs < cutoff) {
          await unlink(p);
        }
      } catch {
        // ignore per-file errors
      }
    }));
  } catch {
    // ignore prune errors
  }
}

export async function writeCrashReport(report: CrashReport, providedDir?: string): Promise<string> {
  const dir = providedDir ?? defaultLogDir();
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const name = filenameFor(new Date(report.timestamp));
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    const contents = formatReport(report);
    try {
      await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
      await rename(tmp, target);
      try {
        await chmod(target, 0o600);
      } catch {
        // best-effort
      }
      // prune old logs asynchronously
      void pruneOldLogs(dir);
      return target;
    } catch (err) {
      // cleanup tmp if present
      try {
        await unlink(tmp);
      } catch {
        // ignore
      }
      throw err;
    }
  } catch (err) {
    // bubble up to caller for them to decide; callers should handle failures gracefully
    throw err;
  }
}

export function writeCrashReportSync(report: CrashReport, providedDir?: string): string {
  const dir = providedDir ?? defaultLogDir();
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const name = filenameFor(new Date(report.timestamp));
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    const contents = formatReport(report);
    try {
      writeFileSync(tmp, contents, { encoding: "utf8", mode: 0o600 });
      renameSync(tmp, target);
      try {
        chmodSync(target, 0o600);
      } catch {
        // best-effort
      }
      // best-effort prune (sync)
      try {
        const files = require("node:fs").readdirSync(dir);
        const now = Date.now();
        const cutoff = now - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const f of files) {
          try {
            const p = path.join(dir, f);
            const s = require("node:fs").statSync(p);
            if (s.mtimeMs < cutoff) {
              require("node:fs").unlinkSync(p);
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      return target;
    } catch (err) {
      try {
        require("node:fs").unlinkSync(tmp);
      } catch {
        // ignore
      }
      throw err;
    }
  } catch (err) {
    throw err;
  }
}
