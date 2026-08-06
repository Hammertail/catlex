//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import {
  UnsafeLocaleWritePathError,
  writeLocaleMessages,
} from "../../../src/core/messages/write.ts";

describe("writeLocaleMessages", () => {
  it("writes JSON with 2-space indent and a trailing newline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "catlex-write-locale-"));
    const filePath = path.join(dir, "pt.json");

    await writeLocaleMessages(
      filePath,
      {
        nav: { home: "Início", about: "Sobre" },
        welcome: "Bem-vindo",
      },
      { allowedDir: dir },
    );

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

  it("refuses to write when the locale file is a symlink pointing outside the allowed directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-write-symlink-escape-"));
    const messagesDir = path.join(root, "messages");
    const victimPath = path.join(root, "package.json");
    const localePath = path.join(messagesDir, "pt.json");

    await mkdir(messagesDir);
    await writeFile(victimPath, `${JSON.stringify({ name: "victim" }, null, 2)}\n`, "utf8");
    await symlink(victimPath, localePath);

    const victimBefore = await readFile(victimPath, "utf8");

    await expect(
      writeLocaleMessages(localePath, { hello: "Olá" }, { allowedDir: messagesDir }),
    ).rejects.toBeInstanceOf(UnsafeLocaleWritePathError);

    expect(await readFile(victimPath, "utf8")).toBe(victimBefore);
  });

  it("refuses to write when the locale file is a symbolic link even if the target stays inside the allowed directory", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-write-symlink-inside-"));
    const enPath = path.join(messagesDir, "en.json");
    const ptPath = path.join(messagesDir, "pt.json");

    await writeFile(enPath, `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`, "utf8");
    await symlink(enPath, ptPath);

    const enBefore = await readFile(enPath, "utf8");

    await expect(
      writeLocaleMessages(ptPath, { hello: "Olá" }, { allowedDir: messagesDir }),
    ).rejects.toBeInstanceOf(UnsafeLocaleWritePathError);

    expect(await readFile(enPath, "utf8")).toBe(enBefore);
  });

  it("refuses to write when the logical path resolves outside the allowed directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-write-path-escape-"));
    const messagesDir = path.join(root, "messages");
    const victimPath = path.join(root, "package.json");

    await mkdir(messagesDir);
    await writeFile(victimPath, `${JSON.stringify({ name: "victim" }, null, 2)}\n`, "utf8");

    const victimBefore = await readFile(victimPath, "utf8");

    await expect(
      writeLocaleMessages(
        path.join(messagesDir, "..", "package.json"),
        { hello: "Olá" },
        { allowedDir: messagesDir },
      ),
    ).rejects.toBeInstanceOf(UnsafeLocaleWritePathError);

    expect(await readFile(victimPath, "utf8")).toBe(victimBefore);
  });

  it("creates a new locale file when the path is a regular file inside the allowed directory", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-write-new-locale-"));
    const filePath = path.join(messagesDir, "pt.json");

    await writeLocaleMessages(filePath, { hello: "Olá" }, { allowedDir: messagesDir });

    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ hello: "Olá" });
  });
});
