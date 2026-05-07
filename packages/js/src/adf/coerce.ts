import type { AdfDocument, AdfNode } from "./types.js"

/**
 * Coerces an ADF document or fragment into a document shape for rendering.
 */
export function coerceAdfDocument(value: unknown): AdfDocument {
  if (isAdfDocument(value)) return value
  if (hasAdfDocumentVersion(value)) {
    throw new Error("Invalid ADF root: expected doc version 1.")
  }
  if (Array.isArray(value)) return { version: 1, type: "doc", content: value }
  if (isAdfNode(value)) return { version: 1, type: "doc", content: [value] }

  throw new Error(
    "Invalid ADF root: expected doc version 1, content array, or ADF node.",
  )
}

/**
 * Detects document-shaped input that failed the stricter document guard.
 */
function hasAdfDocumentVersion(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version !== undefined
  )
}

/**
 * Checks the minimal document structure needed by the converters.
 */
export function isAdfDocument(value: unknown): value is AdfDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  )
}

/**
 * Checks the minimal node structure needed by the converters.
 */
export function isAdfNode(value: unknown): value is AdfNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  )
}
