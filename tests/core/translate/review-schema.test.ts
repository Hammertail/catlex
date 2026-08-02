//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  submitTranslationReviewsSchema,
  validateSubmittedReviews,
} from "../../../src/core/translate/review-schema.ts";

describe("submitTranslationReviewsSchema", () => {
  it("accepts ok and wrong verdicts", () => {
    const parsed = submitTranslationReviewsSchema.parse({
      locale: "pt",
      reviews: [
        { path: "welcome", verdict: "ok" },
        {
          path: "nav.about",
          verdict: "wrong",
          reason: "Meaning drifted",
          suggestedValue: "Sobre",
        },
      ],
    });

    expect(parsed.reviews).toHaveLength(2);
  });

  it("rejects unknown verdicts", () => {
    expect(() =>
      submitTranslationReviewsSchema.parse({
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "maybe" }],
      }),
    ).toThrow();
  });
});

describe("validateSubmittedReviews", () => {
  it("keeps allowed paths and reports unexpected ones", () => {
    const result = validateSubmittedReviews({
      allowedPaths: new Set(["welcome", "nav.about"]),
      baseValues: new Map([
        ["welcome", "Welcome"],
        ["nav.about", "About {name}"],
      ]),
      requireSuggestedValue: false,
      submitted: {
        locale: "pt",
        reviews: [
          { path: "welcome", verdict: "ok" },
          {
            path: "nav.about",
            verdict: "wrong",
            reason: "Bad",
            suggestedValue: "Sobre {name}",
          },
          { path: "extra", verdict: "ok" },
        ],
      },
    });

    expect(result.accepted.map((item) => item.path)).toEqual(["nav.about", "welcome"]);
    expect(result.unexpectedPaths).toEqual(["extra"]);
    expect(result.missingPaths).toEqual([]);
    expect(result.placeholderWarnings).toEqual([]);
  });

  it("reports paths that were not reviewed", () => {
    const result = validateSubmittedReviews({
      allowedPaths: new Set(["welcome", "title"]),
      baseValues: new Map([
        ["welcome", "Welcome"],
        ["title", "Title"],
      ]),
      requireSuggestedValue: false,
      submitted: {
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "ok" }],
      },
    });

    expect(result.missingPaths).toEqual(["title"]);
  });

  it("requires suggestedValue for wrong verdicts when auto-fix is enabled", () => {
    const result = validateSubmittedReviews({
      allowedPaths: new Set(["welcome"]),
      baseValues: new Map([["welcome", "Welcome"]]),
      requireSuggestedValue: true,
      submitted: {
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "wrong", reason: "Bad" }],
      },
    });

    expect(result.missingSuggestedPaths).toEqual(["welcome"]);
    expect(result.accepted).toEqual([]);
  });

  it("warns when suggestedValue placeholders diverge from the base", () => {
    const result = validateSubmittedReviews({
      allowedPaths: new Set(["greeting"]),
      baseValues: new Map([["greeting", "Hello {name}"]]),
      requireSuggestedValue: true,
      submitted: {
        locale: "pt",
        reviews: [
          {
            path: "greeting",
            verdict: "wrong",
            suggestedValue: "Olá {user}",
          },
        ],
      },
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.placeholderWarnings).toEqual([
      {
        path: "greeting",
        basePlaceholders: ["{name}"],
        valuePlaceholders: ["{user}"],
      },
    ]);
  });
});
