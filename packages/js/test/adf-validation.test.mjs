import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../..")
const distEntry = resolve(here, "../dist/src/adf/validate.js")
const invalidFixtures = resolve(root, "fixtures/invalid/adf")

if (!existsSync(distEntry)) {
  throw new Error(
    "JS package is not built. Run `npm run build --workspace packages/js` before tests.",
  )
}

const { parseAdf, validateAdf } = await import(pathToFileURL(distEntry).href)

test("validateAdf reports stable errors for invalid ADF fixtures", async () => {
  for (const fixtureName of await readdir(invalidFixtures)) {
    const fixtureDir = resolve(invalidFixtures, fixtureName)
    const input = JSON.parse(
      await readFile(resolve(fixtureDir, "input.adf.json"), "utf8"),
    )
    const expectedErrors = JSON.parse(
      await readFile(resolve(fixtureDir, "expected.errors.json"), "utf8"),
    )

    assert.deepEqual(validateAdf(input), {
      valid: false,
      errors: expectedErrors,
    })
  }
})

test("parseAdf can skip pinned schema validation when requested", async () => {
  const input = JSON.parse(
    await readFile(
      resolve(invalidFixtures, "block-inside-paragraph/input.adf.json"),
      "utf8",
    ),
  )

  assert.equal(validateAdf(input, { validateAdf: false }).valid, true)
  assert.equal(parseAdf(input, { validateAdf: false }), input)
})
