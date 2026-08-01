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

function resolveScanRoot(options: ScanCommandOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? ".";
  return path.resolve(cwd, dir);
}

function printJson(result: ScanResult): void {
  const failed = result.issues.length > 0;
  const payload = {
    ok: !failed,
    alpha: true,
    alphaMessage: SCAN_ALPHA_MESSAGE,
    rootDir: result.rootDir,
    issues: result.issues,
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

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  const result = await scanHardcoded(resolveScanRoot(options));
  emitScanOutput(result, options.json === true);
  return result.issues.length > 0 ? 1 : 0;
}
