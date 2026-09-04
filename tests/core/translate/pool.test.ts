//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  DEFAULT_TRANSLATE_CONCURRENCY,
  chunkItems,
  mapWithConcurrency,
  resolveTranslateConcurrency,
} from "../../../src/core/translate/pool.ts";

describe("resolveTranslateConcurrency", () => {
  it("defaults to 4 when the value is omitted", () => {
    expect(resolveTranslateConcurrency(undefined)).toBe(DEFAULT_TRANSLATE_CONCURRENCY);
    expect(resolveTranslateConcurrency(undefined)).toBe(4);
  });

  it("accepts integers from 1 to 32", () => {
    expect(resolveTranslateConcurrency(1)).toBe(1);
    expect(resolveTranslateConcurrency(32)).toBe(32);
  });

  it("rejects zero, negatives, floats, and values above 32", () => {
    expect(() => resolveTranslateConcurrency(0)).toThrow(
      "concurrency must be an integer between 1 and 32",
    );
    expect(() => resolveTranslateConcurrency(-1)).toThrow(
      "concurrency must be an integer between 1 and 32",
    );
    expect(() => resolveTranslateConcurrency(3.5)).toThrow(
      "concurrency must be an integer between 1 and 32",
    );
    expect(() => resolveTranslateConcurrency(33)).toThrow(
      "concurrency must be an integer between 1 and 32",
    );
  });
});

describe("chunkItems", () => {
  it("splits items into consecutive slices", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunkItems([1], 0)).toThrow("chunkSize must be greater than 0");
  });
});

describe("mapWithConcurrency", () => {
  it("returns an empty array when there is no work", async () => {
    const mapped = await mapWithConcurrency({
      items: [],
      concurrency: 4,
      mapper: async () => {
        throw new Error("mapper should not run");
      },
    });

    expect(mapped).toEqual([]);
  });

  it("returns results in the original item order when later items finish first", async () => {
    const mapped = await mapWithConcurrency({
      items: ["a", "b", "c"],
      concurrency: 3,
      mapper: async (item, index) => {
        await Bun.sleep((2 - index) * 15);
        return item.toUpperCase();
      },
    });

    expect(mapped).toEqual(["A", "B", "C"]);
  });

  it("does not start more work than the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await mapWithConcurrency({
      items: [0, 1, 2, 3, 4, 5],
      concurrency: 2,
      mapper: async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(20);
        inFlight -= 1;
        return item;
      },
    });

    expect(maxInFlight).toBe(2);
  });

  it("does not schedule new items after the first failure and still waits for in-flight work", async () => {
    const started: number[] = [];
    const finished: number[] = [];

    await expect(
      mapWithConcurrency({
        items: [0, 1, 2],
        concurrency: 2,
        mapper: async (item) => {
          started.push(item);
          if (item === 1) {
            throw new Error("boom");
          }
          await Bun.sleep(40);
          finished.push(item);
          return item;
        },
      }),
    ).rejects.toThrow("boom");

    expect(started).toContain(0);
    expect(started).toContain(1);
    expect(started).not.toContain(2);
    expect(finished).toEqual([0]);
  });

  it("throws the first rejection when two in-flight items fail", async () => {
    await expect(
      mapWithConcurrency({
        items: [0, 1],
        concurrency: 2,
        mapper: async (item) => {
          await Bun.sleep(item === 0 ? 30 : 5);
          throw new Error(`fail-${item}`);
        },
      }),
    ).rejects.toThrow("fail-1");
  });

  it("rejects when onItemComplete throws after the last in-flight mapper succeeds", async () => {
    const callbackError = new Error("progress failed");
    const settled = Promise.race([
      mapWithConcurrency({
        items: ["a"],
        concurrency: 1,
        mapper: async (item) => item,
        onItemComplete: () => {
          throw callbackError;
        },
      }).then(
        () => "resolved" as const,
        (error: unknown) => error,
      ),
      Bun.sleep(200).then(() => "hung" as const),
    ]);

    await expect(settled).resolves.toBe(callbackError);
  });

  it("waits for remaining in-flight work when onItemComplete throws", async () => {
    const callbackError = new Error("progress failed");
    let slowFinished = false;

    await expect(
      mapWithConcurrency({
        items: ["fast", "slow"],
        concurrency: 2,
        mapper: async (item) => {
          if (item === "slow") {
            await Bun.sleep(40);
            slowFinished = true;
          }
          return item;
        },
        onItemComplete: ({ item }) => {
          if (item === "fast") {
            throw callbackError;
          }
        },
      }),
    ).rejects.toBe(callbackError);

    expect(slowFinished).toBe(true);
  });
});
