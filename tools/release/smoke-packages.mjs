import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const tempRoot = await mkdtemp(join(tmpdir(), "md-adf-package-smoke-"));
const npmCache = join(tempRoot, "npm-cache");

await smokeJs();
await smokePython();

console.log(`Package smoke tests passed in ${tempRoot}`);

async function smokeJs() {
  const packDir = join(tempRoot, "npm-pack");
  const projectDir = join(tempRoot, "npm-project");
  await run("npm", ["run", "build", "--workspace", "packages/js"], { cwd: root });
  await mkdirp(packDir);
  const packOutput = await run(
    "npm",
    ["pack", "--workspace", "packages/js", "--pack-destination", packDir],
    { cwd: root },
  );
  const tarballName = packOutput.stdout.trim().split(/\r?\n/).at(-1);
  if (!tarballName) {
    throw new Error("npm pack did not report a tarball name.");
  }
  const tarball = join(packDir, basename(tarballName));
  await assertTarballIncludes(tarball, "package/README.md");

  await mkdirp(projectDir);
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );
  await run("npm", ["install", tarball], { cwd: projectDir });
  await run(
    "node",
    [
      "--input-type=module",
      "--eval",
      [
        'import { adfToMarkdown, markdownToAdf, validateAdf } from "md-adf";',
        'const md = adfToMarkdown({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] });',
        'if (md.value !== "Hello") throw new Error(`Unexpected markdown: ${md.value}`);',
        'const adf = markdownToAdf("# Hello");',
        'if (adf.value.content?.[0]?.type !== "heading") throw new Error("Expected heading node.");',
        'if (!validateAdf(adf.value).valid) throw new Error("Generated ADF did not validate.");',
      ].join("\n"),
    ],
    { cwd: projectDir },
  );
  await writeFile(join(projectDir, "input.md"), "# Hello\n", "utf8");
  await run("npx", ["md-adf", "to-adf", "input.md", "--output", "output.adf.json"], {
    cwd: projectDir,
  });
  await run("npx", ["md-adf", "validate-adf", "output.adf.json"], {
    cwd: projectDir,
  });
}

async function smokePython() {
  const projectDir = join(tempRoot, "python-project");
  const venvDir = join(projectDir, ".venv");
  await run("poetry", ["-C", "packages/python", "build"], { cwd: root });
  await mkdirp(projectDir);
  const distDir = join(root, "packages/python/dist");
  const wheel = (await readdir(distDir))
    .filter((entry) => entry.endsWith(".whl"))
    .sort()
    .at(-1);
  if (!wheel) {
    throw new Error("No Python wheel found after build.");
  }

  await run("python3", ["-m", "venv", venvDir], { cwd: projectDir });
  const python = join(venvDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const mdAdf = join(venvDir, process.platform === "win32" ? "Scripts/md-adf.exe" : "bin/md-adf");
  await run(python, ["-m", "pip", "install", join(distDir, wheel)], { cwd: projectDir });
  await run(
    python,
    [
      "-c",
      [
        "from md_adf import adf_to_markdown, markdown_to_adf, validate_adf",
        "doc = {'type': 'doc', 'version': 1, 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Hello'}]}]}",
        "md = adf_to_markdown(doc)",
        "assert md.value == 'Hello', md.value",
        "adf = markdown_to_adf('# Hello').value",
        "assert adf['content'][0]['type'] == 'heading'",
        "assert validate_adf(adf).valid",
      ].join("; "),
    ],
    { cwd: projectDir },
  );
  await writeFile(join(projectDir, "input.md"), "# Hello\n", "utf8");
  await run(mdAdf, ["to-adf", "input.md", "--output", "output.adf.json"], {
    cwd: projectDir,
  });
  await run(mdAdf, ["validate-adf", "output.adf.json"], { cwd: projectDir });
}

async function mkdirp(path) {
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path, { recursive: true }));
}

async function assertTarballIncludes(tarball, expectedPath) {
  const contents = await run("tar", ["-tf", tarball], { cwd: root });
  const entries = contents.stdout.trim().split(/\r?\n/);
  if (!entries.includes(expectedPath)) {
    throw new Error(`Expected ${tarball} to include ${expectedPath}.`);
  }
}

function run(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, npm_config_cache: process.env.npm_config_cache ?? npmCache },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          [
            `${command} ${args.join(" ")} failed with exit code ${code}.`,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
            stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      );
    });
  });
}
