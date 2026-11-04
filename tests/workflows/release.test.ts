//* Libraries imports
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

//* Types imports
type WorkflowStep = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};

type WorkflowJob = {
  needs?: string;
  permissions?: Record<string, string>;
  steps: WorkflowStep[];
};

type Workflow = {
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
};

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

describe("release workflow provenance", () => {
  const RELEASE_ASSETS = [
    "catlex-linux-x64",
    "catlex-linux-arm64",
    "catlex-darwin-x64",
    "catlex-darwin-arm64",
    "catlex-windows-x64.exe",
    "install.sh",
    "install.ps1",
    "SHA256SUMS",
  ];
  const workflow = Bun.YAML.parse(readFileSync(RELEASE_WORKFLOW_PATH, "utf8")) as Workflow;
  const build = workflow.jobs.build as WorkflowJob;
  const publish = workflow.jobs.publish as WorkflowJob;

  function stepIndex(job: WorkflowJob, predicate: (step: WorkflowStep) => boolean): number {
    const index = job.steps.findIndex(predicate);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  }

  function usesAction(action: string): (step: WorkflowStep) => boolean {
    return (step) => step.uses?.startsWith(`${action}@`) === true;
  }

  function runsCommand(command: string): (step: WorkflowStep) => boolean {
    return (step) => step.run?.includes(command) === true;
  }

  it("grants no write access by default", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("builds and tests without write access or a signing identity", () => {
    expect(build.permissions).toEqual({ contents: "read" });
    const checkout = build.steps[stepIndex(build, usesAction("actions/checkout"))];
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("runs no repository or dependency code in the job holding write access", () => {
    expect(publish.permissions?.contents).toBe("write");
    expect(publish.steps.some(usesAction("oven-sh/setup-bun"))).toBe(false);
    for (const step of publish.steps) {
      expect(step.run ?? "").not.toMatch(/\b(bun|bunx|npm|npx|node)\b/);
    }
  });

  it("publishes only after the build job succeeds", () => {
    expect(publish.needs).toBe("build");
  });

  it("hands every release asset from the build job to the publish job", () => {
    const upload = build.steps[stepIndex(build, usesAction("actions/upload-artifact"))];
    const download = publish.steps[stepIndex(publish, usesAction("actions/download-artifact"))];
    expect(download?.with?.name).toBe(upload?.with?.name as string);
    expect(upload?.with?.["if-no-files-found"]).toBe("error");
    const uploaded = String(upload?.with?.path).trim().split("\n");
    expect(uploaded.sort()).toEqual([...RELEASE_ASSETS].sort());
    const create = publish.steps[stepIndex(publish, runsCommand("gh release create"))];
    for (const asset of RELEASE_ASSETS) {
      expect(create?.run).toContain(`${asset} \\\n`);
    }
  });

  it("signs SLSA build provenance for every downloaded asset with a pinned action", () => {
    expect(publish.permissions?.["id-token"]).toBe("write");
    expect(publish.permissions?.attestations).toBe("write");
    const attest = publish.steps[stepIndex(publish, usesAction("actions/attest"))];
    expect(attest?.uses).toMatch(/^actions\/attest@[0-9a-f]{40}$/);
    const download = publish.steps[stepIndex(publish, usesAction("actions/download-artifact"))];
    expect(attest?.with?.["subject-path"]).toBe(`${download?.with?.path}/*`);
    expect(attest?.with?.predicate).toBeUndefined();
    expect(attest?.with?.["predicate-type"]).toBeUndefined();
  });

  it("verifies and attests the assets before anything becomes public", () => {
    const download = stepIndex(publish, usesAction("actions/download-artifact"));
    const verify = stepIndex(publish, runsCommand("sha256sum --check SHA256SUMS"));
    const attest = stepIndex(publish, usesAction("actions/attest"));
    const push = stepIndex(publish, runsCommand("git push"));
    const release = stepIndex(publish, runsCommand("gh release create"));
    expect(download).toBeLessThan(verify);
    expect(verify).toBeLessThan(attest);
    expect(attest).toBeLessThan(push);
    expect(push).toBeLessThan(release);
  });

  it("tells release consumers how to verify the provenance of a binary", () => {
    const create = publish.steps[stepIndex(publish, runsCommand("gh release create"))];
    const repository = "${{" + " github.repository }}";
    expect(create?.run).toContain(
      `gh attestation verify catlex-linux-x64 --repo ${repository} --signer-workflow ${repository}/.github/workflows/release.yml`,
    );
  });

  describe.skipIf(!Bun.which("jq"))("version bump in the publish job", () => {
    const roots: string[] = [];

    afterEach(async () => {
      await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    });

    it("changes only the version and keeps the formatting of package.json", async () => {
      const root = await mkdtemp(join(tmpdir(), "catlex-release-bump-"));
      roots.push(root);
      const source = readFileSync(join(import.meta.dir, "../../package.json"), "utf8");
      await writeFile(join(root, "package.json"), source);
      const bump = publish.steps[stepIndex(publish, (step) => step.name === "Bump version")];

      const child = Bun.spawn(["bash", "-c", bump?.run ?? "exit 1"], {
        cwd: root,
        env: { ...process.env, VERSION: "9.8.7" },
      });

      expect(await child.exited).toBe(0);
      const expected = `${JSON.stringify({ ...JSON.parse(source), version: "9.8.7" }, null, 2)}\n`;
      expect(await readFile(join(root, "package.json"), "utf8")).toBe(expected);
    });
  });
});
