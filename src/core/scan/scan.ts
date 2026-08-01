//* Libraries imports
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

//* Local imports
import { walkSourceFile } from "./walk.ts";

//* Types imports
import type { HardcodedIssue, ScanResult } from "./types.ts";

const IGNORE_DIR_NAMES = new Set(["node_modules", "dist", ".next", ".git"]);

const SOURCE_EXTENSIONS = new Set([".jsx", ".tsx"]);

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

/**
 * Scan a directory tree for obvious hardcoded user-visible strings in JSX/TSX.
 */
export async function scanHardcoded(rootDir: string): Promise<ScanResult> {
  const absoluteRoot = path.resolve(rootDir);
  const sourceFiles = await collectSourceFiles(absoluteRoot);
  const issues: HardcodedIssue[] = [];

  for (const filePath of sourceFiles) {
    const content = await Bun.file(filePath).text();
    const sourceFile = parseSourceFile(filePath, content);
    issues.push(...walkSourceFile(sourceFile, filePath));
  }

  return {
    rootDir: absoluteRoot,
    issues,
  };
}
