//* Local imports
import { redactUrlCredentials } from "./redact.ts";
import { writeCrashReportSync } from "./write-error.ts";

//* Types imports
import type { CrashReport } from "./write-error.ts";

export type RegisterOptions = {
  logDir?: string;
};

function currentDirectory(): string {
  try {
    return process.cwd();
  } catch {
    return "<unavailable>";
  }
}

function buildCrashReportFromError(err: unknown): CrashReport {
  const now = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    timestamp: now,
    argv: process.argv,
    cwd: currentDirectory(),
    node: typeof process !== "undefined" ? (process.version as string) : undefined,
    error: {
      message,
      stack,
    },
  };
}

function tryPersistCrashSync(report: CrashReport, providedDir?: string): string | undefined {
  try {
    if (process.env.CATLEX_NO_CRASH_LOGS === "1") return undefined;
    return writeCrashReportSync(report, providedDir);
  } catch {
    return undefined;
  }
}

function printFatalError(report: CrashReport, savedPath: string | undefined): void {
  const details = savedPath ? report.error.message : (report.error.stack ?? report.error.message);
  console.error(`catlex: unexpected error: ${redactUrlCredentials(details)}`);
  if (savedPath) console.error(`Crash log saved to ${savedPath}`);
}

/**
 * Registering a handler suppresses the runtime's default crash output and exit,
 * so this has to report the error and end the process itself. Exiting non-zero
 * keeps a crash from passing as success in CI.
 */
function handleFatalError(err: unknown, providedDir?: string): void {
  try {
    const report = buildCrashReportFromError(err);
    printFatalError(report, tryPersistCrashSync(report, providedDir));
  } catch {
    console.error("catlex: unexpected error (details unavailable)");
  } finally {
    process.exit(1);
  }
}

export function registerCrashHandlers(opts?: RegisterOptions): void {
  process.on("uncaughtException", (err) => {
    handleFatalError(err, opts?.logDir);
  });

  process.on("unhandledRejection", (reason) => {
    handleFatalError(reason, opts?.logDir);
  });
}
