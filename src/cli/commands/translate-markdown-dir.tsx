//* Local imports
import { loadConfig } from "../../core/config/load.ts";
import { MARKDOWN_TRANSLATE_ALPHA_MESSAGE } from "../../core/translate/alpha.ts";
import { translateMarkdownDirectory } from "../../core/translate/markdown-dir.ts";
import { createOpenAiMarkdownTranslator } from "../../core/translate/markdown-openai.ts";
import {
  MissingOpenAiApiKeyError,
  assertOpenAiApiKey,
  resolveOpenAiBaseUrl,
} from "../../core/translate/openai.ts";

//* Types imports
import type { CatlexConfig } from "../../core/config/schema.ts";
import type {
  TranslateMarkdownDirectoryFileResult,
  TranslateMarkdownDirectoryResult,
} from "../../core/translate/markdown-dir.ts";
import type { TranslateMarkdownFn } from "../../core/translate/markdown.ts";

export type TranslateMarkdownDirCommandOptions = {
  source: string;
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

function printJson(result: TranslateMarkdownDirectoryResult): void {
  console.log(
    JSON.stringify(
      {
        ok: true,
        alpha: true,
        alphaMessage: MARKDOWN_TRANSLATE_ALPHA_MESSAGE,
        sourceDir: result.sourceDir,
        outDir: result.outDir,
        fromLocale: result.fromLocale,
        toLocale: result.toLocale,
        dryRun: result.dryRun,
        fileCount: result.fileCount,
        files: result.files.map((file) => ({
          sourcePath: file.sourcePath,
          outPath: file.outPath,
          sourceBytes: file.sourceBytes,
          written: file.written,
        })),
        guidanceSource: result.guidanceSource,
        guidancePreview: result.guidancePreview,
      },
      null,
      2,
    ),
  );
}

function fileLine(file: TranslateMarkdownDirectoryFileResult): string {
  return `  ${file.sourcePath} → ${file.outPath} (${file.sourceBytes} bytes)`;
}

function printText(result: TranslateMarkdownDirectoryResult): void {
  console.log(MARKDOWN_TRANSLATE_ALPHA_MESSAGE);
  console.log(`Source: ${result.sourceDir}`);
  console.log(`From: ${result.fromLocale} → ${result.toLocale}`);
  console.log(`Out: ${result.outDir}`);
  console.log(`Files: ${result.fileCount}`);
  for (const file of result.files) {
    console.log(fileLine(file));
  }
  if (result.dryRun) {
    console.log("Dry run: no API call, no write.");
    return;
  }
  const label = result.fileCount === 1 ? "file" : "files";
  console.log(`Wrote ${result.fileCount} translated Markdown ${label}.`);
}

function emitOutput(result: TranslateMarkdownDirectoryResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  printText(result);
}

function resolveTranslator(
  options: TranslateMarkdownDirCommandOptions,
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
 * Runs the alpha Markdown directory translate command.
 */
export async function runTranslateMarkdownDirCommand(
  options: TranslateMarkdownDirCommandOptions,
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

  const result = await translateMarkdownDirectory({
    cwd,
    source: options.source,
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
