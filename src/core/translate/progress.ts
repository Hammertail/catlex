export type TranslateProgressPhase = "translate" | "review" | "translate-missing";

export type TranslateProgressStartEvent = {
  type: "start";
  baseLocale: string;
  messagesDir: string;
  locales: string[];
  totalKeys: number;
  since: string | null;
};

export type TranslateProgressUpdateEvent = {
  type: "progress";
  completedKeys: number;
  totalKeys: number;
  locale: string;
  phase: TranslateProgressPhase;
  inFlight: number;
  chunkPaths?: string[];
};

export type TranslateProgressEvent = TranslateProgressStartEvent | TranslateProgressUpdateEvent;

export type TranslateProgressFn = (event: TranslateProgressEvent) => void;

export type ReviewProgressStartEvent = TranslateProgressStartEvent;

export type ReviewProgressUpdateEvent = TranslateProgressUpdateEvent;

export type ReviewProgressEvent = TranslateProgressEvent;

export type ReviewProgressFn = TranslateProgressFn;

export type TranslateProgressAccumulator = {
  completeChunk: (options: {
    locale: string;
    phase: TranslateProgressPhase;
    chunkPaths: string[];
    inFlight: number;
  }) => void;
};

/**
 * Serializes completed-key counts for progress events. Safe to call from
 * concurrent chunk completions because JavaScript is single-threaded around
 * the synchronous increment and emit.
 */
export function createProgressAccumulator(options: {
  totalKeys: number;
  onProgress?: TranslateProgressFn;
}): TranslateProgressAccumulator {
  let completedKeys = 0;

  return {
    completeChunk(event) {
      completedKeys += event.chunkPaths.length;
      options.onProgress?.({
        type: "progress",
        completedKeys,
        totalKeys: options.totalKeys,
        locale: event.locale,
        phase: event.phase,
        inFlight: event.inFlight,
        chunkPaths: event.chunkPaths,
      });
    },
  };
}
