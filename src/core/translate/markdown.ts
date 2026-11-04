//* Libraries imports
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { findConfigFile, loadConfig } from "../config/load.ts";
import { resolveTranslateGuidance } from "./guidance.ts";
import { buildMarkdownTranslatePrompt } from "./markdown-prompt.ts";

//* Types imports
import type { TranslateGuidanceSource } from "./guidance.ts";
import type { SubmitMarkdownTranslationInput } from "./markdown-schema.ts";

export const MAX_MARKDOWN_SOURCE_BYTES = 64 * 1024;

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export class MarkdownTranslateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownTranslateError";
  }
}

export type TranslateMarkdownInput = {
  sourceLocale: string;
  targetLocale: string;
  sourceMarkdown: string;
  prompt: string;
};

export type TranslateMarkdownFn = (
  input: TranslateMarkdownInput,
) => Promise<SubmitMarkdownTranslationInput>;

export type TranslateMarkdownFileOptions = {
  cwd?: string;
  source: string;
  from: string;
  to: string;
  out: string;
  dryRun?: boolean;
  noConfig?: boolean;
  guidance?: string;
  guidanceFile?: string;
  translateMarkdown: TranslateMarkdownFn;
};

export type TranslateMarkdownResult = {
  sourcePath: string;
  outPath: string;
  fromLocale: string;
  toLocale: string;
  sourceBytes: number;
  dryRun: boolean;
  written: boolean;
  guidanceSource: TranslateGuidanceSource;
  guidancePreview: string | null;
};

function isPathInside(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeLocale(value: string, flagName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MarkdownTranslateError(`${flagName} locale must not be empty`);
  }
  return trimmed;
}

function assertMarkdownExtension(filePath: string): void {
  const extension = path.extname(filePath).toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(extension)) {
    throw new MarkdownTranslateError(`Markdown source must end with .md or .markdown: ${filePath}`);
  }
}

async function resolveAllowedDir(cwd: string): Promise<string> {
  try {
    return await realpath(cwd);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Working directory does not exist or cannot be resolved: ${cwd} (${errorDetail(error)})`,
    );
  }
}

function assertInsideWorkingDirectory(
  candidate: string,
  resolvedAllowedDir: string,
  filePath: string,
  action: "read" | "write",
): void {
  if (!isPathInside(candidate, resolvedAllowedDir)) {
    throw new MarkdownTranslateError(
      `Refusing to ${action} Markdown file outside the working directory (${resolvedAllowedDir}): ${filePath}`,
    );
  }
}

async function resolveSafeMarkdownReadPath(filePath: string, allowedDir: string): Promise<string> {
  const resolvedAllowedDir = await resolveAllowedDir(allowedDir);
  const absolutePath = path.resolve(allowedDir, filePath);

  let resolvedParent: string;
  try {
    resolvedParent = await realpath(path.dirname(absolutePath));
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }

  assertInsideWorkingDirectory(
    path.join(resolvedParent, path.basename(absolutePath)),
    resolvedAllowedDir,
    filePath,
    "read",
  );

  try {
    const linkStat = await lstat(absolutePath);
    if (linkStat.isSymbolicLink()) {
      throw new MarkdownTranslateError(
        `Refusing to read Markdown file because it is a symbolic link: ${filePath}`,
      );
    }
  } catch (error) {
    if (error instanceof MarkdownTranslateError) {
      throw error;
    }
    throw new MarkdownTranslateError(
      `Unable to read Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }

  let resolvedFilePath: string;
  try {
    resolvedFilePath = await realpath(absolutePath);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }

  assertInsideWorkingDirectory(resolvedFilePath, resolvedAllowedDir, filePath, "read");
  return resolvedFilePath;
}

function resolveLogicalOutPath(filePath: string, resolvedAllowedDir: string): string {
  const absolutePath = path.resolve(resolvedAllowedDir, filePath);
  assertInsideWorkingDirectory(absolutePath, resolvedAllowedDir, filePath, "write");
  return absolutePath;
}

async function prepareMarkdownWritePath(filePath: string, allowedDir: string): Promise<string> {
  const resolvedAllowedDir = await resolveAllowedDir(allowedDir);
  const absolutePath = resolveLogicalOutPath(filePath, resolvedAllowedDir);
  const logicalParent = path.dirname(absolutePath);

  try {
    await mkdir(logicalParent, { recursive: true });
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to create Markdown output directory: ${logicalParent} (${errorDetail(error)})`,
    );
  }

  let resolvedParent: string;
  try {
    resolvedParent = await realpath(logicalParent);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Markdown output parent directory does not exist or cannot be resolved: ${logicalParent} (${errorDetail(error)})`,
    );
  }

  const intendedPath = path.join(resolvedParent, path.basename(absolutePath));
  assertInsideWorkingDirectory(intendedPath, resolvedAllowedDir, filePath, "write");

  try {
    const fileStat = await lstat(absolutePath);
    if (fileStat.isSymbolicLink()) {
      throw new MarkdownTranslateError(
        `Refusing to write Markdown file because it is a symbolic link: ${filePath}`,
      );
    }
  } catch (error) {
    if (error instanceof MarkdownTranslateError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      return intendedPath;
    }
    throw new MarkdownTranslateError(
      `Unable to write Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }

  const resolvedFilePath = await realpath(absolutePath);
  assertInsideWorkingDirectory(resolvedFilePath, resolvedAllowedDir, filePath, "write");
  return resolvedFilePath;
}

async function readMarkdownSource(filePath: string): Promise<{ contents: string; bytes: number }> {
  let info: { size: number; isFile: boolean };
  try {
    const stats = await stat(filePath);
    info = { size: stats.size, isFile: stats.isFile() };
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }

  if (!info.isFile) {
    throw new MarkdownTranslateError(`Markdown source is not a file: ${filePath}`);
  }
  if (info.size > MAX_MARKDOWN_SOURCE_BYTES) {
    throw new MarkdownTranslateError(
      `Markdown file exceeds the ${MAX_MARKDOWN_SOURCE_BYTES} byte prototype limit: ${filePath}`,
    );
  }

  try {
    const contents = await readFile(filePath, "utf8");
    return { contents, bytes: info.size };
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown file: ${filePath} (${errorDetail(error)})`,
    );
  }
}

/**
 * Translates a single Markdown file from one locale into another.
 * Dry-run validates the source and reports paths without calling the translator or writing.
 */
export async function translateMarkdownFile(
  options: TranslateMarkdownFileOptions,
): Promise<TranslateMarkdownResult> {
  const cwd = options.cwd ?? process.cwd();
  const fromLocale = normalizeLocale(options.from, "--from");
  const toLocale = normalizeLocale(options.to, "--to");
  const dryRun = options.dryRun === true;

  const sourceInput = options.source.trim();
  if (!sourceInput) {
    throw new MarkdownTranslateError("Markdown source path must not be empty");
  }
  const outInput = options.out.trim();
  if (!outInput) {
    throw new MarkdownTranslateError("Markdown output path must not be empty");
  }

  assertMarkdownExtension(sourceInput);

  const resolvedCwd = await resolveAllowedDir(cwd);
  const sourcePath = await resolveSafeMarkdownReadPath(sourceInput, cwd);
  assertMarkdownExtension(sourcePath);

  const { contents, bytes } = await readMarkdownSource(sourcePath);
  const outPath = resolveLogicalOutPath(outInput, resolvedCwd);

  const config = await loadConfig(cwd, { noConfig: options.noConfig });
  const configPath = options.noConfig === true ? null : await findConfigFile(cwd);
  const resolvedGuidance = await resolveTranslateGuidance({
    cwd,
    guidance: options.guidance,
    guidanceFile: options.guidanceFile,
    configGuidance: config.translate?.guidance,
    configGuidanceFile: config.translate?.guidanceFile,
    configDir: configPath === null ? cwd : path.dirname(configPath),
  });

  if (dryRun) {
    return {
      sourcePath,
      outPath,
      fromLocale,
      toLocale,
      sourceBytes: bytes,
      dryRun: true,
      written: false,
      guidanceSource: resolvedGuidance.source,
      guidancePreview: resolvedGuidance.preview,
    };
  }

  const prompt = buildMarkdownTranslatePrompt({
    sourceLocale: fromLocale,
    targetLocale: toLocale,
    sourceMarkdown: contents,
    guidance: resolvedGuidance.text,
  });

  const submitted = await options.translateMarkdown({
    sourceLocale: fromLocale,
    targetLocale: toLocale,
    sourceMarkdown: contents,
    prompt,
  });

  const writePath = await prepareMarkdownWritePath(outInput, cwd);
  await writeFile(writePath, submitted.markdown, "utf8");

  return {
    sourcePath,
    outPath: writePath,
    fromLocale,
    toLocale,
    sourceBytes: bytes,
    dryRun: false,
    written: true,
    guidanceSource: resolvedGuidance.source,
    guidancePreview: resolvedGuidance.preview,
  };
}
