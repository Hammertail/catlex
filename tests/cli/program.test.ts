//* Libraries imports
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { Command } from "commander";

import packageJson from "../../package.json" with { type: "json" };

//* Local imports
import * as translateCommand from "../../src/cli/commands/translate.tsx";
import { createProgram } from "../../src/cli/program.ts";

//* Types imports
import type { TranslateCommandOptions } from "../../src/cli/commands/translate.tsx";

function findCommand(root: Command, pathSegments: string[]): Command {
  let current: Command = root;
  for (const name of pathSegments) {
    const next = current.commands.find((command) => command.name() === name);
    if (next === undefined) {
      throw new Error(`Command not found: ${pathSegments.join(" ")} (missing "${name}")`);
    }
    current = next;
  }
  return current;
}

/**
 * Parses argv through createProgram and returns the leaf command's opts().
 * Replaces the leaf action with a no-op so interactive / network side effects never run.
 */
async function captureCommandOpts(
  commandPath: string[],
  argv: string[],
): Promise<Record<string, unknown>> {
  const program = createProgram();
  const leaf = findCommand(program, commandPath);

  let captured: Record<string, unknown> | undefined;
  leaf.hook("preAction", (thisCommand) => {
    captured = thisCommand.opts();
  });
  // Replace the production action so parse only exercises Commander binding.
  leaf.action(() => undefined);

  await program.parseAsync(["node", "catlex", ...argv], { from: "node" });

  if (captured === undefined) {
    throw new Error(`preAction did not run for: ${argv.join(" ")}`);
  }
  return captured;
}

async function captureRootVersionOutput(
  argv: string[],
): Promise<{ output: string }> {
  const program = createProgram();
  let output = "";

  program.configureOutput({
    writeOut: (chunk) => {
      output += chunk;
    },
    writeErr: (chunk) => {
      output += chunk;
    },
  });
  program.exitOverride();

  try {
    await program.parseAsync(["node", "catlex", ...argv], { from: "node" });
  } catch (error) {
    if (typeof error !== "object" || error === null || !("exitCode" in error)) {
      throw error;
    }
  }

  return { output };
}

describe("createProgram", () => {
  const errorSpies: Array<ReturnType<typeof spyOn>> = [];
  const actionSpies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of errorSpies) {
      spy.mockRestore();
    }
    for (const spy of actionSpies) {
      spy.mockRestore();
    }
    errorSpies.length = 0;
    actionSpies.length = 0;
    process.exitCode = undefined;
  });

  function silenceErrors(): void {
    const error = spyOn(console, "error").mockImplementation(() => {});
    errorSpies.push(error);
  }

  /**
   * Parses argv through the real command actions, capturing options passed to runTranslateCommand.
   */
  async function captureTranslateActionOptions(
    argv: string[],
  ): Promise<TranslateCommandOptions | undefined> {
    let captured: TranslateCommandOptions | undefined;
    const spy = spyOn(translateCommand, "runTranslateCommand").mockImplementation(
      async (options) => {
        captured = options;
        return 0;
      },
    );
    actionSpies.push(spy);

    const program = createProgram();
    await program.parseAsync(["node", "catlex", ...argv], { from: "node" });
    return captured;
  }

  describe("command registration", () => {
    it("registers leaf commands and key options", () => {
      const program = createProgram();
      const names = new Set(program.commands.map((command) => command.name()));
      expect(names.has("validate")).toBe(true);
      expect(names.has("scan")).toBe(true);
      expect(names.has("ci")).toBe(true);
      expect(names.has("translate")).toBe(true);

      const review = findCommand(program, ["translate", "review"]);
      expect(review.description()).toContain("--since");

      const reviewFlags = new Set(review.options.map((option) => option.flags));
      expect(reviewFlags.has("--since <ref>")).toBe(true);
      expect(reviewFlags.has("--auto-fix")).toBe(true);
      expect(reviewFlags.has("--yes")).toBe(true);
      expect(reviewFlags.has("--locale <locale>")).toBe(true);
      expect(reviewFlags.has("--json")).toBe(true);
      expect(reviewFlags.has("--verbose")).toBe(true);
      expect(reviewFlags.has("--no-config")).toBe(true);

      const validateFlags = new Set(
        findCommand(program, ["validate"]).options.map((option) => option.flags),
      );
      expect(validateFlags.has("--no-config")).toBe(true);

      const translateFlags = new Set(
        findCommand(program, ["translate"]).options.map((option) => option.flags),
      );
      expect(translateFlags.has("--no-config")).toBe(true);

      const ci = findCommand(program, ["ci"]);
      expect(ci.aliases()).toContain("init-ci");
    });

    it("registers a root version flag alias for -v and --version", () => {
      const program = createProgram();
      const versionFlags = new Set(program.options.map((option) => option.flags));

      expect(versionFlags.has("-v, --version")).toBe(true);
    });
  });

  describe("flag binding", () => {
    it("binds validate flags to the validate command", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(
        ["validate"],
        [
          "validate",
          "--dir",
          "/tmp/validate-messages",
          "--base",
          "pt",
          "--cwd",
          "/tmp/validate-cwd",
          "--strict-extra",
          "--no-config",
          "--json",
        ],
      );
      expect(opts).toMatchObject({
        dir: "/tmp/validate-messages",
        base: "pt",
        cwd: "/tmp/validate-cwd",
        strictExtra: true,
        config: false,
        json: true,
      });
    });

    it("binds scan flags to the scan command", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(
        ["scan"],
        ["scan", "--dir", "src", "--cwd", "/tmp/scan-cwd", "--json"],
      );
      expect(opts).toMatchObject({
        dir: "src",
        cwd: "/tmp/scan-cwd",
        json: true,
      });
    });

    it("binds ci --cwd to the ci command", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["ci"], ["ci", "--cwd", "/tmp/ci-cwd"]);
      expect(opts).toMatchObject({ cwd: "/tmp/ci-cwd" });
    });

    it("binds init-ci alias flags to the ci command", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["ci"], ["init-ci", "--cwd", "/tmp/init-ci-cwd"]);
      expect(opts).toMatchObject({ cwd: "/tmp/init-ci-cwd" });
    });

    it("binds translate fill flags including repeated and comma-separated locales", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(
        ["translate"],
        [
          "translate",
          "--dir",
          "/tmp/translate-messages",
          "--base",
          "en",
          "--cwd",
          "/tmp/translate-cwd",
          "--locale",
          "pt",
          "--locale",
          "es,fr",
          "--model",
          "gpt-test",
          "--base-url",
          "https://openrouter.ai/api/v1",
          "--dry-run",
          "--yes",
          "--no-config",
          "--json",
        ],
      );
      expect(opts).toMatchObject({
        dir: "/tmp/translate-messages",
        base: "en",
        cwd: "/tmp/translate-cwd",
        locale: ["pt", "es", "fr"],
        model: "gpt-test",
        baseUrl: "https://openrouter.ai/api/v1",
        dryRun: true,
        yes: true,
        config: false,
        json: true,
      });
    });

    it("forwards --dry-run from argv into runTranslateCommand", async () => {
      silenceErrors();
      const options = await captureTranslateActionOptions([
        "translate",
        "--cwd",
        "/tmp/translate-dry-run-forward",
        "--dry-run",
        "--json",
      ]);

      expect(options).toMatchObject({
        cwd: "/tmp/translate-dry-run-forward",
        dryRun: true,
        yes: false,
        json: true,
      });
    });

    it("forwards --dry-run ahead of --yes into runTranslateCommand", async () => {
      silenceErrors();
      const options = await captureTranslateActionOptions([
        "translate",
        "--cwd",
        "/tmp/translate-dry-run-yes-forward",
        "--yes",
        "--dry-run",
        "--json",
      ]);

      expect(options).toMatchObject({
        cwd: "/tmp/translate-dry-run-yes-forward",
        dryRun: true,
        yes: true,
        json: true,
      });
    });

    it("binds translate review flags to the review subcommand", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(
        ["translate", "review"],
        [
          "translate",
          "review",
          "--dir",
          "/tmp/review-messages",
          "--base",
          "en",
          "--cwd",
          "/tmp/review-cwd",
          "--locale",
          "pt",
          "--model",
          "gpt-test",
          "--base-url",
          "https://openrouter.ai/api/v1",
          "--since",
          "main",
          "--auto-fix",
          "--yes",
          "--no-config",
          "--json",
          "--verbose",
        ],
      );
      expect(opts).toMatchObject({
        dir: "/tmp/review-messages",
        base: "en",
        cwd: "/tmp/review-cwd",
        locale: ["pt"],
        model: "gpt-test",
        baseUrl: "https://openrouter.ai/api/v1",
        since: "main",
        autoFix: true,
        yes: true,
        config: false,
        json: true,
        verbose: true,
      });
    });

    it("prints the installed version and exits for -v", async () => {
      silenceErrors();

      const { output } = await captureRootVersionOutput(["-v"]);

      expect(output.trim()).toBe(packageJson.version);
    });

    it("prints the installed version and exits for --version", async () => {
      silenceErrors();

      const { output } = await captureRootVersionOutput(["--version"]);

      expect(output.trim()).toBe(packageJson.version);
    });
  });

  describe("flag defaults", () => {
    it("applies validate defaults when flags are omitted", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["validate"], ["validate"]);
      expect(opts).toMatchObject({
        cwd: process.cwd(),
        strictExtra: false,
        config: true,
        json: false,
      });
      expect(opts.dir).toBeUndefined();
      expect(opts.base).toBeUndefined();
    });

    it("applies scan defaults when flags are omitted", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["scan"], ["scan"]);
      expect(opts).toMatchObject({
        dir: ".",
        cwd: process.cwd(),
        json: false,
      });
    });

    it("applies ci defaults when flags are omitted", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["ci"], ["ci"]);
      expect(opts).toMatchObject({ cwd: process.cwd() });
    });

    it("applies translate fill defaults when flags are omitted", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["translate"], ["translate"]);
      expect(opts).toMatchObject({
        cwd: process.cwd(),
        locale: [],
        dryRun: false,
        yes: false,
        config: true,
        json: false,
      });
      expect(opts.dir).toBeUndefined();
      expect(opts.base).toBeUndefined();
      expect(opts.model).toBeUndefined();
    });

    it("applies translate review defaults when flags are omitted", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(["translate", "review"], ["translate", "review"]);
      expect(opts).toMatchObject({
        cwd: process.cwd(),
        locale: [],
        autoFix: false,
        yes: false,
        config: true,
        json: false,
        verbose: false,
      });
      expect(opts.dir).toBeUndefined();
      expect(opts.base).toBeUndefined();
      expect(opts.model).toBeUndefined();
      expect(opts.since).toBeUndefined();
    });
  });

  describe("nested shared flags", () => {
    it("keeps overlapping flags on review when they follow the subcommand", async () => {
      silenceErrors();
      const program = createProgram();
      const review = findCommand(program, ["translate", "review"]);

      let reviewOpts: Record<string, unknown> | undefined;
      let translateOpts: Record<string, unknown> | undefined;
      review.hook("preAction", (thisCommand) => {
        reviewOpts = thisCommand.opts();
        translateOpts = thisCommand.parent?.opts();
      });
      review.action(() => undefined);

      await program.parseAsync(
        [
          "node",
          "catlex",
          "translate",
          "review",
          "--dir",
          "/tmp/shared-messages",
          "--base",
          "en",
          "--cwd",
          "/tmp/shared-cwd",
          "--locale",
          "pt,es",
          "--model",
          "gpt-shared",
          "--yes",
          "--json",
        ],
        { from: "node" },
      );

      expect(reviewOpts).toMatchObject({
        dir: "/tmp/shared-messages",
        base: "en",
        cwd: "/tmp/shared-cwd",
        locale: ["pt", "es"],
        model: "gpt-shared",
        yes: true,
        json: true,
      });
      // Parent must not steal the overlapping values.
      expect(translateOpts?.dir).toBeUndefined();
      expect(translateOpts?.json).toBe(false);
      expect(translateOpts?.yes).toBe(false);
      expect(translateOpts?.locale).toEqual([]);
    });

    it("still binds --dir and --json on translate fill when review is not used", async () => {
      silenceErrors();
      const opts = await captureCommandOpts(
        ["translate"],
        ["translate", "--dir", "/tmp/fill-messages", "--json"],
      );
      expect(opts).toMatchObject({
        dir: "/tmp/fill-messages",
        json: true,
      });
    });
  });
});
