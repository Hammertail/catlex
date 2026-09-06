//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { createReviewProgressWriter } from "../../../src/cli/ui/review-progress.ts";

describe("createReviewProgressWriter", () => {
  it("prints a banner on start and newline progress updates when not a TTY", () => {
    const chunks: string[] = [];
    const writer = createReviewProgressWriter({
      model: "gpt-test",
      isTty: false,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    writer.onProgress({
      type: "start",
      baseLocale: "en",
      messagesDir: "messages",
      locales: ["pt-BR"],
      totalKeys: 2,
      since: null,
    });
    writer.onProgress({
      type: "progress",
      completedKeys: 2,
      totalKeys: 2,
      locale: "pt-BR",
      phase: "review",
      inFlight: 0,
      chunkPaths: ["welcome", "about"],
    });
    writer.finish();

    const text = chunks.join("");
    expect(text).toContain("Reviewing translations");
    expect(text).toContain("Source locale: en");
    expect(text).toContain("Target locale: pt-BR");
    expect(text).toContain("Messages dir: messages");
    expect(text).toContain("Model: gpt-test");
    expect(text).toContain("Progress: 0 / 2 keys reviewed");
    expect(text).toContain("Progress: 2 / 2 keys reviewed · in-flight 0");
    expect(text).not.toContain("[review]");
  });

  it("prints per-chunk paths when verbose is enabled", () => {
    const chunks: string[] = [];
    const writer = createReviewProgressWriter({
      model: "gpt-test",
      verbose: true,
      isTty: false,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    writer.onProgress({
      type: "start",
      baseLocale: "en",
      messagesDir: "messages",
      locales: ["pt", "es"],
      totalKeys: 1,
      since: "main",
    });
    writer.onProgress({
      type: "progress",
      completedKeys: 1,
      totalKeys: 1,
      locale: "pt",
      phase: "review",
      inFlight: 0,
      chunkPaths: ["welcome"],
    });
    writer.finish();

    const text = chunks.join("");
    expect(text).toContain("Target locales: pt, es");
    expect(text).toContain("Since: main");
    expect(text).toContain("[review] pt: welcome");
  });

  it("overwrites the progress line with carriage returns on a TTY", () => {
    const chunks: string[] = [];
    const writer = createReviewProgressWriter({
      model: "gpt-test",
      isTty: true,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    writer.onProgress({
      type: "start",
      baseLocale: "en",
      messagesDir: "messages",
      locales: [],
      totalKeys: 1,
      since: null,
    });
    writer.onProgress({
      type: "progress",
      completedKeys: 1,
      totalKeys: 1,
      locale: "pt",
      phase: "review",
      inFlight: 0,
    });
    writer.finish();

    const text = chunks.join("");
    expect(text).toContain("Target locale: (none)");
    expect(text).toContain("\rProgress: 0 / 1 keys reviewed");
    expect(text).toContain("\rProgress: 1 / 1 keys reviewed · in-flight 0");
  });

  it("prints newline progress when json is set even if the terminal is a TTY", () => {
    const chunks: string[] = [];
    const writer = createReviewProgressWriter({
      model: "gpt-test",
      json: true,
      isTty: true,
      verbose: true,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    writer.onProgress({
      type: "start",
      baseLocale: "en",
      messagesDir: "messages",
      locales: ["pt"],
      totalKeys: 1,
      since: null,
    });
    writer.onProgress({
      type: "progress",
      completedKeys: 1,
      totalKeys: 1,
      locale: "pt",
      phase: "review",
      inFlight: 0,
      chunkPaths: [],
    });
    writer.finish();

    const text = chunks.join("");
    expect(text).toContain("Reviewing translations");
    expect(text).toContain("Progress: 0 / 1 keys reviewed\n");
    expect(text).toContain("Progress: 1 / 1 keys reviewed · in-flight 0\n");
    expect(text).not.toContain("\rProgress:");
    expect(text).not.toContain("[review]");
  });

  it("prints a translate banner and keys-translated label", () => {
    const chunks: string[] = [];
    const writer = createReviewProgressWriter({
      kind: "translate",
      model: "gpt-test",
      isTty: false,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    writer.onProgress({
      type: "start",
      baseLocale: "en",
      messagesDir: "messages",
      locales: ["pt"],
      totalKeys: 1,
      since: null,
    });
    writer.onProgress({
      type: "progress",
      completedKeys: 1,
      totalKeys: 1,
      locale: "pt",
      phase: "translate",
      inFlight: 1,
    });
    writer.finish();

    const text = chunks.join("");
    expect(text).toContain("Translating missing keys");
    expect(text).toContain("Progress: 0 / 1 keys translated");
    expect(text).toContain("Progress: 1 / 1 keys translated · in-flight 1");
  });
});
