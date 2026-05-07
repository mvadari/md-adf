import type { AdfDocument, AdfNode } from "../adf/types.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { ConversionOptions, ConversionResult } from "../options.js";

export function markdownToAdf(
  markdown: string,
  _options: ConversionOptions = {},
): ConversionResult<AdfDocument> {
  const diagnostics: Diagnostic[] = [];
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const content = parseBlocks(lines, 0, lines.length, diagnostics).nodes;

  return {
    value: {
      version: 1,
      type: "doc",
      content,
    },
    diagnostics,
  };
}

type BlockParseResult = {
  nodes: AdfNode[];
  next: number;
};

type InlineParseResult = {
  nodes: AdfNode[];
  next: number;
  closed: boolean;
};

type ListMarker = {
  ordered: boolean;
  markerLength: number;
  start: number;
};

function parseBlocks(
  lines: string[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
  baseIndent = 0,
): BlockParseResult {
  const nodes: AdfNode[] = [];
  let index = start;

  while (index < end) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent < baseIndent) break;

    const trimmed = line.slice(baseIndent);
    const heading = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(trimmed);
    if (heading) {
      nodes.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInlineContent(heading[2], diagnostics),
      });
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      nodes.push({ type: "rule" });
      index += 1;
      continue;
    }

    const fence = /^(`{3,}|~{3,})([^`]*)$/.exec(trimmed);
    if (fence) {
      const fenceMarker = fence[1];
      const fenceChar = fenceMarker[0];
      const language = fence[2].trim().split(/\s+/)[0] ?? "";
      const codeLines: string[] = [];
      index += 1;
      while (index < end) {
        const candidate = (lines[index] ?? "").slice(baseIndent);
        if (candidate.startsWith(fenceChar.repeat(fenceMarker.length))) {
          break;
        }
        codeLines.push(
          (lines[index] ?? "").slice(
            Math.min(baseIndent, countIndent(lines[index] ?? "")),
          ),
        );
        index += 1;
      }
      if (index >= end) {
        diagnostics.push({
          severity: "warning",
          code: "UnclosedCodeFence",
          message:
            "Markdown code fence was not closed; consumed the rest of the document.",
        });
      } else {
        index += 1;
      }
      const node: AdfNode = {
        type: "codeBlock",
        content: [{ type: "text", text: codeLines.join("\n") }],
      };
      if (language) node.attrs = { language };
      nodes.push(node);
      continue;
    }

    if (/^>[ \t]?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < end) {
        const current = (lines[index] ?? "").slice(baseIndent);
        if (current.trim() !== "" && !/^>[ \t]?/.test(current)) break;
        quoteLines.push(current.replace(/^>[ \t]?/, ""));
        index += 1;
      }
      nodes.push({
        type: "blockquote",
        content: parseBlocks(quoteLines, 0, quoteLines.length, diagnostics)
          .nodes,
      });
      continue;
    }

    const listMarker = parseListMarker(trimmed);
    if (listMarker) {
      const result = parseList(
        lines,
        index,
        end,
        diagnostics,
        baseIndent,
        listMarker,
      );
      nodes.push(result.node);
      index = result.next;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < end) {
      const current = lines[index] ?? "";
      const currentTrimmed = current.slice(baseIndent);
      if (current.trim() === "") break;
      if (index !== start && startsBlock(currentTrimmed)) break;
      paragraphLines.push(currentTrimmed);
      index += 1;
    }
    nodes.push({
      type: "paragraph",
      content: parseInlineContent(
        joinParagraphLines(paragraphLines),
        diagnostics,
      ),
    });
  }

  return { nodes, next: index };
}

function startsBlock(line: string): boolean {
  return (
    /^(#{1,6})[ \t]+/.test(line) ||
    /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^(`{3,}|~{3,})/.test(line) ||
    /^>[ \t]?/.test(line) ||
    parseListMarker(line) !== null
  );
}

function parseList(
  lines: string[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
  baseIndent: number,
  firstMarker: ListMarker,
): { node: AdfNode; next: number } {
  const listType = firstMarker.ordered ? "orderedList" : "bulletList";
  const items: AdfNode[] = [];
  let index = start;

  while (index < end) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (countIndent(line) !== baseIndent) break;
    const marker = parseListMarker(line.slice(baseIndent));
    if (!marker || marker.ordered !== firstMarker.ordered) break;

    const itemLines: string[] = [line.slice(baseIndent + marker.markerLength)];
    index += 1;
    while (index < end) {
      const current = lines[index] ?? "";
      if (current.trim() === "") {
        itemLines.push("");
        index += 1;
        continue;
      }
      const indent = countIndent(current);
      if (indent === baseIndent && parseListMarker(current.slice(baseIndent)))
        break;
      if (indent < baseIndent + 2) break;
      itemLines.push(current.slice(Math.min(baseIndent + 2, indent)));
      index += 1;
    }

    const itemContent = parseBlocks(
      itemLines,
      0,
      itemLines.length,
      diagnostics,
    ).nodes;
    items.push({ type: "listItem", content: itemContent });
  }

  const node: AdfNode = { type: listType, content: items };
  if (firstMarker.ordered && firstMarker.start !== 1) {
    node.attrs = { order: firstMarker.start };
  }
  return { node, next: index };
}

function parseListMarker(line: string): ListMarker | null {
  const bullet = /^[-+*][ \t]+/.exec(line);
  if (bullet) {
    return { ordered: false, markerLength: bullet[0].length, start: 1 };
  }
  const ordered = /^(\d{1,9})[.)][ \t]+/.exec(line);
  if (ordered) {
    return {
      ordered: true,
      markerLength: ordered[0].length,
      start: Number(ordered[1]),
    };
  }
  return null;
}

function joinParagraphLines(lines: string[]): string {
  let result = "";
  lines.forEach((line, index) => {
    if (index > 0 && !result.endsWith("\\\n")) result += " ";
    if (line.endsWith("\\") && !line.endsWith("\\\\")) {
      result += `${line.slice(0, -1)}\\\n`;
    } else {
      result += line;
    }
  });
  return result;
}

function countIndent(line: string): number {
  let count = 0;
  for (const char of line) {
    if (char === " ") count += 1;
    else if (char === "\t") count += 4;
    else break;
  }
  return count;
}

function parseInlineContent(
  markdown: string,
  diagnostics: Diagnostic[],
): AdfNode[] {
  return parseInlines(markdown, 0, diagnostics, []).nodes;
}

function parseInlines(
  source: string,
  start: number,
  diagnostics: Diagnostic[],
  terminators: string[],
): InlineParseResult {
  const nodes: AdfNode[] = [];
  let index = start;

  while (index < source.length) {
    const terminator = terminators.find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (terminator) {
      return { nodes, next: index + terminator.length, closed: true };
    }

    if (source.startsWith("\\\n", index)) {
      nodes.push({ type: "hardBreak" });
      index += 2;
      continue;
    }

    if (source[index] === "\\" && index + 1 < source.length) {
      addText(nodes, source[index + 1]);
      index += 2;
      continue;
    }

    const code = parseCodeSpan(source, index);
    if (code) {
      addText(nodes, code.text, [{ type: "code" }]);
      index = code.next;
      continue;
    }

    if (source.startsWith("**", index)) {
      const parsed = parseInlines(source, index + 2, diagnostics, ["**"]);
      if (parsed.closed) {
        nodes.push(...addMark(parsed.nodes, { type: "strong" }));
        index = parsed.next;
        continue;
      }
    }

    if (source.startsWith("~~", index)) {
      const parsed = parseInlines(source, index + 2, diagnostics, ["~~"]);
      if (parsed.closed) {
        nodes.push(...addMark(parsed.nodes, { type: "strike" }));
        index = parsed.next;
        continue;
      }
    }

    if (source[index] === "*") {
      const parsed = parseInlines(source, index + 1, diagnostics, ["*"]);
      if (parsed.closed) {
        nodes.push(...addMark(parsed.nodes, { type: "em" }));
        index = parsed.next;
        continue;
      }
    }

    const link = parseLink(source, index, diagnostics);
    if (link) {
      nodes.push(...link.nodes);
      index = link.next;
      continue;
    }

    addText(nodes, source[index]);
    index += 1;
  }

  return { nodes, next: index, closed: terminators.length === 0 };
}

function parseCodeSpan(
  source: string,
  index: number,
): { text: string; next: number } | null {
  const opener = /^`+/.exec(source.slice(index))?.[0];
  if (!opener) return null;
  const close = source.indexOf(opener, index + opener.length);
  if (close === -1) return null;
  let text = source.slice(index + opener.length, close);
  if (text.startsWith(" ") && text.endsWith(" ") && text.trim().length > 0) {
    text = text.slice(1, -1);
  }
  return { text, next: close + opener.length };
}

function parseLink(
  source: string,
  index: number,
  diagnostics: Diagnostic[],
): { nodes: AdfNode[]; next: number } | null {
  if (source[index] !== "[") return null;
  const labelEnd = findUnescaped(source, "]", index + 1);
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return null;
  const destinationEnd = findLinkClose(source, labelEnd + 2);
  if (destinationEnd === -1) return null;

  const label = source.slice(index + 1, labelEnd);
  const rawDestination = source.slice(labelEnd + 2, destinationEnd).trim();
  const match = /^(\S+?)(?:\s+"([^"]*)")?$/.exec(rawDestination);
  if (!match) {
    diagnostics.push({
      severity: "warning",
      code: "InvalidLinkSyntax",
      message:
        "Markdown link destination was invalid; rendered link label as plain text.",
    });
    return {
      nodes: parseInlineContent(label, diagnostics),
      next: destinationEnd + 1,
    };
  }

  const mark: Record<string, unknown> = {
    type: "link",
    attrs: match[2]
      ? { href: unescapeMarkdown(match[1]), title: match[2] }
      : { href: unescapeMarkdown(match[1]) },
  };
  return {
    nodes: addMark(parseInlineContent(label, diagnostics), mark),
    next: destinationEnd + 1,
  };
}

function findUnescaped(source: string, needle: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\\" && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (source[index] === needle) return index;
  }
  return -1;
}

function findLinkClose(source: string, start: number): number {
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === ")") {
      return index;
    }
  }
  return -1;
}

function addText(
  nodes: AdfNode[],
  text: string,
  marks?: Array<Record<string, unknown>>,
): void {
  if (text.length === 0) return;
  const previous = nodes[nodes.length - 1];
  if (
    previous?.type === "text" &&
    previous.text !== undefined &&
    JSON.stringify(previous.marks ?? []) === JSON.stringify(marks ?? [])
  ) {
    previous.text += text;
    return;
  }
  const node: AdfNode = { type: "text", text };
  if (marks && marks.length > 0) node.marks = marks;
  nodes.push(node);
}

function addMark(nodes: AdfNode[], mark: Record<string, unknown>): AdfNode[] {
  return nodes.map((node) => {
    if (node.type === "text") {
      return { ...node, marks: [...(node.marks ?? []), mark] };
    }
    return node;
  });
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!|<>~\s])/g, "$1");
}
