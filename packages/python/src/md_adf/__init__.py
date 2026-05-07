"""Markdown-ADF converter package."""

from typing import Any

from .convert.adf_to_markdown import adf_fragment_to_markdown, adf_to_markdown
from .convert.markdown_to_adf import markdown_to_adf
from .options import ConversionOptions, ConversionOptionsInput, ConversionResult

__all__ = [
    "ConversionResult",
    "ConversionOptions",
    "ConversionOptionsInput",
    "adf_fragment_to_markdown",
    "adf_to_markdown",
    "markdown_to_adf",
    "parse_adf",
    "validate_adf",
]


def __getattr__(name: str) -> Any:
    """Lazily expose validation helpers without loading jsonschema on import."""

    if name in {"parse_adf", "validate_adf"}:
        from .adf.validate import parse_adf, validate_adf

        return {"parse_adf": parse_adf, "validate_adf": validate_adf}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
