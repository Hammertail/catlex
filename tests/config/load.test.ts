//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { loadConfig } from "../../src/core/config/load.ts";
import { DEFAULT_CONFIG } from "../../src/core/config/defaults.ts";

describe("loadConfig", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "catlex-config-"));
    tempDirs.push(dir);
    return dir;
  }

  it("returns defaults when no config file or flags are provided", async () => {
    const cwd = await createTempDir();
    const config = await loadConfig(cwd);

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("merges config file over defaults", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({
        messagesDir: "locales",
        baseLocale: "pt",
        strictExtra: true,
      }),
    );

    const config = await loadConfig(cwd);

    expect(config).toEqual({
      messagesDir: "locales",
      baseLocale: "pt",
      strictExtra: true,
    });
  });

  it("merges flags over config file and defaults", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({
        messagesDir: "locales",
        baseLocale: "pt",
      }),
    );

    const config = await loadConfig(cwd, {
      messagesDir: "i18n",
      strictExtra: true,
    });

    expect(config).toEqual({
      messagesDir: "i18n",
      baseLocale: "pt",
      strictExtra: true,
    });
  });

  it("ignores undefined flags when merging", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "messages"), { recursive: true });
    await writeFile(path.join(cwd, "catlex.config.json"), JSON.stringify({ baseLocale: "es" }));

    const config = await loadConfig(cwd, {
      messagesDir: undefined,
      baseLocale: undefined,
    });

    expect(config.baseLocale).toBe("es");
    expect(config.messagesDir).toBe("messages");
  });
});
