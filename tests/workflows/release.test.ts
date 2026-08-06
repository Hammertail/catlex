//* Libraries imports
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RELEASE_WORKFLOW_PATH = join(import.meta.dir, "../../.github/workflows/release.yml");

const SH = "${";
const INPUTS_VERSION_EXPR = "${{" + " inputs.version }}";
const INPUT_VERSION_STRIP_V = `VERSION="${SH}INPUT_VERSION#v}"`;
const VALIDATE_SCRIPT = [
  INPUT_VERSION_STRIP_V,
  `if [[ ! "${SH}VERSION}" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then`,
  `  echo "Invalid semver version: ${SH}INPUT_VERSION}"`,
  "  exit 1",
  "fi",
  `echo "version=${SH}VERSION}"`,
  `echo "tag=v${SH}VERSION}"`,
].join("\n");

async function validateVersionViaEnv(inputVersion: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bash", "-c", VALIDATE_SCRIPT], {
    env: { ...process.env, INPUT_VERSION: inputVersion },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

describe("release workflow version input", () => {
  const yaml = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");

  it("does not interpolate inputs.version directly into shell run scripts", () => {
    expect(yaml).not.toContain(`VERSION="${INPUTS_VERSION_EXPR}"`);
    expect(yaml).not.toContain(`Invalid semver version: ${INPUTS_VERSION_EXPR}`);
  });

  it("passes the version input through an environment variable before shell use", () => {
    expect(yaml).toContain(`INPUT_VERSION: ${INPUTS_VERSION_EXPR}`);
  });

  it("reads the validated version from the environment in the validate step", () => {
    const validateStep = yaml.slice(
      yaml.indexOf("- name: Validate version"),
      yaml.indexOf("- name: Checkout"),
    );

    expect(validateStep).toContain(`INPUT_VERSION: ${INPUTS_VERSION_EXPR}`);
    expect(validateStep).toContain(INPUT_VERSION_STRIP_V);
    expect(validateStep).not.toContain(`VERSION="${INPUTS_VERSION_EXPR}"`);
  });

  describe("version validation via environment variable", () => {
    it("accepts a valid semver version", async () => {
      const result = await validateVersionViaEnv("1.2.3");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("version=1.2.3");
      expect(result.stdout).toContain("tag=v1.2.3");
    });

    it("strips a leading v prefix from a valid version", async () => {
      const result = await validateVersionViaEnv("v0.3.3");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("version=0.3.3");
      expect(result.stdout).toContain("tag=v0.3.3");
    });

    it("rejects a command-injection payload as invalid data instead of executing it", async () => {
      const proofPath = `/tmp/catlex-release-injection-${Bun.randomUUIDv7()}.txt`;
      const payload = `0.1.0"; echo INJECTED > ${proofPath}; echo "`;

      const result = await validateVersionViaEnv(payload);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Invalid semver version:");
      expect(await Bun.file(proofPath).exists()).toBe(false);
    });

    it("rejects a payload that attempts to break out with command substitution", async () => {
      const proofPath = `/tmp/catlex-release-injection-${Bun.randomUUIDv7()}.txt`;
      const payload = `$(echo INJECTED > ${proofPath})`;

      const result = await validateVersionViaEnv(payload);

      expect(result.exitCode).not.toBe(0);
      expect(await Bun.file(proofPath).exists()).toBe(false);
    });
  });
});
