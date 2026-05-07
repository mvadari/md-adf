from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any, cast

from jsonschema import Draft4Validator
from jsonschema.exceptions import ValidationError

from .types import AdfDocument


@dataclass(frozen=True)
class ParseAdfOptions:
    validate_adf: bool = True


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)


def parse_adf(value: Any, options: Any = None) -> AdfDocument:
    if (
        isinstance(value, dict)
        and value.get("version") == 1
        and value.get("type") == "doc"
        and isinstance(value.get("content"), list)
    ):
        if _validate_enabled(options):
            errors = list(_VALIDATOR.iter_errors(value))
            if errors:
                raise ValueError(_format_schema_error(_most_specific_error(errors, value)))
        return cast(AdfDocument, value)

    raise ValueError("Invalid ADF root: expected doc version 1.")


def validate_adf(
    value: Any, options: Any = None
) -> ValidationResult:
    try:
        parse_adf(value, options)
    except ValueError as exc:
        return ValidationResult(valid=False, errors=[str(exc)])

    return ValidationResult(valid=True)


def _schema_path() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[1] / "schemas" / "adf-schema.json",
        here.parents[5] / "schemas" / "adf-schema.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise RuntimeError("Pinned ADF JSON Schema not found.")


_SCHEMA = json.loads(_schema_path().read_text(encoding="utf-8"))
_VALIDATOR = Draft4Validator(_SCHEMA)


def _validate_enabled(options: Any) -> bool:
    if options is None:
        return True
    if isinstance(options, ParseAdfOptions):
        return options.validate_adf
    if hasattr(options, "validate_adf"):
        return bool(options.validate_adf)
    value = options.get("validate_adf", options.get("validateAdf", True))
    return bool(value)


def _format_schema_error(error: ValidationError) -> str:
    path = _json_pointer(error.absolute_path)
    location = f" at {path}" if path else ""

    if error.validator == "required":
        missing = _required_property(error.message)
        return f"Invalid ADF{location}: missing required property '{missing}'."
    if error.validator == "additionalProperties":
        property_name = _additional_property(error.message)
        return f"Invalid ADF{location}: unexpected property '{property_name}'."
    if error.validator == "enum":
        return f"Invalid ADF{location}: value is not allowed."
    if error.validator == "type":
        return f"Invalid ADF{location}: expected {error.validator_value}."
    if error.validator == "minLength":
        return f"Invalid ADF{location}: expected a non-empty string."
    if error.validator == "minItems":
        return f"Invalid ADF{location}: expected at least one item."
    return f"Invalid ADF{location}: failed schema constraint '{error.validator}'."


def _most_specific_error(errors: list[ValidationError], value: Any) -> ValidationError:
    candidates = _leaf_errors(errors)
    relevant = [error for error in candidates if error.validator not in {"anyOf", "oneOf"}]
    matching_type_error = next(
        (error for error in relevant if _error_matches_actual_type(error, value)),
        None,
    )
    if matching_type_error is not None:
        return matching_type_error
    return max(relevant or candidates, key=_error_specificity)


def _leaf_errors(errors: list[ValidationError]) -> list[ValidationError]:
    leaves: list[ValidationError] = []
    for error in errors:
        if error.context:
            leaves.extend(_leaf_errors(list(error.context)))
        else:
            leaves.append(error)
    return leaves


def _json_pointer(path: Any) -> str:
    parts = [str(part).replace("~", "~0").replace("/", "~1") for part in path]
    return "/" + "/".join(parts) if parts else ""


def _error_specificity(error: ValidationError) -> int:
    base = len(error.absolute_path)
    if error.validator == "required" and "/attrs" in _json_pointer(error.absolute_path):
        return base + 1
    return base


def _additional_property(message: str) -> str:
    marker = "'"
    start = message.find(marker)
    end = message.find(marker, start + 1)
    return message[start + 1 : end] if start >= 0 and end > start else "unknown"


def _error_matches_actual_type(error: ValidationError, value: Any) -> bool:
    if error.validator != "required":
        return False

    parent_path = list(error.absolute_path)
    if parent_path[-1:] == ["attrs"]:
        parent_path = parent_path[:-1]
    parent = _value_at_path(value, parent_path)
    if (
        isinstance(parent, dict)
        and parent.get("type") == "link"
        and _required_property(error.message) == "href"
    ):
        return True

    schema_path = list(error.schema_path)
    if len(schema_path) < 2 or schema_path[0] != "definitions":
        return False

    definition = str(schema_path[1])
    expected_type = definition.removesuffix("_mark").removesuffix("_node")
    return isinstance(parent, dict) and parent.get("type") == expected_type


def _value_at_path(value: Any, path: list[Any]) -> Any:
    current = value
    for part in path:
        if isinstance(current, list) and isinstance(part, int):
            current = current[part]
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _required_property(message: str) -> str:
    marker = "'"
    start = message.find(marker)
    end = message.find(marker, start + 1)
    return message[start + 1 : end] if start >= 0 and end > start else "unknown"
