from __future__ import annotations

from typing import Any

from ..options import ConversionOptions, ConversionResult


def adf_to_markdown(
    adf: Any, options: ConversionOptions | None = None
) -> ConversionResult[str]:
    _ = (adf, options)
    raise NotImplementedError("ADF to Markdown conversion is not implemented yet.")
