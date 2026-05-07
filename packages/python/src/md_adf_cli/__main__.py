from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import sys

from md_adf import adf_to_markdown, markdown_to_adf, validate_adf
from md_adf.diagnostics import Diagnostic
from md_adf.options import ConversionOptions

COMMANDS = {"to-md", "to-adf", "validate-adf"}
PROFILES = {"jira", "confluence", "portableMarkdown"}


class CliError(ValueError):
    """Raised when CLI arguments are invalid."""

    pass


class CliArgs:
    """Parsed CLI command, paths, and option values."""

    def __init__(
        self,
        command: str,
        input_path: str | None = None,
        output_path: str | None = None,
        profile: str | None = None,
    ) -> None:
        self.command = command
        self.input_path = input_path
        self.output_path = output_path
        self.profile = profile


def main() -> int:
    """Run the CLI command and return a process exit code."""

    try:
        args = parse_args(sys.argv[1:])
    except CliError as exc:
        print(str(exc), file=sys.stderr)
        print_usage()
        return 2

    try:
        if args.command == "to-md":
            input_text = read_input(args.input_path)
            adf = json.loads(input_text)
            markdown_result = adf_to_markdown(
                adf,
                ConversionOptions(profile=args.profile or "portableMarkdown"),
            )
            write_diagnostics(markdown_result.diagnostics)
            write_output(args.output_path, markdown_result.value)
            return 1 if has_error_diagnostics(markdown_result.diagnostics) else 0

        if args.command == "to-adf":
            input_text = read_input(args.input_path)
            adf_result = markdown_to_adf(
                input_text,
                ConversionOptions(profile=args.profile or "jira"),
            )
            write_diagnostics(adf_result.diagnostics)
            write_output(args.output_path, f"{json.dumps(adf_result.value, indent=2)}\n")
            return 1 if has_error_diagnostics(adf_result.diagnostics) else 0

        input_text = read_input(args.input_path)
        validation_result = validate_adf(json.loads(input_text))
        if not validation_result.valid:
            for message in validation_result.errors:
                print(
                    json.dumps(
                        {
                            "severity": "error",
                            "code": "InvalidAdf",
                            "message": message,
                        }
                    ),
                    file=sys.stderr,
                )
            return 1
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


def parse_args(argv: list[str]) -> CliArgs:
    """Parse positional command arguments and supported flags."""

    if not argv or argv[0] not in COMMANDS:
        raise CliError("Expected command: to-md, to-adf, or validate-adf.")

    args = CliArgs(command=argv[0])
    index = 1
    while index < len(argv):
        arg = argv[index]

        if arg == "--output":
            if index + 1 >= len(argv) or argv[index + 1].startswith("--"):
                raise CliError("--output requires a path.")
            args.output_path = argv[index + 1]
            index += 2
            continue

        if arg == "--profile":
            if index + 1 >= len(argv) or argv[index + 1].startswith("--"):
                raise CliError("--profile requires a value.")
            profile = argv[index + 1]
            if profile not in PROFILES:
                raise CliError(f"Unsupported profile '{profile}'.")
            args.profile = profile
            index += 2
            continue

        if arg.startswith("--"):
            raise CliError(f"Unknown option '{arg}'.")

        if args.input_path is not None:
            raise CliError("Only one input path may be provided.")
        args.input_path = arg
        index += 1

    if args.command == "validate-adf" and args.output_path is not None:
        raise CliError("validate-adf does not support --output.")
    if args.command == "validate-adf" and args.profile is not None:
        raise CliError("validate-adf does not support --profile.")

    return args


def read_input(path: str | None) -> str:
    """Read command input from a file path or stdin."""

    if path is not None:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def write_output(path: str | None, value: str) -> None:
    """Write command output to a file path or stdout."""

    if path is not None:
        Path(path).write_text(value, encoding="utf-8")
        return
    print(value, end="")


def write_diagnostics(diagnostics: list[Diagnostic]) -> None:
    """Emit converter diagnostics as newline-delimited JSON on stderr."""

    for diagnostic in diagnostics:
        payload = {key: value for key, value in asdict(diagnostic).items() if value is not None}
        print(json.dumps(payload), file=sys.stderr)


def has_error_diagnostics(diagnostics: list[Diagnostic]) -> bool:
    """Return whether diagnostics include an error severity."""

    return any(diagnostic.severity == "error" for diagnostic in diagnostics)


def print_usage() -> None:
    """Print command usage help to stderr."""

    print("Usage:", file=sys.stderr)
    print(
        "  md-adf to-md [input] [--output output.md] [--profile portableMarkdown]",
        file=sys.stderr,
    )
    print(
        "  md-adf to-adf [input] [--output output.adf.json] [--profile jira]",
        file=sys.stderr,
    )
    print("  md-adf validate-adf [input]", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
