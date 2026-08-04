//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import { scanHardcoded } from "../../src/index.ts";
import { brokenRoot } from "./helpers.ts";

function deeplyNestedVueScript(depth: number): string {
  const jsx = `${"<div>".repeat(depth)}Hi${"</div>".repeat(depth)}`;
  return `<script lang="tsx">export default function C(){return (${jsx});}</script>\n`;
}

describe("scanHardcoded resilience", () => {
  it("does not throw when scanning files with broken JSX syntax", async () => {
    await expect(scanHardcoded(brokenRoot)).resolves.toEqual(
      expect.objectContaining({
        rootDir: path.resolve(brokenRoot),
        issues: expect.any(Array),
        errors: [],
      }),
    );
  });

  it("continues scanning after a deeply nested Vue file overflows the call stack", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-scan-stack-"));
    await mkdir(path.join(root, "src"));

    await writeFile(
      path.join(root, "src", "a-good.tsx"),
      "export const B = () => <button>Save</button>;\n",
    );
    await writeFile(path.join(root, "src", "b-deep.vue"), deeplyNestedVueScript(12_000));
    await writeFile(
      path.join(root, "src", "c-good.tsx"),
      "export const C = () => <span>Cancel</span>;\n",
    );

    const result = await scanHardcoded(path.join(root, "src"));

    expect(result.errors).toHaveLength(1);
    expect(path.basename(result.errors[0]?.filePath ?? "")).toBe("b-deep.vue");
    expect(result.errors[0]?.message).toMatch(/Maximum call stack size exceeded/i);

    const texts = result.issues.map((issue) => issue.text).sort();
    expect(texts).toEqual(["Cancel", "Save"]);
  });

  it("records a file-level error and keeps prior findings when one file throws", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "catlex-scan-throw-"));
    await writeFile(
      path.join(root, "a-good.tsx"),
      "export const B = () => <button>Save</button>;\n",
    );
    await writeFile(
      path.join(root, "b-bad.tsx"),
      "export const Bad = () => <button>Broken</button>;\n",
    );
    await writeFile(path.join(root, "c-good.tsx"), "export const C = () => <span>Cancel</span>;\n");

    const originalFile = Bun.file.bind(Bun);
    Bun.file = ((pathLike: string | URL | ArrayBuffer | DataView) => {
      const filePath = String(pathLike);
      if (filePath.endsWith(`${path.sep}b-bad.tsx`)) {
        return {
          text: async () => {
            throw new RangeError("Maximum call stack size exceeded");
          },
        } as ReturnType<typeof Bun.file>;
      }
      return originalFile(pathLike);
    }) as typeof Bun.file;

    try {
      const result = await scanHardcoded(root);

      expect(result.errors).toEqual([
        expect.objectContaining({
          filePath: path.join(root, "b-bad.tsx"),
          message: "Maximum call stack size exceeded",
        }),
      ]);
      expect(result.issues.map((issue) => issue.text).sort()).toEqual(["Cancel", "Save"]);
    } finally {
      Bun.file = originalFile;
    }
  });
});
