//* Libraries imports
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

//* Local imports
import { scanVueFile } from "./vue.ts";
import { walkSourceFile } from "./walk.ts";

//* Types imports
import type { HardcodedIssue, ScanFileError, ScanResult } from "./types.ts";

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
    const content = await Bun.file(filePath).text();
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
