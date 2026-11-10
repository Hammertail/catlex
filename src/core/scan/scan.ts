//* Libraries imports
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "@typescript/typescript6";

//* Local imports
import { scanVueFile } from "./vue.ts";
import { walkSourceFile } from "./walk.ts";

//* Types imports
import type { HardcodedIssue, ScanFileError, ScanResult } from "./types.ts";

export const MAX_SCAN_FILE_BYTES = 1024 * 1024;

export type ResolveSafeScanRootOptions = {
  cwd?: string;
  dir?: string;
  allowOutsideCwd?: boolean;
};

function isInsideOrEqual(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  if (relative === "") {
    return true;
  }
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Resolves the scan target directory against `cwd` and refuses targets that escape
 * `cwd` (logically or via symlinks) unless `allowOutsideCwd: true` is passed.
 */
export async function resolveSafeScanRoot(
  options: ResolveSafeScanRootOptions = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? ".";
  const allowOutsideCwd = options.allowOutsideCwd === true;
  const absoluteCwd = path.resolve(cwd);
  const absoluteTarget = path.resolve(absoluteCwd, dir);

  if (!allowOutsideCwd && !isInsideOrEqual(absoluteTarget, absoluteCwd)) {
    throw new Error(
      `Refusing to scan directory outside the working directory (${absoluteCwd}): ${dir}. Pass --allow-outside-cwd to override.`,
    );
  }

  const targetStat = await lstat(absoluteTarget);

  if (!allowOutsideCwd) {
    if (targetStat.isSymbolicLink()) {
      throw new Error(
        `Refusing to scan directory because it is a symbolic link: ${dir}. Pass --allow-outside-cwd to override.`,
      );
    }

    const [resolvedCwd, resolvedTarget] = await Promise.all([
      realpath(absoluteCwd),
      realpath(absoluteTarget),
    ]);
    if (!isInsideOrEqual(resolvedTarget, resolvedCwd)) {
      throw new Error(
        `Refusing to scan directory outside the working directory (${resolvedCwd}): ${dir}. Pass --allow-outside-cwd to override.`,
      );
    }
  }

  return absoluteTarget;
}

const IGNORE_DIR_NAMES = new Set(["node_modules", "dist", ".next", ".git"]);

const SOURCE_EXTENSIONS = new Set([".jsx", ".tsx", ".vue"]);

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORE_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        await walkDir(fullPath);
        continue;
      }

      if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  await walkDir(rootDir);
  return files;
}

function parseSourceFile(filePath: string, content: string): ts.SourceFile {
  const scriptKind = path.extname(filePath) === ".jsx" ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;

  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scanSourceContent(filePath: string, content: string): HardcodedIssue[] {
  if (path.extname(filePath) === ".vue") {
    return scanVueFile(filePath, content);
  }

  const sourceFile = parseSourceFile(filePath, content);
  return walkSourceFile(sourceFile, filePath);
}

async function scanOneFile(
  filePath: string,
): Promise<{ issues: HardcodedIssue[]; error?: ScanFileError }> {
  try {
    const file = Bun.file(filePath);
    if (file.size > MAX_SCAN_FILE_BYTES) {
      throw new Error(
        `Source file exceeds the ${MAX_SCAN_FILE_BYTES} byte scan limit: ${filePath}`,
      );
    }
    const content = await file.text();
    if (Buffer.byteLength(content, "utf8") > MAX_SCAN_FILE_BYTES) {
      throw new Error(
        `Source file exceeds the ${MAX_SCAN_FILE_BYTES} byte scan limit: ${filePath}`,
      );
    }
    return { issues: scanSourceContent(filePath, content) };
  } catch (error) {
    return {
      issues: [],
      error: {
        filePath,
        message: errorMessage(error),
      },
    };
  }
}

/**
 * Scan a directory tree for obvious hardcoded user-visible strings in JSX/TSX/Vue SFCs.
 *
 * Per-file parse/walk failures are collected in `errors` so one bad file does not
 * abort the rest of the scan or discard findings already collected.
 */
export async function scanHardcoded(rootDir: string): Promise<ScanResult> {
  const absoluteRoot = path.resolve(rootDir);
  const sourceFiles = await collectSourceFiles(absoluteRoot);
  const issues: HardcodedIssue[] = [];
  const errors: ScanFileError[] = [];

  for (const filePath of sourceFiles) {
    const scanned = await scanOneFile(filePath);
    issues.push(...scanned.issues);
    if (scanned.error !== undefined) {
      errors.push(scanned.error);
    }
  }

  return {
    rootDir: absoluteRoot,
    issues,
    errors,
  };
}
