import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

import type { AdfDocument, AdfNode } from "../adf/types.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  resolveConversionOptions,
  type ConversionOptions,
  type ConversionResult,
} from "../options.js";

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  checked?: boolean | null;
  align?: Array<string | null>;
};

const markdownParser = unified().use(remarkParse).use(remarkGfm);

export function markdownToAdf(
  markdown: string,
  options: ConversionOptions = {},
): ConversionResult<AdfDocument> {
  resolveConversionOptions(options);
  const diagnostics: Diagnostic[] = [];
  const tree = markdownParser.parse(markdown.replace(/\r\n?/g, "\n"));
  const content = blockChildren(
    (tree as MarkdownNode).children ?? [],
    diagnostics,
    "/content",
  );

  return {
    value: {
      version: 1,
      type: "doc",
      content,
    },
    diagnostics,
  };
}

function blockChildren(
  nodes: MarkdownNode[],
  diagnostics: Diagnostic[],
  path: string,
): AdfNode[] {
  return nodes.flatMap((node, index) =>
    blockNode(node, diagnostics, `${path}/${index}`),
  );
}

function blockNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode[] {
  switch (node.type) {
    case "paragraph":
      return [
        {
          type: "paragraph",
          content: inlineChildren(node.children ?? [], diagnostics),
        },
      ];
    case "heading":
      return [
        {
          type: "heading",
          attrs: { level: Math.min(6, Math.max(1, node.depth ?? 1)) },
          content: inlineChildren(node.children ?? [], diagnostics),
        },
      ];
    case "thematicBreak":
      return [{ type: "rule" }];
    case "blockquote":
      return [
        {
          type: "blockquote",
          content: blockChildren(
            node.children ?? [],
            diagnostics,
            `${path}/content`,
          ),
        },
      ];
    case "list":
      return [listNode(node, diagnostics, path)];
    case "code":
      return [codeBlockNode(node)];
    case "table":
      return [tableNode(node, diagnostics, path)];
    case "html":
      return paragraphFromText(node.value ?? "");
    default:
      return textFallbackBlock(node);
  }
}

function listNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const list: AdfNode = {
    type: node.ordered ? "orderedList" : "bulletList",
    content: (node.children ?? [])
      .filter((child) => child.type === "listItem")
      .map((child, index) =>
        listItemNode(child, diagnostics, `${path}/content/${index}`),
      ),
  };
  if (node.ordered && node.start && node.start !== 1) {
    list.attrs = { order: node.start };
  }
  return list;
}

function listItemNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const content = blockChildren(
    node.children ?? [],
    diagnostics,
    `${path}/content`,
  );
  return { type: "listItem", content };
}

function codeBlockNode(node: MarkdownNode): AdfNode {
  const codeBlock: AdfNode = {
    type: "codeBlock",
    content: [{ type: "text", text: node.value ?? "" }],
  };
  if (node.lang) codeBlock.attrs = { language: node.lang };
  return codeBlock;
}

function tableNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const rows = node.children ?? [];
  const table: AdfNode = {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: (row.children ?? []).map((cell) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: inlineChildren(cell.children ?? [], diagnostics),
          },
        ],
      })),
    })),
  };
  if (node.align && node.align.some((align) => align !== null)) {
    diagnostics.push({
      severity: "warning",
      code: "UnsupportedTableAlignment",
      path,
      message:
        "Markdown table column alignment is not representable in ADF and was omitted.",
      fallback: "omit",
    });
  }
  return table;
}

function textFallbackBlock(node: MarkdownNode): AdfNode[] {
  const text = plainText(node);
  return text.length > 0 ? paragraphFromText(text) : [];
}

function paragraphFromText(text: string): AdfNode[] {
  return text.length > 0
    ? [{ type: "paragraph", content: [{ type: "text", text }] }]
    : [];
}

function inlineChildren(
  nodes: MarkdownNode[],
  diagnostics: Diagnostic[],
  marks: Array<Record<string, unknown>> = [],
): AdfNode[] {
  const output: AdfNode[] = [];
  for (const node of nodes) {
    for (const child of inlineNode(node, marks, diagnostics)) {
      appendInline(output, child);
    }
  }
  return output;
}

function inlineNode(
  node: MarkdownNode,
  marks: Array<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): AdfNode[] {
  switch (node.type) {
    case "text":
      return textNode((node.value ?? "").replace(/\n/g, " "), marks);
    case "emphasis":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "em" },
      ]);
    case "strong":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "strong" },
      ]);
    case "delete":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "strike" },
      ]);
    case "inlineCode":
      return textNode(node.value ?? "", codeMarks(marks, diagnostics));
    case "link": {
      const attrs: Record<string, unknown> = { href: node.url ?? "" };
      if (node.title) attrs.title = node.title;
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "link", attrs },
      ]);
    }
    case "break":
      return [{ type: "hardBreak" }];
    case "image": {
      const attrs: Record<string, unknown> = { href: node.url ?? "" };
      if (node.title) attrs.title = node.title;
      return textNode(node.alt ?? node.url ?? "", [
        ...marks,
        { type: "link", attrs },
      ]);
    }
    case "html":
      return textNode(node.value ?? "", marks);
    default:
      return textNode(plainText(node), marks);
  }
}

function textNode(
  text: string,
  marks: Array<Record<string, unknown>>,
): AdfNode[] {
  if (text.length === 0) return [];
  const node: AdfNode = { type: "text", text };
  if (marks.length > 0) node.marks = marks;
  return [node];
}

function codeMarks(
  marks: Array<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): Array<Record<string, unknown>> {
  const compatibleMarks = marks.filter((mark) => mark.type === "link");
  if (compatibleMarks.length !== marks.length) {
    diagnostics.push({
      severity: "warning",
      code: "CodeMarkDropsOtherMarks",
      message:
        "ADF code text cannot contain non-code formatting marks; non-code marks were ignored.",
      fallback: "drop-marks",
    });
  }
  return [...compatibleMarks, { type: "code" }];
}

function appendInline(nodes: AdfNode[], node: AdfNode): void {
  const previous = nodes[nodes.length - 1];
  if (
    node.type === "text" &&
    previous?.type === "text" &&
    previous.text !== undefined &&
    node.text !== undefined &&
    JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
  ) {
    previous.text += node.text;
    return;
  }
  nodes.push(node);
}

function plainText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => plainText(child)).join("");
}
