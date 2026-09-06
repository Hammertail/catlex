//* Types imports
import type {
  TranslateProgressEvent,
  TranslateProgressStartEvent,
  TranslateProgressUpdateEvent,
} from "../../core/translate/progress.ts";

export type TranslateProgressWriterKind = "review" | "translate";

export type TranslateProgressWriterOptions = {
  kind?: TranslateProgressWriterKind;
  model: string;
  verbose?: boolean;
  json?: boolean;
  isTty?: boolean;
  write?: (chunk: string) => void;
};

export type ReviewProgressWriterOptions = TranslateProgressWriterOptions;

function formatLocaleList(locales: string[]): string {
  if (locales.length === 0) {
    return "(none)";
  }
  if (locales.length === 1) {
    return locales[0] ?? "(none)";
  }
  return locales.join(", ");
}

function targetLocaleLine(locales: string[]): string {
  const label = formatLocaleList(locales);
  return locales.length <= 1 ? `Target locale: ${label}` : `Target locales: ${label}`;
}

function progressCopy(kind: TranslateProgressWriterKind): {
  title: string;
  keysLabel: string;
} {
  if (kind === "translate") {
    return { title: "Translating missing keys", keysLabel: "keys translated" };
  }
  return { title: "Reviewing translations", keysLabel: "keys reviewed" };
}

/**
 * Builds a progress/banner writer for translate and translate review.
 * Uses stderr when --json so stdout stays machine-readable.
 */
export function createTranslateProgressWriter(options: TranslateProgressWriterOptions): {
  onProgress: (event: TranslateProgressEvent) => void;
  finish: () => void;
} {
  const kind = options.kind ?? "review";
  const { title, keysLabel } = progressCopy(kind);
  const verbose = options.verbose === true;
  const json = options.json === true;
  const isTty = options.isTty ?? (json ? false : Boolean(process.stdout.isTTY));
  const write =
    options.write ??
    ((chunk: string) => {
      const stream = json ? process.stderr : process.stdout;
      stream.write(chunk);
    });

  let progressOpen = false;
  const useCarriageReturn = isTty && !json;

  function endProgressLine(): void {
    if (progressOpen) {
      write("\n");
      progressOpen = false;
    }
  }

  function writeProgressLine(line: string): void {
    if (useCarriageReturn) {
      write(`\r${line}\x1b[K`);
      progressOpen = true;
      return;
    }
    endProgressLine();
    write(`${line}\n`);
  }

  function writeStartBanner(event: TranslateProgressStartEvent): void {
    endProgressLine();
    write(`${title}\n`);
    write(`Source locale: ${event.baseLocale}\n`);
    write(`${targetLocaleLine(event.locales)}\n`);
    write(`Messages dir: ${event.messagesDir}\n`);
    write(`Model: ${options.model}\n`);
    if (event.since !== null) {
      write(`Since: ${event.since}\n`);
    }
    write("\n");
    writeProgressLine(`Progress: 0 / ${event.totalKeys} ${keysLabel}`);
  }

  function writeProgressUpdate(event: TranslateProgressUpdateEvent): void {
    writeProgressLine(
      `Progress: ${event.completedKeys} / ${event.totalKeys} ${keysLabel} · in-flight ${event.inFlight}`,
    );

    const paths = event.chunkPaths;
    if (!verbose || paths === undefined || paths.length === 0) {
      return;
    }
    endProgressLine();
    write(`  [${event.phase}] ${event.locale}: ${paths.join(", ")}\n`);
  }

  function onProgress(event: TranslateProgressEvent): void {
    if (event.type === "start") {
      writeStartBanner(event);
      return;
    }
    writeProgressUpdate(event);
  }

  function finish(): void {
    endProgressLine();
  }

  return { onProgress, finish };
}

/**
 * Builds a progress/banner writer for translate review.
 */
export function createReviewProgressWriter(options: ReviewProgressWriterOptions): {
  onProgress: (event: TranslateProgressEvent) => void;
  finish: () => void;
} {
  return createTranslateProgressWriter({ ...options, kind: options.kind ?? "review" });
}
