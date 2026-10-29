//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { generateValidateMessagesWorkflow } from "../../../src/core/init-ci/workflow.ts";

describe("generateValidateMessagesWorkflow", () => {
  it("includes checkout, binary install via GITHUB_PATH, and validate --json", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("name: Validate messages");
    expect(yaml).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1");
    expect(yaml).toContain(
      `https://github.com/Hammertail/catlex/releases/download/v\${CATLEX_VERSION}/install.sh`,
    );
    expect(yaml).toContain("set -euo pipefail");
    expect(yaml).toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
    expect(yaml).toContain("catlex validate --no-config --json");
  });

  it("does not set up Bun or run scan", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).not.toContain("setup-bun");
    expect(yaml).not.toContain("oven-sh");
    expect(yaml).not.toContain("catlex scan");
  });
});
