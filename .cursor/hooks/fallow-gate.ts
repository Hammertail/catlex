#!/usr/bin/env bun
//* Libraries imports
import { spawnSync } from "node:child_process";

type HookInput = {
  command?: string;
};

type AuditOutput = {
  verdict?: string;
  error?: boolean;
  message?: string;
};

type HookPermission = {
  permission: "allow" | "deny" | "ask";
  user_message?: string;
  agent_message?: string;
};

function respond(payload: HookPermission): never {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(0);
}

function allow(): never {
  respond({ permission: "allow" });
}

const raw = await Bun.stdin.text();
let input: HookInput = {};
try {
  input = JSON.parse(raw) as HookInput;
} catch {
  allow();
}

const command = input.command ?? "";
if (!/(^|[\s;|&()])git\s+(commit|push)([\s]|$)/.test(command)) {
  allow();
}

const audit = spawnSync("bun", ["run", "fallow:audit"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

const stdout = audit.stdout?.toString() ?? "";
let result: AuditOutput = {};
try {
  result = JSON.parse(stdout) as AuditOutput;
} catch {
  // Fail open on non-JSON output (runtime / install issues).
  console.error("fallow-gate: fallow audit did not return JSON; allowing command.");
  allow();
}

if (result.verdict === "fail") {
  respond({
    permission: "deny",
    user_message:
      "Blocked by fallow audit (verdict: fail). Fix the reported findings, then retry the commit/push.",
    agent_message:
      "fallow audit returned verdict fail. Run `bun run fallow:audit`, fix every introduced finding, then retry git commit/push.",
  });
}

if (result.error === true) {
  console.error(
    `fallow-gate: fallow audit runtime error (${result.message ?? "unknown"}); allowing command.`,
  );
  allow();
}

if (audit.status !== 0 && audit.status !== 1) {
  console.error(`fallow-gate: fallow audit exited ${String(audit.status)}; allowing command.`);
  allow();
}

allow();
