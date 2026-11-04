//* Local imports
import { loadConfig } from "../../core/config/load.ts";
import { MARKDOWN_TRANSLATE_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";
import { createOpenAiMarkdownTranslator } from "../../core/translate/markdown-openai.ts";
import { translateMarkdownFile } from "../../core/translate/markdown.ts";
import {
  MissingOpenAiApiKeyError,
  assertOpenAiApiKey,
  resolveOpenAiBaseUrl,
} from "../../core/translate/openai.ts";

//* Types imports
import type { CatlexConfig } from "../../core/config/schema.ts";
import type {
  TranslateMarkdownFn,
  TranslateMarkdownResult,
} from "../../core/translate/markdown.ts";

export type TranslateMarkdownCommandOptions = {
  file: string;
  from: string;
  to: string;
  out: string;
  cwd?: string;
  model?: string;
  baseUrl?: string;
  dryRun?: boolean;
  noConfig?: boolean;
  json?: boolean;
  guidance?: string;
  guidanceFile?: string;
  translateMarkdown?: TranslateMarkdownFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

function printJson(result: TranslateMarkdownResult): void {
  console.log(
    JSON.stringify(
      {
        ok: true,
        alpha: true,
        alphaMessage: MARKDOWN_TRANSLATE_ALPHA_MESSAGE,
        sourcePath: result.sourcePath,
        outPath: result.outPath,
        fromLocale: result.fromLocale,
        toLocale: result.toLocale,
        sourceBytes: result.sourceBytes,
        dryRun: result.dryRun,
        written: result.written,
        guidanceSource: result.guidanceSource,
        guidancePreview: result.guidancePreview,
      },
      null,
      2,
    ),
  );
}

function printText(result: TranslateMarkdownResult): void {
  console.log(MARKDOWN_TRANSLATE_ALPHA_MESSAGE);
  console.log(`Source: ${result.sourcePath}`);
  console.log(`From: ${result.fromLocale} → ${result.toLocale}`);
  console.log(`Out: ${result.outPath}`);
  console.log(`Size: ${result.sourceBytes} bytes`);
  if (result.dryRun) {
    console.log("Dry run: no API call, no write.");
    return;
  }
  if (result.written) {
    console.log("Wrote translated Markdown.");
  }
}

function emitOutput(result: TranslateMarkdownResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  printText(result);
}

function resolveTranslator(
  options: TranslateMarkdownCommandOptions,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  config: CatlexConfig,
): TranslateMarkdownFn {
  return (
    options.translateMarkdown ??
    createOpenAiMarkdownTranslator({
      model: options.model,
      baseUrl: resolveOpenAiBaseUrl({
        baseUrl: options.baseUrl,
        configBaseUrl: config.openai?.baseUrl,
        env,
      }),
      headers: config.openai?.headers,
      env,
    })
  );
}

function requireApiKey(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  try {
    assertOpenAiApiKey(env);
    return true;
  } catch (error) {
    if (error instanceof MissingOpenAiApiKeyError) {
      console.error(`Error: ${error.message}`);
      return false;
    }
    throw error;
  }
}

/**
 * Runs the alpha Markdown translate prototype command.
 */
export async function runTranslateMarkdownCommand(
  options: TranslateMarkdownCommandOptions,
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun === true;
  const json = options.json === true;
  const env = options.env ?? process.env;

  if (!dryRun && !requireApiKey(env)) {
    return 1;
  }

  const noConfig = options.noConfig === true;
  const config = await loadConfig(cwd, { noConfig });
  const translateMarkdown =
    dryRun && options.translateMarkdown === undefined
      ? async () => ({ markdown: "" })
      : resolveTranslator(options, env, config);

  const result = await translateMarkdownFile({
    cwd,
    source: options.file,
    from: options.from,
    to: options.to,
    out: options.out,
    dryRun,
    noConfig,
    guidance: options.guidance,
    guidanceFile: options.guidanceFile,
    translateMarkdown,
  });

  emitOutput(result, json);
  return 0;
}
