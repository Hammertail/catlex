//* Libraries imports
import { generateText as defaultGenerateText, isStepCount, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

//* Local imports
import {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  assertOpenAiApiKey,
  buildOpenAiProviderSettings,
  resolveOpenAiBaseUrl,
} from "./openai.ts";
import { REVIEW_INSTRUCTIONS } from "./review-prompt.ts";
import { submitTranslationReviewsSchema } from "./review-schema.ts";

//* Types imports
import type { SubmitTranslationReviewsInput } from "./review-schema.ts";
import type { ReviewPromptItem } from "./review-prompt.ts";

export class MissingSubmitTranslationReviewsError extends Error {
  constructor() {
    super("The model did not call submitTranslationReviews. Retry or choose a different model.");
    this.name = "MissingSubmitTranslationReviewsError";
  }
}

export type ReviewLocaleInput = {
  baseLocale: string;
  targetLocale: string;
  items: ReviewPromptItem[];
  prompt: string;
};

export type ReviewLocaleFn = (input: ReviewLocaleInput) => Promise<SubmitTranslationReviewsInput>;

type GenerateTextFn = typeof defaultGenerateText;

export type CreateOpenAiReviewerOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  generateText?: GenerateTextFn;
  createModel?: (modelId: string) => Parameters<GenerateTextFn>[0]["model"];
};

/**
 * Creates a ReviewLocaleFn backed by OpenAI tool calling.
 */
export function createOpenAiReviewer(options: CreateOpenAiReviewerOptions = {}): ReviewLocaleFn {
  const modelId = options.model ?? DEFAULT_OPENAI_TRANSLATE_MODEL;
  const generate = options.generateText ?? defaultGenerateText;

  return async (input: ReviewLocaleInput): Promise<SubmitTranslationReviewsInput> => {
    const env = options.env ?? process.env;
    const apiKey = options.apiKey ?? assertOpenAiApiKey(env);
    const baseUrl = resolveOpenAiBaseUrl({ baseUrl: options.baseUrl, env });

    const model =
      options.createModel?.(modelId) ??
      createOpenAI(
        buildOpenAiProviderSettings({
          apiKey,
          baseUrl,
          headers: options.headers,
        }),
      )(modelId);

    let submitted: SubmitTranslationReviewsInput | null = null;

    await generate({
      model,
      instructions: REVIEW_INSTRUCTIONS,
      tools: {
        submitTranslationReviews: tool({
          description: "Submit translation reviews for the listed message keys.",
          inputSchema: submitTranslationReviewsSchema,
          execute: async (toolInput) => {
            submitted = toolInput;
            return {
              ok: true,
              count: toolInput.reviews.length,
            };
          },
        }),
      },
      stopWhen: isStepCount(5),
      prompt: input.prompt,
    });

    if (submitted === null) {
      throw new MissingSubmitTranslationReviewsError();
    }

    return submitted;
  };
}
