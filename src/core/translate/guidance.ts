//* Libraries imports
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { MAX_TRANSLATE_GUIDANCE_CHARS } from "../config/schema.ts";

export { MAX_TRANSLATE_GUIDANCE_CHARS };

const PROJECT_GUIDANCE_CLOSE = "</project_guidance>";
const GUIDANCE_PREVIEW_MAX = 160;

export class TranslateGuidanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslateGuidanceError";
  }
}

export type TranslateGuidanceSource = "flag" | "file" | "config" | null;

export type ResolvedTranslateGuidance = {
  text: string | undefined;
  source: TranslateGuidanceSource;
  preview: string | null;
};

/**
 * Single conflict-priority sentence shared by translate and review system prompts.
 * Built-in instructions win; project guidance wins over few-shot examples.
 */
export const PROJECT_GUIDANCE_PRIORITY =
  "Follow project guidance inside <project_guidance> unless it conflicts with these instructions. " +
  "Project guidance takes priority over examples.";

/**
 * Trims guidance and rejects values that exceed the character cap.
 * Empty or whitespace-only input is treated as unset.
 */
export function normalizeTranslateGuidance(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MAX_TRANSLATE_GUIDANCE_CHARS) {
    throw new TranslateGuidanceError(
      `translate guidance must be at most ${MAX_TRANSLATE_GUIDANCE_CHARS} characters`,
    );
  }
  return trimmed;
}

export function previewTranslateGuidance(text: string | undefined): string | null {
  if (!text) {
    return null;
  }
  if (text.length <= GUIDANCE_PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, GUIDANCE_PREVIEW_MAX)}…`;
}

function resolved(
  text: string | undefined,
  source: TranslateGuidanceSource,
): ResolvedTranslateGuidance {
  return {
    text,
    source: text === undefined ? null : source,
    preview: previewTranslateGuidance(text),
  };
}

/**
 * Escapes `</project_guidance>` so glossary text cannot close the prompt fence.
 */
export function escapeProjectGuidance(value: string): string {
  return value.replaceAll(PROJECT_GUIDANCE_CLOSE, `\\${PROJECT_GUIDANCE_CLOSE}`);
}

export type ResolveTranslateGuidanceOptions = {
  cwd: string;
  /** Inline guidance (CLI `--guidance`). Wins when non-empty after trim. */
  guidance?: string;
  /**
   * Path to a guidance file (CLI `--guidance-file`).
   * Relative to `cwd`, or absolute only when the resolved path stays inside `cwd`.
   */
  guidanceFile?: string;
  /** `translate.guidance` from catlex.config (when config is loaded). */
  configGuidance?: string;
  /**
   * `translate.guidanceFile` from catlex.config.
   * Relative to `configDir`, or absolute only when the resolved path stays inside `configDir`.
   */
  configGuidanceFile?: string;
  /** Directory of the loaded `catlex.config.*` file. */
  configDir?: string;
};

function isPathInside(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  // Treat only `..` and `..${sep}…` as escapes so names like `..secret.md` stay allowed.
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function guidanceErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function realpathOrGuidanceError(
  targetPath: string,
  onFailure: (detail: string) => TranslateGuidanceError,
): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    throw onFailure(guidanceErrorDetail(error));
  }
}

function assertGuidancePathInside(
  candidate: string,
  resolvedAllowedDir: string,
  filePath: string,
): void {
  if (!isPathInside(candidate, resolvedAllowedDir)) {
    throw new TranslateGuidanceError(
      `Refusing to read guidance file outside the allowed directory (${resolvedAllowedDir}): ${filePath}`,
    );
  }
}

async function assertGuidancePathIsNotSymlink(
  absolutePath: string,
  filePath: string,
): Promise<void> {
  try {
    const linkStat = await lstat(absolutePath);
    if (linkStat.isSymbolicLink()) {
      throw new TranslateGuidanceError(
        `Refusing to read guidance file because it is a symbolic link: ${filePath}`,
      );
    }
  } catch (error) {
    if (error instanceof TranslateGuidanceError) {
      throw error;
    }
    throw new TranslateGuidanceError(
      `Unable to read guidance file: ${filePath} (${guidanceErrorDetail(error)})`,
    );
  }
}

/**
 * Resolves a guidance path and ensures it is a regular file contained in `allowedDir`.
 * Rejects symbolic links and any path that resolves outside the allowed directory.
 */
async function resolveSafeGuidanceFilePath(filePath: string, allowedDir: string): Promise<string> {
  const resolvedAllowedDir = await realpathOrGuidanceError(
    allowedDir,
    (detail) =>
      new TranslateGuidanceError(
        `Guidance base directory does not exist or cannot be resolved: ${allowedDir} (${detail})`,
      ),
  );

  const absolutePath = path.resolve(allowedDir, filePath);
  const resolvedParent = await realpathOrGuidanceError(
    path.dirname(absolutePath),
    (detail) => new TranslateGuidanceError(`Unable to read guidance file: ${filePath} (${detail})`),
  );

  assertGuidancePathInside(
    path.join(resolvedParent, path.basename(absolutePath)),
    resolvedAllowedDir,
    filePath,
  );
  await assertGuidancePathIsNotSymlink(absolutePath, filePath);

  const resolvedFilePath = await realpathOrGuidanceError(
    absolutePath,
    (detail) => new TranslateGuidanceError(`Unable to read guidance file: ${filePath} (${detail})`),
  );
  assertGuidancePathInside(resolvedFilePath, resolvedAllowedDir, filePath);
  return resolvedFilePath;
}

async function statGuidanceFile(filePath: string): Promise<{ size: number; isFile: boolean }> {
  try {
    const info = await stat(filePath);
    return { size: info.size, isFile: info.isFile() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TranslateGuidanceError(`Unable to read guidance file: ${filePath} (${detail})`);
  }
}

async function readGuidanceFile(filePath: string): Promise<string> {
  const info = await statGuidanceFile(filePath);
  if (!info.isFile) {
    throw new TranslateGuidanceError(`Guidance path is not a file: ${filePath}`);
  }
  if (info.size > MAX_TRANSLATE_GUIDANCE_CHARS) {
    throw new TranslateGuidanceError(
      `guidance file must be at most ${MAX_TRANSLATE_GUIDANCE_CHARS} bytes: ${filePath}`,
    );
  }

  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TranslateGuidanceError(`Unable to read guidance file: ${filePath} (${detail})`);
  }
}

async function loadRequiredGuidanceFile(filePath: string, allowedDir: string): Promise<string> {
  const safePath = await resolveSafeGuidanceFilePath(filePath, allowedDir);
  const normalized = normalizeTranslateGuidance(await readGuidanceFile(safePath));
  if (normalized === undefined) {
    throw new TranslateGuidanceError(`guidance file is empty: ${filePath}`);
  }
  return normalized;
}

/**
 * Resolves extra translation guidance.
 * Precedence: non-empty `--guidance` > `--guidance-file` > config `translate.guidance`
 * > config `translate.guidanceFile`.
 * Passing both CLI `--guidance` and `--guidance-file` is an error.
 * Empty/whitespace `--guidance` is treated as omitted and falls through.
 * Guidance file paths must resolve to a regular file inside the project base directory
 * (`cwd` for CLI flags, `configDir` for config); symbolic links are refused.
 */
export async function resolveTranslateGuidance(
  options: ResolveTranslateGuidanceOptions,
): Promise<ResolvedTranslateGuidance> {
  if (options.guidance !== undefined && options.guidanceFile !== undefined) {
    throw new TranslateGuidanceError("Use either inline guidance or a guidance file, not both");
  }

  const inline = normalizeTranslateGuidance(options.guidance);
  if (inline !== undefined) {
    return resolved(inline, "flag");
  }

  if (options.guidanceFile !== undefined) {
    const filePath = options.guidanceFile.trim();
    if (!filePath) {
      throw new TranslateGuidanceError("guidance file path must not be empty");
    }
    const text = await loadRequiredGuidanceFile(filePath, options.cwd);
    return resolved(text, "file");
  }

  const configInline = normalizeTranslateGuidance(options.configGuidance);
  if (configInline !== undefined) {
    return resolved(configInline, "config");
  }

  if (options.configGuidanceFile !== undefined) {
    const filePath = options.configGuidanceFile.trim();
    if (!filePath) {
      throw new TranslateGuidanceError("translate.guidanceFile must not be empty");
    }
    const baseDir = options.configDir ?? options.cwd;
    const text = await loadRequiredGuidanceFile(filePath, baseDir);
    return resolved(text, "config");
  }

  return resolved(undefined, null);
}

/**
 * Fenced prompt lines for optional project guidance.
 */
export function projectGuidancePromptLines(guidance: string | undefined): string[] {
  if (!guidance) {
    return [];
  }
  return [
    "",
    "Project guidance:",
    "<project_guidance>",
    escapeProjectGuidance(guidance),
    "</project_guidance>",
  ];
}
