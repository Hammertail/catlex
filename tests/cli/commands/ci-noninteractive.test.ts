//* Libraries imports
import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("catlex ci non-interactive stdin", () => {
  it("exits immediately with a non-zero status when stdin is not a TTY", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "catlex-ci-nontty-"));
    const startedAt = Date.now();

    const proc = Bun.spawn(
      ["bun", "run", path.join(import.meta.dir, "../../../src/bin/catlex.ts"), "ci", "--cwd", cwd],
      {
        cwd: path.join(import.meta.dir, "../../.."),
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const killer = setTimeout(() => {
      proc.kill();
    }, 3000);

    const exitCode = await proc.exited;
    clearTimeout(killer);

    const stderr = await new Response(proc.stderr).text();
    const elapsedMs = Date.now() - startedAt;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("not interactive");
    expect(stderr).toContain("interactive terminal");
    expect(stderr).not.toContain("--yes");
    expect(elapsedMs).toBeLessThan(2500);
  });
});
