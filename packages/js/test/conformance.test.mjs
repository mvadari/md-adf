import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertAdfEqual,
  assertDiagnosticsEqual,
  assertMarkdownEqual,
  loadManifest,
} from "../../../tools/conformance/shared.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const fixturesRoot = resolve(root, "fixtures");
const manifest = await loadManifest();
const distEntry = resolve(here, "../dist/src/index.js");

if (!existsSync(distEntry)) {
  throw new Error(
    "JS package is not built. Run `npm run build --workspace packages/js` before tests.",
  );
}

const { adfToMarkdown, markdownToAdf } = await import(
  pathToFileURL(distEntry).href
);

let executed = 0;
let skipped = 0;

for (const manifestCase of manifest.cases) {
  const casePath = resolve(fixturesRoot, manifestCase.path);
  const caseDir = dirname(casePath);
  const testCase = JSON.parse(await readFile(casePath, "utf8"));

  if (testCase.skip?.js || testCase.xfail?.js) {
    skipped += 1;
    continue;
  }

  if (testCase.direction === "adf-to-md") {
    const input = JSON.parse(
      await readFile(resolve(caseDir, "input.adf.json"), "utf8"),
    );
    const expectedMarkdown = await readFile(
      resolve(caseDir, "expected.md"),
      "utf8",
    );
    const expectedDiagnostics = JSON.parse(
      await readFile(resolve(caseDir, "expected.diagnostics.json"), "utf8"),
    );
    const result = adfToMarkdown(input, testCase.options);
    assertMarkdownEqual(result.value, expectedMarkdown, testCase.id);
    assertDiagnosticsEqual(
      result.diagnostics,
      expectedDiagnostics,
      testCase.id,
    );
    executed += 1;
  } else if (testCase.direction === "md-to-adf") {
    const input = await readFile(resolve(caseDir, "input.md"), "utf8");
    const expectedAdf = JSON.parse(
      await readFile(resolve(caseDir, "expected.adf.json"), "utf8"),
    );
    const expectedDiagnostics = JSON.parse(
      await readFile(resolve(caseDir, "expected.diagnostics.json"), "utf8"),
    );
    const result = markdownToAdf(input, testCase.options);
    assertAdfEqual(result.value, expectedAdf, testCase.id);
    assertDiagnosticsEqual(
      result.diagnostics,
      expectedDiagnostics,
      testCase.id,
    );
    executed += 1;
  } else if (testCase.direction === "roundtrip") {
    const input = JSON.parse(
      await readFile(resolve(caseDir, "input.adf.json"), "utf8"),
    );
    const expected = JSON.parse(
      await readFile(resolve(caseDir, "expected.normalized.adf.json"), "utf8"),
    );
    const markdown = adfToMarkdown(input, testCase.options);
    assertDiagnosticsEqual(
      markdown.diagnostics,
      [],
      `${testCase.id} adf-to-md`,
    );
    const adf = markdownToAdf(markdown.value, testCase.options);
    assertDiagnosticsEqual(adf.diagnostics, [], `${testCase.id} md-to-adf`);
    assertAdfEqual(adf.value, expected, testCase.id);
    executed += 1;
  }
}

console.log(
  `JS conformance passed ${executed} fixture cases (${skipped} skipped).`,
);
