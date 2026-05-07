from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .types import AdfDocument


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)


def parse_adf(value: Any) -> AdfDocument:
    if (
        isinstance(value, dict)
        and value.get("version") == 1
        and value.get("type") == "doc"
        and isinstance(value.get("content"), list)
    ):
        return value

    raise ValueError("Invalid ADF root: expected doc version 1.")


def validate_adf(value: Any) -> ValidationResult:
    try:
        parse_adf(value)
    except ValueError as exc:
        return ValidationResult(valid=False, errors=[str(exc)])

    return ValidationResult(valid=True)
