//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runValidateCommand } from "../../../src/cli/commands/validate.tsx";

describe("runValidateCommand", () => {
  const tempDirs: string[] = [];
  const logSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(async () => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  function silenceLog(): void {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(spy);
  }

  async function createProject(): Promise<{ cwd: string; markerPath: string }> {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-validate-cmd-"));
    tempDirs.push(cwd);
    const markerPath = path.join(cwd, "config-executed.txt");
    await mkdir(path.join(cwd, "messages"), { recursive: true });
    await writeFile(path.join(cwd, "messages", "en.json"), JSON.stringify({ hello: "Hello" }));
    await writeFile(path.join(cwd, "messages", "pt.json"), JSON.stringify({ hello: "Olá" }));
    await writeFile(
      path.join(cwd, "catlex.config.js"),
      `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(markerPath)}, "executed");
export default { messagesDir: "messages", baseLocale: "en" };
`,
    );
    return { cwd, markerPath };
  }

  it("executes project JavaScript config by default", async () => {
    const { cwd, markerPath } = await createProject();
    silenceLog();

    const code = await runValidateCommand({ cwd, json: true });

    expect(code).toBe(0);
    expect(await Bun.file(markerPath).text()).toBe("executed");
  });

  it("does not execute project JavaScript config when noConfig is true", async () => {
    const { cwd, markerPath } = await createProject();
    silenceLog();

    const code = await runValidateCommand({ cwd, json: true, noConfig: true });

    expect(code).toBe(0);
    expect(await Bun.file(markerPath).exists()).toBe(false);
  });
});
