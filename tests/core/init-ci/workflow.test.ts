//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { generateValidateMessagesWorkflow } from "../../../src/core/init-ci/workflow.ts";

describe("generateValidateMessagesWorkflow", () => {
  it("includes checkout, binary install via GITHUB_PATH, and validate --json", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("name: Validate messages");
    expect(yaml).toContain("actions/checkout@v4");
    expect(yaml).toContain(
      "https://github.com/Tamicktom/catlex/releases/latest/download/install.sh",
    );
    expect(yaml).toContain("set -euo pipefail");
    expect(yaml).toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
    expect(yaml).toContain("catlex validate --json");
  });

  it("does not set up Bun or run scan", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).not.toContain("setup-bun");
    expect(yaml).not.toContain("oven-sh");
    expect(yaml).not.toContain("catlex scan");
  });
});
