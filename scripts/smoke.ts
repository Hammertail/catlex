//* Libraries imports
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

//* Local imports
import packageJson from "../package.json" with { type: "json" };

const binaryArgument = process.argv.slice(2).find((arg) => arg !== "--");
const binary = path.resolve(
  binaryArgument ?? (process.platform === "win32" ? "dist/catlex.exe" : "dist/catlex"),
);
const cwd = await mkdtemp(path.join(tmpdir(), "catlex-smoke-"));

async function run(args: string[], expectedExit = 0): Promise<string> {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_BASE_URL;
  const child = Bun.spawn([binary, ...args], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(exit, expectedExit, `${args.join(" ")}: ${stderr}\n${stdout}`);
  return stdout;
}

try {
  assert.equal((await run(["--version"])).trim(), packageJson.version);
  assert.match(await run(["--help"]), /translate/);
  await mkdir(path.join(cwd, "messages"));
  await writeFile(path.join(cwd, "messages/en.json"), JSON.stringify({ greeting: "Hello" }));
  await writeFile(path.join(cwd, "messages/pt.json"), JSON.stringify({ greeting: "Olá" }));
  const validateArgs = ["validate", "--no-config", "--json"];
  assert.equal(JSON.parse(await run(validateArgs)).ok, true);
  await writeFile(path.join(cwd, "messages/pt.json"), "{}");
  assert.equal(JSON.parse(await run(validateArgs, 1)).ok, false);
  await mkdir(path.join(cwd, "source"));
  await writeFile(
    path.join(cwd, "source/view.tsx"),
    "export const View = () => <button>Save</button>;",
  );
  assert.match(await run(["scan", "--dir", "source", "--json"], 1), /Save/);
  await writeFile(path.join(cwd, "notes.md"), "# Hello\n");
  const markdown = JSON.parse(
    await run([
      "translate",
      "markdown",
      "notes.md",
      "--from",
      "en",
      "--to",
      "pt",
      "--out",
      "notes.pt.md",
      "--dry-run",
      "--no-config",
      "--json",
    ]),
  );
  assert.equal(markdown.dryRun, true);
  assert.equal(markdown.written, false);
  assert.equal(await Bun.file(path.join(cwd, "notes.pt.md")).exists(), false);
  console.log("Offline binary smoke checks passed.");
} finally {
  await rm(cwd, { recursive: true, force: true });
}
