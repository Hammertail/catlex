//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { MessagesLoadError, parseLocaleMessages } from "../../../src/core/messages/load.ts";

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
});
