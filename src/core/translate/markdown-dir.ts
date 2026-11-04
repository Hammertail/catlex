//* Libraries imports
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { MarkdownTranslateError, translateMarkdownFile } from "./markdown.ts";

//* Types imports
import type { TranslateGuidanceSource } from "./guidance.ts";
import type { TranslateMarkdownFn } from "./markdown.ts";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export type TranslateMarkdownDirectoryOptions = {
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

export type TranslateMarkdownDirectoryFileResult = {
  sourcePath: string;
  outPath: string;
  sourceBytes: number;
  written: boolean;
};

export type TranslateMarkdownDirectoryResult = {
  sourceDir: string;
  outDir: string;
  fromLocale: string;
  toLocale: string;
  dryRun: boolean;
  fileCount: number;
  files: TranslateMarkdownDirectoryFileResult[];
  guidanceSource: TranslateGuidanceSource;
  guidancePreview: string | null;
};

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

function isInsideOrEqual(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  if (relative === "") {
    return true;
  }
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeSingleLocale(value: string, flagName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MarkdownTranslateError(`${flagName} locale must not be empty`);
  }
  if (trimmed.includes(",")) {
    throw new MarkdownTranslateError(
      `${flagName} accepts a single locale; comma-separated locales are not supported`,
    );
  }
  return trimmed;
}

function isMarkdownFileName(fileName: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(fileName).toLowerCase());
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
  inputPath: string,
  action: "read" | "write",
): void {
  if (!isInsideOrEqual(candidate, resolvedAllowedDir)) {
    const kind = action === "read" ? "read Markdown directory" : "write Markdown directory";
    throw new MarkdownTranslateError(
      `Refusing to ${kind} outside the working directory (${resolvedAllowedDir}): ${inputPath}`,
    );
  }
}

async function resolveSourceDirectory(sourceInput: string, cwd: string): Promise<string> {
  const resolvedAllowedDir = await resolveAllowedDir(cwd);
  const absolutePath = path.resolve(cwd, sourceInput);

  let linkStat: Awaited<ReturnType<typeof lstat>>;
  try {
    linkStat = await lstat(absolutePath);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown directory: ${sourceInput} (${errorDetail(error)})`,
    );
  }

  if (linkStat.isSymbolicLink()) {
    throw new MarkdownTranslateError(
      `Refusing to read Markdown directory because it is a symbolic link: ${sourceInput}`,
    );
  }
  if (!linkStat.isDirectory()) {
    throw new MarkdownTranslateError(`Markdown source path is not a directory: ${sourceInput}`);
  }

  let resolvedDir: string;
  try {
    resolvedDir = await realpath(absolutePath);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to read Markdown directory: ${sourceInput} (${errorDetail(error)})`,
    );
  }

  assertInsideWorkingDirectory(resolvedDir, resolvedAllowedDir, sourceInput, "read");
  return resolvedDir;
}

async function assertOutputDirectory(outInput: string, cwd: string): Promise<string> {
  const resolvedAllowedDir = await resolveAllowedDir(cwd);
  const absolutePath = path.resolve(resolvedAllowedDir, outInput);
  assertInsideWorkingDirectory(absolutePath, resolvedAllowedDir, outInput, "write");

  try {
    const linkStat = await lstat(absolutePath);
    if (linkStat.isSymbolicLink()) {
      throw new MarkdownTranslateError(
        `Refusing to write Markdown directory because it is a symbolic link: ${outInput}`,
      );
    }
    if (!linkStat.isDirectory()) {
      throw new MarkdownTranslateError(`Markdown output path is not a directory: ${outInput}`);
    }
  } catch (error) {
    if (error instanceof MarkdownTranslateError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      return absolutePath;
    }
    throw new MarkdownTranslateError(
      `Unable to write Markdown directory: ${outInput} (${errorDetail(error)})`,
    );
  }

  let resolvedDir: string;
  try {
    resolvedDir = await realpath(absolutePath);
  } catch (error) {
    throw new MarkdownTranslateError(
      `Unable to write Markdown directory: ${outInput} (${errorDetail(error)})`,
    );
  }

  assertInsideWorkingDirectory(resolvedDir, resolvedAllowedDir, outInput, "write");
  return resolvedDir;
}

async function listMarkdownFiles(sourceDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(current);
    } catch (error) {
      throw new MarkdownTranslateError(
        `Unable to read Markdown directory: ${current} (${errorDetail(error)})`,
      );
    }

    for (const name of names) {
      const fullPath = path.join(current, name);
      let linkStat: Awaited<ReturnType<typeof lstat>>;
      try {
        linkStat = await lstat(fullPath);
      } catch (error) {
        throw new MarkdownTranslateError(
          `Unable to read Markdown path: ${fullPath} (${errorDetail(error)})`,
        );
      }

      if (linkStat.isSymbolicLink()) {
        if (isMarkdownFileName(name)) {
          throw new MarkdownTranslateError(
            `Refusing to read Markdown file because it is a symbolic link: ${fullPath}`,
          );
        }
        continue;
      }

      if (linkStat.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (linkStat.isFile() && isMarkdownFileName(name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(sourceDir);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

/**
 * Translates every Markdown file in a directory into one target locale.
 * Relative paths are preserved. Dry-run validates files and reports paths
 * without calling the translator or writing.
 */
export async function translateMarkdownDirectory(
  options: TranslateMarkdownDirectoryOptions,
): Promise<TranslateMarkdownDirectoryResult> {
  const cwd = options.cwd ?? process.cwd();
  const fromLocale = normalizeSingleLocale(options.from, "--from");
  const toLocale = normalizeSingleLocale(options.to, "--to");
  const dryRun = options.dryRun === true;

  const sourceInput = options.source.trim();
  if (!sourceInput) {
    throw new MarkdownTranslateError("Markdown source directory path must not be empty");
  }
  const outInput = options.out.trim();
  if (!outInput) {
    throw new MarkdownTranslateError("Markdown output directory path must not be empty");
  }

  const sourceDir = await resolveSourceDirectory(sourceInput, cwd);
  const logicalOutDir = await assertOutputDirectory(outInput, cwd);
  const markdownFiles = await listMarkdownFiles(sourceDir);
  if (markdownFiles.length === 0) {
    throw new MarkdownTranslateError(`No Markdown files found in source directory: ${sourceInput}`);
  }

  const files: TranslateMarkdownDirectoryFileResult[] = [];
  let guidanceSource: TranslateGuidanceSource = null;
  let guidancePreview: string | null = null;

  for (const markdownFile of markdownFiles) {
    const relativeFile = path.relative(sourceDir, markdownFile);
    const result = await translateMarkdownFile({
      cwd,
      source: markdownFile,
      from: fromLocale,
      to: toLocale,
      out: path.join(logicalOutDir, relativeFile),
      dryRun,
      noConfig: options.noConfig,
      guidance: options.guidance,
      guidanceFile: options.guidanceFile,
      translateMarkdown: options.translateMarkdown,
    });

    if (files.length === 0) {
      guidanceSource = result.guidanceSource;
      guidancePreview = result.guidancePreview;
    }

    files.push({
      sourcePath: result.sourcePath,
      outPath: result.outPath,
      sourceBytes: result.sourceBytes,
      written: result.written,
    });
  }

  let outDir = logicalOutDir;
  if (!dryRun) {
    try {
      outDir = await realpath(logicalOutDir);
    } catch (error) {
      throw new MarkdownTranslateError(
        `Unable to write Markdown directory: ${outInput} (${errorDetail(error)})`,
      );
    }
  }

  return {
    sourceDir,
    outDir,
    fromLocale,
    toLocale,
    dryRun,
    fileCount: files.length,
    files,
    guidanceSource,
    guidancePreview,
  };
}
