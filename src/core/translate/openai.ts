//* Libraries imports
import { generateText as defaultGenerateText, isStepCount, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

//* Local imports
import { TRANSLATE_INSTRUCTIONS } from "./prompt.ts";
import { submitTranslationsSchema } from "./schema.ts";

//* Types imports
import type { TranslateLocaleFn, TranslateLocaleInput } from "./translate.ts";
import type { SubmitTranslationsInput } from "./schema.ts";

export const DEFAULT_OPENAI_TRANSLATE_MODEL = "gpt-5.4-mini";

export class MissingOpenAiApiKeyError extends Error {
  constructor() {
    super(
      "OPENAI_API_KEY is not set. Provide an OpenAI API key in the environment to use catlex translate.",
    );
    this.name = "MissingOpenAiApiKeyError";
  }
}

export class MissingSubmitTranslationsError extends Error {
  constructor() {
    super("The model did not call submitTranslations. Retry or choose a different model.");
    this.name = "MissingSubmitTranslationsError";
  }
}

export function assertOpenAiApiKey(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingOpenAiApiKeyError();
  }
  return apiKey;
}

type GenerateTextFn = typeof defaultGenerateText;

export type CreateOpenAiTranslatorOptions = {
  model?: string;
  apiKey?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  generateText?: GenerateTextFn;
  createModel?: (modelId: string) => Parameters<GenerateTextFn>[0]["model"];
};

/**
 * Creates a TranslateLocaleFn backed by OpenAI tool calling.
 */
export function createOpenAiTranslator(
  options: CreateOpenAiTranslatorOptions = {},
): TranslateLocaleFn {
  const modelId = options.model ?? DEFAULT_OPENAI_TRANSLATE_MODEL;
  const generate = options.generateText ?? defaultGenerateText;

  return async (input: TranslateLocaleInput): Promise<SubmitTranslationsInput> => {
    const apiKey = options.apiKey ?? assertOpenAiApiKey(options.env ?? process.env);

    const model = options.createModel?.(modelId) ?? createOpenAI({ apiKey })(modelId);

    let submitted: SubmitTranslationsInput | null = null;

    await generate({
      model,
      instructions: TRANSLATE_INSTRUCTIONS,
      tools: {
        submitTranslations: tool({
          description: "Submit completed translations for the missing message keys.",
          inputSchema: submitTranslationsSchema,
          execute: async (toolInput) => {
            submitted = toolInput;
            return {
              ok: true,
              count: toolInput.translations.length,
            };
          },
        }),
      },
      stopWhen: isStepCount(5),
      prompt: input.prompt,
    });

    if (submitted === null) {
      throw new MissingSubmitTranslationsError();
    }

    return submitted;
  };
}
