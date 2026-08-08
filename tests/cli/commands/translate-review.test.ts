//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { runTranslateReviewCommand } from "../../../src/cli/commands/translate-review.tsx";
import { REVIEW_ALPHA_MESSAGE } from "../../../src/cli/ui/review-report-view.ts";
import { runGit } from "../../../src/core/git/run.ts";
import {
  checkoutBranch,
  commitAll,
  createTempGitRepo,
  whichGit,
  writeRepoFile,
} from "../../core/git/temp-repo.ts";

//* Types imports
import type { ReviewLocaleFn } from "../../../src/core/translate/review-openai.ts";
import type { TranslateLocaleFn } from "../../../src/core/translate/translate.ts";

async function writeMessages(root: string, files: Record<string, unknown>): Promise<void> {
  const messagesDir = path.join(root, "messages");
  await mkdir(messagesDir, { recursive: true });
  for (const [name, tree] of Object.entries(files)) {
    await writeFile(
      path.join(messagesDir, `${name}.json`),
      `${JSON.stringify(tree, null, 2)}\n`,
      "utf8",
    );
  }
}

describe("runTranslateReviewCommand", () => {
  const logSpies: Array<ReturnType<typeof spyOn>> = [];
  const errorSpies: Array<ReturnType<typeof spyOn>> = [];
  const writeSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    for (const spy of errorSpies) {
      spy.mockRestore();
    }
    for (const spy of writeSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
    errorSpies.length = 0;
    writeSpies.length = 0;
  });

  function captureLog(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(spy);
    return spy;
  }

  function captureError(): ReturnType<typeof spyOn> {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    errorSpies.push(spy);
    return spy;
  }

  function silenceStderr(): void {
    const spy = spyOn(process.stderr, "write").mockImplementation(() => true);
    writeSpies.push(spy);
  }

  it("returns 1 when OPENAI_API_KEY is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-key-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Olá" },
    });
    const error = captureError();

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      env: {},
      reviewLocale: async () => ({ locale: "pt", reviews: [] }),
    });

    expect(exitCode).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("OPENAI_API_KEY");
  });

  it("returns 0 and includes alpha/since fields when all reviews pass", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-ok-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Olá" },
    });
    const log = captureLog();
    silenceStderr();

    const reviewLocale: ReviewLocaleFn = async (input) => ({
      locale: input.targetLocale,
      reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
    });

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      reviewLocale,
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.ok).toBe(true);
    expect(payload.alpha).toBe(true);
    expect(payload.alphaMessage).toBe(REVIEW_ALPHA_MESSAGE);
    expect(payload.since).toBeNull();
    expect(payload.sinceContext).toBeNull();
    expect(payload.keysReviewed).toBe(1);
    expect(payload.issuesFound).toBe(0);
    expect(payload.fixesApplied).toBe(0);
    expect(payload.filesChanged).toBe(0);
    expect(payload.targetLocales).toEqual(["pt"]);
    expect(payload.model).toBe("gpt-5.4-mini");
  });

  it("writes progress banner to stderr when --json is set", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-progress-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Olá", about: "Sobre" },
    });
    const log = captureLog();
    const error = captureError();
    const stderrChunks: string[] = [];
    const writeSpy = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    writeSpies.push(writeSpy);

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      model: "gpt-progress-test",
      verbose: true,
      env: { OPENAI_API_KEY: "sk-test" },
      reviewLocale: async (input) => ({
        locale: input.targetLocale,
        reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
      }),
    });

    expect(exitCode).toBe(0);
    const stderrText = stderrChunks.join("");
    expect(stderrText).toContain("Reviewing translations");
    expect(stderrText).toContain("Source locale: en");
    expect(stderrText).toContain("Target locale: pt");
    expect(stderrText).toContain("Model: gpt-progress-test");
    expect(stderrText).toContain("Progress:");
    expect(stderrText).toContain("[review] pt:");
    expect(error.mock.calls.length).toBe(0);
    expect(
      log.mock.calls.every((call) => {
        try {
          JSON.parse(String(call[0]));
          return true;
        } catch {
          return false;
        }
      }),
    ).toBe(true);

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.ok).toBe(true);
    expect(payload.model).toBe("gpt-progress-test");
    expect(payload.keysReviewed).toBe(2);
  });

  it("returns 1 when a translation is wrong or missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-fail-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Welcome" },
    });
    const log = captureLog();
    silenceStderr();

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      env: { OPENAI_API_KEY: "sk-test" },
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [{ path: "welcome", verdict: "wrong", reason: "Not translated" }],
      }),
    });

    expect(exitCode).toBe(1);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.ok).toBe(false);
    expect(payload.keysReviewed).toBe(2);
    expect(payload.issuesFound).toBeGreaterThanOrEqual(1);
    expect(payload.fixesApplied).toBe(0);
    expect(payload.filesChanged).toBe(0);
  });

  it("does not write files for --auto-fix when confirmation is denied", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-deny-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome" },
      pt: { welcome: "Welcome" },
    });
    const before = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    const log = captureLog();
    silenceStderr();

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      autoFix: true,
      env: { OPENAI_API_KEY: "sk-test" },
      confirm: async () => false,
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Olá",
          },
        ],
      }),
    });

    const after = await readFile(path.join(cwd, "messages", "pt.json"), "utf8");
    expect(after).toBe(before);
    expect(exitCode).toBe(1);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.cancelled).toBe(true);
    expect(payload.writtenFiles).toEqual([]);
    expect(payload.keysReviewed).toBe(1);
    expect(payload.issuesFound).toBe(1);
    expect(payload.fixesApplied).toBe(0);
    expect(payload.filesChanged).toBe(0);
  });

  it("writes fixes with --auto-fix --yes and returns 0 when everything is fixed", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-review-cli-write-"));
    await writeMessages(cwd, {
      en: { welcome: "Welcome", about: "About" },
      pt: { welcome: "Welcome" },
    });
    const log = captureLog();
    silenceStderr();

    const translateLocale: TranslateLocaleFn = async (input) => ({
      locale: input.targetLocale,
      translations: input.missing.map((item) => ({
        path: item.path,
        value: `PT:${item.baseValue}`,
      })),
    });

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      autoFix: true,
      yes: true,
      env: { OPENAI_API_KEY: "sk-test" },
      reviewLocale: async () => ({
        locale: "pt",
        reviews: [
          {
            path: "welcome",
            verdict: "wrong",
            reason: "Not translated",
            suggestedValue: "Olá",
          },
        ],
      }),
      translateLocale,
    });

    const onDisk = JSON.parse(await readFile(path.join(cwd, "messages", "pt.json"), "utf8"));
    expect(onDisk).toEqual({ welcome: "Olá", about: "PT:About" });
    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.ok).toBe(true);
    expect(payload.writtenFiles.length).toBe(1);
    expect(payload.filesChanged).toBe(1);
    expect(payload.fixesApplied).toBeGreaterThanOrEqual(1);
    expect(payload.keysReviewed).toBe(2);
    expect(payload.issuesFound).toBe(2);
  });
});

const gitAvailable = await whichGit();

describe.skipIf(!gitAvailable)("runTranslateReviewCommand with --since", () => {
  const logSpies: Array<ReturnType<typeof spyOn>> = [];
  const writeSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    for (const spy of writeSpies) {
      spy.mockRestore();
    }
    logSpies.length = 0;
    writeSpies.length = 0;
  });

  it("includes sinceContext in JSON when --since scopes the review", async () => {
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

    const log = spyOn(console, "log").mockImplementation(() => {});
    logSpies.push(log);
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    writeSpies.push(writeSpy);

    const exitCode = await runTranslateReviewCommand({
      cwd,
      json: true,
      since: "main",
      env: { OPENAI_API_KEY: "sk-test" },
      reviewLocale: async (input) => ({
        locale: input.targetLocale,
        reviews: input.items.map((item) => ({ path: item.path, verdict: "ok" as const })),
      }),
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(payload.since).toBe("main");
    expect(payload.sinceContext).toEqual(
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
    expect(payload.sinceContext.sinceSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
