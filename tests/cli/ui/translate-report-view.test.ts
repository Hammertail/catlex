//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  TRANSLATE_ALPHA_MESSAGE,
  buildTranslateReportView,
  countTranslatedKeys,
} from "../../../src/cli/ui/translate-report-view.ts";

describe("buildTranslateReportView", () => {
  it("includes the alpha message and empty-state copy", () => {
    const view = buildTranslateReportView({
      baseLocale: "en",
      messagesDir: "messages",
      reports: [],
      writtenFiles: [],
      cancelled: false,
      dryRun: true,
    });

    expect(view.alphaMessage).toBe(TRANSLATE_ALPHA_MESSAGE);
    expect(view.emptyMessage).toBe("No missing string translations to fill.");
    expect(view.summaryLabel).toBe("Dry run");
  });

  it("counts translated keys across locales", () => {
    const count = countTranslatedKeys({
      baseLocale: "en",
      messagesDir: "messages",
      reports: [
        {
          locale: "pt",
          filePath: "pt.json",
          translated: [
            { path: "a", value: "A", baseValue: "A" },
            { path: "b", value: "B", baseValue: "B" },
          ],
          skipped: [],
          incompletePaths: [],
          unexpectedPaths: [],
          placeholderWarnings: [],
        },
      ],
      writtenFiles: [],
      cancelled: false,
      dryRun: false,
    });

    expect(count).toBe(2);
  });
});
