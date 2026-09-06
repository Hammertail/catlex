#!/usr/bin/env bun

//* Libraries imports
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

type CommandResult = {
  name: string;
  argv: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const repoRoot = path.resolve(import.meta.dir, "../..");
const catlexEntry = path.join(repoRoot, "src/bin/catlex.ts");
const nimbusdeskSrc = path.join(repoRoot, "examples/nimbusdesk");
const nimbusdeskAltSrc = path.join(repoRoot, "examples/nimbusdesk-alt");
const artifactDir = "/opt/cursor/artifacts";

function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function runCatlex(args: string[], options?: { timeoutMs?: number }): Promise<CommandResult> {
  const argv = [catlexEntry, ...args];
  const timeoutMs = options?.timeoutMs ?? 180_000;

  return new Promise((resolve, reject) => {
    const child = spawn("bun", argv, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        name: args.join(" "),
        argv: ["bun", ...argv],
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseJsonFromStdout(stdout: string): unknown {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object in stdout:\n${stdout.slice(0, 500)}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function translatedMap(payload: {
  reports?: Array<{
    translated?: Array<{ path: string; value: string }>;
  }>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const report of payload.reports ?? []) {
    for (const item of report.translated ?? []) {
      out[item.path] = item.value;
    }
  }
  return out;
}

function includesFold(value: string | undefined, needle: string): boolean {
  return (value ?? "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

async function writeArtifact(name: string, content: string): Promise<string> {
  await mkdir(artifactDir, { recursive: true });
  const filePath = path.join(artifactDir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

async function copyProject(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true });
}

async function main(): Promise<void> {
  const workRoot = await mkdtemp(path.join(tmpdir(), "catlex-nimbusdesk-live-"));
  const projectA = path.join(workRoot, "nimbusdesk");
  const projectB = path.join(workRoot, "nimbusdesk-alt");
  await copyProject(nimbusdeskSrc, projectA);
  await copyProject(nimbusdeskAltSrc, projectB);

  const results: CommandResult[] = [];
  const checks: CheckResult[] = [];

  const dryA = await runCatlex([
    "translate",
    "--cwd",
    projectA,
    "--dry-run",
    "--json",
    "--locale",
    "pt",
  ]);
  results.push(dryA);
  const dryPayload = parseJsonFromStdout(dryA.stdout) as {
    dryRun?: boolean;
    pendingCount?: number;
    reports?: Array<{ pending?: unknown[] }>;
  };
  checks.push({
    name: "dry-run against nimbusdesk config exits 0 and lists missing keys",
    ok: dryA.exitCode === 0 && dryPayload.dryRun === true && (dryPayload.pendingCount ?? 0) >= 4,
    detail: `exit=${dryA.exitCode} pendingCount=${String(dryPayload.pendingCount)}`,
  });
  checks.push({
    name: "dry-run JSON does not expose resolved guidance (observability gap)",
    ok:
      !JSON.stringify(dryPayload).includes("espaço de trabalho") &&
      !JSON.stringify(dryPayload).includes("Project guidance"),
    detail: "dry-run payload has no guidance/prompt field",
  });

  const bothFlags = await runCatlex([
    "translate",
    "--cwd",
    projectA,
    "--dry-run",
    "--json",
    "--guidance",
    "inline",
    "--guidance-file",
    "glossary.md",
  ]);
  results.push(bothFlags);
  checks.push({
    name: "passing --guidance and --guidance-file together is a hard error",
    ok:
      bothFlags.exitCode === 1 &&
      /either inline guidance or a guidance file/i.test(bothFlags.stderr),
    detail: `exit=${bothFlags.exitCode} stderr=${bothFlags.stderr.trim()}`,
  });

  const customName = await runCatlex(["validate", "--cwd", projectA, "--json"]);
  results.push(customName);
  const validateA = parseJsonFromStdout(customName.stdout) as { messagesDir?: string };
  checks.push({
    name: "validate loads catlex.config.json (messagesDir=messages), not catlex.config.custom.json",
    ok: validateA.messagesDir === "messages",
    detail: `messagesDir=${String(validateA.messagesDir)} exit=${customName.exitCode}`,
  });

  const altValidate = await runCatlex(["validate", "--cwd", projectB, "--json"]);
  results.push(altValidate);
  const altValidatePayload = parseJsonFromStdout(altValidate.stdout) as {
    messagesDir?: string;
  };
  checks.push({
    name: "--cwd nimbusdesk-alt loads catlex.config.js messagesDir=locales",
    ok: altValidatePayload.messagesDir === "locales",
    detail: `exit=${altValidate.exitCode} messagesDir=${String(altValidatePayload.messagesDir)}`,
  });

  if (!hasApiKey()) {
    checks.push({
      name: "OPENAI_API_KEY is set for live translate/review",
      ok: false,
      detail: "OPENAI_API_KEY is unset; skipping live model calls",
    });
  } else {
    const translateA = await runCatlex(
      ["translate", "--cwd", projectA, "--yes", "--json", "--locale", "pt", "--concurrency", "1"],
      { timeoutMs: 240_000 },
    );
    results.push(translateA);
    const payloadA = parseJsonFromStdout(translateA.stdout) as {
      reports?: Array<{ translated?: Array<{ path: string; value: string }> }>;
    };
    const mapA = translatedMap(payloadA);
    const cycleA = mapA["billing.cycle"] ?? "";
    const openA = mapA["actions.openWorkspace"] ?? "";
    const greetA = mapA["billing.greeting"] ?? "";
    checks.push({
      name: "nimbusdesk JSON config: translate fills missing keys",
      ok: translateA.exitCode === 0 && Boolean(cycleA) && Boolean(openA) && Boolean(greetA),
      detail: `exit=${translateA.exitCode} keys=${JSON.stringify(mapA)}`,
    });
    checks.push({
      name: "nimbusdesk JSON config: Billing cycle → ciclo de faturação",
      ok: includesFold(cycleA, "faturação") || includesFold(cycleA, "faturacao"),
      detail: `billing.cycle=${JSON.stringify(cycleA)}`,
    });
    checks.push({
      name: "nimbusdesk JSON config: keeps NimbusDesk untranslated in new strings",
      ok:
        includesFold(openA, "NimbusDesk") &&
        includesFold(greetA, "NimbusDesk") &&
        !includesFold(openA, "NimbusEscritório") &&
        !includesFold(greetA, "Mesa Nimbus"),
      detail: `openWorkspace=${JSON.stringify(openA)} greeting=${JSON.stringify(greetA)}`,
    });

    const translateB = await runCatlex(
      ["translate", "--cwd", projectB, "--yes", "--json", "--locale", "pt", "--concurrency", "1"],
      { timeoutMs: 240_000 },
    );
    results.push(translateB);
    const payloadB = parseJsonFromStdout(translateB.stdout) as {
      messagesDir?: string;
      reports?: Array<{ translated?: Array<{ path: string; value: string }> }>;
    };
    const mapB = translatedMap(payloadB);
    const cycleB = mapB["billing.cycle"] ?? "";
    const openB = mapB["actions.openWorkspace"] ?? "";
    const greetB = mapB["billing.greeting"] ?? "";
    checks.push({
      name: "nimbusdesk-alt JS config: messagesDir from config is locales",
      ok: payloadB.messagesDir === "locales",
      detail: `messagesDir=${String(payloadB.messagesDir)}`,
    });
    checks.push({
      name: "nimbusdesk-alt JS config: Billing cycle → período de cobrança",
      ok:
        translateB.exitCode === 0 &&
        (includesFold(cycleB, "cobrança") || includesFold(cycleB, "cobranca")),
      detail: `exit=${translateB.exitCode} billing.cycle=${JSON.stringify(cycleB)}`,
    });
    checks.push({
      name: "nimbusdesk-alt JS config: NimbusDesk → NimbusEscritório",
      ok:
        includesFold(openB, "NimbusEscritório") ||
        includesFold(openB, "NimbusEscritorio") ||
        includesFold(greetB, "NimbusEscritório") ||
        includesFold(greetB, "NimbusEscritorio"),
      detail: `openWorkspace=${JSON.stringify(openB)} greeting=${JSON.stringify(greetB)}`,
    });
    checks.push({
      name: "the two custom configs produce different Billing cycle translations",
      ok: cycleA.length > 0 && cycleB.length > 0 && cycleA !== cycleB,
      detail: `A=${JSON.stringify(cycleA)} B=${JSON.stringify(cycleB)}`,
    });

    const projectFile = path.join(workRoot, "nimbusdesk-guidance-file");
    await copyProject(nimbusdeskSrc, projectFile);
    const translateFile = await runCatlex(
      [
        "translate",
        "--cwd",
        projectFile,
        "--no-config",
        "--guidance-file",
        "glossary.md",
        "--yes",
        "--json",
        "--locale",
        "pt",
        "--concurrency",
        "1",
      ],
      { timeoutMs: 240_000 },
    );
    results.push(translateFile);
    const mapFile = translatedMap(
      parseJsonFromStdout(translateFile.stdout) as {
        reports?: Array<{ translated?: Array<{ path: string; value: string }> }>;
      },
    );
    const cycleFile = mapFile["billing.cycle"] ?? "";
    checks.push({
      name: "--no-config --guidance-file still applies glossary.md (Billing cycle → ciclo de faturação)",
      ok:
        translateFile.exitCode === 0 &&
        (includesFold(cycleFile, "faturação") || includesFold(cycleFile, "faturacao")),
      detail: `exit=${translateFile.exitCode} billing.cycle=${JSON.stringify(cycleFile)}`,
    });

    const reviewA = await runCatlex(
      ["translate", "review", "--cwd", projectA, "--json", "--locale", "pt", "--concurrency", "1"],
      { timeoutMs: 240_000 },
    );
    results.push(reviewA);
    const reviewPayload = parseJsonFromStdout(reviewA.stdout) as {
      reports?: Array<{
        items?: Array<{ path: string; verdict: string; suggestedValue?: string; reason?: string }>;
      }>;
    };
    const items = reviewPayload.reports?.[0]?.items ?? [];
    const byPath = new Map(items.map((item) => [item.path, item]));
    const product = byPath.get("brand.product");
    const saveItem = byPath.get("actions.save");
    const workspace = byPath.get("nav.workspace");
    checks.push({
      name: "review with nimbusdesk config marks planted glossary violations as wrong",
      ok:
        product?.verdict === "wrong" &&
        saveItem?.verdict === "wrong" &&
        workspace?.verdict === "wrong",
      detail: `brand.product=${product?.verdict} actions.save=${saveItem?.verdict} nav.workspace=${workspace?.verdict}`,
    });
  }

  const summaryLines = [
    "# NimbusDesk live config checks",
    "",
    `workRoot: ${workRoot}`,
    `apiKey: ${hasApiKey() ? "set" : "unset"}`,
    "",
    "## Checks",
    "",
    ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.name} — ${check.detail}`),
    "",
    "## Commands",
    "",
    ...results.map((result) => {
      return [
        `### exit ${result.exitCode}: ${result.name}`,
        "",
        "```",
        result.stdout.trim() || "(empty stdout)",
        result.stderr.trim() ? `\n--- stderr ---\n${result.stderr.trim()}` : "",
        "```",
        "",
      ].join("\n");
    }),
  ];

  const summary = `${summaryLines.join("\n")}\n`;
  const summaryPath = await writeArtifact("nimbusdesk_live_config_checks.md", summary);
  await writeArtifact(
    "nimbusdesk_live_config_checks.json",
    `${JSON.stringify({ checks, results: results.map((r) => ({ ...r, stdout: r.stdout, stderr: r.stderr })) }, null, 2)}\n`,
  );

  const failed = checks.filter((check) => !check.ok);
  console.log(summary);
  console.log(`Wrote ${summaryPath}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }

  await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
}

await main();
