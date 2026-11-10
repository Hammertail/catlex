//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import {
  assertSafeLocaleReadPath,
  loadMessagesDir,
  MAX_LOCALE_FILE_BYTES,
  MessagesLoadError,
  resolveSafeMessagesDir,
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

  it("allows a locale file at exactly MAX_LOCALE_FILE_BYTES and refuses MAX_LOCALE_FILE_BYTES + 1", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-safe-read-oversize-"));
    const exactPath = path.join(messagesDir, "exact.json");
    const overPath = path.join(messagesDir, "over.json");
    const prefix = '{"a":"';
    const suffix = '"}';
    const fillLen = MAX_LOCALE_FILE_BYTES - prefix.length - suffix.length;
    await writeFile(exactPath, `${prefix}${"x".repeat(fillLen)}${suffix}`, "utf8");
    await writeFile(overPath, `${prefix}${"x".repeat(fillLen + 1)}${suffix}`, "utf8");

    await expect(assertSafeLocaleReadPath(exactPath, messagesDir)).resolves.toBeUndefined();
    await expect(assertSafeLocaleReadPath(overPath, messagesDir)).rejects.toBeInstanceOf(
      MessagesLoadError,
    );
    await expect(assertSafeLocaleReadPath(overPath, messagesDir)).rejects.toThrow(
      /exceeds.*byte limit/i,
    );
  });
});

describe("resolveSafeMessagesDir", () => {
  it("resolves a messages directory inside cwd (relative, '.', and absolute inside cwd)", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-ok-"));
    const messagesDir = path.join(cwd, "messages");
    await mkdir(messagesDir);

    expect(await resolveSafeMessagesDir(cwd, "messages")).toBe(path.resolve(messagesDir));
    expect(await resolveSafeMessagesDir(cwd, ".")).toBe(path.resolve(cwd));
    expect(await resolveSafeMessagesDir(cwd, messagesDir)).toBe(path.resolve(messagesDir));
  });

  it("refuses a messagesDir that traverses outside cwd with ..", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-parent-"));
    const cwd = path.join(root, "project");
    const outside = path.join(root, "outside");
    await mkdir(cwd);
    await mkdir(outside);

    await expect(resolveSafeMessagesDir(cwd, "../outside")).rejects.toBeInstanceOf(
      MessagesLoadError,
    );
    await expect(resolveSafeMessagesDir(cwd, "../outside")).rejects.toThrow(
      /outside the working directory/i,
    );
  });

  it("refuses an absolute messagesDir outside cwd", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-abs-cwd-"));
    const outside = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-abs-out-"));

    await expect(resolveSafeMessagesDir(cwd, outside)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(resolveSafeMessagesDir(cwd, outside)).rejects.toThrow(
      /outside the working directory/i,
    );
  });

  it("refuses a messagesDir that is a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-symlink-"));
    const cwd = path.join(root, "project");
    const target = path.join(root, "real-messages");
    await mkdir(cwd);
    await mkdir(target);
    await symlink(target, path.join(cwd, "messages"));

    await expect(resolveSafeMessagesDir(cwd, "messages")).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(resolveSafeMessagesDir(cwd, "messages")).rejects.toThrow(/symbolic link/i);
  });

  it("refuses a messagesDir whose parent inside cwd is a symlink pointing outside cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-safe-msgdir-parent-link-"));
    const cwd = path.join(root, "project");
    const outside = path.join(root, "outside");
    await mkdir(cwd);
    await mkdir(path.join(outside, "messages"), { recursive: true });
    await symlink(outside, path.join(cwd, "linked"));

    await expect(resolveSafeMessagesDir(cwd, "linked/messages")).rejects.toBeInstanceOf(
      MessagesLoadError,
    );
    await expect(resolveSafeMessagesDir(cwd, "linked/messages")).rejects.toThrow(
      /outside the working directory/i,
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

  it("refuses to read a messages directory that is itself a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-load-symlink-dir-"));
    const realMessages = path.join(root, "real-messages");
    const linkMessages = path.join(root, "messages");
    await mkdir(realMessages);
    await writeFile(path.join(realMessages, "en.json"), '{"hello":"Hello"}\n', "utf8");
    await symlink(realMessages, linkMessages);

    await expect(loadMessagesDir(linkMessages)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(loadMessagesDir(linkMessages)).rejects.toThrow(/symbolic link/i);
  });

  it("refuses to load a locale file that exceeds MAX_LOCALE_FILE_BYTES", async () => {
    const messagesDir = await mkdtemp(path.join(tmpdir(), "catlex-load-oversize-"));
    const oversized = `{"a":"${"x".repeat(MAX_LOCALE_FILE_BYTES)}"}`;
    await writeFile(path.join(messagesDir, "en.json"), oversized, "utf8");

    await expect(loadMessagesDir(messagesDir)).rejects.toBeInstanceOf(MessagesLoadError);
    await expect(loadMessagesDir(messagesDir)).rejects.toThrow(/exceeds.*byte limit/i);
  });
});
