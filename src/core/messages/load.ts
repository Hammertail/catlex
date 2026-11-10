//* Libraries imports
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { flattenMessages } from "./flatten.ts";

//* Types imports
import type { Stats } from "node:fs";
import type { LocaleMessages, MessageTree } from "../types.ts";

export const MAX_LOCALE_FILE_BYTES = 2 * 1024 * 1024;

export class MessagesLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagesLoadError";
  }
}

function localeFromFileName(fileName: string): string {
  return path.basename(fileName, ".json");
}

/**
 * Returns whether `candidate` is strictly inside `allowedDir` (both compared as given, without
 * resolving symlinks).
 */
export function isPathInside(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isInsideOrEqual(candidate: string, allowedDir: string): boolean {
  const relative = path.relative(allowedDir, candidate);
  if (relative === "") {
    return true;
  }
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Ensures `messagesDir` logically resolves inside (or equal to) `cwd`.
 */
export function assertLogicalMessagesDirInsideCwd(cwd: string, messagesDir: string): string {
  const absoluteCwd = path.resolve(cwd);
  const candidate = path.resolve(absoluteCwd, messagesDir);
  if (!isInsideOrEqual(candidate, absoluteCwd)) {
    throw new MessagesLoadError(
      `Refusing to use messages directory outside the working directory (${absoluteCwd}): ${messagesDir}`,
    );
  }
  return candidate;
}

/**
 * Resolves `messagesDir` against `cwd` and verifies that it is a non-symlink directory
 * whose canonical `realpath` remains inside (or equal to) the canonical `cwd`.
 */
export async function resolveSafeMessagesDir(cwd: string, messagesDir: string): Promise<string> {
  const candidate = assertLogicalMessagesDirInsideCwd(cwd, messagesDir);
  let resolvedCwd: string;

  try {
    resolvedCwd = await realpath(path.resolve(cwd));
  } catch {
    throw new MessagesLoadError(`Working directory not found: ${cwd}`);
  }

  let dirStat: Stats;
  try {
    dirStat = await lstat(candidate);
  } catch {
    throw new MessagesLoadError(`Messages directory not found: ${candidate}`);
  }

  if (dirStat.isSymbolicLink()) {
    throw new MessagesLoadError(
      `Refusing to read messages directory because it is a symbolic link: ${messagesDir}`,
    );
  }

  if (!dirStat.isDirectory()) {
    throw new MessagesLoadError(`Messages path is not a directory: ${candidate}`);
  }

  let resolvedMessagesDir: string;
  try {
    resolvedMessagesDir = await realpath(candidate);
  } catch {
    throw new MessagesLoadError(`Messages directory not found: ${candidate}`);
  }

  if (!isInsideOrEqual(resolvedMessagesDir, resolvedCwd)) {
    throw new MessagesLoadError(
      `Refusing to use messages directory outside the working directory (${resolvedCwd}): ${messagesDir}`,
    );
  }

  return candidate;
}

/**
 * Ensures a locale read target is a regular file contained in `messagesDir` and within the byte limit.
 * Rejects symbolic links and any path that resolves outside the messages directory.
 */
export async function assertSafeLocaleReadPath(
  filePath: string,
  messagesDir: string,
): Promise<void> {
  let resolvedMessagesDir: string;

  try {
    resolvedMessagesDir = await realpath(messagesDir);
  } catch {
    throw new MessagesLoadError(`Messages directory not found: ${messagesDir}`);
  }

  const absolutePath = path.resolve(filePath);
  let fileStat: Stats;

  try {
    fileStat = await lstat(absolutePath);
  } catch {
    throw new MessagesLoadError(`Cannot read translation file: ${filePath}`);
  }

  if (fileStat.isSymbolicLink()) {
    throw new MessagesLoadError(
      `Refusing to read locale file because it is a symbolic link: ${filePath}`,
    );
  }

  if (!fileStat.isFile()) {
    throw new MessagesLoadError(`Translation path is not a regular file: ${filePath}`);
  }

  if (fileStat.size > MAX_LOCALE_FILE_BYTES) {
    throw new MessagesLoadError(
      `Locale file exceeds the ${MAX_LOCALE_FILE_BYTES} byte limit: ${filePath}`,
    );
  }

  const resolvedFilePath = await realpath(absolutePath);
  if (!isPathInside(resolvedFilePath, resolvedMessagesDir)) {
    throw new MessagesLoadError(
      `Refusing to read locale file outside the messages directory (${resolvedMessagesDir}): ${filePath}`,
    );
  }
}

export type ParseLocaleMessagesOptions = {
  locale: string;
  filePath: string;
};

/**
 * Parses raw JSON text into LocaleMessages with a flattened key map.
 */
export function parseLocaleMessages(
  raw: string,
  options: ParseLocaleMessagesOptions,
): LocaleMessages {
  if (Buffer.byteLength(raw, "utf8") > MAX_LOCALE_FILE_BYTES) {
    throw new MessagesLoadError(
      `Locale file exceeds the ${MAX_LOCALE_FILE_BYTES} byte limit: ${options.filePath}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MessagesLoadError(`Invalid JSON: ${options.filePath}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MessagesLoadError(`Translation file must be a JSON object: ${options.filePath}`);
  }

  const tree = parsed as MessageTree;

  return {
    locale: options.locale,
    filePath: options.filePath,
    tree,
    flat: flattenMessages(tree),
  };
}

async function loadLocaleFile(filePath: string, messagesDir: string): Promise<LocaleMessages> {
  await assertSafeLocaleReadPath(filePath, messagesDir);

  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new MessagesLoadError(`Cannot read translation file: ${filePath}`);
  }

  return parseLocaleMessages(raw, {
    locale: localeFromFileName(filePath),
    filePath,
  });
}

export type LoadMessagesDirOptions = {
  allowedRootDir?: string;
};

/**
 * Loads all `*.json` translation files from a messages directory.
 */
export async function loadMessagesDir(
  messagesDir: string,
  options?: LoadMessagesDirOptions,
): Promise<LocaleMessages[]> {
  let directory = messagesDir;
  if (options?.allowedRootDir !== undefined) {
    directory = await resolveSafeMessagesDir(options.allowedRootDir, messagesDir);
  }

  let dirStat: Stats;

  try {
    dirStat = await lstat(directory);
  } catch {
    throw new MessagesLoadError(`Messages directory not found: ${directory}`);
  }

  if (dirStat.isSymbolicLink()) {
    throw new MessagesLoadError(
      `Refusing to read messages directory because it is a symbolic link: ${directory}`,
    );
  }

  if (!dirStat.isDirectory()) {
    throw new MessagesLoadError(`Messages path is not a directory: ${directory}`);
  }

  const entries = await readdir(directory);
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();

  if (jsonFiles.length === 0) {
    throw new MessagesLoadError(`No JSON translation files found in: ${directory}`);
  }

  const locales: LocaleMessages[] = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(directory, fileName);
    locales.push(await loadLocaleFile(filePath, directory));
  }

  return locales;
}

export function splitBaseAndLocales(
  locales: LocaleMessages[],
  baseLocale: string,
): { base: LocaleMessages; others: LocaleMessages[] } {
  const base = locales.find((locale) => locale.locale === baseLocale);

  if (!base) {
    throw new MessagesLoadError(`Base locale file not found: ${baseLocale}.json`);
  }

  const others = locales.filter((locale) => locale.locale !== baseLocale);

  return { base, others };
}
