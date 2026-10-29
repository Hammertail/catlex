//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const roots: string[] = [];
const installer = path.resolve(import.meta.dir, "../../scripts/install.sh");
const powershellInstaller = path.resolve(import.meta.dir, "../../scripts/install.ps1");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(
  validChecksum: boolean,
): Promise<{ root: string; env: NodeJS.ProcessEnv; destination: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "catlex-install-"));
  roots.push(root);
  const destination = path.join(root, "installed");
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
  return {
    root,
    destination,
    env: {
      ...process.env,
      FIXTURE_ROOT: root,
      CATLEX_INSTALL_DIR: destination,
      CATLEX_VERSION: "0.5.2",
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  };
}

async function run(command: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return child.exited;
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

  it("rejects a manifest without the selected asset", async () => {
    const f = await fixture(true);
    await writeFile(path.join(f.root, "SHA256SUMS"), "");
    expect(await run(["bash", installer], f.env)).not.toBe(0);
    expect(await Bun.file(path.join(f.destination, "catlex")).exists()).toBe(false);
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
& $env:INSTALLER_PATH
`,
        );
        if (valid) f.env.CATLEX_VERSION = "latest";
        const exit = await run(["pwsh", "-NoProfile", "-File", harness], {
          ...f.env,
          INSTALLER_PATH: powershellInstaller,
        });
        expect(exit === 0).toBe(valid);
        expect(await readFile(path.join(f.destination, "catlex.exe"), "utf8")).toBe(
          valid ? "verified catlex binary\n" : "original",
        );
      },
    );
  }
});
