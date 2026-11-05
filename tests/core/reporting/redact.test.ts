//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import { redactArgv, redactUrlCredentials } from "../../../src/core/reporting/redact.ts";

const REDACTED = "<redacted>";

describe("redactArgv", () => {
  it("masks the value that follows --guidance and --base-url", () => {
    expect(
      redactArgv(["--guidance", "secret glossary", "--base-url", "https://proxy.example/v1"]),
    ).toEqual(["--guidance", REDACTED, "--base-url", REDACTED]);
  });

  it("masks values passed with the --flag=value form", () => {
    expect(redactArgv(["--guidance=secret glossary", "--base-url=https://proxy/v1"])).toEqual([
      `--guidance=${REDACTED}`,
      `--base-url=${REDACTED}`,
    ]);
  });

  it.each([
    "--api-key",
    "--apikey",
    "--access-token",
    "--client-secret",
    "--db-password",
    "--API-KEY",
    "--GUIDANCE",
    "--Base-Url",
    "-token",
  ])("masks the value of %s and of its = form", (flag) => {
    expect(redactArgv([flag, "hunter2"])).toEqual([flag, REDACTED]);
    expect(redactArgv([`${flag}=hunter2`])).toEqual([`${flag}=${REDACTED}`]);
  });

  it("keeps non-sensitive flags and positionals readable for debugging", () => {
    const argv = [
      "bun",
      "/repo/src/bin/catlex.ts",
      "translate",
      "--guidance-file",
      "glossary.txt",
      "--model",
      "gpt-5.4-mini",
      "--dry-run",
      "docs/secret-sauce.md",
    ];
    expect(redactArgv(argv)).toEqual(argv);
  });

  it("does not mask the next argument after an = form, or judge a flag by its value", () => {
    expect(redactArgv(["--guidance=a", "--json"])).toEqual([`--guidance=${REDACTED}`, "--json"]);
    expect(redactArgv(["--model=monkey", "docs/a.md"])).toEqual(["--model=monkey", "docs/a.md"]);
  });

  it("masks a sensitive value even when it looks like a flag", () => {
    expect(redactArgv(["--guidance", "-keep this private", "--json"])).toEqual([
      "--guidance",
      REDACTED,
      "--json",
    ]);
  });

  it("still masks the value when a sensitive flag directly follows another one", () => {
    expect(redactArgv(["--monkey", "--guidance", "secret glossary"])).toEqual([
      "--monkey",
      REDACTED,
      REDACTED,
    ]);
  });

  it("leaves a trailing sensitive flag without a value untouched", () => {
    expect(redactArgv(["translate", "--guidance"])).toEqual(["translate", "--guidance"]);
  });

  it("masks URL credentials in any other argument", () => {
    expect(
      redactArgv(["https://user:token@proxy.example/v1", "--endpoint=https://user:token@host/v1"]),
    ).toEqual([`https://${REDACTED}@proxy.example/v1`, `--endpoint=https://${REDACTED}@host/v1`]);
  });

  it("does not mutate its input", () => {
    const argv = ["--guidance", "secret glossary"];
    redactArgv(argv);
    expect(argv).toEqual(["--guidance", "secret glossary"]);
  });
});

describe("redactUrlCredentials", () => {
  it("masks credentials embedded in free text", () => {
    expect(redactUrlCredentials("fetch failed: https://user:token@proxy.example/v1 (503)")).toBe(
      `fetch failed: https://${REDACTED}@proxy.example/v1 (503)`,
    );
  });

  it("masks the whole password when it contains a raw @", () => {
    const masked = redactUrlCredentials("https://user:p@SECRET@proxy.example/v1");
    expect(masked).toBe(`https://${REDACTED}@proxy.example/v1`);
  });

  it("masks every URL when several are joined in one token", () => {
    const masked = redactUrlCredentials("https://a:one@h1,https://b:two@h2");
    expect(masked).not.toContain("one");
    expect(masked).not.toContain("two");
  });

  it("does not treat an @ in later text as part of a URL", () => {
    const text = "https://proxy.example/v1 failed for me@example.com";
    expect(redactUrlCredentials(text)).toBe(text);
  });

  it("stays fast on long unbroken input", () => {
    const inputs = ["A".repeat(2_000_000), "x://".repeat(500_000)];
    for (const input of inputs) {
      const startedAt = performance.now();
      redactUrlCredentials(input);
      expect(performance.now() - startedAt).toBeLessThan(1000);
    }
  });

  it("leaves URLs without credentials untouched", () => {
    const text = "fetch failed: https://proxy.example/v1?x=1";
    expect(redactUrlCredentials(text)).toBe(text);
  });
});
