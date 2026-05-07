#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { adfToMarkdown, markdownToAdf, validateAdf } from "../src/index.js"
import type { ConversionOptions, Diagnostic } from "../src/index.js"

type Command = "to-md" | "to-adf" | "validate-adf"

type CliArgs = {
  command: Command
  input?: string
  output?: string
  profile?: ConversionOptions["profile"]
}

const validProfiles = new Set(["jira", "confluence", "portableMarkdown"])

/**
 * Runs the CLI command, wiring file/stdin IO to the requested converter.
 */
async function main(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    printUsage()
    return 2
  }

  try {
    if (args.command === "to-md") {
      const input = await readInput(args.input)
      const adf = JSON.parse(input) as unknown
      const result = adfToMarkdown(adf, {
        profile: args.profile ?? "portableMarkdown",
      })
      writeDiagnostics(result.diagnostics)
      await writeOutput(args.output, result.value)
      return hasErrorDiagnostics(result.diagnostics) ? 1 : 0
    }

    if (args.command === "to-adf") {
      const input = await readInput(args.input)
      const result = markdownToAdf(input, { profile: args.profile ?? "jira" })
      writeDiagnostics(result.diagnostics)
      await writeOutput(
        args.output,
        `${JSON.stringify(result.value, null, 2)}\n`,
      )
      return hasErrorDiagnostics(result.diagnostics) ? 1 : 0
    }

    const input = await readInput(args.input)
    const result = validateAdf(JSON.parse(input) as unknown)
    if (!result.valid) {
      for (const message of result.errors) {
        console.error(
          JSON.stringify({
            severity: "error",
            code: "InvalidAdf",
            message,
          }),
        )
      }
      return 1
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

/**
 * Parses positional command arguments and supported flags into a typed CLI
 * argument object.
 */
function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv
  if (!isCommand(command)) {
    throw new Error("Expected command: to-md, to-adf, or validate-adf.")
  }

  const parsed: CliArgs = { command }
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]

    if (arg === "--output") {
      const output = rest[index + 1]
      if (!output || output.startsWith("--")) {
        throw new Error("--output requires a path.")
      }
      parsed.output = output
      index += 1
      continue
    }

    if (arg === "--profile") {
      const profile = rest[index + 1]
      if (!profile || profile.startsWith("--")) {
        throw new Error("--profile requires a value.")
      }
      if (!validProfiles.has(profile)) {
        throw new Error(`Unsupported profile '${profile}'.`)
      }
      parsed.profile = profile as ConversionOptions["profile"]
      index += 1
      continue
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option '${arg}'.`)
    }

    if (parsed.input) {
      throw new Error("Only one input path may be provided.")
    }
    parsed.input = arg
  }

  if (parsed.command === "validate-adf" && parsed.output) {
    throw new Error("validate-adf does not support --output.")
  }
  if (parsed.command === "validate-adf" && parsed.profile) {
    throw new Error("validate-adf does not support --profile.")
  }

  return parsed
}

/**
 * Checks whether a string is one of the supported CLI commands.
 */
function isCommand(value: string | undefined): value is Command {
  return value === "to-md" || value === "to-adf" || value === "validate-adf"
}

/**
 * Reads command input from a file path when present, otherwise from stdin.
 */
async function readInput(path: string | undefined): Promise<string> {
  if (path) return readFile(path, "utf8")
  return new Promise((resolve, reject) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk: string) => {
      data += chunk
    })
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", reject)
  })
}

/**
 * Writes command output to a file path when present, otherwise to stdout.
 */
async function writeOutput(
  path: string | undefined,
  value: string,
): Promise<void> {
  if (path) {
    await writeFile(path, value, "utf8")
    return
  }
  process.stdout.write(value)
}

/**
 * Emits converter diagnostics as newline-delimited JSON on stderr.
 */
function writeDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    console.error(JSON.stringify(diagnostic))
  }
}

/**
 * Returns true when any diagnostic should cause a non-zero CLI exit.
 */
function hasErrorDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
}

/**
 * Prints command usage help to stderr.
 */
function printUsage(): void {
  console.error("Usage:")
  console.error(
    "  md-adf to-md [input] [--output output.md] [--profile portableMarkdown]",
  )
  console.error(
    "  md-adf to-adf [input] [--output output.adf.json] [--profile jira]",
  )
  console.error("  md-adf validate-adf [input]")
}

process.exitCode = await main(process.argv.slice(2))
