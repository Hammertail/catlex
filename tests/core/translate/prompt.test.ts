//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { buildTranslatePrompt } from "../../../src/core/translate/prompt.ts";

describe("buildTranslatePrompt", () => {
  it("includes base locale, target locale, missing keys, and examples", () => {
    const prompt = buildTranslatePrompt({
      baseLocale: "en",
      targetLocale: "pt",
      missing: [
        { path: "nav.about", baseValue: "About" },
        { path: "farewell", baseValue: "Goodbye {name}" },
      ],
      examples: [
        {
          path: "nav.home",
          baseValue: "Home",
          localeValue: "Início",
        },
      ],
    });

    expect(prompt).toContain("base locale: en");
    expect(prompt).toContain("target locale: pt");
    expect(prompt).toContain("nav.about");
    expect(prompt).toContain("About");
    expect(prompt).toContain("Goodbye {name}");
    expect(prompt).toContain("Home");
    expect(prompt).toContain("Início");
    expect(prompt).toContain("submitTranslations");
  });
});
