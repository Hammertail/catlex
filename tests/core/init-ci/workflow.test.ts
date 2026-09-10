//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import packageJson from "../../../package.json" with { type: "json" };
import { generateValidateMessagesWorkflow } from "../../../src/core/init-ci/workflow.ts";

const PINNED_VERSION = packageJson.version;
const PINNED_INSTALL_URL = `https://github.com/Hammertail/catlex/releases/download/v${PINNED_VERSION}/install.sh`;
const LATEST_INSTALL_URL =
  "https://github.com/Hammertail/catlex/releases/latest/download/install.sh";

describe("generateValidateMessagesWorkflow", () => {
  it("includes checkout, binary install via GITHUB_PATH, and validate --json", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("name: Validate messages");
    expect(yaml).toContain("actions/checkout@v4");
    expect(yaml).toContain(PINNED_INSTALL_URL);
    expect(yaml).toContain(`CATLEX_VERSION=${PINNED_VERSION}`);
    expect(yaml).toContain("set -euo pipefail");
    expect(yaml).toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
    expect(yaml).toContain("catlex validate --no-config --json");
  });

  it("pins Catlex instead of downloading releases/latest", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain(PINNED_INSTALL_URL);
    expect(yaml).not.toContain(LATEST_INSTALL_URL);
  });

  it("declares contents: read for the gate-only validate job", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("contents: read");
    expect(yaml).not.toContain("contents: write");
  });

  it("does not set up Bun or run scan", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).not.toContain("setup-bun");
    expect(yaml).not.toContain("oven-sh");
    expect(yaml).not.toContain("catlex scan");
  });
});
