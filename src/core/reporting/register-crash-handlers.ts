import { writeCrashReportSync, type CrashReport } from "./write-error.ts";

export type RegisterOptions = {
  logDir?: string;
};

function buildCrashReportFromError(err: unknown): CrashReport {
  const now = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    timestamp: now,
    argv: process.argv,
    cwd: process.cwd(),
    node: typeof process !== "undefined" ? (process.version as string) : undefined,
    error: {
      message,
      stack,
    },
  };
}

function tryPersistCrashSync(err: unknown, providedDir?: string): void {
  try {
    if (process.env.CATLEX_NO_CRASH_LOGS === "1") return;
    const report = buildCrashReportFromError(err);
    writeCrashReportSync(report, providedDir);
  } catch {
    // swallow errors
  }
}

export function registerCrashHandlers(opts?: RegisterOptions): void {
  process.on("uncaughtException", (err) => {
    console.log("banan");
    tryPersistCrashSync(err, opts?.logDir);
  });

  process.on("unhandledRejection", (reason) => {
    console.log("melao");
    tryPersistCrashSync(reason, opts?.logDir);
  });
}
