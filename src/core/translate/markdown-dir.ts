//* Libraries imports
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { loadConfig } from "../config/load.ts";
import { MarkdownTranslateError, translateMarkdownFile } from "./markdown.ts";
import { mapWithConcurrency, resolveTranslateConcurrency } from "./pool.ts";

//* Types imports
import type { TranslateGuidanceSource } from "./guidance.ts";
import type { TranslateMarkdownFn } from "./markdown.ts";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

const MARKDOWN_DIR_TO_USAGE = "--to <locale> <dir>";

export type TranslateMarkdownDirectoryTarget = {
  to: string;
  out: string;
};

export type TranslateMarkdownDirectoryOptions = {
  cwd?: string;
  source: string;
  from: string;
  targets: TranslateMarkdownDirectoryTarget[];
  dryRun?: boolean;
  noConfig?: boolean;
  concurrency?: number;
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

export type TranslateMarkdownDirectoryTargetResult = {
  outDir: string;
  toLocale: string;
  fileCount: number;
  files: TranslateMarkdownDirectoryFileResult[];
};

export type TranslateMarkdownDirectoryResult = {
  sourceDir: string;
  fromLocale: string;
  dryRun: boolean;
  targets: TranslateMarkdownDirectoryTargetResult[];
  guidanceSource: TranslateGuidanceSource;
  guidancePreview: string | null;
};

type NormalizedMarkdownDirectoryTarget = {
  toLocale: string;
  outInput: string;
};

type ResolvedMarkdownDirectoryTarget = NormalizedMarkdownDirectoryTarget & {
  logicalOutDir: string;
};

type MarkdownDirectoryJob = {
  targetIndex: number;
  markdownFile: string;
  relativeFile: string;
  toLocale: string;
  logicalOutDir: string;
};

/**
 * Pairs variadic `--to` values as locale, output directory, locale, output directory.
 * An odd count, including a locale with no directory, is an error.
 */
export function pairMarkdownDirectoryTargets(
  values: readonly string[],
): TranslateMarkdownDirectoryTarget[] {
  if (values.length === 0 || values.length % 2 !== 0) {
    throw new MarkdownTranslateError(
      `Each --to requires a locale and an output directory: ${MARKDOWN_DIR_TO_USAGE}`,
    );
  }

  const targets: TranslateMarkdownDirectoryTarget[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const to = values[index];
    const out = values[index + 1];
    if (to === undefined || out === undefined) {
      throw new MarkdownTranslateError(
        `Each --to requires a locale and an output directory: ${MARKDOWN_DIR_TO_USAGE}`,
      );
    }
    targets.push({ to, out });
  }
  return targets;
}

function normalizeTargets(
  targets: TranslateMarkdownDirectoryTarget[],
): NormalizedMarkdownDirectoryTarget[] {
  if (targets.length === 0) {
    throw new MarkdownTranslateError(
      `Each --to requires a locale and an output directory: ${MARKDOWN_DIR_TO_USAGE}`,
    );
  }

  const normalized: NormalizedMarkdownDirectoryTarget[] = [];
  const seenLocales = new Set<string>();
  for (const target of targets) {
    const toLocale = normalizeSingleLocale(target.to, "--to");
    if (seenLocales.has(toLocale)) {
      throw new MarkdownTranslateError(`Duplicate --to locale: ${toLocale}`);
    }
    seenLocales.add(toLocale);

    const outInput = target.out.trim();
    if (!outInput) {
      throw new MarkdownTranslateError("Markdown output directory path must not be empty");
    }
    normalized.push({ toLocale, outInput });
  }
  return normalized;
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

async function resolveOutputDirectories(
  targets: NormalizedMarkdownDirectoryTarget[],
  cwd: string,
): Promise<ResolvedMarkdownDirectoryTarget[]> {
  const resolved: ResolvedMarkdownDirectoryTarget[] = [];
  const seenDirs = new Set<string>();
  for (const target of targets) {
    const logicalOutDir = await assertOutputDirectory(target.outInput, cwd);
    if (seenDirs.has(logicalOutDir)) {
      throw new MarkdownTranslateError(`Duplicate --to output directory: ${target.outInput}`);
    }
    seenDirs.add(logicalOutDir);
    resolved.push({ ...target, logicalOutDir });
  }
  return resolved;
}

function buildDirectoryJobs(
  markdownFiles: string[],
  sourceDir: string,
  outputTargets: ResolvedMarkdownDirectoryTarget[],
): MarkdownDirectoryJob[] {
  const jobs: MarkdownDirectoryJob[] = [];
  for (const markdownFile of markdownFiles) {
    const relativeFile = path.relative(sourceDir, markdownFile);
    for (const [targetIndex, target] of outputTargets.entries()) {
      jobs.push({
        targetIndex,
        markdownFile,
        relativeFile,
        toLocale: target.toLocale,
        logicalOutDir: target.logicalOutDir,
      });
    }
  }
  return jobs;
}

/**
 * Translates every Markdown file in a directory into each target locale.
 * Relative paths are preserved. Every output directory is validated before
 * the first translation. File and locale pairs run together up to the
 * concurrency limit. Dry-run reports paths without calling the translator
 * or writing.
 */
export async function translateMarkdownDirectory(
  options: TranslateMarkdownDirectoryOptions,
): Promise<TranslateMarkdownDirectoryResult> {
  const cwd = options.cwd ?? process.cwd();
  const fromLocale = normalizeSingleLocale(options.from, "--from");
  const dryRun = options.dryRun === true;
  const normalizedTargets = normalizeTargets(options.targets);

  const sourceInput = options.source.trim();
  if (!sourceInput) {
    throw new MarkdownTranslateError("Markdown source directory path must not be empty");
  }

  const sourceDir = await resolveSourceDirectory(sourceInput, cwd);
  const outputTargets = await resolveOutputDirectories(normalizedTargets, cwd);
  const markdownFiles = await listMarkdownFiles(sourceDir);
  if (markdownFiles.length === 0) {
    throw new MarkdownTranslateError(`No Markdown files found in source directory: ${sourceInput}`);
  }

  const config = await loadConfig(cwd, { noConfig: options.noConfig });
  const concurrency = resolveTranslateConcurrency(
    options.concurrency ?? config.translate?.concurrency,
  );
  const jobs = buildDirectoryJobs(markdownFiles, sourceDir, outputTargets);
  const translatedFiles = await mapWithConcurrency({
    items: jobs,
    concurrency,
    mapper: (job) =>
      translateMarkdownFile({
        cwd,
        source: job.markdownFile,
        from: fromLocale,
        to: job.toLocale,
        out: path.join(job.logicalOutDir, job.relativeFile),
        dryRun,
        noConfig: options.noConfig,
        guidance: options.guidance,
        guidanceFile: options.guidanceFile,
        translateMarkdown: options.translateMarkdown,
      }),
  });

  const firstTranslation = translatedFiles[0];
  if (firstTranslation === undefined) {
    throw new MarkdownTranslateError("Markdown directory translation produced no file results");
  }

  const filesByTarget: TranslateMarkdownDirectoryFileResult[][] = outputTargets.map(() => []);
  for (const [index, result] of translatedFiles.entries()) {
    const job = jobs[index];
    const bucket = job === undefined ? undefined : filesByTarget[job.targetIndex];
    if (job === undefined || bucket === undefined) {
      throw new MarkdownTranslateError("Markdown directory translation is missing a queued file");
    }
    bucket.push({
      sourcePath: result.sourcePath,
      outPath: result.outPath,
      sourceBytes: result.sourceBytes,
      written: result.written,
    });
  }

  const targets: TranslateMarkdownDirectoryTargetResult[] = [];
  for (const [targetIndex, target] of outputTargets.entries()) {
    const files = filesByTarget[targetIndex] ?? [];
    let outDir = target.logicalOutDir;
    if (!dryRun) {
      try {
        outDir = await realpath(target.logicalOutDir);
      } catch (error) {
        throw new MarkdownTranslateError(
          `Unable to write Markdown directory: ${target.outInput} (${errorDetail(error)})`,
        );
      }
    }

    targets.push({
      outDir,
      toLocale: target.toLocale,
      fileCount: files.length,
      files,
    });
  }

  return {
    sourceDir,
    fromLocale,
    dryRun,
    targets,
    guidanceSource: firstTranslation.guidanceSource,
    guidancePreview: firstTranslation.guidancePreview,
  };
}
