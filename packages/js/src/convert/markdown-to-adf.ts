import type { AdfDocument } from "../adf/types.js";
import type { ConversionOptions, ConversionResult } from "../options.js";

export function markdownToAdf(
  _markdown: string,
  _options: ConversionOptions = {}
): ConversionResult<AdfDocument> {
  throw new Error("Markdown to ADF conversion is not implemented yet.");
}
