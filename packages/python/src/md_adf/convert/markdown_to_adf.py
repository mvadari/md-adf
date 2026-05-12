from __future__ import annotations

from html import unescape
from typing import Any, cast

import mistune

from ..adf.types import AdfDocument, AdfNode
from ..diagnostics.diagnostic import Diagnostic
from ..options import ConversionOptionsInput, ConversionResult, resolve_conversion_options

MarkdownNode = dict[str, Any]

MARKDOWN_PARSER = mistune.create_markdown(
    renderer="ast",
    plugins=["strikethrough", "table", "task_lists"],
)


def markdown_to_adf(
    markdown: str, options: ConversionOptionsInput = None
) -> ConversionResult[AdfDocument]:
    """Convert Markdown text into an ADF document with fallback diagnostics."""

    resolve_conversion_options(options)
    diagnostics: list[Diagnostic] = []
    tree = cast(list[MarkdownNode], MARKDOWN_PARSER(markdown))
    content = _block_children(tree, diagnostics, "/content")

    return ConversionResult(
        value={"version": 1, "type": "doc", "content": content},
        diagnostics=diagnostics,
    )


def _block_children(
    nodes: list[MarkdownNode], diagnostics: list[Diagnostic], path: str
) -> list[AdfNode]:
    """Convert a list of Markdown block nodes into ADF block nodes."""

    output: list[AdfNode] = []
    index = 0
    while index < len(nodes):
        details = _details_block(nodes, index, diagnostics, path)
        if details is not None:
            details_nodes, consumed = details
            output.extend(details_nodes)
            index += consumed
            continue
        node = nodes[index]
        output.extend(_block_node(node, diagnostics, f"{path}/{index}"))
        index += 1
    return output


def _details_block(
    nodes: list[MarkdownNode], index: int, diagnostics: list[Diagnostic], path: str
) -> tuple[list[AdfNode], int] | None:
    """Convert a simple raw HTML details sequence to ADF expand when possible."""

    opening_raw = _html_raw(nodes[index])
    if opening_raw is None or not _is_details_opening(opening_raw):
        return None

    node_path = f"{path}/{index}"
    closing_index = next(
        (
            candidate_index
            for candidate_index, node in enumerate(nodes[index + 1 :], start=index + 1)
            if _is_details_closing(_html_raw(node) or "")
        ),
        -1,
    )
    if closing_index == -1:
        _warn_details_fallback(diagnostics, node_path)
        return None

    summary = _summary_title(opening_raw)
    inner_nodes = nodes[index + 1 : closing_index]

    def fallback() -> tuple[list[AdfNode], int]:
        fallback_nodes = [
            *_paragraph_from_text(opening_raw.strip()),
            *_block_children(inner_nodes, diagnostics, f"{node_path}/content"),
            *_paragraph_from_text((_html_raw(nodes[closing_index]) or "").strip()),
        ]
        return fallback_nodes, closing_index - index + 1

    if (
        path != "/content"
        or summary is None
        or not inner_nodes
        or any(_is_details_boundary(_html_raw(node) or "") for node in inner_nodes)
    ):
        _warn_details_fallback(diagnostics, node_path)
        return fallback()

    content = _block_children(inner_nodes, diagnostics, f"{node_path}/content")
    if not content:
        _warn_details_fallback(diagnostics, node_path)
        return fallback()

    return (
        [
            {
                "type": "expand",
                "attrs": {"title": summary},
                "content": content,
            }
        ],
        closing_index - index + 1,
    )


def _block_node(node: MarkdownNode, diagnostics: list[Diagnostic], path: str) -> list[AdfNode]:
    """Convert one Markdown block node into zero or more ADF block nodes."""

    node_type = node.get("type")

    if node_type == "blank_line":
        return []

    if node_type == "paragraph":
        return [
            {
                "type": "paragraph",
                "content": _inline_children(_children(node), diagnostics),
            }
        ]

    if node_type == "block_text":
        return [
            {
                "type": "paragraph",
                "content": _inline_children(_children(node), diagnostics),
            }
        ]

    if node_type == "heading":
        attrs = _attrs(node)
        level = min(6, max(1, int(attrs.get("level", 1))))
        return [
            {
                "type": "heading",
                "attrs": {"level": level},
                "content": _inline_children(_children(node), diagnostics),
            }
        ]

    if node_type == "thematic_break":
        return [{"type": "rule"}]

    if node_type == "block_quote":
        return [
            {
                "type": "blockquote",
                "content": _block_children(_children(node), diagnostics, f"{path}/content"),
            }
        ]

    if node_type == "list":
        return [_list_node(node, diagnostics, path)]

    if node_type == "block_code":
        return [_code_block_node(node)]

    if node_type == "table":
        return [_table_node(node, diagnostics, path)]

    if node_type == "block_html":
        return _paragraph_from_text(str(node.get("raw", "")))

    return _text_fallback_block(node)


def _list_node(node: MarkdownNode, diagnostics: list[Diagnostic], path: str) -> AdfNode:
    """Convert a Markdown ordered, bullet, or task list to an ADF list node."""

    attrs = _attrs(node)
    ordered = bool(attrs.get("ordered", False))
    items = [
        child for child in _children(node) if child.get("type") in {"list_item", "task_list_item"}
    ]
    if (
        not ordered
        and len(items) > 0
        and all(child.get("type") == "task_list_item" for child in items)
    ):
        task_list = _task_list_node(items, diagnostics, path)
        if task_list is not None:
            return task_list
    if any(child.get("type") == "task_list_item" for child in items):
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="TaskListFallback",
                path=path,
                message=(
                    "Mixed or complex GFM task list items were converted to bullet list items."
                ),
                fallback="bulletList",
            )
        )

    list_node: AdfNode = {
        "type": "orderedList" if ordered else "bulletList",
        "content": [
            _list_item_node(child, diagnostics, f"{path}/content/{index}")
            for index, child in enumerate(items)
        ],
    }
    start = attrs.get("start")
    if ordered and isinstance(start, int) and start != 1:
        list_node["attrs"] = {"order": start}
    return list_node


def _task_list_node(
    items: list[MarkdownNode], diagnostics: list[Diagnostic], path: str
) -> AdfNode | None:
    """Convert a simple GFM task list to an ADF taskList when possible."""

    task_items = [
        _task_item_node(item, diagnostics, f"{path}/content/{index}")
        for index, item in enumerate(items)
    ]
    if any(item is None for item in task_items):
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="TaskListFallback",
                path=path,
                message="Complex GFM task list items were converted to bullet list items.",
                fallback="bulletList",
            )
        )
        return None

    return {
        "type": "taskList",
        "attrs": {"localId": _local_id_from_path("task-list", path)},
        "content": [item for item in task_items if item is not None],
    }


def _task_item_node(node: MarkdownNode, diagnostics: list[Diagnostic], path: str) -> AdfNode | None:
    """Convert one simple Markdown task item into an ADF taskItem."""

    children = _children(node)
    if len(children) != 1 or children[0].get("type") not in {"block_text", "paragraph"}:
        return None

    return {
        "type": "taskItem",
        "attrs": {
            "localId": _local_id_from_path("task-item", path),
            "state": "DONE" if _attrs(node).get("checked") is True else "TODO",
        },
        "content": _inline_children(_children(children[0]), diagnostics),
    }


def _list_item_node(node: MarkdownNode, diagnostics: list[Diagnostic], path: str) -> AdfNode:
    """Convert a Markdown list item, preserving task state as fallback text."""

    content = _block_children(_children(node), diagnostics, f"{path}/content")
    if node.get("type") == "task_list_item":
        _prepend_task_fallback_marker(content, _attrs(node).get("checked") is True)
    return {
        "type": "listItem",
        "content": content,
    }


def _prepend_task_fallback_marker(content: list[AdfNode], checked: bool) -> None:
    """Insert a checked or unchecked marker into fallback list item content."""

    marker = "[x] " if checked else "[ ] "
    if not content or content[0].get("type") != "paragraph":
        content.insert(0, {"type": "paragraph", "content": [{"type": "text", "text": marker}]})
        return
    content[0]["content"] = [{"type": "text", "text": marker}, *content[0].get("content", [])]


def _code_block_node(node: MarkdownNode) -> AdfNode:
    """Convert a Markdown code block into an ADF codeBlock."""

    code_block: AdfNode = {
        "type": "codeBlock",
        "content": [{"type": "text", "text": str(node.get("raw", "")).removesuffix("\n")}],
    }
    info = _attrs(node).get("info")
    if isinstance(info, str) and info.strip():
        code_block["attrs"] = {"language": info.strip().split()[0]}
    return code_block


def _table_node(node: MarkdownNode, diagnostics: list[Diagnostic], path: str) -> AdfNode:
    """Convert a GFM table into an ADF table and report dropped alignment."""

    rows: list[AdfNode] = []
    alignments: list[Any] = []

    for table_child in _children(node):
        if table_child.get("type") == "table_head":
            rows.append(_table_row_node(table_child, header=True, diagnostics=diagnostics))
            alignments = [_attrs(cell).get("align") for cell in _children(table_child)]
        elif table_child.get("type") == "table_body":
            rows.extend(
                _table_row_node(row, header=False, diagnostics=diagnostics)
                for row in _children(table_child)
            )

    table: AdfNode = {"type": "table", "content": rows}
    if any(align is not None for align in alignments):
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedTableAlignment",
                path=path,
                message=(
                    "Markdown table column alignment is not representable in ADF and was omitted."
                ),
                fallback="omit",
            )
        )
    return table


def _table_row_node(node: MarkdownNode, header: bool, diagnostics: list[Diagnostic]) -> AdfNode:
    """Convert one Markdown table row into an ADF tableRow."""

    cells: list[AdfNode] = []
    for cell in _children(node):
        if cell.get("type") != "table_cell":
            continue
        cell_node: AdfNode = {
            "type": "tableHeader" if header else "tableCell",
            "content": [
                {
                    "type": "paragraph",
                    "content": _inline_children(_children(cell), diagnostics),
                }
            ],
        }
        cells.append(cell_node)
    return {"type": "tableRow", "content": cells}


def _text_fallback_block(node: MarkdownNode) -> list[AdfNode]:
    """Fall an unsupported Markdown block back to a paragraph of plain text."""

    text = _plain_text(node)
    return _paragraph_from_text(text) if text else []


def _html_raw(node: MarkdownNode | None) -> str | None:
    """Return raw HTML text for a Markdown HTML node."""

    if node is None or node.get("type") != "block_html":
        return None
    return str(node.get("raw", ""))


def _warn_details_fallback(diagnostics: list[Diagnostic], path: str) -> None:
    """Report that Markdown details stayed as readable fallback content."""

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="MarkdownDetailsFallback",
            path=path,
            message=(
                "Markdown details block could not be converted to ADF expand and was "
                "preserved as readable fallback."
            ),
            fallback="text",
        )
    )


def _is_details_boundary(raw: str) -> bool:
    """Return whether raw HTML begins or closes a details block."""

    return _is_details_opening(raw) or _is_details_closing(raw)


def _is_details_opening(raw: str) -> bool:
    """Return whether raw HTML begins with an opening details tag."""

    stripped = raw.strip().lower()
    return stripped.startswith("<details>") or stripped.startswith("<details ")


def _is_details_closing(raw: str) -> bool:
    """Return whether raw HTML is exactly a closing details tag."""

    return raw.strip().lower() == "</details>"


def _summary_title(raw: str) -> str | None:
    """Extract the title from the simple supported summary forms."""

    stripped = raw.strip()
    lower = stripped.lower()
    if not lower.startswith("<details>"):
        return None
    remainder = stripped[len("<details>") :].strip()
    if not remainder.lower().startswith("<summary>") or not remainder.lower().endswith(
        "</summary>"
    ):
        return None
    title = remainder[len("<summary>") : -len("</summary>")]
    if "<" in title or ">" in title:
        return None
    decoded = unescape(title).strip()
    return decoded or None


def _paragraph_from_text(text: str) -> list[AdfNode]:
    """Build a paragraph containing a single text node, omitting empty text."""

    if not text:
        return []
    return [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]


def _inline_children(
    nodes: list[MarkdownNode],
    diagnostics: list[Diagnostic],
    marks: list[dict[str, Any]] | None = None,
) -> list[AdfNode]:
    """Convert Markdown inline children into ADF inline nodes."""

    output: list[AdfNode] = []
    active_marks = marks or []
    for node in nodes:
        for child in _inline_node(node, active_marks, diagnostics):
            _append_inline(output, child)
    return output


def _inline_node(
    node: MarkdownNode, marks: list[dict[str, Any]], diagnostics: list[Diagnostic]
) -> list[AdfNode]:
    """Convert one Markdown inline node into one or more ADF inline nodes."""

    node_type = node.get("type")

    if node_type == "text":
        return _text_node(str(node.get("raw", "")).replace("\n", " "), marks)

    if node_type == "emphasis":
        return _inline_children(_children(node), diagnostics, [*marks, {"type": "em"}])

    if node_type == "strong":
        return _inline_children(_children(node), diagnostics, [*marks, {"type": "strong"}])

    if node_type == "strikethrough":
        return _inline_children(_children(node), diagnostics, [*marks, {"type": "strike"}])

    if node_type == "codespan":
        return _text_node(str(node.get("raw", "")), _code_marks(marks, diagnostics))

    if node_type == "link":
        attrs = _attrs(node)
        link_attrs: dict[str, Any] = {"href": attrs.get("url", "")}
        title = attrs.get("title")
        if isinstance(title, str) and title:
            link_attrs["title"] = title
        return _inline_children(
            _children(node), diagnostics, [*marks, {"type": "link", "attrs": link_attrs}]
        )

    if node_type == "linebreak":
        return [{"type": "hardBreak"}]

    if node_type == "softbreak":
        return _text_node(" ", marks)

    if node_type == "image":
        attrs = _attrs(node)
        image_link_attrs: dict[str, Any] = {"href": attrs.get("url", "")}
        title = attrs.get("title")
        if isinstance(title, str) and title:
            image_link_attrs["title"] = title
        image_marks = (
            marks
            if any(mark.get("type") == "link" for mark in marks)
            else [*marks, {"type": "link", "attrs": image_link_attrs}]
        )
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="MarkdownImageLinkFallback",
                message="Markdown image was converted to linked text fallback.",
                fallback="link",
            )
        )
        alt = _plain_text(node) or str(attrs.get("url", ""))
        return _text_node(alt, image_marks)

    if node_type == "inline_html":
        return _text_node(str(node.get("raw", "")), marks)

    return _text_node(_plain_text(node), marks)


def _text_node(text: str, marks: list[dict[str, Any]]) -> list[AdfNode]:
    """Create an ADF text node with optional marks, omitting empty strings."""

    if not text:
        return []
    node: AdfNode = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    return [node]


def _code_marks(marks: list[dict[str, Any]], diagnostics: list[Diagnostic]) -> list[dict[str, Any]]:
    """Keep only marks that can legally wrap ADF code text."""

    compatible_marks = [mark for mark in marks if mark.get("type") == "link"]
    if len(compatible_marks) != len(marks):
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="CodeMarkDropsOtherMarks",
                message=(
                    "ADF code text cannot contain non-code formatting marks; "
                    "non-code marks were ignored."
                ),
                fallback="drop-marks",
            )
        )
    return [*compatible_marks, {"type": "code"}]


def _append_inline(nodes: list[AdfNode], node: AdfNode) -> None:
    """Append an inline node, merging adjacent text with identical marks."""

    previous = nodes[-1] if nodes else None
    if (
        previous is not None
        and node.get("type") == "text"
        and previous.get("type") == "text"
        and previous.get("marks", []) == node.get("marks", [])
    ):
        previous["text"] = previous.get("text", "") + node.get("text", "")
        return
    nodes.append(node)


def _plain_text(node: MarkdownNode) -> str:
    """Extract human-readable text from a Markdown node tree."""

    raw = node.get("raw")
    if isinstance(raw, str):
        return raw
    return "".join(_plain_text(child) for child in _children(node))


def _children(node: MarkdownNode) -> list[MarkdownNode]:
    """Return a Markdown node's children as a typed list."""

    children = node.get("children")
    return cast(list[MarkdownNode], children if isinstance(children, list) else [])


def _attrs(node: MarkdownNode) -> dict[str, Any]:
    """Return a Markdown node's attrs as a dictionary."""

    attrs = node.get("attrs")
    return cast(dict[str, Any], attrs if isinstance(attrs, dict) else {})


def _local_id_from_path(prefix: str, path: str) -> str:
    """Create a deterministic ADF localId from the Markdown node path."""

    suffix = path.strip("/")
    suffix = "".join(char if char.isalnum() or char in {"_", "-"} else "-" for char in suffix)
    return f"{prefix}-{suffix or 'root'}"
