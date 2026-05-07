import { spawnSync } from "node:child_process";
import { root } from "./shared.mjs";

const commands = [
  ["JS", "node", ["tools/conformance/run-js.mjs", "--json"]],
  [
    "Python",
    "poetry",
    [
      "-C",
      "packages/python",
      "run",
      "python",
      "../../tools/conformance/run-python.py",
      "--json",
    ],
  ],
];

const summaries = [];
const failures = [];

for (const [language, command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures.push(
      result.stderr || result.stdout || `${language} conformance failed.`,
    );
  }

  try {
    summaries.push(JSON.parse(result.stdout.trim()));
  } catch {
    summaries.push({
      language,
      passed: 0,
      failed: 1,
      skipped: 0,
      xfailed: 0,
      failures: [{ id: "runner", message: result.stderr || result.stdout }],
    });
  }
}

printTable(summaries);

for (const summary of summaries) {
  for (const failure of summary.failures ?? []) {
    console.error(`FAIL ${summary.language} ${failure.id}: ${failure.message}`);
  }
}

for (const failure of failures) {
  if (failure.trim()) console.error(failure.trim());
}

process.exitCode = summaries.some((summary) => summary.failed > 0) ? 1 : 0;

function printTable(rows) {
  const headers = ["Language", "Passed", "Failed", "Skipped", "XFailed"];
  const tableRows = rows.map((row) => [
    row.language,
    String(row.passed),
    String(row.failed),
    String(row.skipped),
    String(row.xfailed),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...tableRows.map((row) => row[index].length)),
  );

  console.log(formatRow(headers, widths));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of tableRows) {
    console.log(formatRow(row, widths));
  }
}

function formatRow(cells, widths) {
  return cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
}
