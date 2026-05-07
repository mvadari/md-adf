import type { AdfDocument } from "../adf/types.js";
import type { ConversionOptions, ConversionResult } from "../options.js";

export function adfToMarkdown(
  _adf: AdfDocument | unknown,
  _options: ConversionOptions = {}
): ConversionResult<string> {
  throw new Error("ADF to Markdown conversion is not implemented yet.");
}
