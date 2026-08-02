//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { fixturesRoot, issuesForFile } from "./helpers.ts";

describe("scanHardcoded complex fixtures", () => {
  it("flags complex real-world copy including accents, emoji mixes, and smart quotes", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-complex.tsx");

    expect(issues).toHaveLength(6);
    expect(issues).toContainEqual(expect.objectContaining({ text: "Save changes…" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Don’t delete this account" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Hello 👋 world" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Configurações gerais" }));
    expect(issues).toContainEqual(
      expect.objectContaining({ text: "Use “smart quotes” carefully" }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ text: "Price:\u00A0R$ 10,00" }));
  });

  it("flags complex real-world copy in Vue SFCs including decoded unicode escapes", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-complex.vue");

    expect(issues).toHaveLength(6);
    expect(issues).toContainEqual(expect.objectContaining({ text: "Save changes…" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Don’t delete this account" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Hello 👋 world" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Configurações gerais" }));
    expect(issues).toContainEqual(
      expect.objectContaining({ text: "Use “smart quotes” carefully" }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ text: "Price:\u00A0R$ 10,00" }));
  });

  it("trims multiline JSX text while preserving internal newlines", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-multiline.tsx");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Review your\n        billing details",
      }),
    ]);
  });

  it("trims multiline Vue template text while preserving internal newlines", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "text-multiline.vue");

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "jsx-text",
        text: "Review your\n      billing details",
      }),
    ]);
  });

  it("reports hardcoded strings in a messy real-world settings form", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "messy-realworld.tsx");

    expect(issues).toHaveLength(6);
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Account settings" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Display name" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Jane Doe",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Display name",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "alt",
        text: "Profile photo",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Save preferences" }),
    );
  });

  it("reports hardcoded strings in a messy real-world Vue settings form", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "messy-realworld.vue");

    expect(issues).toHaveLength(6);
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Account settings" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Display name" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Jane Doe",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Display name",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "alt",
        text: "Profile photo",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "jsx-text", text: "Save preferences" }),
    );
  });

  it("flags copy inside namespaced components and interleaved JSX text", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "nested-components.tsx");

    expect(issues).toHaveLength(7);
    expect(issues).toContainEqual(expect.objectContaining({ text: "Full name" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Team plan" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "seats remaining" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Starter plan" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Includes" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "basic" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "support" }));
  });

  it("flags copy inside nested Vue components and interleaved template text", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "nested-components.vue");

    expect(issues).toHaveLength(7);
    expect(issues).toContainEqual(expect.objectContaining({ text: "Full name" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Team plan" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "seats remaining" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Starter plan" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "Includes" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "basic" }));
    expect(issues).toContainEqual(expect.objectContaining({ text: "support" }));
  });

  it("flags hardcoded strings in densely formatted messy components", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "messy-style.tsx");

    expect(issues).toHaveLength(3);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Submit form",
      }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ kind: "jsx-text", text: "Submit" }));
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Type here…",
      }),
    );
  });

  it("flags hardcoded strings in densely formatted messy Vue SFCs", async () => {
    const result = await scanHardcoded(fixturesRoot);
    const issues = issuesForFile(result.issues, "messy-style.vue");

    expect(issues).toHaveLength(3);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "aria-label",
        text: "Submit form",
      }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ kind: "jsx-text", text: "Submit" }));
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "jsx-attribute",
        attributeName: "placeholder",
        text: "Type here…",
      }),
    );
  });
});
