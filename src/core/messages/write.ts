//* Libraries imports
import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

//* Types imports
import type { MessageTree } from "../types.ts";

export class UnsafeLocaleWritePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeLocaleWritePathError";
  }
}

export type WriteLocaleMessagesOptions = {
  /**
   * Directory that locale files must remain inside after path resolution.
   * Typically the configured messages directory.
   */
  allowedDir: string;
};

function isPathInside(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Ensures a locale write target is a regular path contained in `allowedDir`.
 * Rejects symbolic links and any path that resolves outside the allowed directory.
 */
export async function assertSafeLocaleWritePath(
  filePath: string,
  allowedDir: string,
): Promise<void> {
  let resolvedAllowedDir: string;

  try {
    resolvedAllowedDir = await realpath(allowedDir);
  } catch {
    throw new UnsafeLocaleWritePathError(
      `Allowed locale directory does not exist or cannot be resolved: ${allowedDir}`,
    );
  }

  const absolutePath = path.resolve(filePath);
  const logicalParent = path.dirname(absolutePath);
  let resolvedParent: string;

  try {
    resolvedParent = await realpath(logicalParent);
  } catch {
    throw new UnsafeLocaleWritePathError(
      `Locale file parent directory does not exist or cannot be resolved: ${logicalParent}`,
    );
  }

  const intendedPath = path.join(resolvedParent, path.basename(absolutePath));
  if (!isPathInside(intendedPath, resolvedAllowedDir)) {
    throw new UnsafeLocaleWritePathError(
      `Refusing to write locale file outside the allowed directory (${resolvedAllowedDir}): ${filePath}`,
    );
  }

  try {
    const fileStat = await lstat(absolutePath);
    if (fileStat.isSymbolicLink()) {
      throw new UnsafeLocaleWritePathError(
        `Refusing to write locale file because it is a symbolic link: ${filePath}`,
      );
    }
  } catch (error) {
    if (error instanceof UnsafeLocaleWritePathError) {
      throw error;
    }
    if (!isNotFoundError(error)) {
      throw error;
    }
    // File does not exist yet; creating a new regular file inside allowedDir is safe.
    return;
  }

  const resolvedFilePath = await realpath(absolutePath);
  if (!isPathInside(resolvedFilePath, resolvedAllowedDir)) {
    throw new UnsafeLocaleWritePathError(
      `Refusing to write locale file outside the allowed directory (${resolvedAllowedDir}): ${filePath}`,
    );
  }
}

/**
 * Writes a locale message tree as pretty-printed JSON with a trailing newline.
 */
export async function writeLocaleMessages(
  filePath: string,
  tree: MessageTree,
  options: WriteLocaleMessagesOptions,
): Promise<void> {
  await assertSafeLocaleWritePath(filePath, options.allowedDir);
  const contents = `${JSON.stringify(tree, null, 2)}\n`;
  await writeFile(filePath, contents, "utf8");
}
