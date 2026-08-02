//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  MissingSubmitTranslationReviewsError,
  createOpenAiReviewer,
} from "../../../src/core/translate/review-openai.ts";
import { REVIEW_INSTRUCTIONS } from "../../../src/core/translate/review-prompt.ts";
import { DEFAULT_OPENAI_TRANSLATE_MODEL } from "../../../src/core/translate/openai.ts";

describe("createOpenAiReviewer", () => {
  it("calls generateText with submitTranslationReviews and returns tool input", async () => {
    const calls: unknown[] = [];

    const reviewLocale = createOpenAiReviewer({
      apiKey: "sk-test",
      model: "gpt-5.4-mini",
      generateText: async (options) => {
        calls.push(options);
        const tool = options.tools?.submitTranslationReviews;
        if (!tool || typeof tool.execute !== "function") {
          throw new Error("expected submitTranslationReviews tool");
        }

        await tool.execute(
          {
            locale: "pt",
            reviews: [{ path: "welcome", verdict: "ok" as const }],
          },
          {
            toolCallId: "call-1",
            messages: [],
            context: {},
          },
        );

        return {
          text: "",
          toolCalls: [],
          toolResults: [],
        } as never;
      },
    });

    const submitted = await reviewLocale({
      baseLocale: "en",
      targetLocale: "pt",
      items: [{ path: "welcome", baseValue: "Welcome", localeValue: "Olá" }],
      prompt: "review please",
    });

    expect(submitted).toEqual({
      locale: "pt",
      reviews: [{ path: "welcome", verdict: "ok" }],
    });
    expect(calls).toHaveLength(1);

    const call = calls[0] as {
      instructions: string;
      prompt: string;
      tools: { submitTranslationReviews: { description?: string } };
    };
    expect(call.instructions).toBe(REVIEW_INSTRUCTIONS);
    expect(call.prompt).toBe("review please");
    expect(call.tools.submitTranslationReviews.description).toContain("Submit translation reviews");
  });

  it("throws when the model never calls submitTranslationReviews", async () => {
    const reviewLocale = createOpenAiReviewer({
      apiKey: "sk-test",
      generateText: async () =>
        ({
          text: "done",
          toolCalls: [],
          toolResults: [],
        }) as never,
    });

    await expect(
      reviewLocale({
        baseLocale: "en",
        targetLocale: "pt",
        items: [{ path: "welcome", baseValue: "Welcome", localeValue: "Olá" }],
        prompt: "review please",
      }),
    ).rejects.toThrow(MissingSubmitTranslationReviewsError);
  });

  it("defaults to the shared OpenAI translate model id", () => {
    expect(DEFAULT_OPENAI_TRANSLATE_MODEL).toBe("gpt-5.4-mini");
  });
});
