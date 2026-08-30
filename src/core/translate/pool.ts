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

/**
 * Maps `items` with a cap on in-flight work. Results keep the original index order.
 *
 * After the first mapper rejection, no further items are started. In-flight
 * work is allowed to finish, then the first error is thrown.
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

  await new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      if (firstError !== undefined) {
        reject(firstError);
        return;
      }
      resolve();
    };

    const launch = (): void => {
      while (inFlight < concurrency && nextIndex < items.length && firstError === undefined) {
        const index = nextIndex;
        const item = items[index];
        if (item === undefined) {
          break;
        }
        nextIndex += 1;
        inFlight += 1;

        void Promise.resolve()
          .then(() => mapper(item, index))
          .then((value) => {
            results[index] = value;
            inFlight -= 1;
            onItemComplete?.({ item, index, inFlight });
            if (firstError !== undefined) {
              if (inFlight === 0) {
                finish();
              }
              return;
            }
            if (nextIndex >= items.length && inFlight === 0) {
              finish();
              return;
            }
            launch();
          })
          .catch((error: unknown) => {
            inFlight -= 1;
            if (firstError === undefined) {
              firstError = error;
            }
            if (inFlight === 0) {
              finish();
            }
          });
      }
    };

    launch();
  });

  return results;
}
