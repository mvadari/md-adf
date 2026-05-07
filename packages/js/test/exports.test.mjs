import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, "..")

test("package export map exposes converter and validation subpaths", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  )

  assert.deepEqual(Object.keys(packageJson.exports).sort(), [
    ".",
    "./adf-to-markdown",
    "./markdown-to-adf",
    "./types",
    "./validate",
  ])

  const [
    root,
    { adfFragmentToMarkdown, adfToMarkdown },
    { markdownToAdf },
    validate,
  ] = await Promise.all([
    import("md-adf"),
    import("md-adf/adf-to-markdown"),
    import("md-adf/markdown-to-adf"),
    import("md-adf/validate"),
    import("md-adf/types"),
  ])

  assert.equal(typeof root.validateAdf, "function")
  assert.equal(typeof root.parseAdf, "function")
  assert.equal(typeof adfToMarkdown, "function")
  assert.equal(typeof adfFragmentToMarkdown, "function")
  assert.equal(typeof markdownToAdf, "function")
  assert.equal(typeof validate.validateAdf, "function")
})

test("browser-safe converter entrypoints do not import Node-only validation", async () => {
  const browserSafeFiles = [
    "dist/src/browser.js",
    "dist/src/convert/adfToMarkdown.js",
    "dist/src/adf/coerce.js",
  ]

  for (const file of browserSafeFiles) {
    const source = await readFile(resolve(packageRoot, file), "utf8")
    assert.doesNotMatch(source, /node:(?:fs|path|module|url)/, file)
    assert.doesNotMatch(source, /adf\/validate/, file)
    assert.doesNotMatch(source, /ajv/, file)
  }
})
