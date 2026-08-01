//* Libraries imports
import { describe, expect, it } from "bun:test";
import path from "node:path";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { brokenRoot } from "./helpers.ts";

describe("scanHardcoded resilience", () => {
  it("does not throw when scanning files with broken JSX syntax", async () => {
    await expect(scanHardcoded(brokenRoot)).resolves.toEqual(
      expect.objectContaining({
        rootDir: path.resolve(brokenRoot),
        issues: expect.any(Array),
      }),
    );
  });
});
