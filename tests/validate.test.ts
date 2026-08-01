//* Libraries imports
import { describe, expect, it } from "bun:test";
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
});
