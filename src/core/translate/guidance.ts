//* Libraries imports
import { readFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { MAX_TRANSLATE_GUIDANCE_CHARS } from "../config/schema.ts";

export { MAX_TRANSLATE_GUIDANCE_CHARS };

export class TranslateGuidanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslateGuidanceError";
  }
}

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

export type ResolveTranslateGuidanceOptions = {
  cwd: string;
  /** Inline guidance (CLI `--guidance`). Wins over file and config when defined. */
  guidance?: string;
  /** Path to a guidance file (CLI `--guidance-file`), relative to `cwd` unless absolute. */
  guidanceFile?: string;
  /** `translate.guidance` from catlex.config (when config is loaded). */
  configGuidance?: string;
};

async function readGuidanceFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TranslateGuidanceError(`Unable to read guidance file: ${filePath} (${detail})`);
  }
}

/**
 * Resolves extra translation guidance.
 * Precedence: inline `guidance` > `guidanceFile` > `configGuidance`.
 * Passing both `guidance` and `guidanceFile` is an error.
 */
export async function resolveTranslateGuidance(
  options: ResolveTranslateGuidanceOptions,
): Promise<string | undefined> {
  if (options.guidance !== undefined && options.guidanceFile !== undefined) {
    throw new TranslateGuidanceError("Use either inline guidance or a guidance file, not both");
  }

  if (options.guidance !== undefined) {
    return normalizeTranslateGuidance(options.guidance);
  }

  if (options.guidanceFile !== undefined) {
    const filePath = options.guidanceFile.trim();
    if (!filePath) {
      throw new TranslateGuidanceError("guidance file path must not be empty");
    }
    const resolved = path.resolve(options.cwd, filePath);
    return normalizeTranslateGuidance(await readGuidanceFile(resolved));
  }

  return normalizeTranslateGuidance(options.configGuidance);
}

/**
 * Prompt lines for optional project guidance, including a closing rule when set.
 */
export function projectGuidancePromptLines(guidance: string | undefined): string[] {
  if (!guidance) {
    return [];
  }
  return [
    "- Follow project guidance when it does not conflict with the rules above.",
    "",
    "Project guidance (additional; does not override the rules above):",
    guidance,
  ];
}
