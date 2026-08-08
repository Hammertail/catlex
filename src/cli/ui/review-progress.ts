//* Types imports
import type {
  ReviewProgressEvent,
  ReviewProgressStartEvent,
  ReviewProgressUpdateEvent,
} from "../../core/translate/review.ts";

export type ReviewProgressWriterOptions = {
  model: string;
  verbose?: boolean;
  json?: boolean;
  isTty?: boolean;
  write?: (chunk: string) => void;
};

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

/**
 * Builds a progress/banner writer for translate review.
 * Uses stderr when --json so stdout stays machine-readable.
 */
export function createReviewProgressWriter(options: ReviewProgressWriterOptions): {
  onProgress: (event: ReviewProgressEvent) => void;
  finish: () => void;
} {
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

  function writeStartBanner(event: ReviewProgressStartEvent): void {
    endProgressLine();
    write("Reviewing translations\n");
    write(`Source locale: ${event.baseLocale}\n`);
    write(`${targetLocaleLine(event.locales)}\n`);
    write(`Messages dir: ${event.messagesDir}\n`);
    write(`Model: ${options.model}\n`);
    if (event.since !== null) {
      write(`Since: ${event.since}\n`);
    }
    write("\n");
    writeProgressLine(`Progress: 0 / ${event.totalKeys} keys reviewed`);
  }

  function writeProgressUpdate(event: ReviewProgressUpdateEvent): void {
    writeProgressLine(
      `Progress: ${event.completedKeys} / ${event.totalKeys} keys reviewed · ${event.locale}`,
    );

    const paths = event.chunkPaths;
    if (!verbose || paths === undefined || paths.length === 0) {
      return;
    }
    endProgressLine();
    write(`  [${event.phase}] ${event.locale}: ${paths.join(", ")}\n`);
  }

  function onProgress(event: ReviewProgressEvent): void {
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
