from __future__ import annotations

from typing import Any, cast

from .types import AdfDocument, AdfNode


def coerce_adf_document(value: Any) -> AdfDocument:
    """Coerce an ADF document or fragment into a document shape for rendering."""

    if is_adf_document(value):
        return cast(AdfDocument, value)
    if _has_adf_document_version(value):
        raise ValueError("Invalid ADF root: expected doc version 1.")
    if isinstance(value, list):
        return {"version": 1, "type": "doc", "content": value}
    if is_adf_node(value):
        return {"version": 1, "type": "doc", "content": [cast(AdfNode, value)]}

    raise ValueError(
        "Invalid ADF root: expected doc version 1, content array, or ADF node."
    )


def is_adf_document(value: Any) -> bool:
    """Check the minimal document structure needed by the converters."""

    return (
        isinstance(value, dict)
        and value.get("version") == 1
        and value.get("type") == "doc"
        and isinstance(value.get("content"), list)
    )


def is_adf_node(value: Any) -> bool:
    """Check the minimal node structure needed by the converters."""

    return isinstance(value, dict) and isinstance(value.get("type"), str)


def _has_adf_document_version(value: Any) -> bool:
    """Detect document-shaped input that failed the stricter document guard."""

    return isinstance(value, dict) and "version" in value
