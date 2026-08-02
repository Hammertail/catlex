//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { writeLocaleMessages } from "../../../src/core/messages/write.ts";

describe("writeLocaleMessages", () => {
  it("writes JSON with 2-space indent and a trailing newline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "catlex-write-locale-"));
    const filePath = path.join(dir, "pt.json");

    await writeLocaleMessages(filePath, {
      nav: { home: "Início", about: "Sobre" },
      welcome: "Bem-vindo",
    });

    const onDisk = await readFile(filePath, "utf8");
    expect(onDisk).toBe(
      `${JSON.stringify(
        {
          nav: { home: "Início", about: "Sobre" },
          welcome: "Bem-vindo",
        },
        null,
        2,
      )}\n`,
    );
  });
});
