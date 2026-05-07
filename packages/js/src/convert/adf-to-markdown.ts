import type { AdfDocument } from "../adf/types.js";
import { parseAdf } from "../adf/validate.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  codeFenceFor,
  escapeLinkDestination,
  escapeLinkTitle,
  escapeMarkdownText,
  renderCodeSpan,
} from "../markdown/escape.js";
import type { ConversionOptions, ConversionResult } from "../options.js";

type AdfNode = AdfDocument["content"][number];
type AdfMark = NonNullable<AdfNode["marks"]>[number];

const supportedNodes = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "rule",
  "text",
  "hardBreak",
]);

const markOrder = ["link", "strong", "em", "strike"] as const;
const supportedMarks = new Set(["strong", "em", "strike", "code", "link"]);

export function adfToMarkdown(
  adf: AdfDocument | unknown,
  options: ConversionOptions = {},
): ConversionResult<string> {
  const diagnostics: Diagnostic[] = [];
  let document: AdfDocument;

  try {
    document = parseAdf(adf, options);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "InvalidAdfRoot",
      path: "",
      message: error instanceof Error ? error.message : "Invalid ADF root.",
    });
    return { value: "", diagnostics };
  }

  return {
    value: renderBlocks(document.content, diagnostics, "/content").trimEnd(),
    diagnostics,
  };
}

function renderBlocks(
  nodes: AdfNode[] = [],
  diagnostics: Diagnostic[],
  path: string,
): string {
  return nodes
    .map((node, index) => renderBlock(node, diagnostics, `${path}/${index}`))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function renderBlock(
  node: AdfNode,
  diagnostics: Diagnostic[],
  path: string,
): string {
  if (!supportedNodes.has(node.type)) {
    diagnostics.push({
      severity: "warning",
      code: "UnsupportedNode",
      path,
      message: `Unsupported ADF node '${node.type}' was omitted.`,
    });
    return "";
  }

  switch (node.type) {
    case "paragraph":
      return renderInlineContent(
        node.content ?? [],
        diagnostics,
        `${path}/content`,
      );
    case "heading": {
      const rawLevel = Number(node.attrs?.level ?? 1);
      const level = Math.min(
        6,
        Math.max(1, Number.isFinite(rawLevel) ? rawLevel : 1),
      );
      return `${"#".repeat(level)} ${renderInlineContent(node.content ?? [], diagnostics, `${path}/content`)}`;
    }
    case "blockquote":
      return prefixLines(
        renderBlocks(node.content ?? [], diagnostics, `${path}/content`),
        "> ",
      );
    case "bulletList":
      return renderList(node, diagnostics, path, false);
    case "orderedList":
      return renderList(node, diagnostics, path, true);
    case "listItem":
      return renderBlocks(node.content ?? [], diagnostics, `${path}/content`);
    case "codeBlock": {
      const text = collectPlainText(
        node.content ?? [],
        diagnostics,
        `${path}/content`,
      );
      const language =
        typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const fence = codeFenceFor(text);
      return `${fence}${language}\n${text.replace(/\n$/, "")}\n${fence}`;
    }
    case "rule":
      return "---";
    default:
      diagnostics.push({
        severity: "warning",
        code: "InvalidContainer",
        path,
        message: `ADF node '${node.type}' cannot be rendered as a block.`,
      });
      return "";
  }
}

function renderList(
  node: AdfNode,
  diagnostics: Diagnostic[],
  path: string,
  ordered: boolean,
): string {
  const start = Number(node.attrs?.order ?? 1);
  return (node.content ?? [])
    .map((item, index) => {
      if (item.type !== "listItem") {
        diagnostics.push({
          severity: "warning",
          code: "InvalidContainer",
          path: `${path}/content/${index}`,
          message: `Expected listItem inside ${node.type}; omitted '${item.type}'.`,
        });
        return "";
      }

      const marker = ordered
        ? `${(Number.isFinite(start) ? start : 1) + index}. `
        : "- ";
      const body = renderBlock(item, diagnostics, `${path}/content/${index}`);
      return marker + indentListContinuation(body);
    })
    .filter((item) => item.length > 0)
    .join("\n");
}

function indentListContinuation(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? prefix.trimEnd() : `${prefix}${line}`))
    .join("\n");
}

function renderInlineContent(
  nodes: AdfNode[],
  diagnostics: Diagnostic[],
  path: string,
): string {
  return nodes
    .map((node, index) =>
      renderInline(node, diagnostics, `${path}/${index}`, index === 0),
    )
    .join("");
}

function renderInline(
  node: AdfNode,
  diagnostics: Diagnostic[],
  path: string,
  atLineStart: boolean,
): string {
  switch (node.type) {
    case "text":
      return renderMarkedText(
        node.text ?? "",
        node.marks ?? [],
        diagnostics,
        path,
        atLineStart,
      );
    case "hardBreak":
      return "\\\n";
    default:
      diagnostics.push({
        severity: "warning",
        code: "UnsupportedNode",
        path,
        message: `Unsupported inline ADF node '${node.type}' was omitted.`,
      });
      return "";
  }
}

function renderMarkedText(
  text: string,
  marks: AdfMark[],
  diagnostics: Diagnostic[],
  path: string,
  atLineStart: boolean,
): string {
  const knownMarks = marks.filter((mark) => {
    if (typeof mark.type === "string" && supportedMarks.has(mark.type)) {
      return true;
    }
    diagnostics.push({
      severity: "warning",
      code: "UnsupportedMark",
      path,
      message: `Unsupported ADF mark '${String(mark.type)}' was ignored.`,
    });
    return false;
  });

  if (knownMarks.some((mark) => mark.type === "code")) {
    if (knownMarks.length > 1) {
      diagnostics.push({
        severity: "warning",
        code: "CodeMarkDropsOtherMarks",
        path,
        message:
          "Markdown code spans cannot contain nested marks; non-code marks were ignored.",
      });
    }
    return renderCodeSpan(text);
  }

  let rendered = escapeMarkdownText(text, atLineStart);
  for (const markType of markOrder) {
    const mark = knownMarks.find((candidate) => candidate.type === markType);
    if (!mark) continue;

    if (markType === "link") {
      const attrs = mark.attrs as Record<string, unknown> | undefined;
      const href = typeof attrs?.href === "string" ? attrs.href : "";
      if (!href) {
        diagnostics.push({
          severity: "warning",
          code: "InvalidLinkMark",
          path,
          message: "ADF link mark without href was rendered as plain text.",
        });
        continue;
      }
      const title =
        typeof attrs?.title === "string"
          ? ` "${escapeLinkTitle(attrs.title)}"`
          : "";
      rendered = `[${rendered}](${escapeLinkDestination(href)}${title})`;
    } else if (markType === "strong") {
      rendered = `**${rendered}**`;
    } else if (markType === "em") {
      rendered = `*${rendered}*`;
    } else if (markType === "strike") {
      rendered = `~~${rendered}~~`;
    }
  }
  return rendered;
}

function collectPlainText(
  nodes: AdfNode[],
  diagnostics: Diagnostic[],
  path: string,
): string {
  return nodes
    .map((node, index) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return "\n";
      diagnostics.push({
        severity: "warning",
        code: "UnsupportedNode",
        path: `${path}/${index}`,
        message: `Unsupported codeBlock child '${node.type}' was omitted.`,
      });
      return "";
    })
    .join("");
}
