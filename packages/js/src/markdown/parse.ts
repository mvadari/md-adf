export type MarkdownDocument = {
  source: string;
};

export function parseMarkdown(markdown: string): MarkdownDocument {
  return { source: markdown };
}
