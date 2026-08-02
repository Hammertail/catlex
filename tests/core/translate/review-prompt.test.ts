//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  REVIEW_INSTRUCTIONS,
  buildReviewPrompt,
} from "../../../src/core/translate/review-prompt.ts";

describe("buildReviewPrompt", () => {
  it("includes locales, pairs to review, and tool guidance", () => {
    const prompt = buildReviewPrompt({
      baseLocale: "en",
      targetLocale: "pt",
      items: [
        {
          path: "welcome",
          baseValue: "Welcome",
          localeValue: "Bem-vindo",
        },
        {
          path: "nav.about",
          baseValue: "About",
          localeValue: "About",
        },
      ],
    });

    expect(prompt).toContain("base locale: en");
    expect(prompt).toContain("target locale: pt");
    expect(prompt).toContain('welcome: base="Welcome" locale="Bem-vindo"');
    expect(prompt).toContain("submitTranslationReviews");
    expect(prompt).toContain("ok");
    expect(prompt).toContain("wrong");
  });
});

describe("REVIEW_INSTRUCTIONS", () => {
  it("asks the model to use the review tool only", () => {
    expect(REVIEW_INSTRUCTIONS).toContain("submitTranslationReviews");
  });
});
