//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { hasFailingIssues, validateTranslations } from "../src/core/validate.ts";

const fixturesRoot = path.join(import.meta.dir, "fixtures");

describe("validateTranslations", () => {
  it("reports missing and extra keys against the fixture messages", async () => {
    const result = await validateTranslations({
      cwd: fixturesRoot,
      messagesDir: "messages",
      baseLocale: "en",
    });

    const ptIssues = result.issues.filter((issue) => issue.locale === "pt");
    const esIssues = result.issues.filter((issue) => issue.locale === "es");

    expect(ptIssues).toContainEqual({
      locale: "pt",
      path: "nav.about",
      kind: "missing",
    });
    expect(ptIssues).toContainEqual({
      locale: "pt",
      path: "extraOnly",
      kind: "extra",
    });
    expect(esIssues).toEqual([]);
  });

  it("fails when missing keys exist", () => {
    expect(hasFailingIssues([{ locale: "pt", path: "nav.about", kind: "missing" }], false)).toBe(
      true,
    );
  });

  it("treats extra keys as warnings unless strictExtra is enabled", () => {
    const extras = [{ locale: "pt", path: "extraOnly", kind: "extra" as const }];

    expect(hasFailingIssues(extras, false)).toBe(false);
    expect(hasFailingIssues(extras, true)).toBe(true);
  });

  describe("with a JavaScript project config", () => {
    async function createJsConfigProject(): Promise<string> {
      const cwd = await mkdtemp(path.join(tmpdir(), "catlex-validate-js-config-"));
      await mkdir(path.join(cwd, "locales"), { recursive: true });
      await writeFile(path.join(cwd, "locales", "en.json"), JSON.stringify({ hello: "Hello" }));
      await writeFile(path.join(cwd, "locales", "pt.json"), JSON.stringify({}));
      await writeFile(
        path.join(cwd, "catlex.config.js"),
        'export default { messagesDir: "locales", baseLocale: "en" };\n',
      );
      return cwd;
    }

    it("refuses the config without allowJsConfig", async () => {
      const cwd = await createJsConfigProject();

      await expect(validateTranslations({ cwd })).rejects.toThrow(/allow-js-config|allowJsConfig/);
    });

    it("applies the config when allowJsConfig is true", async () => {
      const cwd = await createJsConfigProject();

      const result = await validateTranslations({ cwd, allowJsConfig: true });

      expect(result.issues).toContainEqual({ locale: "pt", path: "hello", kind: "missing" });
    });
  });
});
