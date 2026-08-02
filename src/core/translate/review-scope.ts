//* Libraries imports
import path from "node:path";

//* Local imports
import { assertGitRepo, assertRefExists, listFilesAtRef, readFileAtRef } from "../git/show.ts";
import { diffFlatMessages } from "../messages/diff-flat.ts";
import { flattenMessages } from "../messages/flatten.ts";
import { loadMessagesDir, parseLocaleMessages } from "../messages/load.ts";
import { sortByLocalePath } from "./locale-path.ts";

//* Types imports
import type { GitRunner } from "../git/run.ts";
import type { FlatMessages, LocaleMessages, MessageTree } from "../types.ts";

export type ReviewChangeSource = "base" | "locale";

export type ReviewTarget = {
  locale: string;
  path: string;
  baseValue: string;
  localeValue?: string;
  changeSources: ReviewChangeSource[];
};

export type ReviewRemovedPath = {
  locale: string;
  path: string;
  value: unknown;
  source: ReviewChangeSource;
};

export type ReviewScopeSkipped = {
  locale: string;
  path: string;
  reason: "non-string-base" | "non-string-locale";
  baseValue?: unknown;
  localeValue?: unknown;
};

export type ReviewScopeResult = {
  targets: ReviewTarget[];
  removed: ReviewRemovedPath[];
  skipped: ReviewScopeSkipped[];
  baseLocale: string;
  since: string | null;
};

export type ResolveReviewScopeOptions = {
  cwd: string;
  messagesDir: string;
  baseLocale: string;
  since?: string;
  locales?: string[];
  runGit?: GitRunner;
  loadWorkingTree?: () => Promise<LocaleMessages[]>;
  loadAtRef?: (ref: string) => Promise<LocaleMessages[]>;
};

function emptyLocale(locale: string, filePath: string): LocaleMessages {
  const tree: MessageTree = {};
  return {
    locale,
    filePath,
    tree,
    flat: flattenMessages(tree),
  };
}

function localeFromRelativePath(relativePath: string): string {
  return path.basename(relativePath, ".json");
}

function filterLocales(locales: LocaleMessages[], localeFilter?: string[]): LocaleMessages[] {
  if (localeFilter === undefined) {
    return locales;
  }
  const allowed = new Set(localeFilter);
  return locales.filter((locale) => allowed.has(locale.locale));
}

async function defaultLoadWorkingTree(cwd: string, messagesDir: string): Promise<LocaleMessages[]> {
  return loadMessagesDir(path.resolve(cwd, messagesDir));
}

async function defaultLoadAtRef(options: {
  cwd: string;
  messagesDir: string;
  ref: string;
  runGit?: GitRunner;
}): Promise<LocaleMessages[]> {
  const files = await listFilesAtRef({
    cwd: options.cwd,
    ref: options.ref,
    directory: options.messagesDir,
    runGit: options.runGit,
  });

  const jsonFiles = files.filter((filePath) => filePath.endsWith(".json")).sort();
  const locales: LocaleMessages[] = [];

  for (const relativePath of jsonFiles) {
    const raw = await readFileAtRef({
      cwd: options.cwd,
      ref: options.ref,
      path: relativePath,
      runGit: options.runGit,
    });

    if (raw === null) {
      continue;
    }

    locales.push(
      parseLocaleMessages(raw, {
        locale: localeFromRelativePath(relativePath),
        filePath: path.resolve(options.cwd, relativePath),
      }),
    );
  }

  return locales;
}

function findLocale(
  locales: LocaleMessages[],
  localeId: string,
  messagesDir: string,
  cwd: string,
): LocaleMessages {
  return (
    locales.find((locale) => locale.locale === localeId) ??
    emptyLocale(localeId, path.resolve(cwd, messagesDir, `${localeId}.json`))
  );
}

function changedPaths(before: FlatMessages, after: FlatMessages): string[] {
  const diff = diffFlatMessages(before, after);
  return [...diff.added.map((item) => item.path), ...diff.modified.map((item) => item.path)];
}

function removedEntries(
  before: FlatMessages,
  after: FlatMessages,
  locale: string,
  source: ReviewChangeSource,
): ReviewRemovedPath[] {
  return diffFlatMessages(before, after).removed.map((item) => ({
    locale,
    path: item.path,
    value: item.value,
    source,
  }));
}

function upsertTarget(byKey: Map<string, ReviewTarget>, target: ReviewTarget): void {
  const key = `${target.locale}\0${target.path}`;
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, {
      ...target,
      changeSources: [...target.changeSources],
    });
    return;
  }

  const sources = new Set<ReviewChangeSource>([...existing.changeSources, ...target.changeSources]);
  existing.changeSources = [...sources].sort();
}

function pushNonStringSkip(
  skipped: ReviewScopeSkipped[],
  localeId: string,
  messagePath: string,
  reason: ReviewScopeSkipped["reason"],
  baseValue: unknown,
  localeValue?: unknown,
): void {
  skipped.push({
    locale: localeId,
    path: messagePath,
    reason,
    baseValue,
    localeValue,
  });
}

function tryBuildTarget(options: {
  locale: LocaleMessages;
  messagePath: string;
  baseValue: unknown;
  changeSources: ReviewChangeSource[];
  skipped: ReviewScopeSkipped[];
}): ReviewTarget | null {
  if (typeof options.baseValue !== "string") {
    pushNonStringSkip(
      options.skipped,
      options.locale.locale,
      options.messagePath,
      "non-string-base",
      options.baseValue,
    );
    return null;
  }

  const localeValue = options.locale.flat.get(options.messagePath);
  if (localeValue !== undefined && typeof localeValue !== "string") {
    pushNonStringSkip(
      options.skipped,
      options.locale.locale,
      options.messagePath,
      "non-string-locale",
      options.baseValue,
      localeValue,
    );
    return null;
  }

  return {
    locale: options.locale.locale,
    path: options.messagePath,
    baseValue: options.baseValue,
    localeValue: typeof localeValue === "string" ? localeValue : undefined,
    changeSources: options.changeSources,
  };
}

function buildFullCorpusScope(options: {
  current: LocaleMessages[];
  baseLocale: string;
  messagesDir: string;
  cwd: string;
  locales?: string[];
}): ReviewScopeResult {
  const base = findLocale(options.current, options.baseLocale, options.messagesDir, options.cwd);
  const others = filterLocales(
    options.current.filter((locale) => locale.locale !== options.baseLocale),
    options.locales,
  );

  const targets: ReviewTarget[] = [];
  const skipped: ReviewScopeSkipped[] = [];

  for (const [messagePath, baseValue] of base.flat) {
    for (const locale of others) {
      const target = tryBuildTarget({
        locale,
        messagePath,
        baseValue,
        changeSources: [],
        skipped,
      });
      if (target) {
        targets.push(target);
      }
    }
  }

  return {
    targets: sortByLocalePath(targets),
    removed: [],
    skipped: sortByLocalePath(skipped),
    baseLocale: options.baseLocale,
    since: null,
  };
}

function applyBaseChanges(options: {
  baseChanged: Set<string>;
  baseCurrent: LocaleMessages;
  others: LocaleMessages[];
  byKey: Map<string, ReviewTarget>;
  skipped: ReviewScopeSkipped[];
}): void {
  for (const messagePath of options.baseChanged) {
    const baseValue = options.baseCurrent.flat.get(messagePath);
    for (const locale of options.others) {
      const target = tryBuildTarget({
        locale,
        messagePath,
        baseValue,
        changeSources: ["base"],
        skipped: options.skipped,
      });
      if (target) {
        upsertTarget(options.byKey, target);
      }
    }
  }
}

function markLocaleSourceOnExisting(
  byKey: Map<string, ReviewTarget>,
  localeId: string,
  messagePath: string,
): void {
  const existing = byKey.get(`${localeId}\0${messagePath}`);
  if (existing) {
    upsertTarget(byKey, {
      ...existing,
      changeSources: ["locale"],
    });
  }
}

function applySiblingPathChange(options: {
  locale: LocaleMessages;
  messagePath: string;
  baseCurrent: LocaleMessages;
  baseChanged: Set<string>;
  byKey: Map<string, ReviewTarget>;
  skipped: ReviewScopeSkipped[];
}): void {
  if (options.baseChanged.has(options.messagePath)) {
    markLocaleSourceOnExisting(options.byKey, options.locale.locale, options.messagePath);
    return;
  }

  const baseValue = options.baseCurrent.flat.get(options.messagePath);
  if (baseValue === undefined) {
    return;
  }

  const target = tryBuildTarget({
    locale: options.locale,
    messagePath: options.messagePath,
    baseValue,
    changeSources: ["locale"],
    skipped: options.skipped,
  });
  if (target) {
    upsertTarget(options.byKey, target);
  }
}

function applySiblingChanges(options: {
  others: LocaleMessages[];
  previous: LocaleMessages[];
  baseCurrent: LocaleMessages;
  baseChanged: Set<string>;
  messagesDir: string;
  cwd: string;
  byKey: Map<string, ReviewTarget>;
  skipped: ReviewScopeSkipped[];
  removed: ReviewRemovedPath[];
}): void {
  for (const locale of options.others) {
    const previousLocale = findLocale(
      options.previous,
      locale.locale,
      options.messagesDir,
      options.cwd,
    );
    options.removed.push(
      ...removedEntries(previousLocale.flat, locale.flat, locale.locale, "locale"),
    );

    for (const messagePath of changedPaths(previousLocale.flat, locale.flat)) {
      applySiblingPathChange({
        locale,
        messagePath,
        baseCurrent: options.baseCurrent,
        baseChanged: options.baseChanged,
        byKey: options.byKey,
        skipped: options.skipped,
      });
    }
  }
}

async function buildSinceScope(options: {
  since: string;
  cwd: string;
  messagesDir: string;
  baseLocale: string;
  locales?: string[];
  runGit?: GitRunner;
  loadAtRef: (ref: string) => Promise<LocaleMessages[]>;
  loadWorkingTree: () => Promise<LocaleMessages[]>;
  skipGitChecks: boolean;
}): Promise<ReviewScopeResult> {
  if (!options.skipGitChecks) {
    await assertGitRepo({ cwd: options.cwd, runGit: options.runGit });
    await assertRefExists({ cwd: options.cwd, ref: options.since, runGit: options.runGit });
  }

  const previous = await options.loadAtRef(options.since);
  const current = await options.loadWorkingTree();

  const baseCurrent = findLocale(current, options.baseLocale, options.messagesDir, options.cwd);
  const basePrevious = findLocale(previous, options.baseLocale, options.messagesDir, options.cwd);
  const others = filterLocales(
    current.filter((locale) => locale.locale !== options.baseLocale),
    options.locales,
  );

  const removed: ReviewRemovedPath[] = [
    ...removedEntries(basePrevious.flat, baseCurrent.flat, options.baseLocale, "base"),
  ];
  const baseChanged = new Set(changedPaths(basePrevious.flat, baseCurrent.flat));
  const byKey = new Map<string, ReviewTarget>();
  const skipped: ReviewScopeSkipped[] = [];

  applyBaseChanges({
    baseChanged,
    baseCurrent,
    others,
    byKey,
    skipped,
  });
  applySiblingChanges({
    others,
    previous,
    baseCurrent,
    baseChanged,
    messagesDir: options.messagesDir,
    cwd: options.cwd,
    byKey,
    skipped,
    removed,
  });

  return {
    targets: sortByLocalePath([...byKey.values()]),
    removed: sortByLocalePath(removed),
    skipped: sortByLocalePath(skipped),
    baseLocale: options.baseLocale,
    since: options.since,
  };
}

/**
 * Resolves which locale/path pairs should be reviewed.
 */
export async function resolveReviewScope(
  options: ResolveReviewScopeOptions,
): Promise<ReviewScopeResult> {
  const loadWorkingTree =
    options.loadWorkingTree ?? (() => defaultLoadWorkingTree(options.cwd, options.messagesDir));
  const loadAtRef =
    options.loadAtRef ??
    ((ref: string) =>
      defaultLoadAtRef({
        cwd: options.cwd,
        messagesDir: options.messagesDir,
        ref,
        runGit: options.runGit,
      }));

  if (options.since === undefined) {
    return buildFullCorpusScope({
      current: await loadWorkingTree(),
      baseLocale: options.baseLocale,
      messagesDir: options.messagesDir,
      cwd: options.cwd,
      locales: options.locales,
    });
  }

  return buildSinceScope({
    since: options.since,
    cwd: options.cwd,
    messagesDir: options.messagesDir,
    baseLocale: options.baseLocale,
    locales: options.locales,
    runGit: options.runGit,
    loadAtRef,
    loadWorkingTree,
    skipGitChecks: options.loadAtRef !== undefined,
  });
}
