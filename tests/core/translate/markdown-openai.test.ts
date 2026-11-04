//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  MissingOpenAiApiKeyError,
} from "../../../src/core/translate/openai.ts";
import {
  MissingSubmitMarkdownTranslationError,
  createOpenAiMarkdownTranslator,
} from "../../../src/core/translate/markdown-openai.ts";
import { MARKDOWN_TRANSLATE_INSTRUCTIONS } from "../../../src/core/translate/markdown-prompt.ts";

describe("createOpenAiMarkdownTranslator", () => {
  it("calls generateText with submitMarkdownTranslation and returns tool input", async () => {
    const calls: unknown[] = [];

    const translateMarkdown = createOpenAiMarkdownTranslator({
      apiKey: "sk-test",
      model: "gpt-5.4-mini",
      generateText: async (options) => {
        calls.push(options);
        const tool = options.tools?.submitMarkdownTranslation;
        if (!tool || typeof tool.execute !== "function") {
          throw new Error("expected submitMarkdownTranslation tool");
        }

        await tool.execute(
          { markdown: "# Olá\n" },
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

    const submitted = await translateMarkdown({
      sourceLocale: "en",
      targetLocale: "pt-BR",
      sourceMarkdown: "# Hello\n",
      prompt: "translate this markdown",
    });

    expect(submitted).toEqual({ markdown: "# Olá\n" });
    expect(calls).toHaveLength(1);

    const call = calls[0] as {
      instructions: string;
      prompt: string;
      tools: { submitMarkdownTranslation: { description?: string } };
    };
    expect(call.instructions).toBe(MARKDOWN_TRANSLATE_INSTRUCTIONS);
    expect(call.prompt).toBe("translate this markdown");
    expect(call.tools.submitMarkdownTranslation.description).toContain(
      "Submit the full translated Markdown document",
    );
  });

  it("throws when the model never calls submitMarkdownTranslation", async () => {
    const translateMarkdown = createOpenAiMarkdownTranslator({
      apiKey: "sk-test",
      generateText: async () =>
        ({
          text: "done",
          toolCalls: [],
          toolResults: [],
        }) as never,
    });

    await expect(
      translateMarkdown({
        sourceLocale: "en",
        targetLocale: "pt-BR",
        sourceMarkdown: "# Hello\n",
        prompt: "translate this markdown",
      }),
    ).rejects.toBeInstanceOf(MissingSubmitMarkdownTranslationError);
  });

  it("uses the default model id when none is provided", async () => {
    let modelArg: unknown;
    const translateMarkdown = createOpenAiMarkdownTranslator({
      apiKey: "sk-test",
      createModel: (modelId) => {
        modelArg = modelId;
        return { modelId } as never;
      },
      generateText: async () => {
        throw new Error("should not reach generateText in this assertion");
      },
    });

    try {
      await translateMarkdown({
        sourceLocale: "en",
        targetLocale: "pt-BR",
        sourceMarkdown: "# Hello\n",
        prompt: "x",
      });
    } catch {
      // expected
    }

    expect(modelArg).toBe(DEFAULT_OPENAI_TRANSLATE_MODEL);
  });

  it("requires an API key when none is injected", async () => {
    const translateMarkdown = createOpenAiMarkdownTranslator({
      env: {},
      generateText: async () => {
        throw new Error("should not call generateText without a key");
      },
    });

    await expect(
      translateMarkdown({
        sourceLocale: "en",
        targetLocale: "pt-BR",
        sourceMarkdown: "# Hello\n",
        prompt: "x",
      }),
    ).rejects.toBeInstanceOf(MissingOpenAiApiKeyError);
  });
});
