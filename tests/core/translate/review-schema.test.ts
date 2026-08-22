//* Libraries imports
import { describe, expect, it } from "bun:test";
import { z } from "zod";

//* Local imports
import {
  submitTranslationReviewsSchema,
  validateSubmittedReviews,
} from "../../../src/core/translate/review-schema.ts";

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
  const?: unknown;
};

function asJsonSchemaObject(value: unknown): JsonSchemaObject | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as JsonSchemaObject;
}

function verdictConstOf(variant: unknown): string | undefined {
  const schema = asJsonSchemaObject(variant);
  const verdict = asJsonSchemaObject(schema?.properties?.verdict);
  return typeof verdict?.const === "string" ? verdict.const : undefined;
}

function reviewItemVariants(jsonSchema: ReturnType<typeof z.toJSONSchema>): unknown[] {
  const reviews = asJsonSchemaObject(jsonSchema.properties?.reviews);
  const items = asJsonSchemaObject(
    reviews && "items" in reviews ? (reviews as { items?: unknown }).items : undefined,
  );
  const oneOf = items && "oneOf" in items ? (items as { oneOf?: unknown }).oneOf : undefined;
  if (!Array.isArray(oneOf)) {
    throw new Error("expected reviews.items.oneOf for discriminated verdicts");
  }
  return oneOf;
}

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

  it("strips reason and suggestedValue from ok verdicts", () => {
    const parsed = submitTranslationReviewsSchema.parse({
      locale: "pt",
      reviews: [
        {
          path: "welcome",
          verdict: "ok",
          reason: "Looks fine",
          suggestedValue: "Bem-vindo",
        },
      ],
    });

    expect(parsed.reviews[0]).toEqual({ path: "welcome", verdict: "ok" });
    expect(parsed.reviews[0]).not.toHaveProperty("reason");
    expect(parsed.reviews[0]).not.toHaveProperty("suggestedValue");
  });

  it("keeps reason and suggestedValue on wrong verdicts", () => {
    const parsed = submitTranslationReviewsSchema.parse({
      locale: "pt",
      reviews: [
        {
          path: "nav.about",
          verdict: "wrong",
          reason: "Meaning drifted",
          suggestedValue: "Sobre",
        },
      ],
    });

    expect(parsed.reviews[0]).toEqual({
      path: "nav.about",
      verdict: "wrong",
      reason: "Meaning drifted",
      suggestedValue: "Sobre",
    });
  });

  it("encodes ok without reason or suggestedValue in the tool JSON Schema", () => {
    const variants = reviewItemVariants(z.toJSONSchema(submitTranslationReviewsSchema));
    const okVariant = asJsonSchemaObject(
      variants.find((variant) => verdictConstOf(variant) === "ok"),
    );
    const wrongVariant = asJsonSchemaObject(
      variants.find((variant) => verdictConstOf(variant) === "wrong"),
    );

    expect(okVariant).not.toBeNull();
    expect(okVariant?.properties).not.toHaveProperty("reason");
    expect(okVariant?.properties).not.toHaveProperty("suggestedValue");
    expect(okVariant?.additionalProperties).toBe(false);

    expect(wrongVariant).not.toBeNull();
    expect(wrongVariant?.properties).toHaveProperty("reason");
    expect(wrongVariant?.properties).toHaveProperty("suggestedValue");
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

  it("does not keep reason or suggestedValue on accepted ok verdicts", () => {
    const result = validateSubmittedReviews({
      allowedPaths: new Set(["welcome"]),
      baseValues: new Map([["welcome", "Welcome"]]),
      requireSuggestedValue: false,
      submitted: {
        locale: "pt",
        // Simulate a model that still filled optional fields on an ok verdict.
        reviews: [
          {
            path: "welcome",
            verdict: "ok",
            reason: "Looks fine",
            suggestedValue: "Bem-vindo",
          },
        ],
      } as Parameters<typeof validateSubmittedReviews>[0]["submitted"],
    });

    expect(result.accepted).toEqual([{ path: "welcome", verdict: "ok" }]);
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
