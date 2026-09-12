//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import {
  assertSafeLocaleReadPath,
  loadMessagesDir,
  MessagesLoadError,
} from "../../../src/core/messages/load.ts";

describe("assertSafeLocaleReadPath", () => {
  it("allows a regular file inside the messages directory", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-safe-read-ok-"));
    const filePath = path.join(messagesDir, "en.json");
    await writeFile(filePath, `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`, "utf8");

    await expect(assertSafeLocaleReadPath(filePath, messagesDir)).resolves.toBeUndefined();
  });

  it("refuses a regular file whose path is outside the messages directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-safe-read-outside-"));
    const messagesDir = path.join(root, "messages");
    const outsidePath = path.join(root, "outside.json");

    await mkdir(messagesDir);
    await writeFile(outsidePath, `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`, "utf8");

    await expect(assertSafeLocaleReadPath(outsidePath, messagesDir)).rejects.toBeInstanceOf(
      MessagesLoadError,
    );
    await expect(assertSafeLocaleReadPath(outsidePath, messagesDir)).rejects.toThrow(
      /outside the messages directory/i,
    );
  });
});

describe("loadMessagesDir", () => {
  it("loads regular JSON locale files from the messages directory", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-load-ok-"));
    await writeFile(
      path.join(messagesDir, "en.json"),
      `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(messagesDir, "pt.json"),
      `${JSON.stringify({ hello: "Olá" }, null, 2)}\n`,
      "utf8",
    );

    const locales = await loadMessagesDir(messagesDir);

    expect(locales.map((locale) => locale.locale)).toEqual(["en", "pt"]);
    expect(locales[0]?.flat.get("hello")).toBe("Hello");
    expect(locales[1]?.flat.get("hello")).toBe("Olá");
  });

  it("refuses to read a locale file that is a symlink pointing outside the messages directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-load-symlink-escape-"));
    const messagesDir = path.join(root, "messages");
    const secretPath = path.join(root, "secret.json");

    await mkdir(messagesDir);
    await writeFile(
      path.join(messagesDir, "en.json"),
      `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      secretPath,
      `${JSON.stringify({ leaked: "outside-secret" }, null, 2)}\n`,
      "utf8",
    );
    await symlink(secretPath, path.join(messagesDir, "pt.json"));

    await expect(loadMessagesDir(messagesDir)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(loadMessagesDir(messagesDir)).rejects.toThrow(/symbolic link/i);
  });

  it("refuses to read a locale file that is a symbolic link even when the target stays inside the messages directory", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-load-symlink-inside-"));
    const enPath = path.join(messagesDir, "en.json");
    const ptPath = path.join(messagesDir, "pt.json");

    await writeFile(enPath, `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`, "utf8");
    await symlink(enPath, ptPath);

    await expect(loadMessagesDir(messagesDir)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(loadMessagesDir(messagesDir)).rejects.toThrow(/symbolic link/i);
  });

  it("refuses to treat a directory named like a locale JSON file as a locale", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-load-dir-json-"));
    await writeFile(
      path.join(messagesDir, "en.json"),
      `${JSON.stringify({ hello: "Hello" }, null, 2)}\n`,
      "utf8",
    );
    await mkdir(path.join(messagesDir, "pt.json"));

    await expect(loadMessagesDir(messagesDir)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(loadMessagesDir(messagesDir)).rejects.toThrow(/not a regular file/i);
  });
});
