//* Libraries imports
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const INSTALL_SH = path.join(REPO_ROOT, "scripts/install.sh");

describe("scripts/install.sh checksum verification", () => {
  let server: ReturnType<typeof Bun.serve>;
  let assetsDir: string;
  let installHome: string;
  let releaseBase: string;
  let assetName: string;
  let goodHash: string;

  beforeAll(async () => {
    assetsDir = await mkdtemp(path.join(tmpdir(), "catlex-install-assets-"));
    installHome = await mkdtemp(path.join(tmpdir(), "catlex-install-home-"));

    const osName = process.platform === "darwin" ? "darwin" : "linux";
    const archName = process.arch === "arm64" ? "arm64" : "x64";
    assetName = `catlex-${osName}-${archName}`;

    const binaryPath = path.join(assetsDir, assetName);
    await writeFile(binaryPath, "#!/bin/sh\necho catlex-fixture\n", {
      mode: 0o755,
    });
    goodHash = createHash("sha256")
      .update(await readFile(binaryPath))
      .digest("hex");
    await writeFile(path.join(assetsDir, "SHA256SUMS"), `${goodHash}  ${assetName}\n`);

    server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const filePath = path.join(assetsDir, path.basename(url.pathname));
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return new Response("not found", { status: 404 });
        }
        return new Response(file);
      },
    });
    releaseBase = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    server.stop(true);
    await rm(assetsDir, { recursive: true, force: true });
    await rm(installHome, { recursive: true, force: true });
  });

  async function runInstaller(env: Record<string, string>): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    await mkdir(path.join(installHome, ".local", "bin"), { recursive: true });

    return await new Promise((resolve, reject) => {
      const child = spawn("bash", [INSTALL_SH], {
        env: {
          ...process.env,
          HOME: installHome,
          CATLEX_RELEASE_BASE: releaseBase,
          ...env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  }

  it("installs the binary when the SHA256SUMS entry matches", async () => {
    const result = await runInstaller({
      CATLEX_REQUIRE_CHECKSUM: "1",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Checksum verified");
    const installed = path.join(installHome, ".local", "bin", "catlex");
    expect(await Bun.file(installed).exists()).toBe(true);
  });

  it("fails closed when CATLEX_REQUIRE_CHECKSUM=1 and the checksum mismatches", async () => {
    await writeFile(path.join(assetsDir, "SHA256SUMS"), `${"0".repeat(64)}  ${assetName}\n`);

    const result = await runInstaller({
      CATLEX_REQUIRE_CHECKSUM: "1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("checksum mismatch");

    await writeFile(path.join(assetsDir, "SHA256SUMS"), `${goodHash}  ${assetName}\n`);
  });

  it("fails closed when CATLEX_REQUIRE_CHECKSUM=1 and SHA256SUMS is missing", async () => {
    await rm(path.join(assetsDir, "SHA256SUMS"), { force: true });

    const result = await runInstaller({
      CATLEX_REQUIRE_CHECKSUM: "1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("SHA256SUMS is required");

    await writeFile(path.join(assetsDir, "SHA256SUMS"), `${goodHash}  ${assetName}\n`);
  });
});
