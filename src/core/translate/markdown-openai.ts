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
import { MARKDOWN_TRANSLATE_INSTRUCTIONS } from "./markdown-prompt.ts";
import { submitMarkdownTranslationSchema } from "./markdown-schema.ts";

//* Types imports
import type { TranslateMarkdownFn, TranslateMarkdownInput } from "./markdown.ts";
import type { SubmitMarkdownTranslationInput } from "./markdown-schema.ts";

export class MissingSubmitMarkdownTranslationError extends Error {
  constructor() {
    super("The model did not call submitMarkdownTranslation. Retry or choose a different model.");
    this.name = "MissingSubmitMarkdownTranslationError";
  }
}

type GenerateTextFn = typeof defaultGenerateText;

export type CreateOpenAiMarkdownTranslatorOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  generateText?: GenerateTextFn;
  createModel?: (modelId: string) => Parameters<GenerateTextFn>[0]["model"];
};

/**
 * Creates a TranslateMarkdownFn backed by OpenAI tool calling.
 */
export function createOpenAiMarkdownTranslator(
  options: CreateOpenAiMarkdownTranslatorOptions = {},
): TranslateMarkdownFn {
  const modelId = options.model ?? DEFAULT_OPENAI_TRANSLATE_MODEL;
  const generate = options.generateText ?? defaultGenerateText;

  return async (input: TranslateMarkdownInput): Promise<SubmitMarkdownTranslationInput> => {
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

    let submitted: SubmitMarkdownTranslationInput | null = null;

    await generate({
      model,
      instructions: MARKDOWN_TRANSLATE_INSTRUCTIONS,
      tools: {
        submitMarkdownTranslation: tool({
          description: "Submit the full translated Markdown document.",
          inputSchema: submitMarkdownTranslationSchema,
          execute: async (toolInput) => {
            submitted = toolInput;
            return {
              ok: true,
              bytes: toolInput.markdown.length,
            };
          },
        }),
      },
      stopWhen: isStepCount(5),
      prompt: input.prompt,
    });

    if (submitted === null) {
      throw new MissingSubmitMarkdownTranslationError();
    }

    return submitted;
  };
}
