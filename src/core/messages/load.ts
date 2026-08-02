//* Libraries imports
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { flattenMessages } from "./flatten.ts";

//* Types imports
import type { Stats } from "node:fs";
import type { LocaleMessages, MessageTree } from "../types.ts";

export class MessagesLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagesLoadError";
  }
}

function localeFromFileName(fileName: string): string {
  return path.basename(fileName, ".json");
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

async function loadLocaleFile(filePath: string): Promise<LocaleMessages> {
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

/**
 * Loads all `*.json` translation files from a messages directory.
 */
export async function loadMessagesDir(messagesDir: string): Promise<LocaleMessages[]> {
  let dirStat: Stats;

  try {
    dirStat = await stat(messagesDir);
  } catch {
    throw new MessagesLoadError(`Messages directory not found: ${messagesDir}`);
  }

  if (!dirStat.isDirectory()) {
    throw new MessagesLoadError(`Messages path is not a directory: ${messagesDir}`);
  }

  const entries = await readdir(messagesDir);
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();

  if (jsonFiles.length === 0) {
    throw new MessagesLoadError(`No JSON translation files found in: ${messagesDir}`);
  }

  const locales: LocaleMessages[] = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(messagesDir, fileName);
    locales.push(await loadLocaleFile(filePath));
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
