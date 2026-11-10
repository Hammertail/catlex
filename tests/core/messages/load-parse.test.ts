//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  MAX_LOCALE_FILE_BYTES,
  MessagesLoadError,
  parseLocaleMessages,
} from "../../../src/core/messages/load.ts";
import { applyTranslationsToTree } from "../../../src/core/messages/unflatten.ts";

describe("parseLocaleMessages", () => {
  it("parses a JSON object into LocaleMessages with flattened paths", () => {
    const result = parseLocaleMessages(
      JSON.stringify({
        nav: { home: "Home", about: "About" },
        welcome: "Welcome",
      }),
      { locale: "en", filePath: "/tmp/messages/en.json" },
    );

    expect(result.locale).toBe("en");
    expect(result.filePath).toBe("/tmp/messages/en.json");
    expect(result.tree).toEqual({
      nav: { home: "Home", about: "About" },
      welcome: "Welcome",
    });
    expect(result.flat.get("nav.home")).toBe("Home");
    expect(result.flat.get("nav.about")).toBe("About");
    expect(result.flat.get("welcome")).toBe("Welcome");
  });

  it("throws MessagesLoadError when the JSON is invalid", () => {
    expect(() =>
      parseLocaleMessages("{not json", {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow(MessagesLoadError);

    expect(() =>
      parseLocaleMessages("{not json", {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow("Invalid JSON: /tmp/messages/en.json");
  });

  it("throws MessagesLoadError when the root is not a JSON object", () => {
    expect(() =>
      parseLocaleMessages("[]", {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow("Translation file must be a JSON object: /tmp/messages/en.json");

    expect(() =>
      parseLocaleMessages("null", {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow(MessagesLoadError);

    expect(() =>
      parseLocaleMessages('"hello"', {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow(MessagesLoadError);
  });

  it("allows raw JSON at MAX_LOCALE_FILE_BYTES and throws at MAX_LOCALE_FILE_BYTES + 1", () => {
    const prefix = '{"a":"';
    const suffix = '"}';
    const fillLen = MAX_LOCALE_FILE_BYTES - prefix.length - suffix.length;
    const exact = `${prefix}${"x".repeat(fillLen)}${suffix}`;
    const oversized = `${prefix}${"x".repeat(fillLen + 1)}${suffix}`;

    expect(
      parseLocaleMessages(exact, { locale: "en", filePath: "/tmp/messages/en.json" }).flat.get("a"),
    ).toHaveLength(fillLen);

    expect(() =>
      parseLocaleMessages(oversized, {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow(MessagesLoadError);
    expect(() =>
      parseLocaleMessages(oversized, {
        locale: "en",
        filePath: "/tmp/messages/en.json",
      }),
    ).toThrow(/exceeds.*byte limit/i);
  });

  it("does not pollute Object.prototype across parse, flatten, and applyTranslationsToTree", () => {
    const marker = `__catlex_parse_proto_${Date.now()}`;
    const raw = `{"__proto__":{"${marker}":"polluted"},"constructor":{"prototype":{"${marker}":"polluted"}},"safe":"ok"}`;

    const result = parseLocaleMessages(raw, {
      locale: "en",
      filePath: "/tmp/messages/en.json",
    });

    expect(Object.hasOwn(result.tree, "__proto__")).toBe(true);
    expect(result.flat.get(`__proto__.${marker}`)).toBe("polluted");
    expect(result.flat.get(`constructor.prototype.${marker}`)).toBe("polluted");
    expect(result.flat.get("safe")).toBe("ok");

    expect(() =>
      applyTranslationsToTree(result.tree, [{ path: `__proto__.${marker}`, value: "evil" }]),
    ).toThrow(/Unsafe message key: __proto__/);

    const updated = applyTranslationsToTree(result.tree, [{ path: "safe", value: "updated" }]);
    expect(updated.safe).toBe("updated");
    expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    expect(({} as Record<string, unknown>)[marker]).toBeUndefined();
  });
});
