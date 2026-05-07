from __future__ import annotations

from ..adf.types import AdfDocument
from ..options import ConversionOptions, ConversionResult


def markdown_to_adf(
    markdown: str, options: ConversionOptions | None = None
) -> ConversionResult[AdfDocument]:
    _ = (markdown, options)
    raise NotImplementedError("Markdown to ADF conversion is not implemented yet.")
