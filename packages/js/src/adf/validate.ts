import type { AdfDocument } from "./types.js";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function parseAdf(value: unknown): AdfDocument {
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  ) {
    return value as AdfDocument;
  }

  throw new Error("Invalid ADF root: expected doc version 1.");
}

export function validateAdf(value: unknown): ValidationResult {
  try {
    parseAdf(value);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Invalid ADF."]
    };
  }
}
