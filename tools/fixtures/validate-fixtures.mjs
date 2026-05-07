import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const fixturesRoot = new URL("../../fixtures/", import.meta.url);

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

function assertCaseShape(testCase, path) {
  const required = [
    "id",
    "direction",
    "description",
    "profile",
    "options",
    "features",
    "expectedLoss",
    "skip",
    "xfail"
  ];

  for (const key of required) {
    if (!(key in testCase)) {
      throw new Error(`${path} is missing required key ${key}`);
    }
  }

  if (!["adf-to-md", "md-to-adf", "roundtrip"].includes(testCase.direction)) {
    throw new Error(`${path} has invalid direction ${testCase.direction}`);
  }
}

const rootPath = fixturesRoot.pathname;
const manifest = await readJson(join(rootPath, "manifest.json"));
const caseFiles = await findCaseFiles(rootPath);
const casePaths = new Set(caseFiles.map((path) => relative(rootPath, path)));

for (const manifestCase of manifest.cases) {
  if (!casePaths.has(manifestCase.path)) {
    throw new Error(`Manifest references missing case ${manifestCase.path}`);
  }
}

for (const caseFile of caseFiles) {
  const testCase = await readJson(caseFile);
  const relativePath = relative(rootPath, caseFile);
  assertCaseShape(testCase, relativePath);
}

console.log(`Validated ${caseFiles.length} fixture cases.`);
