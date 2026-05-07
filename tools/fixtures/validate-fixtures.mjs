import Ajv2020 from "ajv/dist/2020.js";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = new URL("../../fixtures/", import.meta.url);
const rootPath = fileURLToPath(fixturesRoot);
const manifestPath = join(rootPath, "manifest.json");
const writeManifest = process.argv.includes("--write");

const requiredFilesByDirection = {
  "adf-to-md": ["input.adf.json", "expected.md", "expected.diagnostics.json"],
  "md-to-adf": ["input.md", "expected.adf.json", "expected.diagnostics.json"],
  roundtrip: ["input.adf.json", "expected.normalized.adf.json"],
};
const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function findCaseFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findCaseFiles(path)));
    } else if (entry.name === "case.json") {
      files.push(path);
    }
  }

  return files;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function formatAjvError(error) {
  const path = error.instancePath || "/";
  const detail =
    error.keyword === "additionalProperties"
      ? ` ${error.message}: ${error.params.additionalProperty}`
      : ` ${error.message}`;
  return `${path}${detail}`;
}

function validateJson(validate, value, label, errors) {
  if (!validate(value)) {
    for (const error of validate.errors ?? []) {
      errors.push(`${label}: ${formatAjvError(error)}`);
    }
  }
}

function validateGeneratedAt(value, label, errors) {
  if (
    typeof value !== "string" ||
    !dateTimePattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${label}: /generatedAt must be a valid RFC 3339 date-time`);
  }
}

function compareManifest(actual, expected) {
  return stableJson(actual) === stableJson(expected);
}

function buildManifest(cases, generatedAt) {
  return {
    version: 1,
    generatedAt,
    cases: cases
      .map(({ path, testCase }) => ({
        id: testCase.id,
        path,
        direction: testCase.direction,
        features: testCase.features,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}

async function validateRequiredFiles(caseDir, testCase, label, errors) {
  const requiredFiles = requiredFilesByDirection[testCase.direction] ?? [];

  for (const filename of requiredFiles) {
    const path = join(caseDir, filename);
    if (!(await fileExists(path))) {
      errors.push(`${label}: missing required file ${filename}`);
    }
  }
}

async function validateExpectedDiagnostics(
  caseDir,
  label,
  validateDiagnostics,
  errors,
) {
  const diagnosticsPath = join(caseDir, "expected.diagnostics.json");
  if (!(await fileExists(diagnosticsPath))) {
    return;
  }

  try {
    validateJson(
      validateDiagnostics,
      await readJson(diagnosticsPath),
      relative(rootPath, diagnosticsPath),
      errors,
    );
  } catch (error) {
    errors.push(
      `${label}: invalid JSON in expected.diagnostics.json: ${error.message}`,
    );
  }
}

function assertUniqueCaseIds(cases, errors) {
  const seen = new Map();
  for (const { path, testCase } of cases) {
    const previous = seen.get(testCase.id);
    if (previous) {
      errors.push(
        `${path}: duplicate fixture id ${testCase.id}; first seen in ${previous}`,
      );
    } else {
      seen.set(testCase.id, path);
    }
  }
}

function validateManifestCoverage(manifest, cases, errors) {
  const casePaths = new Set(cases.map(({ path }) => path));
  const manifestPaths = new Set();
  const manifestCases = Array.isArray(manifest.cases) ? manifest.cases : [];

  for (const manifestCase of manifestCases) {
    manifestPaths.add(manifestCase.path);
    if (!casePaths.has(manifestCase.path)) {
      errors.push(
        `fixtures/manifest.json: references missing case ${manifestCase.path}`,
      );
    }
  }

  for (const { path } of cases) {
    if (!manifestPaths.has(path)) {
      errors.push(`fixtures/manifest.json: missing discovered case ${path}`);
    }
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});
const fixtureSchema = await readJson(
  join(rootPath, "schema/fixture.schema.json"),
);
const diagnosticsSchema = await readJson(
  join(rootPath, "schema/diagnostics.schema.json"),
);
const manifestSchema = await readJson(
  join(rootPath, "schema/manifest.schema.json"),
);

const validateFixture = ajv.compile(fixtureSchema);
const validateDiagnostics = ajv.compile(diagnosticsSchema);
const validateManifest = ajv.compile(manifestSchema);

const errors = [];
let manifest = {};
try {
  manifest = await readJson(manifestPath);
} catch (error) {
  errors.push(`fixtures/manifest.json: invalid JSON: ${error.message}`);
}
validateJson(validateManifest, manifest, "fixtures/manifest.json", errors);
validateGeneratedAt(manifest.generatedAt, "fixtures/manifest.json", errors);

const caseFiles = await findCaseFiles(rootPath);
const cases = [];

for (const caseFile of caseFiles) {
  const path = relative(rootPath, caseFile);
  let testCase;

  try {
    testCase = await readJson(caseFile);
  } catch (error) {
    errors.push(`${path}: invalid JSON: ${error.message}`);
    continue;
  }

  validateJson(validateFixture, testCase, path, errors);
  cases.push({ path, testCase });

  const caseDir = dirname(caseFile);
  await validateRequiredFiles(caseDir, testCase, path, errors);
  await validateExpectedDiagnostics(caseDir, path, validateDiagnostics, errors);
}

assertUniqueCaseIds(cases, errors);
validateManifestCoverage(manifest, cases, errors);

const generatedAt =
  typeof manifest.generatedAt === "string" &&
  dateTimePattern.test(manifest.generatedAt) &&
  !Number.isNaN(Date.parse(manifest.generatedAt))
    ? manifest.generatedAt
    : new Date().toISOString();
const expectedManifest = buildManifest(cases, generatedAt);

if (writeManifest) {
  expectedManifest.generatedAt = new Date().toISOString();
  await writeFile(manifestPath, stableJson(expectedManifest), "utf8");
  console.log(
    `Wrote fixture manifest with ${expectedManifest.cases.length} cases.`,
  );
} else if (!compareManifest(manifest, expectedManifest)) {
  errors.push(
    "fixtures/manifest.json is stale. Run `node tools/fixtures/validate-fixtures.mjs --write` to regenerate it.",
  );
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = 1;
} else {
  console.log(`Validated ${caseFiles.length} fixture cases.`);
}
