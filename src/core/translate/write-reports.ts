//* Libraries imports
import { readFile } from "node:fs/promises";

//* Local imports
import { applyTranslationsToTree } from "../messages/unflatten.ts";
import { writeLocaleMessages } from "../messages/write.ts";

//* Types imports
import type { MessageTree } from "../types.ts";
import type { LocaleTranslateReport } from "./translate.ts";

/**
 * Writes accepted translations from translate reports onto locale JSON files.
 */
export async function writeTranslatedReports(reports: LocaleTranslateReport[]): Promise<string[]> {
  const writtenFiles: string[] = [];

  for (const report of reports) {
    if (report.translated.length === 0) {
      continue;
    }

    const raw = await readFile(report.filePath, "utf8");
    const tree = JSON.parse(raw) as MessageTree;
    const next = applyTranslationsToTree(
      tree,
      report.translated.map((item) => ({
        path: item.path,
        value: item.value,
      })),
    );
    await writeLocaleMessages(report.filePath, next);
    writtenFiles.push(report.filePath);
  }

  return writtenFiles;
}
