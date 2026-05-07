from typing import Any

from .types import AdfDocument, AdfNode

__all__ = ["AdfDocument", "AdfNode", "ValidationResult", "parse_adf", "validate_adf"]


def __getattr__(name: str) -> Any:
    """Lazily expose validation helpers without loading jsonschema on import."""

    if name in {"ValidationResult", "parse_adf", "validate_adf"}:
        from .validate import ValidationResult, parse_adf, validate_adf

        return {
            "ValidationResult": ValidationResult,
            "parse_adf": parse_adf,
            "validate_adf": validate_adf,
        }[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
