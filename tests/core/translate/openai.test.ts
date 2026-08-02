//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  MissingOpenAiApiKeyError,
  MissingSubmitTranslationsError,
  assertOpenAiApiKey,
  createOpenAiTranslator,
} from "../../../src/core/translate/openai.ts";
import { TRANSLATE_INSTRUCTIONS } from "../../../src/core/translate/prompt.ts";

describe("assertOpenAiApiKey", () => {
  it("returns the key when OPENAI_API_KEY is set", () => {
    expect(assertOpenAiApiKey({ OPENAI_API_KEY: "sk-test" })).toBe("sk-test");
  });

  it("throws MissingOpenAiApiKeyError when the key is missing", () => {
    expect(() => assertOpenAiApiKey({})).toThrow(MissingOpenAiApiKeyError);
    expect(() => assertOpenAiApiKey({ OPENAI_API_KEY: "   " })).toThrow(MissingOpenAiApiKeyError);
  });
});

describe("createOpenAiTranslator", () => {
  it("calls generateText with submitTranslations tool and returns tool input", async () => {
    const calls: unknown[] = [];

    const translateLocale = createOpenAiTranslator({
      apiKey: "sk-test",
      model: "gpt-5.4-mini",
      generateText: async (options) => {
        calls.push(options);
        const tool = options.tools?.submitTranslations;
        if (!tool || typeof tool.execute !== "function") {
          throw new Error("expected submitTranslations tool");
        }

        await tool.execute(
          {
            locale: "pt",
            translations: [{ path: "nav.about", value: "Sobre" }],
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

    const submitted = await translateLocale({
      baseLocale: "en",
      targetLocale: "pt",
      missing: [{ path: "nav.about", baseValue: "About" }],
      examples: [],
      prompt: "translate please",
    });

    expect(submitted).toEqual({
      locale: "pt",
      translations: [{ path: "nav.about", value: "Sobre" }],
    });
    expect(calls).toHaveLength(1);

    const call = calls[0] as {
      instructions: string;
      prompt: string;
      stopWhen: unknown;
      tools: { submitTranslations: { description?: string } };
    };
    expect(call.instructions).toBe(TRANSLATE_INSTRUCTIONS);
    expect(call.prompt).toBe("translate please");
    expect(call.tools.submitTranslations.description).toContain("Submit completed translations");
  });

  it("throws when the model never calls submitTranslations", async () => {
    const translateLocale = createOpenAiTranslator({
      apiKey: "sk-test",
      generateText: async () =>
        ({
          text: "done",
          toolCalls: [],
          toolResults: [],
        }) as never,
    });

    await expect(
      translateLocale({
        baseLocale: "en",
        targetLocale: "pt",
        missing: [{ path: "nav.about", baseValue: "About" }],
        examples: [],
        prompt: "translate please",
      }),
    ).rejects.toBeInstanceOf(MissingSubmitTranslationsError);
  });

  it("uses the default model id when none is provided", async () => {
    let modelArg: unknown;
    const translateLocale = createOpenAiTranslator({
      apiKey: "sk-test",
      createModel: (modelId) => {
        modelArg = modelId;
        return { modelId } as never;
      },
      generateText: async () => {
        throw new Error("should not reach generateText in this assertion");
      },
    });

    // Force early failure after model creation by making generateText throw,
    // but createModel is invoked first.
    try {
      await translateLocale({
        baseLocale: "en",
        targetLocale: "pt",
        missing: [],
        examples: [],
        prompt: "x",
      });
    } catch {
      // expected
    }

    expect(modelArg).toBe(DEFAULT_OPENAI_TRANSLATE_MODEL);
  });
});
