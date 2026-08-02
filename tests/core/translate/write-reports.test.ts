//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { writeTranslatedReports } from "../../../src/core/translate/write-reports.ts";

describe("writeTranslatedReports", () => {
  it("merges translated keys into existing locale files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-write-reports-"));
    const messagesDir = path.join(cwd, "messages");
    await mkdir(messagesDir);
    const filePath = path.join(messagesDir, "pt.json");
    await writeFile(filePath, `${JSON.stringify({ welcome: "Bem-vindo" }, null, 2)}\n`, "utf8");

    const written = await writeTranslatedReports([
      {
        locale: "pt",
        filePath,
        translated: [{ path: "about", value: "Sobre", baseValue: "About" }],
        skipped: [],
        incompletePaths: [],
        unexpectedPaths: [],
        placeholderWarnings: [],
      },
    ]);

    expect(written).toEqual([filePath]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      welcome: "Bem-vindo",
      about: "Sobre",
    });
  });
});
