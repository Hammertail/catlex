//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";

//* Local imports
import { NON_INTERACTIVE_ERROR_MESSAGE } from "../../../src/cli/ui/interactive.ts";
import { promptConfirm } from "../../../src/cli/ui/prompt-confirm.tsx";

describe("promptConfirm", () => {
  const originalStdinIsTTY = process.stdin.isTTY;
  const originalStdoutIsTTY = process.stdout.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinIsTTY,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
  });

  it("rejects immediately when stdin is not interactive", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });

    await expect(promptConfirm("Overwrite existing file?")).rejects.toThrow(
      NON_INTERACTIVE_ERROR_MESSAGE,
    );
  });
});
