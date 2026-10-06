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
  TranslateMarkdownDirectoryTarget,
} from "../../core/translate/markdown-dir.ts";
import type { TranslateMarkdownFn } from "../../core/translate/markdown.ts";

export type TranslateMarkdownDirCommandOptions = {
  source: string;
  from: string;
  targets: TranslateMarkdownDirectoryTarget[];
  cwd?: string;
  model?: string;
  baseUrl?: string;
  dryRun?: boolean;
  noConfig?: boolean;
  json?: boolean;
  concurrency?: number;
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
        fromLocale: result.fromLocale,
        dryRun: result.dryRun,
        targets: result.targets.map((target) => ({
          toLocale: target.toLocale,
          outDir: target.outDir,
          fileCount: target.fileCount,
          files: target.files.map((file) => ({
            sourcePath: file.sourcePath,
            outPath: file.outPath,
            sourceBytes: file.sourceBytes,
            written: file.written,
          })),
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
  console.log(`From: ${result.fromLocale}`);
  for (const target of result.targets) {
    console.log(`${target.toLocale} → ${target.outDir}`);
    console.log(`Files: ${target.fileCount}`);
    for (const file of target.files) {
      console.log(fileLine(file));
    }
  }
  if (result.dryRun) {
    console.log("Dry run: no API call, no write.");
    return;
  }
  for (const target of result.targets) {
    const label = target.fileCount === 1 ? "file" : "files";
    console.log(`Wrote ${target.fileCount} translated Markdown ${label} for ${target.toLocale}.`);
  }
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
    targets: options.targets,
    dryRun,
    noConfig,
    concurrency: options.concurrency,
    guidance: options.guidance,
    guidanceFile: options.guidanceFile,
    translateMarkdown,
  });

  emitOutput(result, json);
  return 0;
}
