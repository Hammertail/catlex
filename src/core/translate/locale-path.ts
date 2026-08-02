export type LocalePathItem = {
  locale: string;
  path: string;
};

/**
 * Compares items by locale, then by path.
 */
function compareLocalePath(a: LocalePathItem, b: LocalePathItem): number {
  const localeCmp = a.locale.localeCompare(b.locale);
  if (localeCmp !== 0) {
    return localeCmp;
  }
  return a.path.localeCompare(b.path);
}

export function sortByLocalePath<T extends LocalePathItem>(items: T[]): T[] {
  return [...items].sort(compareLocalePath);
}
