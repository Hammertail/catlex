//* Libraries imports
import { describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";

//* Local imports
import { GitError } from "../../../src/core/git/show.ts";
import { runGit } from "../../../src/core/git/run.ts";
import { flattenMessages } from "../../../src/core/messages/flatten.ts";
import { resolveReviewScope } from "../../../src/core/translate/review-scope.ts";
import {
  checkoutBranch,
  commitAll,
  createTempGitRepo,
  whichGit,
  writeRepoFile,
} from "../git/temp-repo.ts";

//* Types imports
import type { LocaleMessages } from "../../../src/core/types.ts";

function localeMessages(
  locale: string,
  tree: Record<string, unknown>,
  filePath = `/messages/${locale}.json`,
): LocaleMessages {
  return {
    locale,
    filePath,
    tree,
    flat: flattenMessages(tree),
  };
}

describe("resolveReviewScope", () => {
  it("returns every base string path for every target locale when since is omitted", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      loadWorkingTree: async () => [
        localeMessages("en", {
          welcome: "Welcome",
          nav: { about: "About" },
          meta: { count: 1 },
        }),
        localeMessages("pt", {
          welcome: "Olá",
        }),
        localeMessages("es", {
          welcome: "Hola",
          nav: { about: "Acerca" },
        }),
      ],
    });

    expect(result.targets.map((t) => `${t.locale}:${t.path}`).sort()).toEqual([
      "es:nav.about",
      "es:welcome",
      "pt:nav.about",
      "pt:welcome",
    ]);
    expect(result.targets.find((t) => t.locale === "pt" && t.path === "nav.about")).toEqual({
      locale: "pt",
      path: "nav.about",
      baseValue: "About",
      localeValue: undefined,
      changeSources: [],
    });
    expect(result.skipped.some((s) => s.path === "meta.count")).toBe(true);
    expect(result.sinceContext).toBeNull();
  });

  it("reviews all locales when a base key is added or modified", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome" }),
            localeMessages("pt", { welcome: "Olá" }),
            localeMessages("es", { welcome: "Hola" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", {
          welcome: "Hello",
          nav: { about: "About" },
        }),
        localeMessages("pt", { welcome: "Olá" }),
        localeMessages("es", { welcome: "Hola", nav: { about: "Acerca" } }),
      ],
    });

    const keys = result.targets.map((t) => `${t.locale}:${t.path}`).sort();
    expect(keys).toEqual(["es:nav.about", "es:welcome", "pt:nav.about", "pt:welcome"]);
    expect(
      result.targets.find((t) => t.locale === "pt" && t.path === "welcome")?.changeSources,
    ).toEqual(["base"]);
    expect(
      result.targets.find((t) => t.locale === "pt" && t.path === "nav.about")?.localeValue,
    ).toBeUndefined();
    expect(
      result.targets.find((t) => t.locale === "es" && t.path === "nav.about")?.localeValue,
    ).toBe("Acerca");
    expect(result.sinceContext).toEqual({
      sinceRef: "main",
      sinceSha: null,
      currentBranch: null,
      detachedHead: false,
      filesAtRef: ["en.json", "es.json", "pt.json"],
      filesWorkingTree: ["en.json", "es.json", "pt.json"],
      keyCount: 4,
      removedCount: 0,
      skippedCount: 0,
    });
  });

  it("reviews only the sibling locale when only that file changed", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome", title: "Title" }),
            localeMessages("pt", { welcome: "Olá", title: "Título" }),
            localeMessages("es", { welcome: "Hola", title: "Título" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome", title: "Title" }),
        localeMessages("pt", { welcome: "Oi", title: "Título" }),
        localeMessages("es", { welcome: "Hola", title: "Título" }),
      ],
    });

    expect(result.targets).toEqual([
      {
        locale: "pt",
        path: "welcome",
        baseValue: "Welcome",
        localeValue: "Oi",
        changeSources: ["locale"],
      },
    ]);
  });

  it("dedupes when base and sibling both change the same path", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome" }),
            localeMessages("pt", { welcome: "Olá" }),
            localeMessages("es", { welcome: "Hola" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Hello" }),
        localeMessages("pt", { welcome: "Oi" }),
        localeMessages("es", { welcome: "Hola" }),
      ],
    });

    const welcomePt = result.targets.find((t) => t.locale === "pt" && t.path === "welcome");
    expect(welcomePt?.changeSources.sort()).toEqual(["base", "locale"]);
    expect(
      result.targets
        .filter((t) => t.path === "welcome")
        .map((t) => t.locale)
        .sort(),
    ).toEqual(["es", "pt"]);
  });

  it("records removed paths as informational and does not create targets for them", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome", old: "Old" }),
            localeMessages("pt", { welcome: "Olá", old: "Antigo" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome" }),
        localeMessages("pt", { welcome: "Olá" }),
      ],
    });

    expect(result.targets).toEqual([]);
    expect(result.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "old", source: "base" }),
        expect.objectContaining({ path: "old", locale: "pt", source: "locale" }),
      ]),
    );
  });

  it("respects locale filter", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      locales: ["pt"],
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome" }),
        localeMessages("pt", { welcome: "Olá" }),
        localeMessages("es", { welcome: "Hola" }),
      ],
    });

    expect(result.targets.map((t) => t.locale)).toEqual(["pt"]);
  });

  it("skips non-string locale values and does not create targets for them", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome", count: "1" }),
        localeMessages("pt", { welcome: "Olá", count: 1 }),
      ],
    });

    expect(result.targets.map((t) => t.path)).toEqual(["welcome"]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        locale: "pt",
        path: "count",
        reason: "non-string-locale",
        baseValue: "1",
        localeValue: 1,
      }),
    ]);
  });

  it("ignores sibling changes for paths absent from the current base", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome" }),
            localeMessages("pt", { welcome: "Olá", orphan: "Antigo" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome" }),
        localeMessages("pt", { welcome: "Olá", orphan: "Novo" }),
      ],
    });

    expect(result.targets).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("respects locale filter when resolving --since scope", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      locales: ["pt"],
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome" }),
            localeMessages("pt", { welcome: "Olá" }),
            localeMessages("es", { welcome: "Hola" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Hello" }),
        localeMessages("pt", { welcome: "Olá" }),
        localeMessages("es", { welcome: "Hola" }),
      ],
    });

    expect(result.targets.map((t) => `${t.locale}:${t.path}`)).toEqual(["pt:welcome"]);
    expect(result.targets[0]?.changeSources).toEqual(["base"]);
  });

  it("treats a newly added locale file as sibling additions against the current base", async () => {
    const result = await resolveReviewScope({
      cwd: "/project",
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
      loadAtRef: async (ref) => {
        if (ref === "main") {
          return [
            localeMessages("en", { welcome: "Welcome", about: "About" }),
            localeMessages("pt", { welcome: "Olá", about: "Sobre" }),
          ];
        }
        throw new Error(`unexpected ref: ${ref}`);
      },
      loadWorkingTree: async () => [
        localeMessages("en", { welcome: "Welcome", about: "About" }),
        localeMessages("pt", { welcome: "Olá", about: "Sobre" }),
        localeMessages("es", { welcome: "Hola", about: "Acerca" }),
      ],
    });

    expect(result.targets.map((t) => `${t.locale}:${t.path}`).sort()).toEqual([
      "es:about",
      "es:welcome",
    ]);
    expect(result.targets.every((t) => t.changeSources.includes("locale"))).toBe(true);
  });
});

const gitAvailable = await whichGit();

describe.skipIf(!gitAvailable)("resolveReviewScope with real git", () => {
  it("uses working tree content including dirty edits when since is set", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Welcome" }, null, 2)}\n`,
    );
    await writeRepoFile(
      cwd,
      "messages/pt.json",
      `${JSON.stringify({ welcome: "Olá" }, null, 2)}\n`,
    );
    await commitAll(cwd, "initial");
    await runGit(["branch", "-M", "main"], { cwd });

    await checkoutBranch(cwd, "feature");
    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Hello" }, null, 2)}\n`,
    );
    await commitAll(cwd, "change base");

    await writeFile(
      path.join(cwd, "messages/en.json"),
      `${JSON.stringify({ welcome: "DIRTY" }, null, 2)}\n`,
      "utf8",
    );

    const result = await resolveReviewScope({
      cwd,
      messagesDir: "messages",
      baseLocale: "en",
      since: "main",
    });

    expect(result.targets).toEqual([
      {
        locale: "pt",
        path: "welcome",
        baseValue: "DIRTY",
        localeValue: "Olá",
        changeSources: ["base"],
      },
    ]);
    expect(result.sinceContext).toEqual(
      expect.objectContaining({
        sinceRef: "main",
        currentBranch: "feature",
        detachedHead: false,
        filesAtRef: ["en.json", "pt.json"],
        filesWorkingTree: ["en.json", "pt.json"],
        keyCount: 1,
        removedCount: 0,
        skippedCount: 0,
      }),
    );
    expect(result.sinceContext?.sinceSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws GitError when --since references a missing ref without injected loaders", async () => {
    const { cwd } = await createTempGitRepo();
    await writeRepoFile(
      cwd,
      "messages/en.json",
      `${JSON.stringify({ welcome: "Welcome" }, null, 2)}\n`,
    );
    await commitAll(cwd, "initial");

    await expect(
      resolveReviewScope({
        cwd,
        messagesDir: "messages",
        baseLocale: "en",
        since: "definitely-missing-ref",
      }),
    ).rejects.toThrow(GitError);
  });
});
