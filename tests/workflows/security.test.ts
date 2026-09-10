//* Libraries imports
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = join(import.meta.dir, "../../.github/workflows");

const WORKFLOW_FILES = readdirSync(WORKFLOWS_DIR)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOWS_DIR, name), "utf8");
}

/** True when `uses:` pins an action to a 40-char commit SHA (optionally with version comment). */
function isShaPinnedUses(line: string): boolean {
  const match = line.match(/uses:\s*([^\s#]+)/);
  if (!match?.[1]) {
    return false;
  }
  const ref = match[1];
  if (ref.startsWith("./") || ref.startsWith("docker://")) {
    return true;
  }
  return /@[0-9a-f]{40}(\s|$)/i.test(ref);
}

function installSteps(yaml: string): string[] {
  return yaml
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("run:") && line.includes("bun install"));
}

function jobBlocks(yaml: string): Array<{ name: string; body: string }> {
  const lines = yaml.split("\n");
  const jobsIndex = lines.findIndex((line) => line.trim() === "jobs:");
  if (jobsIndex < 0) {
    return [];
  }

  const blocks: Array<{ name: string; body: string }> = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (let i = jobsIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const jobMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch?.[1]) {
      if (currentName !== null) {
        blocks.push({ name: currentName, body: currentLines.join("\n") });
      }
      currentName = jobMatch[1];
      currentLines = [line];
      continue;
    }
    if (currentName !== null) {
      currentLines.push(line);
    }
  }

  if (currentName !== null) {
    blocks.push({ name: currentName, body: currentLines.join("\n") });
  }

  return blocks;
}

function hasContentsPermission(yamlOrJob: string, value: "read" | "write"): boolean {
  const contentsMatch = yamlOrJob.match(/^\s*contents:\s*(\w+)\s*$/m);
  return contentsMatch?.[1] === value;
}

function topLevelPermissionsBlock(yaml: string): string | null {
  const match = yaml.match(/^permissions:\s*\n((?:[ \t]+.+\n)*)/m);
  if (!match) {
    return null;
  }
  return match[0];
}

describe("repository GitHub Actions security", () => {
  it("discovers the expected workflow files", () => {
    expect(WORKFLOW_FILES).toEqual([
      "biome.yml",
      "build.yml",
      "fallow.yml",
      "release.yml",
      "test.yml",
    ]);
  });

  describe.each(WORKFLOW_FILES)("%s", (fileName) => {
    it("pins every third-party action to a full commit SHA", () => {
      const yaml = readWorkflow(fileName);
      const usesLines = yaml
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("uses:"));

      expect(usesLines.length).toBeGreaterThan(0);
      for (const line of usesLines) {
        expect(isShaPinnedUses(line)).toBe(true);
      }
    });

    it("does not reference mutable major-version action tags", () => {
      const yaml = readWorkflow(fileName);
      expect(yaml).not.toMatch(
        /uses:\s*(actions\/checkout|oven-sh\/setup-bun|fallow-rs\/fallow|stefanzweifel\/git-auto-commit-action)@v\d+\b/,
      );
    });
  });

  describe("bun install lifecycle scripts", () => {
    it("passes --ignore-scripts on every bun install in PR and release workflows", () => {
      for (const fileName of WORKFLOW_FILES) {
        const yaml = readWorkflow(fileName);
        const steps = installSteps(yaml);
        if (steps.length === 0) {
          continue;
        }
        for (const step of steps) {
          expect(step).toContain("--ignore-scripts");
          expect(step).toContain("--frozen-lockfile");
        }
      }
    });
  });

  describe("test.yml", () => {
    it("declares least-privilege contents: read permissions", () => {
      const yaml = readWorkflow("test.yml");
      expect(hasContentsPermission(yaml, "read")).toBe(true);
      expect(hasContentsPermission(yaml, "write")).toBe(false);
    });

    it("disables credential persistence on checkout", () => {
      const yaml = readWorkflow("test.yml");
      expect(yaml).toContain("persist-credentials: false");
    });
  });

  describe("build.yml", () => {
    it("declares least-privilege contents: read permissions", () => {
      const yaml = readWorkflow("build.yml");
      expect(hasContentsPermission(yaml, "read")).toBe(true);
      expect(hasContentsPermission(yaml, "write")).toBe(false);
    });

    it("disables credential persistence on checkout", () => {
      const yaml = readWorkflow("build.yml");
      expect(yaml).toContain("persist-credentials: false");
    });
  });

  describe("fallow.yml", () => {
    it("keeps contents: read and does not grant contents: write", () => {
      const yaml = readWorkflow("fallow.yml");
      expect(hasContentsPermission(yaml, "read")).toBe(true);
      expect(yaml).not.toMatch(/contents:\s*write/);
    });

    it("disables credential persistence on checkout", () => {
      const yaml = readWorkflow("fallow.yml");
      expect(yaml).toContain("persist-credentials: false");
    });
  });

  describe("biome.yml", () => {
    it("splits format-check (read-only) from optional auto-commit", () => {
      const yaml = readWorkflow("biome.yml");
      const jobs = jobBlocks(yaml);
      const jobNames = jobs.map((job) => job.name);

      expect(jobNames).toContain("check");
      expect(jobNames.some((name) => name === "format" || name === "autofix")).toBe(true);
    });

    it("runs the format-check job with contents: read and without write", () => {
      const yaml = readWorkflow("biome.yml");
      const checkJob = jobBlocks(yaml).find((job) => job.name === "check");
      expect(checkJob).toBeDefined();
      if (!checkJob) {
        return;
      }

      expect(checkJob.body).toMatch(/contents:\s*read/);
      expect(checkJob.body).not.toMatch(/contents:\s*write/);
      expect(checkJob.body).toContain("bun run check");
      expect(checkJob.body).not.toContain("check:fix");
      expect(checkJob.body).not.toContain("git-auto-commit-action");
      expect(checkJob.body).toContain("persist-credentials: false");
    });

    it("limits the auto-commit job to same-repository pull requests", () => {
      const yaml = readWorkflow("biome.yml");
      const formatJob = jobBlocks(yaml).find(
        (job) => job.name === "format" || job.name === "autofix",
      );
      expect(formatJob).toBeDefined();
      if (!formatJob) {
        return;
      }

      expect(formatJob.body).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
      expect(formatJob.body).toMatch(/contents:\s*write/);
      expect(formatJob.body).toContain("check:fix");
      expect(formatJob.body).toContain("git-auto-commit-action");
    });

    it("does not grant contents: write at the workflow top level", () => {
      const yaml = readWorkflow("biome.yml");
      const top = topLevelPermissionsBlock(yaml);
      expect(top).not.toBeNull();
      expect(top ?? "").not.toMatch(/contents:\s*write/);
    });
  });

  describe("release.yml", () => {
    it("still allows contents: write for tagging and publishing releases", () => {
      const yaml = readWorkflow("release.yml");
      expect(hasContentsPermission(yaml, "write")).toBe(true);
    });

    it("installs dependencies with --ignore-scripts before building release binaries", () => {
      const yaml = readWorkflow("release.yml");
      const steps = installSteps(yaml);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step).toContain("--ignore-scripts");
      }
    });
  });

  describe("pull_request_target", () => {
    it("is not enabled on any repository workflow", () => {
      for (const fileName of WORKFLOW_FILES) {
        const yaml = readWorkflow(fileName);
        expect(yaml).not.toContain("pull_request_target");
      }
    });
  });
});
