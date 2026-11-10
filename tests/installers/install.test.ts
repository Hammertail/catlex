//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const roots: string[] = [];
const installer = path.resolve(import.meta.dir, "../../scripts/install.sh");
const powershellInstaller = path.resolve(import.meta.dir, "../../scripts/install.ps1");
// pwsh cold start alone can exceed bun's default 5s timeout on shared CI runners.
const POWERSHELL_TEST_TIMEOUT_MS = 30_000;
const UNSAFE_VERSIONS = ["0.5.2/../../evil", "0.5.2\n", "0.5.2?asset=evil", "0.5.2;touch evil"];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type Fixture = { root: string; env: NodeJS.ProcessEnv; destination: string; home: string };

async function fixture(validChecksum: boolean, installDirName = "installed"): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "catlex-install-"));
  roots.push(root);
  const destination = path.join(root, installDirName);
  const home = path.join(root, "home");
  await mkdir(home);
  const payload = "verified catlex binary\n";
  await writeFile(path.join(root, "payload"), payload);
  const hash = new Bun.CryptoHasher("sha256").update(payload).digest("hex");
  await writeFile(
    path.join(root, "SHA256SUMS"),
    `${validChecksum ? hash : "0".repeat(64)}  catlex-linux-x64\n${validChecksum ? hash : "0".repeat(64)}  catlex-windows-x64.exe\n`,
  );
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "uname"),
    '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n',
    { mode: 0o755 },
  );
  await writeFile(
    path.join(bin, "curl"),
    `#!/bin/sh
set -eu
output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output="$2"; shift 2;;
    --retry) shift 2;;
    https:*) url="$1"; shift;;
    *) shift;;
  esac
done
case "$url" in
  https://github.com/Hammertail/catlex/releases/latest) printf '%s' 'https://github.com/Hammertail/catlex/releases/tag/v0.5.2';;
  https://github.com/Hammertail/catlex/releases/download/v0.5.2/SHA256SUMS) cp "$FIXTURE_ROOT/SHA256SUMS" "$output";;
  https://github.com/Hammertail/catlex/releases/download/v0.5.2/catlex-linux-x64) cp "$FIXTURE_ROOT/payload" "$output";;
  *) echo "Unexpected URL: $url" >&2; exit 1;;
esac
`,
    { mode: 0o755 },
  );
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Never let the installer touch the developer's or runner's real shell setup.
  for (const name of ["CI", "CATLEX_NO_MODIFY_PATH", "ZDOTDIR", "XDG_CONFIG_HOME"])
    delete env[name];
  return {
    root,
    destination,
    home,
    env: {
      ...env,
      HOME: home,
      SHELL: "/bin/bash",
      USER_PATH_FILE: path.join(root, "user-path"),
      FIXTURE_ROOT: root,
      CATLEX_INSTALL_DIR: destination,
      CATLEX_VERSION: "0.5.2",
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  };
}

async function runWithOutput(
  command: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Starts an interactive-like bash that loads the startup file and resolves catlex. */
async function resolveFromFreshShell(f: Fixture, startupFile: string): Promise<string> {
  const child = Bun.spawn(
    [
      "bash",
      "--noprofile",
      "--norc",
      "-c",
      'source "$1" && command -v catlex',
      "bash",
      startupFile,
    ],
    { env: { ...f.env, PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return stdout.trim();
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

async function run(command: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return (await runWithOutput(command, env)).exitCode;
}

async function runPowershellInstaller(
  f: Fixture,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const harness = path.join(f.root, "harness.ps1");
  await writeFile(
    harness,
    `
$ErrorActionPreference = 'Stop'
function Invoke-WebRequest {
  param($Uri, $OutFile, $Method, $MaximumRedirection, [switch]$UseBasicParsing)
  if ($Method -eq 'Head' -and $Uri -eq 'https://github.com/Hammertail/catlex/releases/latest') { return [pscustomobject]@{ BaseResponse = [pscustomobject]@{ RequestMessage = [pscustomobject]@{ RequestUri = [uri]'https://github.com/Hammertail/catlex/releases/tag/v0.5.2' } } } }
  if ($Uri -eq 'https://github.com/Hammertail/catlex/releases/download/v0.5.2/SHA256SUMS') { Copy-Item (Join-Path $env:FIXTURE_ROOT 'SHA256SUMS') $OutFile }
  elseif ($Uri -eq 'https://github.com/Hammertail/catlex/releases/download/v0.5.2/catlex-windows-x64.exe') { Copy-Item (Join-Path $env:FIXTURE_ROOT 'payload') $OutFile }
  else { throw "Unexpected URL: $Uri" }
}
# Stand in for the HKCU registry so tests never change the real user PATH.
function Get-CatlexUserPath {
  if ($env:USER_PATH_FAIL) { throw 'registry unavailable' }
  if (Test-Path $env:USER_PATH_FILE) { return [IO.File]::ReadAllText($env:USER_PATH_FILE) }
  return ''
}
function Set-CatlexUserPath { param([string]$Value) [IO.File]::WriteAllText($env:USER_PATH_FILE, $Value) }
& $env:INSTALLER_PATH
Write-Output "SESSION_PATH=$env:PATH"
`,
  );
  return runWithOutput(["pwsh", "-NoProfile", "-NonInteractive", "-File", harness], {
    ...f.env,
    INSTALLER_PATH: powershellInstaller,
    POWERSHELL_TELEMETRY_OPTOUT: "1",
    POWERSHELL_UPDATECHECK: "Off",
  });
}

describe.skipIf(process.platform === "win32")("Unix release installer", () => {
  it("resolves latest once and installs the verified release into a custom directory", async () => {
    const f = await fixture(true);
    f.env.CATLEX_VERSION = "latest";
    expect(await run(["bash", installer], f.env)).toBe(0);
    expect(await readFile(path.join(f.destination, "catlex"), "utf8")).toBe(
      "verified catlex binary\n",
    );
  });

  it("preserves an existing installation when the checksum does not match", async () => {
    const f = await fixture(false);
    await mkdir(f.destination);
    await writeFile(path.join(f.destination, "catlex"), "original");
    expect(await run(["bash", installer], f.env)).not.toBe(0);
    expect(await readFile(path.join(f.destination, "catlex"), "utf8")).toBe("original");
  });

  it("refuses to install when the release has no SHA256SUMS", async () => {
    const f = await fixture(true);
    await rm(path.join(f.root, "SHA256SUMS"));
    expect(await run(["bash", installer], f.env)).not.toBe(0);
    expect(await Bun.file(path.join(f.destination, "catlex")).exists()).toBe(false);
  });

  it("rejects a manifest without the selected asset", async () => {
    const f = await fixture(true);
    await writeFile(path.join(f.root, "SHA256SUMS"), "");
    expect(await run(["bash", installer], f.env)).not.toBe(0);
    expect(await Bun.file(path.join(f.destination, "catlex")).exists()).toBe(false);
  });

  it("explains the failure when the manifest has no entry for the selected asset", async () => {
    const f = await fixture(true);
    await writeFile(path.join(f.root, "SHA256SUMS"), "");
    const result = await runWithOutput(["bash", installer], f.env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Missing or ambiguous checksum for catlex-linux-x64");
  });

  it.each(UNSAFE_VERSIONS)("rejects the unsafe version %j before downloading", async (version) => {
    const f = await fixture(true);
    f.env.CATLEX_VERSION = version;
    const result = await runWithOutput(["bash", installer], f.env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Invalid release version");
    expect(await Bun.file(path.join(f.destination, "catlex")).exists()).toBe(false);
  });

  describe("PATH setup", () => {
    const BLOCK_BEGIN = "# >>> catlex PATH >>>";

    it("adds the install directory to .bashrc so a fresh shell finds catlex", async () => {
      const f = await fixture(true);
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      const bashrc = path.join(f.home, ".bashrc");
      expect(await readFile(bashrc, "utf8")).toContain(BLOCK_BEGIN);
      expect(result.stdout).toContain(`Added ${f.destination} to your PATH in ${bashrc}`);
      expect(result.stdout).toContain(`export PATH='${f.destination}'`);
      expect(await resolveFromFreshShell(f, bashrc)).toBe(path.join(f.destination, "catlex"));
    });

    it("preserves existing startup file content and never duplicates the block on reinstall", async () => {
      const f = await fixture(true);
      const bashrc = path.join(f.home, ".bashrc");
      await writeFile(bashrc, "alias ll='ls -l'");
      expect(await run(["bash", installer], f.env)).toBe(0);
      expect(await run(["bash", installer], f.env)).toBe(0);
      const content = await readFile(bashrc, "utf8");
      expect(content.startsWith("alias ll='ls -l'\n")).toBe(true);
      expect(countOccurrences(content, BLOCK_BEGIN)).toBe(1);
    });

    it("leaves startup files alone when the install directory is already on PATH", async () => {
      const f = await fixture(true);
      f.env.PATH = `${f.destination}${path.delimiter}${f.env.PATH}`;
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(await Bun.file(path.join(f.home, ".bashrc")).exists()).toBe(false);
      expect(result.stdout).not.toContain("Warning");
    });

    it("supports a custom install directory containing spaces and quotes", async () => {
      const f = await fixture(true, "my tools/it's bin");
      expect(await run(["bash", installer], f.env)).toBe(0);
      const bashrc = path.join(f.home, ".bashrc");
      expect(await resolveFromFreshShell(f, bashrc)).toBe(path.join(f.destination, "catlex"));
    });

    it("writes .zshrc for zsh users, honoring ZDOTDIR", async () => {
      const f = await fixture(true);
      const zdotdir = path.join(f.root, "zdot");
      f.env.SHELL = "/usr/bin/zsh";
      f.env.ZDOTDIR = zdotdir;
      expect(await run(["bash", installer], f.env)).toBe(0);
      const zshrc = path.join(zdotdir, ".zshrc");
      expect(await readFile(zshrc, "utf8")).toContain(BLOCK_BEGIN);
      // The block is POSIX shell, so bash can verify what zsh will load.
      expect(await resolveFromFreshShell(f, zshrc)).toBe(path.join(f.destination, "catlex"));
    });

    it("writes a fish conf.d snippet for fish users", async () => {
      const f = await fixture(true);
      f.env.SHELL = "/usr/bin/fish";
      expect(await run(["bash", installer], f.env)).toBe(0);
      const snippet = await readFile(
        path.join(f.home, ".config", "fish", "conf.d", "catlex.fish"),
        "utf8",
      );
      expect(snippet).toContain(`set -gx PATH '${f.destination}' $PATH`);
    });

    it("prints manual instructions for an unsupported shell", async () => {
      const f = await fixture(true);
      f.env.SHELL = "/bin/tcsh";
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("is not supported for automatic setup");
      expect(result.stdout).toContain(path.join(f.destination, "catlex"));
    });

    for (const [name, value] of [
      ["CATLEX_NO_MODIFY_PATH", "1"],
      ["CI", "true"],
    ] as const) {
      it(`does not modify startup files when ${name} is set`, async () => {
        const f = await fixture(true);
        f.env[name] = value;
        const result = await runWithOutput(["bash", installer], f.env);
        expect(result.exitCode).toBe(0);
        expect(await Bun.file(path.join(f.home, ".bashrc")).exists()).toBe(false);
        expect(result.stdout).toContain("is not in your PATH");
      });
    }

    it("reports a startup file it cannot update and keeps the installed binary", async () => {
      const f = await fixture(true);
      await mkdir(path.join(f.home, ".bashrc"));
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("could not update");
      expect(result.stdout).toContain(path.join(f.destination, "catlex"));
      expect(await Bun.file(path.join(f.destination, "catlex")).exists()).toBe(true);
    });
  });
});

describe.skipIf(!Bun.which("pwsh"))("Windows release installer", () => {
  for (const valid of [true, false]) {
    it(
      valid ? "installs a verified binary" : "preserves the existing binary on a checksum mismatch",
      async () => {
        const f = await fixture(valid);
        await mkdir(f.destination);
        await writeFile(path.join(f.destination, "catlex.exe"), "original");
        if (valid) f.env.CATLEX_VERSION = "latest";
        const { exitCode } = await runPowershellInstaller(f);
        expect(exitCode === 0).toBe(valid);
        expect(await readFile(path.join(f.destination, "catlex.exe"), "utf8")).toBe(
          valid ? "verified catlex binary\n" : "original",
        );
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );
  }

  for (const version of UNSAFE_VERSIONS) {
    it(
      `rejects the unsafe version ${JSON.stringify(version)} before downloading`,
      async () => {
        const f = await fixture(true);
        f.env.CATLEX_VERSION = version;
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Invalid release version");
        expect(await Bun.file(path.join(f.destination, "catlex.exe")).exists()).toBe(false);
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );
  }
  describe("PATH setup", () => {
    const readUserPath = (f: Fixture) => readFile(f.env.USER_PATH_FILE as string, "utf8");

    it(
      "appends the install directory to the user PATH without copying the process PATH",
      async () => {
        const f = await fixture(true);
        await writeFile(f.env.USER_PATH_FILE as string, "%USERPROFILE%\\tools;C:\\keep;");
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).toBe(0);
        expect(await readUserPath(f)).toBe(`%USERPROFILE%\\tools;C:\\keep;${f.destination}`);
        expect(result.stdout).toContain(`SESSION_PATH=${f.destination};`);
        expect(result.stdout).toContain("restart VS Code");
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );

    it(
      "leaves the user PATH unchanged when it already has the install directory",
      async () => {
        const f = await fixture(true);
        await writeFile(
          f.env.USER_PATH_FILE as string,
          `C:\\keep;${f.destination.toUpperCase()}\\`,
        );
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).toBe(0);
        expect(await readUserPath(f)).toBe(`C:\\keep;${f.destination.toUpperCase()}\\`);
        expect(result.stdout).not.toContain("Added");
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );

    it(
      "adds a custom directory with spaces only once across reinstalls",
      async () => {
        const f = await fixture(true, "my tools");
        expect((await runPowershellInstaller(f)).exitCode).toBe(0);
        expect((await runPowershellInstaller(f)).exitCode).toBe(0);
        expect(await readUserPath(f)).toBe(f.destination);
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );

    it(
      "does not modify the user PATH when CATLEX_NO_MODIFY_PATH is set",
      async () => {
        const f = await fixture(true);
        f.env.CATLEX_NO_MODIFY_PATH = "1";
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).toBe(0);
        expect(await Bun.file(f.env.USER_PATH_FILE as string).exists()).toBe(false);
        expect(result.stdout).toContain("is not in your user PATH");
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );

    it(
      "reports a user PATH it cannot update and keeps the installed binary",
      async () => {
        const f = await fixture(true);
        f.env.USER_PATH_FAIL = "1";
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain("Could not add");
        expect(result.stdout).toContain(path.join(f.destination, "catlex.exe"));
        expect(await Bun.file(path.join(f.destination, "catlex.exe")).exists()).toBe(true);
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );
  });
});
