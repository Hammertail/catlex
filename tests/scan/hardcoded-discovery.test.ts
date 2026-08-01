//* Libraries imports
import { describe, expect, it } from "bun:test";
import path from "node:path";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { discoveryRoot } from "./helpers.ts";

describe("scanHardcoded discovery", () => {
  it("scans nested source files while skipping node_modules and dot-directories", async () => {
    const result = await scanHardcoded(discoveryRoot);

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0];
    expect(issue).toEqual(
      expect.objectContaining({
        kind: "jsx-text",
        text: "Nested save",
      }),
    );
    expect(path.basename(issue?.filePath ?? "")).toBe("ok.tsx");
    expect(result.issues.some((issue) => issue.filePath.includes("node_modules"))).toBe(false);
    expect(
      result.issues.some((issue) => issue.filePath.includes(`${path.sep}.hidden${path.sep}`)),
    ).toBe(false);
  });
});
