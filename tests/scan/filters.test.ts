//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { isLikelyUserVisible, isUserFacingAttribute, USER_FACING_ATTRS } from "../../src/index.ts";

describe("isLikelyUserVisible", () => {
  describe("user-facing copy", () => {
    it("returns true for ordinary words and padded content", () => {
      expect(isLikelyUserVisible("Save")).toBe(true);
      expect(isLikelyUserVisible("a")).toBe(true);
      expect(isLikelyUserVisible("  Hello world  ")).toBe(true);
    });

    it("returns true for accented, CJK, and RTL text", () => {
      expect(isLikelyUserVisible("Configurações")).toBe(true);
      expect(isLikelyUserVisible("保存")).toBe(true);
      expect(isLikelyUserVisible("مرحبا")).toBe(true);
    });

    it("returns true when letters mix with punctuation or emoji", () => {
      expect(isLikelyUserVisible("Save!")).toBe(true);
      expect(isLikelyUserVisible("Hello 👋")).toBe(true);
      expect(isLikelyUserVisible("Hello 👋 world")).toBe(true);
    });

    it("returns true for multiline text and NBSP inside copy", () => {
      expect(isLikelyUserVisible("Hello\nWorld")).toBe(true);
      expect(isLikelyUserVisible("Price:\u00A0R$ 10,00")).toBe(true);
    });
  });

  describe("whitespace-only text", () => {
    it("returns false for empty and whitespace-only strings", () => {
      expect(isLikelyUserVisible("")).toBe(false);
      expect(isLikelyUserVisible(" ")).toBe(false);
      expect(isLikelyUserVisible("\n\t")).toBe(false);
      expect(isLikelyUserVisible("   \n  \t  ")).toBe(false);
    });
  });

  describe("numeric-only text", () => {
    it("returns false for digit-only strings including spaced digits", () => {
      expect(isLikelyUserVisible("42")).toBe(false);
      expect(isLikelyUserVisible("1 2 3")).toBe(false);
      expect(isLikelyUserVisible("  7  ")).toBe(false);
    });
  });

  describe("punctuation-only text", () => {
    it("returns false for punctuation and symbol-only strings", () => {
      expect(isLikelyUserVisible("—")).toBe(false);
      expect(isLikelyUserVisible("...")).toBe(false);
      expect(isLikelyUserVisible("***")).toBe(false);
      expect(isLikelyUserVisible("!!!")).toBe(false);
      expect(isLikelyUserVisible("$")).toBe(false);
      expect(isLikelyUserVisible("©")).toBe(false);
      expect(isLikelyUserVisible("→")).toBe(false);
    });

    it("returns false when punctuation is padded with whitespace", () => {
      expect(isLikelyUserVisible(" . ")).toBe(false);
      expect(isLikelyUserVisible("\n—\n")).toBe(false);
    });
  });

  describe("emoji-only text", () => {
    it("returns false for single and repeated emoji", () => {
      expect(isLikelyUserVisible("🎉")).toBe(false);
      expect(isLikelyUserVisible("🎉🎉")).toBe(false);
    });

    it("returns false for ZWJ sequences and skin-tone modifiers", () => {
      expect(isLikelyUserVisible("👨‍👩‍👧")).toBe(false);
      expect(isLikelyUserVisible("👋🏽")).toBe(false);
    });
  });

  describe("broken and ambiguous text", () => {
    it("returns true for decimals and signed numbers", () => {
      expect(isLikelyUserVisible("3.14")).toBe(true);
      expect(isLikelyUserVisible("-1")).toBe(true);
    });

    it("returns true for currency-like strings", () => {
      expect(isLikelyUserVisible("$100")).toBe(true);
      expect(isLikelyUserVisible("R$ 10")).toBe(true);
    });

    it("returns true for zero-width and control characters", () => {
      expect(isLikelyUserVisible("\u200B")).toBe(true);
      expect(isLikelyUserVisible("\0")).toBe(true);
    });

    it("returns true when digits mix with punctuation or emoji", () => {
      expect(isLikelyUserVisible("42!")).toBe(true);
      expect(isLikelyUserVisible("1 🎉")).toBe(true);
    });

    it("returns false when emoji mixes only with punctuation", () => {
      expect(isLikelyUserVisible("🎉!")).toBe(false);
      expect(isLikelyUserVisible("🎉...")).toBe(false);
    });
  });
});

describe("isUserFacingAttribute", () => {
  it("returns true for every name in USER_FACING_ATTRS", () => {
    for (const name of USER_FACING_ATTRS) {
      expect(isUserFacingAttribute(name)).toBe(true);
    }
  });

  it("returns false for non-user-facing attribute names", () => {
    expect(isUserFacingAttribute("className")).toBe(false);
    expect(isUserFacingAttribute("id")).toBe(false);
    expect(isUserFacingAttribute("href")).toBe(false);
    expect(isUserFacingAttribute("onClick")).toBe(false);
    expect(isUserFacingAttribute("")).toBe(false);
  });

  it("treats attribute names as case-sensitive", () => {
    expect(isUserFacingAttribute("Placeholder")).toBe(false);
    expect(isUserFacingAttribute("ARIA-LABEL")).toBe(false);
  });
});
