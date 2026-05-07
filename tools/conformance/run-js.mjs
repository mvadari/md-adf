import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAdfEqual,
  assertDiagnosticsEqual,
  assertMarkdownEqual,
  loadManifest,
  fixturesRoot,
} from "./shared.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const distEntry = resolve(root, "packages/js/dist/src/index.js");

if (!existsSync(distEntry)) {
  throw new Error(
    "JS package is not built. Run `npm run build --workspace packages/js` before conformance.",
  );
}

const { adfToMarkdown, markdownToAdf } = await import(
  pathToFileURL(distEntry).href
);
const summary = await runJsConformance({ adfToMarkdown, markdownToAdf });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary));
} else {
  console.log(formatSummary(summary));
  for (const failure of summary.failures) {
    console.error(`FAIL ${failure.id}: ${failure.message}`);
  }
}

process.exitCode = summary.failed > 0 ? 1 : 0;

async function runJsConformance(api) {
  const manifest = await loadManifest();
  const summary = {
    language: "JS",
    passed: 0,
    failed: 0,
    skipped: 0,
    xfailed: 0,
    failures: [],
  };

  for (const manifestCase of manifest.cases) {
    const casePath = resolve(fixturesRoot, manifestCase.path);
    const caseDir = dirname(casePath);
    const testCase = JSON.parse(await readFile(casePath, "utf8"));

    if (testCase.skip?.js) {
      summary.skipped += 1;
      continue;
    }

    try {
      await runCase(api, testCase, caseDir);
      if (testCase.xfail?.js) {
        throw new Error(
          "Fixture unexpectedly passed despite js xfail metadata.",
        );
      }
      summary.passed += 1;
    } catch (error) {
      if (testCase.xfail?.js) {
        summary.xfailed += 1;
      } else {
        summary.failed += 1;
        summary.failures.push({
          id: testCase.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return summary;
}

async function runCase(api, testCase, caseDir) {
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
    const result = api.adfToMarkdown(input, testCase.options);
    assertMarkdownEqual(result.value, expectedMarkdown, testCase.id);
    assertDiagnosticsEqual(
      result.diagnostics,
      expectedDiagnostics,
      testCase.id,
    );
  } else if (testCase.direction === "md-to-adf") {
    const input = await readFile(resolve(caseDir, "input.md"), "utf8");
    const expectedAdf = JSON.parse(
      await readFile(resolve(caseDir, "expected.adf.json"), "utf8"),
    );
    const expectedDiagnostics = JSON.parse(
      await readFile(resolve(caseDir, "expected.diagnostics.json"), "utf8"),
    );
    const result = api.markdownToAdf(input, testCase.options);
    assertAdfEqual(result.value, expectedAdf, testCase.id);
    assertDiagnosticsEqual(
      result.diagnostics,
      expectedDiagnostics,
      testCase.id,
    );
  } else if (testCase.direction === "roundtrip") {
    const input = JSON.parse(
      await readFile(resolve(caseDir, "input.adf.json"), "utf8"),
    );
    const expected = JSON.parse(
      await readFile(resolve(caseDir, "expected.normalized.adf.json"), "utf8"),
    );
    const markdown = api.adfToMarkdown(input, testCase.options);
    assertDiagnosticsEqual(
      markdown.diagnostics,
      [],
      `${testCase.id} adf-to-md`,
    );
    const adf = api.markdownToAdf(markdown.value, testCase.options);
    assertDiagnosticsEqual(adf.diagnostics, [], `${testCase.id} md-to-adf`);
    assertAdfEqual(adf.value, expected, testCase.id);
  } else {
    throw new Error(`Unknown fixture direction ${testCase.direction}`);
  }
}

function formatSummary(summary) {
  return `${summary.language} conformance: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.xfailed} xfail.`;
}
