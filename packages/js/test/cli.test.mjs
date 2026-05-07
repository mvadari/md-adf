import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../dist/bin/adfmd.js");

test("to-md converts ADF from stdin to stdout", () => {
  const adf = {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello CLI" }],
      },
    ],
  };

  const result = runCli(["to-md"], JSON.stringify(adf));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Hello CLI");
  assert.equal(result.stderr, "");
});

test("to-adf converts Markdown from stdin to stdout", () => {
  const result = runCli(["to-adf"], "Hello CLI");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello CLI" }],
      },
    ],
  });
  assert.equal(result.stderr, "");
});

test("to-md writes to --output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adfmd-js-cli-"));
  const input = join(dir, "input.adf.json");
  const output = join(dir, "output.md");
  await writeFile(
    input,
    JSON.stringify({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "File output" }],
        },
      ],
    }),
    "utf8",
  );

  const result = runCli(["to-md", input, "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(await readFile(output, "utf8"), "File output");
});

test("validate-adf accepts valid ADF from stdin", () => {
  const result = runCli(
    ["validate-adf"],
    JSON.stringify({ version: 1, type: "doc", content: [] }),
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

function runCli(args, input = "") {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
  });
}
