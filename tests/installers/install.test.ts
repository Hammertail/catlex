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

type Fixture = {
  root: string;
  env: NodeJS.ProcessEnv;
  destination: string;
  home: string;
  /** Stands in for the HKCU user PATH value in the Windows installer tests. */
  userPathFile: string;
};

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
    ["catlex-linux-x64", "catlex-darwin-x64", "catlex-windows-x64.exe"]
      .map((asset) => `${validChecksum ? hash : "0".repeat(64)}  ${asset}\n`)
      .join(""),
  );
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "uname"),
    '#!/bin/sh\ncase "$1" in -s) echo "$FAKE_UNAME_S";; -m) echo x86_64;; esac\n',
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
  https://github.com/Hammertail/catlex/releases/download/v0.5.2/catlex-linux-x64 | \\
  https://github.com/Hammertail/catlex/releases/download/v0.5.2/catlex-darwin-x64) cp "$FIXTURE_ROOT/payload" "$output";;
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
    userPathFile: path.join(root, "user-path"),
    env: {
      ...env,
      HOME: home,
      SHELL: "/bin/bash",
      FAKE_UNAME_S: "Linux",
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
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { env, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Sources a startup file in a clean, non-interactive bash and resolves catlex from it. */
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
  cwd?: string,
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
# Functions shadow cmdlets, so these stand in for the HKCU registry key and the
# tests never change the real user PATH, while still checking how it is accessed.
function Get-Item {
  param([string]$Path)
  if ($Path -ne 'HKCU:\\Environment') { throw "Unexpected Get-Item: $Path" }
  if ($env:USER_PATH_FAIL) { throw 'registry unavailable' }
  $Key = [pscustomobject]@{}
  $Key | Add-Member -MemberType ScriptMethod -Name GetValue -Value {
    param($Name, $Default, $Options)
    if ($Name -ne 'Path' -or "$Options" -ne 'DoNotExpandEnvironmentNames') { throw "Unexpected GetValue: $Name $Options" }
    if (Test-Path $env:USER_PATH_FILE) { return [IO.File]::ReadAllText($env:USER_PATH_FILE) }
    return $Default
  }
  return $Key
}
function Set-ItemProperty {
  param($Path, $Name, $Value, $Type)
  if ($Path -ne 'HKCU:\\Environment' -or $Name -ne 'Path' -or $Type -ne 'ExpandString') { throw "Unexpected Set-ItemProperty: $Path $Name $Type" }
  [IO.File]::WriteAllText($env:USER_PATH_FILE, $Value)
}
function Add-Type { }
& $env:INSTALLER_PATH
Write-Output "SESSION_PATH=$env:PATH"
`,
  );
  return runWithOutput(
    ["pwsh", "-NoProfile", "-NonInteractive", "-File", harness],
    {
      ...f.env,
      INSTALLER_PATH: powershellInstaller,
      USER_PATH_FILE: f.userPathFile,
      POWERSHELL_TELEMETRY_OPTOUT: "1",
      POWERSHELL_UPDATECHECK: "Off",
    },
    cwd,
  );
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
    const BLOCK_END = "# <<< catlex PATH <<<";

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

    it("persists the directory even when it is only on the current session PATH", async () => {
      const f = await fixture(true);
      f.env.PATH = `${f.destination}/${path.delimiter}${f.env.PATH}`;
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      const bashrc = path.join(f.home, ".bashrc");
      expect(await resolveFromFreshShell(f, bashrc)).toBe(path.join(f.destination, "catlex"));
      // The current terminal already finds catlex, so no refresh command is needed.
      expect(result.stdout).not.toContain("export PATH=");
      expect(result.stdout).not.toContain("Warning");
    });

    it("leaves a startup file byte-for-byte unchanged when its block is already current", async () => {
      const f = await fixture(true);
      const bashrc = path.join(f.home, ".bashrc");
      await writeFile(bashrc, "before\n");
      expect(await run(["bash", installer], f.env)).toBe(0);
      await writeFile(bashrc, `${await readFile(bashrc, "utf8")}after\n`);
      const configured = await readFile(bashrc, "utf8");
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(await readFile(bashrc, "utf8")).toBe(configured);
      expect(result.stdout).not.toContain("Added");
      expect(result.stdout).toContain("Open a new terminal");
    });

    it("replaces an outdated block in place and drops duplicate blocks", async () => {
      const f = await fixture(true);
      const bashrc = path.join(f.home, ".bashrc");
      const stale = `${BLOCK_BEGIN}\nexport PATH=/old:$PATH\n${BLOCK_END}\n`;
      await writeFile(bashrc, `first\n${stale}middle\n${stale}last\n`);
      expect(await run(["bash", installer], f.env)).toBe(0);
      const content = await readFile(bashrc, "utf8");
      expect(countOccurrences(content, BLOCK_BEGIN)).toBe(1);
      expect(content).not.toContain("/old");
      expect(content.startsWith(`first\n${BLOCK_BEGIN}\n`)).toBe(true);
      expect(content.endsWith(`${BLOCK_END}\nmiddle\nlast\n`)).toBe(true);
      expect(await Bun.file(`${bashrc}.catlex-backup`).exists()).toBe(false);
    });

    it("keeps a startup file intact when its catlex block has no end marker", async () => {
      const f = await fixture(true);
      const bashrc = path.join(f.home, ".bashrc");
      const original = `a\n${BLOCK_BEGIN}\nkeep me\n`;
      await writeFile(bashrc, original);
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(await readFile(bashrc, "utf8")).toBe(original);
      expect(result.stderr).toContain("without a matching");
      expect(result.stdout).toContain(path.join(f.destination, "catlex"));
    });

    it("stores an absolute path for a relative custom install directory", async () => {
      const f = await fixture(true);
      f.env.CATLEX_INSTALL_DIR = "relative/bin";
      expect((await runWithOutput(["bash", installer], f.env, f.root)).exitCode).toBe(0);
      const bashrc = path.join(f.home, ".bashrc");
      expect(await resolveFromFreshShell(f, bashrc)).toBe(
        path.join(f.root, "relative", "bin", "catlex"),
      );
    });

    it("supports a custom install directory containing spaces, quotes, $ and backslashes", async () => {
      const f = await fixture(true, "my tools/it's $HOME \\bin");
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

    it("also configures the existing .bashrc of a zsh user, for terminals that run bash", async () => {
      const f = await fixture(true);
      f.env.SHELL = "/bin/zsh";
      const bashrc = path.join(f.home, ".bashrc");
      await writeFile(bashrc, "# user bashrc\n");
      const result = await runWithOutput(["bash", installer], f.env);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`in ${path.join(f.home, ".zshrc")}`);
      expect(result.stdout).toContain(`in ${bashrc}`);
      expect(await resolveFromFreshShell(f, bashrc)).toBe(path.join(f.destination, "catlex"));
    });

    it("uses the existing ~/.profile on macOS instead of creating a .bash_profile that hides it", async () => {
      const f = await fixture(true);
      f.env.FAKE_UNAME_S = "Darwin";
      const profile = path.join(f.home, ".profile");
      await writeFile(profile, "export EDITOR=vi\n");
      expect(await run(["bash", installer], f.env)).toBe(0);
      expect(await Bun.file(path.join(f.home, ".bash_profile")).exists()).toBe(false);
      expect(await readFile(profile, "utf8")).toStartWith("export EDITOR=vi\n");
      expect(await resolveFromFreshShell(f, profile)).toBe(path.join(f.destination, "catlex"));
    });

    it("creates ~/.bash_profile on macOS when no Bash login file exists", async () => {
      const f = await fixture(true);
      f.env.FAKE_UNAME_S = "Darwin";
      expect(await run(["bash", installer], f.env)).toBe(0);
      const bashProfile = path.join(f.home, ".bash_profile");
      expect(await resolveFromFreshShell(f, bashProfile)).toBe(path.join(f.destination, "catlex"));
      expect(await Bun.file(path.join(f.home, ".bashrc")).exists()).toBe(false);
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
      expect(result.stdout).toContain("is not supported for automatic PATH setup");
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
    const readUserPath = (f: Fixture) => readFile(f.userPathFile, "utf8");

    it(
      "appends the install directory to the user PATH without copying the process PATH",
      async () => {
        const f = await fixture(true);
        await writeFile(f.userPathFile, "%USERPROFILE%\\tools;C:\\keep;");
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
        await writeFile(f.userPathFile, `C:\\keep;${f.destination.toUpperCase()}\\`);
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

    for (const [name, value] of [
      ["CATLEX_NO_MODIFY_PATH", "1"],
      ["CI", "true"],
    ] as const) {
      it(
        `does not modify the user PATH when ${name} is set`,
        async () => {
          const f = await fixture(true);
          f.env[name] = value;
          const result = await runPowershellInstaller(f);
          expect(result.exitCode).toBe(0);
          expect(await Bun.file(f.userPathFile).exists()).toBe(false);
          expect(result.stdout).toContain("is not in your user PATH");
        },
        POWERSHELL_TEST_TIMEOUT_MS,
      );
    }

    it(
      "stores an absolute path for a relative custom install directory",
      async () => {
        const f = await fixture(true);
        f.env.CATLEX_INSTALL_DIR = "relative-bin";
        expect((await runPowershellInstaller(f, f.root)).exitCode).toBe(0);
        expect(await readUserPath(f)).toBe(path.join(f.root, "relative-bin"));
      },
      POWERSHELL_TEST_TIMEOUT_MS,
    );

    it(
      "prints a command that refreshes PATH in a PowerShell session the installer did not run in",
      async () => {
        const f = await fixture(true, "it's bin");
        const result = await runPowershellInstaller(f);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(
          `$env:Path = '${f.destination.replace("'", "''")};' + $env:Path`,
        );
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
