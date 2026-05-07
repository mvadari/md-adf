import type { AdfDocument } from "./types.js"
import { isAdfDocument } from "./coerce.js"
import type { AnySchema } from "ajv-draft-04/dist/index.js"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type ParseAdfOptions = {
  validateAdf?: boolean
}

type SchemaError = {
  instancePath?: string
  keyword?: string
  params?: Record<string, unknown>
  schema?: unknown
  schemaPath?: string
  message?: string
}

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

const schema = loadPinnedAdfSchema()
const require = createRequire(import.meta.url)
const Ajv = require("ajv-draft-04")
  .default as typeof import("ajv-draft-04/dist/index.js").default
const ajv = new Ajv({ allErrors: true, strict: false })
const validatePinnedAdfSchema = ajv.compile(schema as AnySchema)

/**
 * Parses an unknown value as an ADF document, optionally validating it against
 * the pinned schema before returning the typed document.
 */
export function parseAdf(
  value: unknown,
  options: ParseAdfOptions = {},
): AdfDocument {
  if (isAdfDocument(value)) {
    if (options.validateAdf !== false) {
      const valid = validatePinnedAdfSchema(value)
      if (!valid) {
        throw new Error(
          formatSchemaError(validatePinnedAdfSchema.errors ?? [], value),
        )
      }
    }
    return value as AdfDocument
  }

  throw new Error("Invalid ADF root: expected doc version 1.")
}

/**
 * Validates an unknown value as ADF and returns a structured success/error
 * result instead of throwing.
 */
export function validateAdf(
  value: unknown,
  options: ParseAdfOptions = {},
): ValidationResult {
  try {
    parseAdf(value, options)
    return { valid: true, errors: [] }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Invalid ADF."],
    }
  }
}

/**
 * Finds and loads the pinned ADF schema from either source or built package
 * layouts.
 */
function loadPinnedAdfSchema(): unknown {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, "../../schemas/adf-schema.json"),
    resolve(here, "../../../../schemas/adf-schema.json"),
    resolve(here, "../../../../../schemas/adf-schema.json"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, "utf8")) as unknown
    }
  }

  throw new Error("Pinned ADF JSON Schema not found.")
}

/**
 * Converts AJV schema errors into a short human-readable validation message.
 */
function formatSchemaError(errors: SchemaError[], value: unknown): string {
  const error = mostSpecificError(errors, value)
  const path =
    error.instancePath && error.instancePath.length > 0
      ? error.instancePath
      : ""
  const location = path.length > 0 ? ` at ${path}` : ""

  switch (error.keyword) {
    case "required": {
      const missing = String(error.params?.missingProperty ?? "unknown")
      return `Invalid ADF${location}: missing required property '${missing}'.`
    }
    case "additionalProperties": {
      const property = String(error.params?.additionalProperty ?? "unknown")
      return `Invalid ADF${location}: unexpected property '${property}'.`
    }
    case "enum":
      return `Invalid ADF${location}: value is not allowed.`
    case "type":
      return `Invalid ADF${location}: expected ${String(error.params?.type ?? "valid value")}.`
    case "minLength":
      return `Invalid ADF${location}: expected a non-empty string.`
    case "minItems":
      return `Invalid ADF${location}: expected at least one item.`
    default:
      return `Invalid ADF${location}: failed schema constraint '${error.keyword ?? "unknown"}'.`
  }
}

/**
 * Picks the schema error that most closely describes the invalid ADF location.
 */
function mostSpecificError(errors: SchemaError[], value: unknown): SchemaError {
  const relevantErrors = errors.filter(
    (error) => error.keyword !== "anyOf" && error.keyword !== "oneOf",
  )
  const candidates = relevantErrors.length > 0 ? relevantErrors : errors
  const matchingTypeError = candidates.find((error) =>
    errorMatchesActualType(error, value),
  )
  if (matchingTypeError) return matchingTypeError

  return candidates.reduce<SchemaError>(
    (best, error) =>
      errorSpecificity(error) > errorSpecificity(best) ? error : best,
    candidates[0] ?? {},
  )
}

/**
 * Checks whether a required-property error applies to the node or mark type at
 * the reported path.
 */
function errorMatchesActualType(error: SchemaError, value: unknown): boolean {
  if (error.keyword !== "required" || !error.schemaPath) return false

  const definition = /^#\/definitions\/([^/]+)\//.exec(error.schemaPath)?.[1]
  if (!definition) return false

  const expectedType = definition.replace(/_(mark|node)$/, "")
  const parentPath = (error.instancePath ?? "").replace(/\/attrs$/, "")
  const parent = valueAtPointer(value, parentPath)
  return (
    typeof parent === "object" &&
    parent !== null &&
    (parent as { type?: unknown }).type === expectedType
  )
}

/**
 * Resolves a JSON Pointer against a value so schema errors can be matched to
 * the actual ADF node.
 */
function valueAtPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current)) return current[Number(part)]
      if (typeof current === "object" && current !== null) {
        return (current as Record<string, unknown>)[part]
      }
      return undefined
    }, value)
}

/**
 * Scores schema errors by path depth so deeper, more specific failures win.
 */
function errorSpecificity(error: SchemaError): number {
  const base = pathDepth(error.instancePath ?? "")
  return error.keyword === "required" &&
    (error.instancePath ?? "").includes("/attrs")
    ? base + 1
    : base
}

/**
 * Counts the number of JSON Pointer path segments.
 */
function pathDepth(path: string): number {
  return path === "" ? 0 : path.split("/").length
}
