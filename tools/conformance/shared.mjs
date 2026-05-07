import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const fixturesRoot = resolve(root, "fixtures");

export async function loadManifest() {
  return JSON.parse(
    await readFile(resolve(fixturesRoot, "manifest.json"), "utf8"),
  );
}

export async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function normalizeMarkdown(markdown) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
}

export function normalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJson(value[key])]),
    );
  }
  return value;
}

export function normalizeAdf(value) {
  return normalizeJson(mergeAdjacentTextNodes(value));
}

export function normalizeDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => {
    const normalized = {
      severity: diagnostic.severity,
      code: diagnostic.code,
    };
    if (diagnostic.path !== undefined) normalized.path = diagnostic.path;
    if (diagnostic.fallback !== undefined)
      normalized.fallback = diagnostic.fallback;
    return normalized;
  });
}

export function assertMarkdownEqual(actual, expected, id) {
  assert.equal(normalizeMarkdown(actual), normalizeMarkdown(expected), id);
}

export function assertJsonEqual(actual, expected, id) {
  assert.deepEqual(normalizeJson(actual), normalizeJson(expected), id);
}

export function assertAdfEqual(actual, expected, id) {
  assert.deepEqual(normalizeAdf(actual), normalizeAdf(expected), id);
}

export function assertDiagnosticsEqual(actual, expected, id) {
  assert.deepEqual(
    normalizeDiagnostics(actual),
    normalizeDiagnostics(expected),
    `${id} diagnostics`,
  );
}

function mergeAdjacentTextNodes(value) {
  if (Array.isArray(value)) {
    const merged = [];
    for (const item of value.map((entry) => mergeAdjacentTextNodes(entry))) {
      const previous = merged[merged.length - 1];
      if (
        previous?.type === "text" &&
        item?.type === "text" &&
        JSON.stringify(normalizeJson(previous.marks ?? [])) ===
          JSON.stringify(normalizeJson(item.marks ?? []))
      ) {
        previous.text = `${previous.text ?? ""}${item.text ?? ""}`;
      } else {
        merged.push(item);
      }
    }
    return merged;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        mergeAdjacentTextNodes(entry),
      ]),
    );
  }
  return value;
}
