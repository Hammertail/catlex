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

  it("executes JavaScript config modules when loading config by default", async () => {
    const cwd = await createTempDir();
    const markerPath = path.join(cwd, "config-executed.txt");
    await writeFile(
      path.join(cwd, "catlex.config.js"),
      `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(markerPath)}, "executed");
export default { messagesDir: "locales", baseLocale: "pt" };
`,
    );

    const config = await loadConfig(cwd);

    expect(await Bun.file(markerPath).text()).toBe("executed");
    expect(config).toEqual({
      messagesDir: "locales",
      baseLocale: "pt",
      strictExtra: false,
    });
  });

  it("does not load or execute config files when noConfig is true", async () => {
    const cwd = await createTempDir();
    const markerPath = path.join(cwd, "config-executed.txt");
    await writeFile(
      path.join(cwd, "catlex.config.js"),
      `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(markerPath)}, "executed");
export default { messagesDir: "locales", baseLocale: "pt", strictExtra: true };
`,
    );

    const config = await loadConfig(cwd, { noConfig: true });

    expect(await Bun.file(markerPath).exists()).toBe(false);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("still applies CLI flags when noConfig is true", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({
        messagesDir: "locales",
        baseLocale: "pt",
        strictExtra: true,
      }),
    );

    const config = await loadConfig(cwd, {
      noConfig: true,
      messagesDir: "i18n",
      baseLocale: "es",
    });

    expect(config).toEqual({
      messagesDir: "i18n",
      baseLocale: "es",
      strictExtra: false,
    });
  });

  it("loads optional openai baseUrl and headers from config", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({
        openai: {
          baseUrl: "https://openrouter.ai/api/v1",
          headers: {
            "HTTP-Referer": "https://example.com",
            "X-Title": "Catlex",
          },
        },
      }),
    );

    const config = await loadConfig(cwd);

    expect(config.openai).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": "https://example.com",
        "X-Title": "Catlex",
      },
    });
  });

  it("rejects invalid openai config", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "catlex.config.json"),
      JSON.stringify({
        openai: {
          baseUrl: "",
        },
      }),
    );

    await expect(loadConfig(cwd)).rejects.toThrow(/Invalid config/);
  });
});
