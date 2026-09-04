export const DEFAULT_TRANSLATE_CONCURRENCY = 4;

const MIN_TRANSLATE_CONCURRENCY = 1;

const MAX_TRANSLATE_CONCURRENCY = 32;

const CONCURRENCY_RANGE_MESSAGE = `concurrency must be an integer between ${MIN_TRANSLATE_CONCURRENCY} and ${MAX_TRANSLATE_CONCURRENCY}`;

/**
 * Resolves omitted concurrency to the default and rejects values outside 1–32.
 */
export function resolveTranslateConcurrency(value: number | undefined): number {
  const resolved = value ?? DEFAULT_TRANSLATE_CONCURRENCY;
  if (
    !Number.isInteger(resolved) ||
    resolved < MIN_TRANSLATE_CONCURRENCY ||
    resolved > MAX_TRANSLATE_CONCURRENCY
  ) {
    throw new Error(CONCURRENCY_RANGE_MESSAGE);
  }
  return resolved;
}

/**
 * Splits `items` into consecutive slices of `size`.
 */
export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function rememberFirstError(current: unknown, incoming: unknown): unknown {
  return current !== undefined ? current : incoming;
}

/**
 * Maps `items` with a cap on in-flight work. Results keep the original index order.
 *
 * After the first mapper rejection or `onItemComplete` throw, no further items
 * are started. In-flight work is allowed to finish, then the first error is thrown.
 */
export async function mapWithConcurrency<T, R>(options: {
  items: readonly T[];
  concurrency: number;
  mapper: (item: T, index: number) => Promise<R>;
  onItemComplete?: (info: { item: T; index: number; inFlight: number }) => void;
}): Promise<R[]> {
  const concurrency = resolveTranslateConcurrency(options.concurrency);
  const { items, mapper, onItemComplete } = options;

  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let inFlight = 0;
  let firstError: unknown;

  const runItem = async (index: number, item: T): Promise<void> => {
    inFlight += 1;
    let mapperFailed = false;
    try {
      results[index] = await mapper(item, index);
    } catch (error: unknown) {
      mapperFailed = true;
      firstError = rememberFirstError(firstError, error);
    } finally {
      inFlight -= 1;
    }

    if (mapperFailed) {
      return;
    }

    try {
      onItemComplete?.({ item, index, inFlight });
    } catch (error: unknown) {
      firstError = rememberFirstError(firstError, error);
    }
  };

  const runWorker = async (): Promise<void> => {
    while (firstError === undefined && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      await runItem(index, item);
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (firstError !== undefined) {
    throw firstError;
  }

  return results;
}
