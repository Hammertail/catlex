//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runScanCommand } from "../../../src/cli/commands/scan.tsx";
import { SCAN_ALPHA_MESSAGE } from "../../../src/cli/ui/scan-report-view.ts";
import { fixturesRoot } from "../../scan/helpers.ts";

describe("runScanCommand", () => {
  const logSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
  });

  function captureLog(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(spy);
    return spy;
  }

  it("returns 0 and prints JSON when no hardcoded strings are found", async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), "catlex-scan-empty-"));
    const log = captureLog();

    const exitCode = await runScanCommand({
      cwd: emptyDir,
      dir: ".",
      json: true,
    });

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.ok).toBe(true);
    expect(payload.alpha).toBe(true);
    expect(payload.alphaMessage).toBe(SCAN_ALPHA_MESSAGE);
    expect(payload.rootDir).toBe(path.resolve(emptyDir));
    expect(payload.issues).toEqual([]);
  });

  it("returns 1 and includes issues in JSON when hardcoded strings are found", async () => {
    const log = captureLog();

    const exitCode = await runScanCommand({
      cwd: fixturesRoot,
      dir: ".",
      json: true,
    });

    expect(exitCode).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.ok).toBe(false);
    expect(payload.alpha).toBe(true);
    expect(payload.issues.length).toBeGreaterThan(0);
    expect(payload.issues[0]).toMatchObject({
      text: expect.any(String),
      kind: expect.stringMatching(/^jsx-(text|attribute)$/),
      line: expect.any(Number),
      column: expect.any(Number),
    });
  });

  it("resolves --dir relative to --cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-scan-cwd-"));
    const nested = path.join(root, "src");
    await mkdir(nested);
    await writeFile(
      path.join(nested, "Button.tsx"),
      "export const B = () => <button>Save</button>;\n",
    );
    const log = captureLog();

    const exitCode = await runScanCommand({
      cwd: root,
      dir: "src",
      json: true,
    });

    expect(exitCode).toBe(1);

    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.rootDir).toBe(path.resolve(root, "src"));
    expect(payload.issues.some((issue: { text: string }) => issue.text === "Save")).toBe(true);
  });

  it("defaults dir to the cwd root when dir is omitted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-scan-default-dir-"));
    await writeFile(path.join(root, "ok.tsx"), "export const Ok = () => <span>{t('ok')}</span>;\n");
    const log = captureLog();

    const exitCode = await runScanCommand({
      cwd: root,
      json: true,
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.rootDir).toBe(path.resolve(root));
    expect(payload.issues).toEqual([]);
  });
});
