//* Libraries imports
import path from "node:path";
import { render } from "ink";

//* Local imports
import { ScanReport } from "../ui/ScanReport.tsx";
import { SCAN_ALPHA_MESSAGE } from "../ui/scan-report-view.ts";
import { scanHardcoded } from "../../core/scan/scan.ts";

//* Types imports
import type { ScanResult } from "../../core/scan/types.ts";

export type ScanCommandOptions = {
  dir?: string;
  cwd?: string;
  json?: boolean;
};

/** Exit codes for `catlex scan` (distinct from unexpected CLI wrapper failures). */
const SCAN_EXIT = {
  ok: 0,
  findings: 1,
  error: 2,
} as const;

function resolveScanRoot(options: ScanCommandOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? ".";
  return path.resolve(cwd, dir);
}

function printJson(result: ScanResult): void {
  const hasErrors = result.errors.length > 0;
  const hasFindings = result.issues.length > 0;
  const payload = {
    ok: !hasErrors && !hasFindings,
    alpha: true,
    alphaMessage: SCAN_ALPHA_MESSAGE,
    rootDir: result.rootDir,
    issues: result.issues,
    errors: result.errors,
  };

  console.log(JSON.stringify(payload, null, 2));
}

function renderReport(result: ScanResult): void {
  const instance = render(<ScanReport result={result} />);
  instance.unmount();
}

function emitScanOutput(result: ScanResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }

  renderReport(result);
}

function exitCodeForScanResult(result: ScanResult): number {
  if (result.errors.length > 0) {
    return SCAN_EXIT.error;
  }

  if (result.issues.length > 0) {
    return SCAN_EXIT.findings;
  }

  return SCAN_EXIT.ok;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  // Let unexpected failures propagate to program.ts (`setExitCodeFrom` → exit 1).
  // Exit 2 is only for completed scans with per-file errors.
  const result = await scanHardcoded(resolveScanRoot(options));
  emitScanOutput(result, options.json === true);
  return exitCodeForScanResult(result);
}
