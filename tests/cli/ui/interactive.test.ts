//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";

//* Local imports
import {
  NON_INTERACTIVE_ERROR_MESSAGE,
  assertInteractiveTerminal,
} from "../../../src/cli/ui/interactive.ts";

describe("assertInteractiveTerminal", () => {
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

  function setTty(stdin: boolean, stdout: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: stdin,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: stdout,
    });
  }

  it("does not throw when both stdin and stdout are interactive", () => {
    setTty(true, true);
    expect(() => assertInteractiveTerminal()).not.toThrow();
  });

  it("throws when stdin is not interactive", () => {
    setTty(false, true);
    expect(() => assertInteractiveTerminal()).toThrow(NON_INTERACTIVE_ERROR_MESSAGE);
  });

  it("throws when stdout is not interactive", () => {
    setTty(true, false);
    expect(() => assertInteractiveTerminal()).toThrow(NON_INTERACTIVE_ERROR_MESSAGE);
  });

  it("throws when neither stdin nor stdout is interactive", () => {
    setTty(false, false);
    expect(() => assertInteractiveTerminal()).toThrow(NON_INTERACTIVE_ERROR_MESSAGE);
  });
});
