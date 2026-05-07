import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = resolve(here, "../dist/src/index.js")

if (!existsSync(distEntry)) {
  throw new Error(
    "JS package is not built. Run `npm run build --workspace packages/js` before tests.",
  )
}

const { adfToMarkdown, markdownToAdf } = await import(
  pathToFileURL(distEntry).href
)

const validAdf = {
  version: 1,
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
}

const invalidNestedBlockAdf = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Bad" }] },
      ],
    },
  ],
}

test("conversion options validate the only supported Markdown dialect", () => {
  assert.throws(
    () => adfToMarkdown(validAdf, { markdownDialect: "commonmark" }),
    /Unsupported markdownDialect 'commonmark'/,
  )
  assert.throws(
    () => markdownToAdf("Hello", { markdownDialect: "commonmark" }),
    /Unsupported markdownDialect 'commonmark'/,
  )
})

test("conversion profiles are accepted but do not change Phase 1 behavior", () => {
  for (const profile of ["jira", "confluence", "portableMarkdown"]) {
    assert.deepEqual(adfToMarkdown(validAdf, { profile }), {
      value: "Hello",
      diagnostics: [],
    })
    assert.deepEqual(markdownToAdf("Hello", { profile }), {
      value: validAdf,
      diagnostics: [],
    })
  }

  assert.throws(
    () => markdownToAdf("Hello", { profile: "unknown" }),
    /Unsupported profile 'unknown'/,
  )
})

test("validateAdf controls pinned schema validation during ADF conversion", () => {
  const validated = adfToMarkdown(invalidNestedBlockAdf)
  assert.equal(validated.value, "")
  assert.equal(validated.diagnostics[0]?.severity, "error")
  assert.equal(validated.diagnostics[0]?.code, "InvalidAdfRoot")

  const skipped = adfToMarkdown(invalidNestedBlockAdf, { validateAdf: false })
  assert.deepEqual(skipped, {
    value: "",
    diagnostics: [
      {
        severity: "warning",
        code: "UnsupportedNode",
        path: "/content/0/content/0",
        message: "Unsupported inline ADF node 'paragraph' was omitted.",
      },
    ],
  })
})

test("normalizeAdf is accepted as a future-only no-op", () => {
  assert.deepEqual(markdownToAdf("Hello", { normalizeAdf: true }), {
    value: validAdf,
    diagnostics: [],
  })
  assert.deepEqual(markdownToAdf("Hello", { normalizeAdf: false }), {
    value: validAdf,
    diagnostics: [],
  })
})

test("ADF to Markdown output has no final newline", () => {
  assert.equal(adfToMarkdown(validAdf).value, "Hello")
})
