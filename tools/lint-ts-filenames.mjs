import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

const roots = process.argv.slice(2)
const typeScriptFile = /\.(?:[cm]?tsx?|d\.ts)$/
const camelCaseFile = /^[a-z][a-zA-Z0-9]*(?:\.(?:test|spec|d))?$/
const failures = []

if (roots.length === 0) {
  console.error("Usage: node tools/lint-ts-filenames.mjs <directory> [...]")
  process.exit(2)
}

for (const root of roots) {
  await checkDirectory(root)
}

if (failures.length > 0) {
  console.error("TypeScript filenames must be camelCase:")
  for (const file of failures) {
    console.error(`  ${file}`)
  }
  process.exit(1)
}

/**
 * Recursively checks a directory for TypeScript files whose base names are not
 * camelCase.
 */
async function checkDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      await checkDirectory(path)
      continue
    }

    if (!entry.isFile() || !typeScriptFile.test(entry.name)) {
      continue
    }

    const stem = entry.name.replace(/\.(?:[cm]?tsx?|d\.ts)$/, "")
    if (!camelCaseFile.test(stem)) {
      failures.push(relative(process.cwd(), path))
    }
  }
}
