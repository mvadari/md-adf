import type { Diagnostic } from "./diagnostics/diagnostic.js";

export type ConversionResult<T> = {
  value: T;
  diagnostics: Diagnostic[];
};

export type ConversionOptions = {
  markdownDialect?: "gfm";
  profile?: "jira" | "confluence" | "portableMarkdown";
  validateAdf?: boolean;
  normalizeAdf?: boolean;
};
