from __future__ import annotations

from typing import Any

from ..adf.types import AdfNode
from ..adf.validate import parse_adf
from ..diagnostics.diagnostic import Diagnostic
from ..markdown.escape import (
    code_fence_for,
    escape_link_destination,
    escape_link_title,
    escape_markdown_text,
    render_code_span,
)
from ..options import ConversionOptions, ConversionResult

SUPPORTED_NODES = {
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
}
MARK_ORDER = ("link", "strong", "em", "strike")
SUPPORTED_MARKS = {"strong", "em", "strike", "code", "link"}


def adf_to_markdown(
    adf: Any, options: ConversionOptions | None = None
) -> ConversionResult[str]:
    diagnostics: list[Diagnostic] = []

    try:
        document = parse_adf(adf, options)
    except ValueError as exc:
        diagnostics.append(
            Diagnostic(
                severity="error",
                code="InvalidAdfRoot",
                path="",
                message=str(exc),
            )
        )
        return ConversionResult(value="", diagnostics=diagnostics)

    return ConversionResult(
        value=render_blocks(document.get("content", []), diagnostics, "/content").rstrip(),
        diagnostics=diagnostics,
    )


def render_blocks(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    blocks = [
        render_block(node, diagnostics, f"{path}/{index}")
        for index, node in enumerate(nodes)
    ]
    return "\n\n".join(block for block in blocks if len(block) > 0)


def render_block(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    node_type = node.get("type")
    if node_type not in SUPPORTED_NODES:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedNode",
                path=path,
                message=f"Unsupported ADF node '{node_type}' was omitted.",
            )
        )
        return ""

    if node_type == "paragraph":
        return render_inline_content(node.get("content", []), diagnostics, f"{path}/content")

    if node_type == "heading":
        raw_level = _to_number(_attrs(node).get("level", 1), 1)
        level = min(6, max(1, int(raw_level)))
        content = render_inline_content(node.get("content", []), diagnostics, f"{path}/content")
        return f"{'#' * level} {content}"

    if node_type == "blockquote":
        return prefix_lines(
            render_blocks(node.get("content", []), diagnostics, f"{path}/content"),
            "> ",
        )

    if node_type == "bulletList":
        return render_list(node, diagnostics, path, ordered=False)

    if node_type == "orderedList":
        return render_list(node, diagnostics, path, ordered=True)

    if node_type == "listItem":
        return render_blocks(node.get("content", []), diagnostics, f"{path}/content")

    if node_type == "codeBlock":
        text = collect_plain_text(node.get("content", []), diagnostics, f"{path}/content")
        language_value = _attrs(node).get("language")
        language = language_value if isinstance(language_value, str) else ""
        fence = code_fence_for(text)
        code_text = text.removesuffix("\n")
        return f"{fence}{language}\n{code_text}\n{fence}"

    if node_type == "rule":
        return "---"

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="InvalidContainer",
            path=path,
            message=f"ADF node '{node_type}' cannot be rendered as a block.",
        )
    )
    return ""


def render_list(
    node: AdfNode, diagnostics: list[Diagnostic], path: str, ordered: bool
) -> str:
    start = _to_number(_attrs(node).get("order", 1), 1)
    items: list[str] = []

    for index, item in enumerate(node.get("content", [])):
        if item.get("type") != "listItem":
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="InvalidContainer",
                    path=f"{path}/content/{index}",
                    message=(
                        f"Expected listItem inside {node.get('type')}; "
                        f"omitted '{item.get('type')}'."
                    ),
                )
            )
            continue

        marker = f"{int(start) + index}. " if ordered else "- "
        body = render_block(item, diagnostics, f"{path}/content/{index}")
        items.append(marker + indent_list_continuation(body))

    return "\n".join(item for item in items if len(item) > 0)


def indent_list_continuation(text: str) -> str:
    lines = text.split("\n")
    return "\n".join(line if index == 0 else f"  {line}" for index, line in enumerate(lines))


def prefix_lines(text: str, prefix: str) -> str:
    return "\n".join(
        prefix.rstrip() if len(line) == 0 else f"{prefix}{line}" for line in text.split("\n")
    )


def render_inline_content(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    return "".join(
        render_inline(node, diagnostics, f"{path}/{index}", index == 0)
        for index, node in enumerate(nodes)
    )


def render_inline(
    node: AdfNode, diagnostics: list[Diagnostic], path: str, at_line_start: bool
) -> str:
    node_type = node.get("type")
    if node_type == "text":
        return render_marked_text(
            node.get("text", ""),
            node.get("marks", []),
            diagnostics,
            path,
            at_line_start,
        )

    if node_type == "hardBreak":
        return "\\\n"

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="UnsupportedNode",
            path=path,
            message=f"Unsupported inline ADF node '{node_type}' was omitted.",
        )
    )
    return ""


def render_marked_text(
    text: str,
    marks: list[dict[str, Any]],
    diagnostics: list[Diagnostic],
    path: str,
    at_line_start: bool,
) -> str:
    known_marks: list[dict[str, Any]] = []
    for mark in marks:
        mark_type = mark.get("type")
        if isinstance(mark_type, str) and mark_type in SUPPORTED_MARKS:
            known_marks.append(mark)
            continue

        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedMark",
                path=path,
                message=f"Unsupported ADF mark '{mark_type}' was ignored.",
            )
        )

    if any(mark.get("type") == "code" for mark in known_marks):
        if len(known_marks) > 1:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="CodeMarkDropsOtherMarks",
                    path=path,
                    message=(
                        "Markdown code spans cannot contain nested marks; "
                        "non-code marks were ignored."
                    ),
                )
            )
        return render_code_span(text)

    rendered = escape_markdown_text(text, at_line_start)
    for mark_type in MARK_ORDER:
        current_mark = next(
            (candidate for candidate in known_marks if candidate.get("type") == mark_type),
            None,
        )
        if current_mark is None:
            continue

        if mark_type == "link":
            attrs = current_mark.get("attrs")
            href = attrs.get("href") if isinstance(attrs, dict) else ""
            if not isinstance(href, str) or not href:
                diagnostics.append(
                    Diagnostic(
                        severity="warning",
                        code="InvalidLinkMark",
                        path=path,
                        message="ADF link mark without href was rendered as plain text.",
                    )
                )
                continue

            title_value = attrs.get("title") if isinstance(attrs, dict) else None
            title = (
                f' "{escape_link_title(title_value)}"'
                if isinstance(title_value, str)
                else ""
            )
            rendered = f"[{rendered}]({escape_link_destination(href)}{title})"
        elif mark_type == "strong":
            rendered = f"**{rendered}**"
        elif mark_type == "em":
            rendered = f"*{rendered}*"
        elif mark_type == "strike":
            rendered = f"~~{rendered}~~"

    return rendered


def collect_plain_text(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    parts: list[str] = []
    for index, node in enumerate(nodes):
        node_type = node.get("type")
        if node_type == "text":
            parts.append(node.get("text", ""))
        elif node_type == "hardBreak":
            parts.append("\n")
        else:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="UnsupportedNode",
                    path=f"{path}/{index}",
                    message=f"Unsupported codeBlock child '{node_type}' was omitted.",
                )
            )
    return "".join(parts)


def _attrs(node: AdfNode) -> dict[str, Any]:
    attrs = node.get("attrs")
    return attrs if isinstance(attrs, dict) else {}


def _to_number(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    if number != number or number in {float("inf"), float("-inf")}:
        return fallback
    return number
