//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { MAX_LOCALE_FILE_BYTES, MessagesLoadError } from "../../../src/core/messages/load.ts";
import { writeTranslatedReports } from "../../../src/core/translate/write-reports.ts";

describe("writeTranslatedReports", () => {
  it("merges translated keys into existing locale files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-write-reports-"));
    const messagesDir = path.join(cwd, "messages");
    await mkdir(messagesDir);
    const filePath = path.join(messagesDir, "pt.json");
    await writeFile(filePath, `${JSON.stringify({ welcome: "Bem-vindo" }, null, 2)}\n`, "utf8");

    const written = await writeTranslatedReports(
      [
        {
          locale: "pt",
          filePath,
          translated: [{ path: "about", value: "Sobre", baseValue: "About" }],
          pending: [],
          skipped: [],
          incompletePaths: [],
          unexpectedPaths: [],
          placeholderWarnings: [],
        },
      ],
      { allowedDir: messagesDir },
    );

    expect(written).toEqual([filePath]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      welcome: "Bem-vindo",
      about: "Sobre",
    });
  });

  it("refuses to read an existing locale file that was replaced with a symlink", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-write-reports-symlink-"));
    const messagesDir = path.join(cwd, "messages");
    await mkdir(messagesDir);
    const secretPath = path.join(cwd, "secret.json");
    const filePath = path.join(messagesDir, "pt.json");
    await writeFile(secretPath, '{"secret":"do-not-read"}\n', "utf8");
    await symlink(secretPath, filePath);

    await expect(
      writeTranslatedReports(
        [
          {
            locale: "pt",
            filePath,
            translated: [{ path: "about", value: "Sobre", baseValue: "About" }],
            pending: [],
            skipped: [],
            incompletePaths: [],
            unexpectedPaths: [],
            placeholderWarnings: [],
          },
        ],
        { allowedDir: messagesDir },
      ),
    ).rejects.toThrow(MessagesLoadError);
  });

  it("refuses to read an existing locale file that exceeds MAX_LOCALE_FILE_BYTES", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-write-reports-oversize-"));
    const messagesDir = path.join(cwd, "messages");
    await mkdir(messagesDir);
    const filePath = path.join(messagesDir, "pt.json");
    await writeFile(filePath, `{"a":"${"x".repeat(MAX_LOCALE_FILE_BYTES)}"}`, "utf8");

    await expect(
      writeTranslatedReports(
        [
          {
            locale: "pt",
            filePath,
            translated: [{ path: "about", value: "Sobre", baseValue: "About" }],
            pending: [],
            skipped: [],
            incompletePaths: [],
            unexpectedPaths: [],
            placeholderWarnings: [],
          },
        ],
        { allowedDir: messagesDir },
      ),
    ).rejects.toThrow(/exceeds.*byte limit/i);
  });
});
