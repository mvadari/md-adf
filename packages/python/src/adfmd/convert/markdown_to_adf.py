from __future__ import annotations

import re
from typing import Any, NamedTuple, cast

from ..adf.types import AdfDocument, AdfNode
from ..diagnostics.diagnostic import Diagnostic
from ..options import ConversionOptions, ConversionResult


def markdown_to_adf(
    markdown: str, options: ConversionOptions | None = None
) -> ConversionResult[AdfDocument]:
    _ = options
    diagnostics: list[Diagnostic] = []
    normalized = markdown.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    content, _next = _parse_blocks(lines, 0, len(lines), diagnostics)

    return ConversionResult(
        value={"version": 1, "type": "doc", "content": content},
        diagnostics=diagnostics,
    )


class _BlockParseResult(NamedTuple):
    nodes: list[AdfNode]
    next: int


class _InlineParseResult(NamedTuple):
    nodes: list[AdfNode]
    next: int
    closed: bool


class _ListMarker(NamedTuple):
    ordered: bool
    marker_length: int
    start: int


def _parse_blocks(
    lines: list[str],
    start: int,
    end: int,
    diagnostics: list[Diagnostic],
    base_indent: int = 0,
) -> _BlockParseResult:
    nodes: list[AdfNode] = []
    index = start

    while index < end:
        line = lines[index] if index < len(lines) else ""
        if line.strip() == "":
            index += 1
            continue

        indent = _count_indent(line)
        if indent < base_indent:
            break

        trimmed = line[base_indent:]
        heading = re.match(r"^(#{1,6})[ \t]+(.+?)\s*#*\s*$", trimmed)
        if heading:
            nodes.append(
                {
                    "type": "heading",
                    "attrs": {"level": len(heading.group(1))},
                    "content": _parse_inline_content(heading.group(2), diagnostics),
                }
            )
            index += 1
            continue

        if re.match(r"^(?:-{3,}|\*{3,}|_{3,})\s*$", trimmed):
            nodes.append({"type": "rule"})
            index += 1
            continue

        fence = re.match(r"^(`{3,}|~{3,})([^`]*)$", trimmed)
        if fence:
            fence_marker = fence.group(1)
            fence_char = fence_marker[0]
            language = (fence.group(2).strip().split() or [""])[0]
            code_lines: list[str] = []
            index += 1
            while index < end:
                current_line = lines[index] if index < len(lines) else ""
                candidate = current_line[base_indent:]
                if candidate.startswith(fence_char * len(fence_marker)):
                    break
                code_lines.append(
                    current_line[min(base_indent, _count_indent(current_line)) :]
                )
                index += 1
            if index >= end:
                diagnostics.append(
                    Diagnostic(
                        severity="warning",
                        code="UnclosedCodeFence",
                        message=(
                            "Markdown code fence was not closed; consumed the "
                            "rest of the document."
                        ),
                    )
                )
            else:
                index += 1
            node: AdfNode = {
                "type": "codeBlock",
                "content": [{"type": "text", "text": "\n".join(code_lines)}],
            }
            if language:
                node["attrs"] = {"language": language}
            nodes.append(node)
            continue

        if re.match(r"^>[ \t]?", trimmed):
            quote_lines: list[str] = []
            while index < end:
                current = (lines[index] if index < len(lines) else "")[base_indent:]
                if current.strip() != "" and not re.match(r"^>[ \t]?", current):
                    break
                quote_lines.append(re.sub(r"^>[ \t]?", "", current, count=1))
                index += 1
            quote_content, _ = _parse_blocks(quote_lines, 0, len(quote_lines), diagnostics)
            nodes.append({"type": "blockquote", "content": quote_content})
            continue

        list_marker = _parse_list_marker(trimmed)
        if list_marker is not None:
            node, next_index = _parse_list(
                lines, index, end, diagnostics, base_indent, list_marker
            )
            nodes.append(node)
            index = next_index
            continue

        paragraph_lines: list[str] = []
        while index < end:
            current = lines[index] if index < len(lines) else ""
            current_trimmed = current[base_indent:]
            if current.strip() == "":
                break
            if index != start and _starts_block(current_trimmed):
                break
            paragraph_lines.append(current_trimmed)
            index += 1
        nodes.append(
            {
                "type": "paragraph",
                "content": _parse_inline_content(
                    _join_paragraph_lines(paragraph_lines), diagnostics
                ),
            }
        )

    return _BlockParseResult(nodes, index)


def _starts_block(line: str) -> bool:
    return (
        re.match(r"^(#{1,6})[ \t]+", line) is not None
        or re.match(r"^(?:-{3,}|\*{3,}|_{3,})\s*$", line) is not None
        or re.match(r"^(`{3,}|~{3,})", line) is not None
        or re.match(r"^>[ \t]?", line) is not None
        or _parse_list_marker(line) is not None
    )


def _parse_list(
    lines: list[str],
    start: int,
    end: int,
    diagnostics: list[Diagnostic],
    base_indent: int,
    first_marker: _ListMarker,
) -> tuple[AdfNode, int]:
    list_type = "orderedList" if first_marker.ordered else "bulletList"
    items: list[AdfNode] = []
    index = start

    while index < end:
        line = lines[index] if index < len(lines) else ""
        if line.strip() == "":
            index += 1
            continue
        if _count_indent(line) != base_indent:
            break
        marker = _parse_list_marker(line[base_indent:])
        if marker is None or marker.ordered != first_marker.ordered:
            break

        item_lines = [line[base_indent + marker.marker_length :]]
        index += 1
        while index < end:
            current = lines[index] if index < len(lines) else ""
            if current.strip() == "":
                item_lines.append("")
                index += 1
                continue
            indent = _count_indent(current)
            if indent == base_indent and _parse_list_marker(current[base_indent:]):
                break
            if indent < base_indent + 2:
                break
            item_lines.append(current[min(base_indent + 2, indent) :])
            index += 1

        item_content, _ = _parse_blocks(item_lines, 0, len(item_lines), diagnostics)
        items.append({"type": "listItem", "content": item_content})

    node: AdfNode = {"type": list_type, "content": items}
    if first_marker.ordered and first_marker.start != 1:
        node["attrs"] = {"order": first_marker.start}
    return node, index


def _parse_list_marker(line: str) -> _ListMarker | None:
    bullet = re.match(r"^[-+*][ \t]+", line)
    if bullet:
        return _ListMarker(False, len(bullet.group(0)), 1)
    ordered = re.match(r"^(\d{1,9})[.)][ \t]+", line)
    if ordered:
        return _ListMarker(True, len(ordered.group(0)), int(ordered.group(1)))
    return None


def _join_paragraph_lines(lines: list[str]) -> str:
    result = ""
    for index, line in enumerate(lines):
        if index > 0 and not result.endswith("\\\n"):
            result += " "
        if line.endswith("\\") and not line.endswith("\\\\"):
            result += f"{line[:-1]}\\\n"
        else:
            result += line
    return result


def _count_indent(line: str) -> int:
    count = 0
    for char in line:
        if char == " ":
            count += 1
        elif char == "\t":
            count += 4
        else:
            break
    return count


def _parse_inline_content(markdown: str, diagnostics: list[Diagnostic]) -> list[AdfNode]:
    return _parse_inlines(markdown, 0, diagnostics, []).nodes


def _parse_inlines(
    source: str,
    start: int,
    diagnostics: list[Diagnostic],
    terminators: list[str],
) -> _InlineParseResult:
    nodes: list[AdfNode] = []
    index = start

    while index < len(source):
        terminator = next(
            (candidate for candidate in terminators if source.startswith(candidate, index)),
            None,
        )
        if terminator is not None:
            return _InlineParseResult(nodes, index + len(terminator), True)

        if source.startswith("\\\n", index):
            nodes.append({"type": "hardBreak"})
            index += 2
            continue

        if source[index] == "\\" and index + 1 < len(source):
            _add_text(nodes, source[index + 1])
            index += 2
            continue

        code = _parse_code_span(source, index)
        if code is not None:
            text, next_index = code
            _add_text(nodes, text, [{"type": "code"}])
            index = next_index
            continue

        if source.startswith("**", index):
            parsed = _parse_inlines(source, index + 2, diagnostics, ["**"])
            if parsed.closed:
                nodes.extend(_add_mark(parsed.nodes, {"type": "strong"}))
                index = parsed.next
                continue

        if source.startswith("~~", index):
            parsed = _parse_inlines(source, index + 2, diagnostics, ["~~"])
            if parsed.closed:
                nodes.extend(_add_mark(parsed.nodes, {"type": "strike"}))
                index = parsed.next
                continue

        if source[index] == "*":
            parsed = _parse_inlines(source, index + 1, diagnostics, ["*"])
            if parsed.closed:
                nodes.extend(_add_mark(parsed.nodes, {"type": "em"}))
                index = parsed.next
                continue

        link = _parse_link(source, index, diagnostics)
        if link is not None:
            link_nodes, next_index = link
            nodes.extend(link_nodes)
            index = next_index
            continue

        _add_text(nodes, source[index])
        index += 1

    return _InlineParseResult(nodes, index, len(terminators) == 0)


def _parse_code_span(source: str, index: int) -> tuple[str, int] | None:
    opener_match = re.match(r"^`+", source[index:])
    if opener_match is None:
        return None
    opener = opener_match.group(0)
    close = source.find(opener, index + len(opener))
    if close == -1:
        return None
    text = source[index + len(opener) : close]
    if text.startswith(" ") and text.endswith(" ") and len(text.strip()) > 0:
        text = text[1:-1]
    return text, close + len(opener)


def _parse_link(
    source: str, index: int, diagnostics: list[Diagnostic]
) -> tuple[list[AdfNode], int] | None:
    if source[index] != "[":
        return None
    label_end = _find_unescaped(source, "]", index + 1)
    if label_end == -1 or label_end + 1 >= len(source) or source[label_end + 1] != "(":
        return None
    destination_end = _find_link_close(source, label_end + 2)
    if destination_end == -1:
        return None

    label = source[index + 1 : label_end]
    raw_destination = source[label_end + 2 : destination_end].strip()
    match = re.match(r'^(\S+?)(?:\s+"([^"]*)")?$', raw_destination)
    if match is None:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="InvalidLinkSyntax",
                message=(
                    "Markdown link destination was invalid; rendered link label "
                    "as plain text."
                ),
            )
        )
        return _parse_inline_content(label, diagnostics), destination_end + 1

    attrs: dict[str, Any] = {"href": _unescape_markdown(match.group(1))}
    if match.group(2) is not None:
        attrs["title"] = match.group(2)
    return (
        _add_mark(_parse_inline_content(label, diagnostics), {"type": "link", "attrs": attrs}),
        destination_end + 1,
    )


def _find_unescaped(source: str, needle: str, start: int) -> int:
    index = start
    while index < len(source):
        if source[index] == "\\" and index + 1 < len(source):
            index += 2
            continue
        if source[index] == needle:
            return index
        index += 1
    return -1


def _find_link_close(source: str, start: int) -> int:
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ")":
            return index
    return -1


def _add_text(
    nodes: list[AdfNode], text: str, marks: list[dict[str, Any]] | None = None
) -> None:
    if len(text) == 0:
        return
    previous = nodes[-1] if nodes else None
    normalized_marks = marks or []
    if (
        previous is not None
        and previous.get("type") == "text"
        and "text" in previous
        and previous.get("marks", []) == normalized_marks
    ):
        previous["text"] = previous.get("text", "") + text
        return
    node: AdfNode = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    nodes.append(node)


def _add_mark(nodes: list[AdfNode], mark: dict[str, Any]) -> list[AdfNode]:
    marked: list[AdfNode] = []
    for node in nodes:
        if node.get("type") == "text":
            marked_node = cast(AdfNode, dict(node))
            marked_node["marks"] = [*node.get("marks", []), mark]
            marked.append(marked_node)
        else:
            marked.append(node)
    return marked


def _unescape_markdown(value: str) -> str:
    return re.sub(r"\\([\\`*_{}\[\]()#+\-.!|<>~\s])", r"\1", value)
